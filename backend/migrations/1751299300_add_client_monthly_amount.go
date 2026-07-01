package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Adds the standard monthly amount (USD) a client pays. Used to pre-fill
// remittances; the actual remittance amount stays editable for differences
// (e.g. vacation).
func init() {
	m.Register(func(app core.App) error {
		clients, err := app.FindCollectionByNameOrId("clients")
		if err != nil {
			return err
		}
		clients.Fields.Add(&core.NumberField{Name: "monthly_amount", Min: ptr(0.0)})
		return app.Save(clients)
	}, func(app core.App) error {
		clients, err := app.FindCollectionByNameOrId("clients")
		if err != nil {
			return err
		}
		clients.Fields.RemoveByName("monthly_amount")
		return app.Save(clients)
	})
}
