package api

import (
	"fmt"
	"time"

	"github.com/pocketbase/pocketbase/core"

	"financeapp/backend/internal/tax"
)

// quarterOut is a quarter result enriched with its lock status and due date.
type quarterOut struct {
	tax.QuarterResult
	Status  string `json:"status"`   // "locked" | "forecast"
	DueDate string `json:"due_date"` // YYYY-MM-DD
}

// dueDate returns the IRPJ/CSLL payment due date for a quarter: the last
// business day of the month following the quarter end (holidays not considered).
func dueDate(year, quarter int) time.Time {
	endMonth := quarter * 3 // 3, 6, 9, 12
	dueMonth := time.Month(endMonth%12 + 1)
	dueYear := year
	if endMonth == 12 {
		dueYear++
	}
	firstOfDue := time.Date(dueYear, dueMonth, 1, 0, 0, 0, 0, time.Local)
	last := firstOfDue.AddDate(0, 1, 0).AddDate(0, 0, -1)
	for last.Weekday() == time.Saturday || last.Weekday() == time.Sunday {
		last = last.AddDate(0, 0, -1)
	}
	return last
}

// dateOnOrAfter reports whether a's calendar date is >= b's calendar date.
func dateOnOrAfter(a, b time.Time) bool {
	ay, am, ad := a.Date()
	by, bm, bd := b.Date()
	return time.Date(ay, am, ad, 0, 0, 0, 0, time.Local).
		Compare(time.Date(by, bm, bd, 0, 0, 0, 0, time.Local)) >= 0
}

func findPeriod(app core.App, year, quarter int) *core.Record {
	rec, _ := app.FindFirstRecordByFilter(
		"tax_periods", fmt.Sprintf("year=%d && quarter=%d", year, quarter))
	return rec
}

func snapshotToResult(rec *core.Record) tax.QuarterResult {
	return tax.QuarterResult{
		Quarter:       int(rec.GetFloat("quarter")),
		Revenue:       rec.GetFloat("revenue"),
		BaseIRPJ:      rec.GetFloat("base_irpj"),
		IRPJ:          rec.GetFloat("irpj"),
		IRPJAdicional: rec.GetFloat("irpj_adicional"),
		BaseCSLL:      rec.GetFloat("base_csll"),
		CSLL:          rec.GetFloat("csll"),
		Total:         rec.GetFloat("total"),
	}
}

func saveSnapshot(app core.App, year int, r tax.QuarterResult, locked bool) error {
	rec := findPeriod(app, year, r.Quarter)
	if rec == nil {
		col, err := app.FindCollectionByNameOrId("tax_periods")
		if err != nil {
			return err
		}
		rec = core.NewRecord(col)
		rec.Set("year", year)
		rec.Set("quarter", r.Quarter)
	}
	rec.Set("revenue", r.Revenue)
	rec.Set("base_irpj", r.BaseIRPJ)
	rec.Set("irpj", r.IRPJ)
	rec.Set("irpj_adicional", r.IRPJAdicional)
	rec.Set("base_csll", r.BaseCSLL)
	rec.Set("csll", r.CSLL)
	rec.Set("total", r.Total)
	rec.Set("locked", locked)
	return app.Save(rec)
}

// enrichYear computes the four quarters and applies the lock state machine:
//   - locked record       -> return its frozen snapshot
//   - unlocked record      -> live forecast (user opened it for correction)
//   - no record, past due  -> auto-lock: persist a snapshot and return it
//   - no record, not due   -> live forecast
//
// Locked quarters contribute their frozen revenue to the cumulative IRPJ
// presumption tiering so forecasts stay consistent.
func enrichYear(app core.App, year int, params tax.Params, now time.Time) ([]quarterOut, error) {
	revenue, err := revenueByQuarter(app, year)
	if err != nil {
		return nil, err
	}

	periods := map[int]*core.Record{}
	for q := 1; q <= 4; q++ {
		if rec := findPeriod(app, year, q); rec != nil {
			periods[q] = rec
			if rec.GetBool("locked") {
				revenue[q-1] = rec.GetFloat("revenue")
			}
		}
	}

	computed := tax.ComputeYear(revenue, params)

	out := make([]quarterOut, 4)
	for i := 0; i < 4; i++ {
		q := i + 1
		due := dueDate(year, q)
		rec := periods[q]

		switch {
		case rec != nil && rec.GetBool("locked"):
			out[i] = quarterOut{snapshotToResult(rec), "locked", due.Format("2006-01-02")}
		case rec != nil: // explicitly unlocked -> forecast
			out[i] = quarterOut{computed[i], "forecast", due.Format("2006-01-02")}
		case dateOnOrAfter(now, due): // auto-lock past-due
			if err := saveSnapshot(app, year, computed[i], true); err != nil {
				return nil, err
			}
			out[i] = quarterOut{computed[i], "locked", due.Format("2006-01-02")}
		default:
			out[i] = quarterOut{computed[i], "forecast", due.Format("2006-01-02")}
		}
	}
	return out, nil
}
