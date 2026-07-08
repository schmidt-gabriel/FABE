package api

import (
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

// autoRegisterAutoServices posts the monthly expense for every recurring
// service marked payment_type=auto once its due day (this month) has arrived,
// unless a matching expense already exists. It mirrors clicking "Registrar" on
// the due date, so auto-debited bills record themselves. Runs on startup and
// daily via cron; only the current month is handled.
func autoRegisterAutoServices(app core.App) error {
	services, err := app.FindAllRecords("recurring_services", dbx.HashExp{"payment_type": "auto"})
	if err != nil {
		return err
	}
	if len(services) == 0 {
		return nil
	}

	now := time.Now()
	ym := now.Format("2006-01")
	// Day 0 of next month is the last day of this one; clamp exp_day (e.g. 31
	// in a 30-day month) so it never spills into the following month.
	lastDay := time.Date(now.Year(), now.Month()+1, 0, 0, 0, 0, 0, now.Location()).Day()

	// Categories already recorded (and not still pending) this month, so a
	// service already paid, by any route, is skipped.
	expenses, err := app.FindAllRecords("expenses")
	if err != nil {
		return err
	}
	done := map[string]bool{}
	for _, e := range expenses {
		if e.GetDateTime("date").Time().Format("2006-01") != ym {
			continue
		}
		if e.GetBool("scheduled") && !e.GetBool("paid") {
			continue // a future expense not yet paid does not count
		}
		done[strings.ToUpper(e.GetString("category"))] = true
	}

	expCol, err := app.FindCollectionByNameOrId("expenses")
	if err != nil {
		return err
	}

	for _, s := range services {
		day := s.GetInt("exp_day")
		if day > lastDay {
			day = lastDay
		}
		if now.Day() < day {
			continue // due date not reached yet this month
		}
		name := s.GetString("name")
		if done[strings.ToUpper(name)] {
			continue
		}

		exp := core.NewRecord(expCol)
		exp.Set("date", time.Date(now.Year(), now.Month(), day, 12, 0, 0, 0, now.Location()))
		exp.Set("category", name)
		exp.Set("amount", s.GetFloat("default_amount"))
		exp.Set("payment_type", "auto")
		exp.Set("paid", true)
		exp.Set("scheduled", false)
		if err := app.Save(exp); err != nil {
			return err
		}
		done[strings.ToUpper(name)] = true
		app.Logger().Info("auto-registered recurring service", "service", name)
	}
	return nil
}
