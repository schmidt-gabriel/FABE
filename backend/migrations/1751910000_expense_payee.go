package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Adds expenses.payee ("Recebedor"): who the expense was paid to ("Unimed"),
// separate from the category that groups it ("Health insurance"). Optional, so
// records created before this keep working: the UI falls back to the category.
//
// recurring_services.category comes along because a service is what fills both
// fields when its expense is registered (by hand or by the auto-register
// routine): the service name becomes expenses.payee and this category becomes
// expenses.category. Empty falls back to the service name, the old behaviour.
func init() {
	m.Register(func(app core.App) error {
		if err := addField(app, "expenses", &core.TextField{Name: "payee", Max: 100}); err != nil {
			return err
		}
		return addField(app, "recurring_services", &core.TextField{Name: "category", Max: 100})
	}, func(app core.App) error {
		if err := dropField(app, "expenses", "payee"); err != nil {
			return err
		}
		return dropField(app, "recurring_services", "category")
	})
}

func addField(app core.App, collection string, field core.Field) error {
	col, err := app.FindCollectionByNameOrId(collection)
	if err != nil {
		return err
	}
	col.Fields.Add(field)
	return app.Save(col)
}

func dropField(app core.App, collection, field string) error {
	col, err := app.FindCollectionByNameOrId(collection)
	if err != nil {
		return err
	}
	col.Fields.RemoveByName(field)
	return app.Save(col)
}
