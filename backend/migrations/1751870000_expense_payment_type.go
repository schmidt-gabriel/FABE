package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Adds payment_type (auto|manual) to expenses so the Despesas table can show
// whether each expense is auto-debited or paid manually. Empty (existing
// records) is treated as manual in the UI.
func init() {
	m.Register(func(app core.App) error {
		col, err := app.FindCollectionByNameOrId("expenses")
		if err != nil {
			return err
		}
		col.Fields.Add(
			&core.SelectField{Name: "payment_type", MaxSelect: 1, Values: []string{"auto", "manual"}},
		)
		return app.Save(col)
	}, func(app core.App) error {
		col, err := app.FindCollectionByNameOrId("expenses")
		if err != nil {
			return err
		}
		col.Fields.RemoveByName("payment_type")
		return app.Save(col)
	})
}
