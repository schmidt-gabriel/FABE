package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Future expenses: an expense can now be created as "a pagar" (scheduled=true,
// paid=false) with its date acting as the due date, so it shows up in the
// Overview "Próximos pagamentos" card until marked as paid. Regular expenses
// keep scheduled=false and are treated as paid everywhere. Also adds the
// "Impostos" category for one-off taxes like TFE.
func init() {
	m.Register(func(app core.App) error {
		col, err := app.FindCollectionByNameOrId("expenses")
		if err != nil {
			return err
		}
		col.Fields.Add(
			&core.BoolField{Name: "scheduled"},
			&core.BoolField{Name: "paid"},
		)
		if f, ok := col.Fields.GetByName("category").(*core.SelectField); ok {
			f.Values = []string{
				"HealthInsurance", "Internet", "Contabilizei", "GoWork",
				"DARF INSS", "DARF CSLL", "DARF IRPJ", "IMPOSTO", "Outros",
			}
		}
		return app.Save(col)
	}, func(app core.App) error {
		col, err := app.FindCollectionByNameOrId("expenses")
		if err != nil {
			return err
		}
		col.Fields.RemoveByName("scheduled")
		col.Fields.RemoveByName("paid")
		if f, ok := col.Fields.GetByName("category").(*core.SelectField); ok {
			f.Values = []string{
				"HealthInsurance", "Internet", "Contabilizei", "GoWork",
				"DARF INSS", "DARF CSLL", "DARF IRPJ", "Outros",
			}
		}
		return app.Save(col)
	})
}
