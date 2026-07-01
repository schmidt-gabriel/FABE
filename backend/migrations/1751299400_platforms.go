package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Introduces a managed `platforms` collection and converts the platform fields
// from a fixed select to free text, so platforms can be added/edited via the UI.
func init() {
	m.Register(func(app core.App) error {
		rule := authRule()

		platforms := core.NewBaseCollection("platforms")
		platforms.ListRule, platforms.ViewRule, platforms.CreateRule, platforms.UpdateRule, platforms.DeleteRule = rule, rule, rule, rule, rule
		platforms.Fields.Add(
			&core.TextField{Name: "name", Required: true, Presentable: true, Max: 100},
			&core.BoolField{Name: "active"},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		if err := app.Save(platforms); err != nil {
			return err
		}
		for _, name := range []string{"Remessa Online", "Deel", "Higlobal", "Wise", "Outro"} {
			r := core.NewRecord(platforms)
			r.Set("name", name)
			r.Set("active", true)
			if err := app.Save(r); err != nil {
				return err
			}
		}

		// Convert fixed-select platform fields to free text.
		conv := []struct {
			coll, field string
			required    bool
		}{
			{"remittances", "platform", true},
			{"imports", "platform", true},
			{"clients", "default_platform", false},
		}
		for _, c := range conv {
			col, err := app.FindCollectionByNameOrId(c.coll)
			if err != nil {
				return err
			}
			col.Fields.RemoveByName(c.field)
			col.Fields.Add(&core.TextField{Name: c.field, Required: c.required, Max: 100})
			if err := app.Save(col); err != nil {
				return err
			}
		}
		return nil
	}, func(app core.App) error {
		if c, _ := app.FindCollectionByNameOrId("platforms"); c != nil {
			if err := app.Delete(c); err != nil {
				return err
			}
		}
		return nil
	})
}
