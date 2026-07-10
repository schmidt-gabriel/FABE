// Package api wires custom HTTP endpoints on top of PocketBase.
package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"

	"financeapp/backend/internal/fx"
	"financeapp/backend/internal/tax"
)

// Register binds all custom routes to the app.
func Register(app core.App) {
	fxClient := fx.NewClient()

	// Auto-debited recurring services post their expense on the due date: catch
	// up once at startup, then check daily.
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		if err := autoRegisterAutoServices(app); err != nil {
			app.Logger().Warn("auto-register services failed", "err", err)
		}
		return e.Next()
	})
	app.Cron().MustAdd("autoRegisterServices", "0 6 * * *", func() {
		if err := autoRegisterAutoServices(app); err != nil {
			app.Logger().Warn("auto-register services failed", "err", err)
		}
	})

	app.OnServe().Bind(&hook.Handler[*core.ServeEvent]{
		Func: func(e *core.ServeEvent) error {
			// GET /api/tax/compute?year=2026
			// Returns the quarterly IRPJ/CSLL assessment computed from the
			// imports of the given year, using the rates stored in settings.
			e.Router.GET("/api/tax/compute", func(re *core.RequestEvent) error {
				return computeTax(app, re)
			}).Bind(apis.RequireAuth())

			// POST /api/tax/lock   {year, quarter} -> freeze the quarter's value
			// POST /api/tax/unlock {year, quarter} -> reopen it for correction
			e.Router.POST("/api/tax/lock", func(re *core.RequestEvent) error {
				return setLock(app, re, true)
			}).Bind(apis.RequireAuth())
			e.Router.POST("/api/tax/unlock", func(re *core.RequestEvent) error {
				return setLock(app, re, false)
			}).Bind(apis.RequireAuth())

			// GET /api/fx/usd-brl?date=YYYY-MM-DD (date optional => latest)
			// Returns the USD/BRL exchange rate, used to pre-fill imports.
			e.Router.GET("/api/fx/usd-brl", func(re *core.RequestEvent) error {
				quote, err := fxClient.Fetch(re.Request.Context(), re.Request.URL.Query().Get("date"))
				if err != nil {
					return apis.NewApiError(http.StatusBadGateway, "could not fetch exchange rate", err)
				}
				return re.JSON(http.StatusOK, quote)
			}).Bind(apis.RequireAuth())

			// Data export (CSV per collection + full JSON backup).
			registerExportRoutes(app, e)

			return e.Next()
		},
	})
}

type computeResponse struct {
	Year      int          `json:"year"`
	Params    tax.Params   `json:"params"`
	Quarters  []quarterOut `json:"quarters"`
	YearTotal float64      `json:"year_total"`
}

func computeTax(app core.App, re *core.RequestEvent) error {
	year, err := strconv.Atoi(re.Request.URL.Query().Get("year"))
	if err != nil || year < 2000 || year > 2100 {
		return apis.NewBadRequestError("invalid 'year' parameter", nil)
	}

	params, err := loadParams(app)
	if err != nil {
		return err
	}

	quarters, err := enrichYear(app, year, params, time.Now())
	if err != nil {
		return err
	}

	total := 0.0
	for _, q := range quarters {
		total += q.Total
	}

	return re.JSON(http.StatusOK, computeResponse{
		Year:      year,
		Params:    params,
		Quarters:  quarters,
		YearTotal: total,
	})
}

type lockPayload struct {
	Year    int `json:"year"`
	Quarter int `json:"quarter"`
}

// setLock freezes (locked=true) or reopens (locked=false) a quarter.
func setLock(app core.App, re *core.RequestEvent, locked bool) error {
	var p lockPayload
	if err := json.NewDecoder(re.Request.Body).Decode(&p); err != nil {
		return apis.NewBadRequestError("invalid body", err)
	}
	if p.Year < 2000 || p.Year > 2100 || p.Quarter < 1 || p.Quarter > 4 {
		return apis.NewBadRequestError("invalid year/quarter", nil)
	}

	params, err := loadParams(app)
	if err != nil {
		return err
	}
	// Compute a fresh snapshot for the requested quarter.
	quarters, err := enrichYear(app, p.Year, params, time.Now())
	if err != nil {
		return err
	}
	if err := saveSnapshot(app, p.Year, quarters[p.Quarter-1].QuarterResult, locked); err != nil {
		return err
	}
	return re.JSON(http.StatusOK, map[string]any{"year": p.Year, "quarter": p.Quarter, "locked": locked})
}

// loadParams reads the tax rates from the singleton settings record.
func loadParams(app core.App) (tax.Params, error) {
	rec, err := app.FindFirstRecordByFilter("settings", "id != ''")
	if err != nil {
		return tax.Params{}, err
	}
	return tax.Params{
		IRPJPresumptionReduced:  rec.GetFloat("irpj_presumption_reduced"),
		IRPJPresumptionStandard: rec.GetFloat("irpj_presumption_standard"),
		IRPJReducedAnnualLimit:  rec.GetFloat("irpj_reduced_annual_limit"),
		IRPJRate:                rec.GetFloat("irpj_rate"),
		IRPJAdicionalRate:       rec.GetFloat("irpj_adicional_rate"),
		IRPJAdicionalThreshold:  rec.GetFloat("irpj_adicional_threshold"),
		CSLLPresumption:         rec.GetFloat("csll_presumption"),
		CSLLRate:                rec.GetFloat("csll_rate"),
	}, nil
}

// revenueByQuarter sums imports.amount_brl grouped by the quarter of convert_day.
func revenueByQuarter(app core.App, year int) ([4]float64, error) {
	var revenue [4]float64

	records, err := app.FindAllRecords("imports")
	if err != nil {
		return revenue, err
	}

	for _, r := range records {
		d := r.GetDateTime("convert_day").Time()
		if d.Year() != year {
			continue
		}
		q := (int(d.Month()) - 1) / 3 // 0..3
		revenue[q] += r.GetFloat("amount_brl")
	}

	return revenue, nil
}
