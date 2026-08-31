// Package api wires custom HTTP endpoints on top of PocketBase.
package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/hook"

	"fabe/backend/internal/fx"
	"fabe/backend/internal/tax"
)

// quoteCache holds the last quote AwesomeAPI returned, so a transient outage
// degrades to a slightly old rate instead of an error.
type quoteCache struct {
	mu    sync.RWMutex
	quote fx.Quote
	ok    bool
}

func (c *quoteCache) set(q fx.Quote) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.quote, c.ok = q, true
}

// get returns the cached quote flagged as stale, and whether one was stored.
func (c *quoteCache) get() (fx.Quote, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	q := c.quote
	q.Stale = true
	return q, c.ok
}

// Register binds all custom routes to the app.
func Register(app core.App) {
	fxClient := fx.NewClient()
	latestFX := &quoteCache{}

	// Auto-debited items record themselves on their due date: recurring services
	// post their monthly expense, and expenses the user scheduled as automatic
	// get marked paid. Catch up once at startup, then check daily.
	runAutoRegister := func() (created int, paid int) {
		var err error
		if created, err = autoRegisterAutoServices(app); err != nil {
			app.Logger().Warn("auto-register services failed", "err", err)
		}
		if paid, err = autoPayScheduledAutoExpenses(app); err != nil {
			app.Logger().Warn("auto-pay expenses failed", "err", err)
		}
		return created, paid
	}
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		runAutoRegister()
		return e.Next()
	})
	app.Cron().MustAdd("autoRegister", "0 6 * * *", func() { runAutoRegister() })

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

			// POST /api/maintenance/auto-register
			// Runs the auto-register routine on demand (same as the daily cron):
			// posts expenses for any due auto-debited service and marks due
			// scheduled auto expenses as paid. Returns {created, paid}.
			e.Router.POST("/api/maintenance/auto-register", func(re *core.RequestEvent) error {
				created, err := autoRegisterAutoServices(app)
				if err != nil {
					return apis.NewApiError(http.StatusInternalServerError, "auto-register failed", err)
				}
				paid, err := autoPayScheduledAutoExpenses(app)
				if err != nil {
					return apis.NewApiError(http.StatusInternalServerError, "auto-pay failed", err)
				}
				return re.JSON(http.StatusOK, map[string]any{"created": created, "paid": paid})
			}).Bind(apis.RequireAuth())

			// GET /api/fx/usd-brl?date=YYYY-MM-DD (date optional => latest)
			// Returns the USD/BRL exchange rate, used to pre-fill imports.
			e.Router.GET("/api/fx/usd-brl", func(re *core.RequestEvent) error {
				date := re.Request.URL.Query().Get("date")
				quote, err := fxClient.Fetch(re.Request.Context(), date)
				if err != nil {
					// The current rate is informational, so an AwesomeAPI outage
					// falls back to the last one we saw rather than blanking the
					// Overview card. A dated lookup has no safe fallback: it feeds
					// a stored amount, so it must fail loudly.
					if date == "" {
						if cached, ok := latestFX.get(); ok {
							app.Logger().Warn("fx upstream failed, serving cached quote", "err", err)
							return re.JSON(http.StatusOK, cached)
						}
					}
					return apis.NewApiError(http.StatusBadGateway, "could not fetch exchange rate", err)
				}
				if date == "" {
					latestFX.set(quote)
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
