package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Drops the other_taxes collection: taxes are now plain expenses (a future one
// while unpaid, per the scheduled/paid flags). Existing records are converted
// into expenses first so nothing is lost. Entries that already had their
// expense auto-created by the old hook (expense_id set) are skipped.
func init() {
	m.Register(func(app core.App) error {
		col, err := app.FindCollectionByNameOrId("other_taxes")
		if err != nil {
			return nil // already gone
		}
		expenses, err := app.FindCollectionByNameOrId("expenses")
		if err != nil {
			return err
		}
		taxes, err := app.FindAllRecords("other_taxes")
		if err != nil {
			return err
		}

		for _, t := range taxes {
			if t.GetString("expense_id") != "" {
				continue // the linked expense already exists
			}
			paid := t.GetBool("paid")
			exp := core.NewRecord(expenses)
			exp.Set("date", t.GetDateTime("due_date")) // due date for unpaid ones
			exp.Set("category", "IMPOSTO")
			exp.Set("amount", t.GetFloat("amount"))
			exp.Set("notes", t.GetString("name")+" (imposto)")
			exp.Set("payment_type", "manual")
			exp.Set("paid", paid)
			exp.Set("scheduled", !paid) // unpaid becomes an "a pagar" expense
			if err := app.Save(exp); err != nil {
				return err
			}
		}

		return app.Delete(col)
	}, func(app core.App) error {
		// down: recreate the (empty) collection with its original shape.
		if c, _ := app.FindCollectionByNameOrId("other_taxes"); c != nil {
			return nil
		}
		rule := authRule()
		other := core.NewBaseCollection("other_taxes")
		other.ListRule, other.ViewRule, other.CreateRule, other.UpdateRule, other.DeleteRule = rule, rule, rule, rule, rule
		other.Fields.Add(
			&core.TextField{Name: "name", Required: true, Presentable: true, Max: 200},
			&core.DateField{Name: "reference"},
			&core.DateField{Name: "due_date", Required: true},
			&core.NumberField{Name: "amount", Required: true, Min: ptr(0.0)},
			&core.BoolField{Name: "paid"},
			&core.TextField{Name: "expense_id", Max: 30},
			&core.TextField{Name: "notes", Max: 500},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		return app.Save(other)
	})
}
