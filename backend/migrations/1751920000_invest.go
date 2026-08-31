package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Pessoa Física module ("Investimentos"). It shares the same database as the
// CNPJ side but nothing else: its collections carry the `_invest` suffix so the
// two never get mixed in exports, backups or the admin UI.
//
//	investments_invest -> the fixed-income products being compared
//	settings_invest    -> singleton with the global inputs (CDI, and at the time
//	                      also the simulation's valor/prazo, dropped later by
//	                      1751950000_invest_drop_simulation.go)
//
// Rates are stored the way the UI shows them: `cdi_rate` and `cdi_pct` are
// percentages (13.90 = 13,90% a.a., 98 = 98% do CDI), converted to fractions
// only inside the calculator (frontend/src/lib/invest.ts).
func init() {
	m.Register(func(app core.App) error {
		rule := authRule()

		// ---- investments_invest ------------------------------------------
		investments := core.NewBaseCollection("investments_invest")
		investments.ListRule, investments.ViewRule, investments.CreateRule, investments.UpdateRule, investments.DeleteRule = rule, rule, rule, rule, rule
		investments.Fields.Add(
			&core.TextField{Name: "name", Required: true, Presentable: true, Max: 100},
			// cdb -> IR regressivo; lci_lca -> isento.
			&core.SelectField{Name: "kind", MaxSelect: 1, Required: true, Values: []string{"cdb", "lci_lca"}},
			// % do CDI contratado (98 = 98% do CDI).
			&core.NumberField{Name: "cdi_pct", Required: true, Min: ptr(0.0)},
			// daily -> resgate a qualquer momento; maturity -> só no vencimento.
			&core.SelectField{Name: "liquidity", MaxSelect: 1, Values: []string{"daily", "maturity"}},
			&core.DateField{Name: "maturity"},
			&core.TextField{Name: "notes", Max: 500},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		if err := app.Save(investments); err != nil {
			return err
		}

		// ---- settings_invest (singleton) ---------------------------------
		settings := core.NewBaseCollection("settings_invest")
		settings.ListRule, settings.ViewRule, settings.CreateRule, settings.UpdateRule, settings.DeleteRule = rule, rule, rule, rule, rule
		settings.Fields.Add(
			&core.NumberField{Name: "cdi_rate", Min: ptr(0.0)},                              // % a.a. (13.90)
			&core.NumberField{Name: "amount", Min: ptr(0.0)},                                // R$ a investir
			&core.NumberField{Name: "months", OnlyInt: true, Min: ptr(1.0), Max: ptr(36.0)}, // prazo simulado
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		return app.Save(settings)
	}, func(app core.App) error {
		for _, name := range []string{"settings_invest", "investments_invest"} {
			if c, _ := app.FindCollectionByNameOrId(name); c != nil {
				if err := app.Delete(c); err != nil {
					return err
				}
			}
		}
		return nil
	})
}
