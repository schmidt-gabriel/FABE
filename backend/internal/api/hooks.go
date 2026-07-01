package api

import "github.com/pocketbase/pocketbase/core"

// registerHooks wires record hooks (business side effects).
func registerHooks(app core.App) {
	// When an "other tax" is marked paid, auto-create a matching expense (and
	// remove it if unmarked). The expense_id field links the two.
	sync := func(e *core.RecordEvent) error {
		if err := syncTaxExpense(app, e.Record); err != nil {
			return err
		}
		return e.Next()
	}
	app.OnRecordAfterCreateSuccess("other_taxes").BindFunc(sync)
	app.OnRecordAfterUpdateSuccess("other_taxes").BindFunc(sync)
}

func syncTaxExpense(app core.App, rec *core.Record) error {
	paid := rec.GetBool("paid")
	expID := rec.GetString("expense_id")

	switch {
	case paid && expID == "":
		col, err := app.FindCollectionByNameOrId("expenses")
		if err != nil {
			return err
		}
		exp := core.NewRecord(col)
		exp.Set("date", rec.GetDateTime("due_date"))
		exp.Set("category", "Outros")
		exp.Set("amount", rec.GetFloat("amount"))
		exp.Set("notes", rec.GetString("name")+" (imposto)")
		if err := app.Save(exp); err != nil {
			return err
		}
		rec.Set("expense_id", exp.Id)
		return app.Save(rec) // re-triggers the hook; guarded by expense_id != ""

	case !paid && expID != "":
		if exp, _ := app.FindRecordById("expenses", expID); exp != nil {
			if err := app.Delete(exp); err != nil {
				return err
			}
		}
		rec.Set("expense_id", "")
		return app.Save(rec) // re-triggers the hook; guarded by expense_id == ""
	}
	return nil
}
