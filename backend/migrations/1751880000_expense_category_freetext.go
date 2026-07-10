package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Turns expenses.category into free text so any recurring-service name (which
// is free text) can be used as a category. The Overview marks a service paid
// by matching an expense with the same category name, so the fixed enum blocked
// services named outside the list. The frontend still offers the known
// categories plus the service names as suggestions.
//
// PocketBase forbids changing a field's type in place, so we drop the select
// and add a text field of the same name. That empties the column, so we
// snapshot every value first and write it back afterwards to preserve data.

var categoryEnum = []string{
	"Unimed", "Internet", "Contabilizei", "GoWork",
	"DARF INSS", "DARF CSLL", "DARF IRPJ", "IMPOSTOS", "Outros",
}

func init() {
	m.Register(func(app core.App) error {
		return swapCategoryField(app, &core.TextField{Name: "category", Required: true, Max: 100}, nil)
	}, func(app core.App) error {
		// down: clamp any free-text value not in the enum to "Outros".
		allowed := map[string]bool{}
		for _, v := range categoryEnum {
			allowed[v] = true
		}
		clamp := func(v string) string {
			if allowed[v] {
				return v
			}
			return "Outros"
		}
		return swapCategoryField(app,
			&core.SelectField{Name: "category", MaxSelect: 1, Required: true, Values: categoryEnum},
			clamp,
		)
	})
}

// swapCategoryField replaces the expenses.category field, preserving each
// record's value (optionally transformed by `conv`).
func swapCategoryField(app core.App, field core.Field, conv func(string) string) error {
	col, err := app.FindCollectionByNameOrId("expenses")
	if err != nil {
		return err
	}
	records, err := app.FindAllRecords("expenses")
	if err != nil {
		return err
	}
	saved := make(map[string]string, len(records))
	for _, r := range records {
		v := r.GetString("category")
		if conv != nil {
			v = conv(v)
		}
		saved[r.Id] = v
	}

	col.Fields.RemoveByName("category")
	col.Fields.Add(field)
	if err := app.Save(col); err != nil {
		return err
	}

	// Re-fetch against the new schema and restore the snapshotted values.
	records, err = app.FindAllRecords("expenses")
	if err != nil {
		return err
	}
	for _, r := range records {
		r.Set("category", saved[r.Id])
		if err := app.Save(r); err != nil {
			return err
		}
	}
	return nil
}
