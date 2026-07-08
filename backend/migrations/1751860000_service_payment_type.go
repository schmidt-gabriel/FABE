package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Adds payment_type (auto|manual) to recurring_services so auto-debited
// services can be told apart from the ones that need a manual payment.
// Empty (existing records) is treated as manual in the UI.
func init() {
	m.Register(func(app core.App) error {
		col, err := app.FindCollectionByNameOrId("recurring_services")
		if err != nil {
			return err
		}
		col.Fields.Add(
			&core.SelectField{Name: "payment_type", MaxSelect: 1, Values: []string{"auto", "manual"}},
		)
		return app.Save(col)
	}, func(app core.App) error {
		col, err := app.FindCollectionByNameOrId("recurring_services")
		if err != nil {
			return err
		}
		col.Fields.RemoveByName("payment_type")
		return app.Save(col)
	})
}
