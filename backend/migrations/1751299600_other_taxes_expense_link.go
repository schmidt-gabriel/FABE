package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Links an other_taxes record to the expense auto-created when it is paid.
func init() {
	m.Register(func(app core.App) error {
		c, err := app.FindCollectionByNameOrId("other_taxes")
		if err != nil {
			return err
		}
		c.Fields.Add(&core.TextField{Name: "expense_id", Hidden: false, Max: 30})
		return app.Save(c)
	}, func(app core.App) error {
		c, err := app.FindCollectionByNameOrId("other_taxes")
		if err != nil {
			return err
		}
		c.Fields.RemoveByName("expense_id")
		return app.Save(c)
	})
}
