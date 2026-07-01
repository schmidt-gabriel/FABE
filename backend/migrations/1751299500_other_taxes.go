package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// other_taxes holds manual/seasonal taxes that aren't the computed quarterly
// IRPJ/CSLL, e.g. "Taxa de Fiscalização de Estabelecimentos".
func init() {
	m.Register(func(app core.App) error {
		rule := authRule()

		c := core.NewBaseCollection("other_taxes")
		c.ListRule, c.ViewRule, c.CreateRule, c.UpdateRule, c.DeleteRule = rule, rule, rule, rule, rule
		c.Fields.Add(
			&core.TextField{Name: "name", Required: true, Presentable: true, Max: 200},
			&core.DateField{Name: "reference"}, // competência (mês de referência)
			&core.DateField{Name: "due_date", Required: true},
			&core.NumberField{Name: "amount", Required: true, Min: ptr(0.0)},
			&core.BoolField{Name: "paid"},
			&core.TextField{Name: "notes", Max: 500},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		return app.Save(c)
	}, func(app core.App) error {
		if c, _ := app.FindCollectionByNameOrId("other_taxes"); c != nil {
			return app.Delete(c)
		}
		return nil
	})
}
