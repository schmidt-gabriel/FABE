package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Adds how a client is billed and how often it pays:
//   - billing_type: "monthly" (fixed monthly fee) or "hourly" (bills by the hour,
//     so the reference amount is only approximate).
//   - pay_frequency: "monthly" or "weekly".
func init() {
	m.Register(func(app core.App) error {
		clients, err := app.FindCollectionByNameOrId("clients")
		if err != nil {
			return err
		}
		clients.Fields.Add(
			&core.SelectField{Name: "billing_type", MaxSelect: 1, Values: []string{"monthly", "hourly"}},
			&core.SelectField{Name: "pay_frequency", MaxSelect: 1, Values: []string{"monthly", "weekly"}},
		)
		return app.Save(clients)
	}, func(app core.App) error {
		clients, err := app.FindCollectionByNameOrId("clients")
		if err != nil {
			return err
		}
		clients.Fields.RemoveByName("billing_type")
		clients.Fields.RemoveByName("pay_frequency")
		return app.Save(clients)
	})
}
