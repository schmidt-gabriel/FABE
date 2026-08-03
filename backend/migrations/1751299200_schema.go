package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Single consolidated schema migration. Creates every collection in its final
// shape and removes PocketBase's default `users` auth collection: this is a
// single-user app and the UI authenticates directly against `_superusers`.
//
// No seed data: everything (settings, platforms, services, records) comes from
// importing the backup JSON (Config → Dados → Importar backup).

// authRule restricts access to authenticated requests only. The only account
// is the superuser, which bypasses rules anyway, but keep the rule non-public.
func authRule() *string {
	s := `@request.auth.id != ""`
	return &s
}

func ptr[T any](v T) *T { return &v }

func init() {
	m.Register(func(app core.App) error {
		rule := authRule()

		// Drop the default `users` auth collection (unused: single superuser).
		if users, _ := app.FindCollectionByNameOrId("users"); users != nil {
			if err := app.Delete(users); err != nil {
				return err
			}
		}

		// ---- platforms (managed list, referenced as free text) -----------
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

		// ---- clients ------------------------------------------------------
		clients := core.NewBaseCollection("clients")
		clients.ListRule, clients.ViewRule, clients.CreateRule, clients.UpdateRule, clients.DeleteRule = rule, rule, rule, rule, rule
		clients.Fields.Add(
			&core.TextField{Name: "name", Required: true, Presentable: true, Max: 200},
			&core.TextField{Name: "default_platform", Max: 100},
			// Reference amount used to pre-fill remittances (always editable).
			// For hourly clients it stores the hourly rate; the UI shows the
			// monthly equivalent (x160h).
			&core.NumberField{Name: "monthly_amount", Min: ptr(0.0)},
			&core.SelectField{Name: "billing_type", MaxSelect: 1, Values: []string{"monthly", "hourly"}},
			&core.SelectField{Name: "pay_frequency", MaxSelect: 1, Values: []string{"monthly", "weekly"}},
			&core.BoolField{Name: "active"},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		if err := app.Save(clients); err != nil {
			return err
		}

		// ---- remittances (USD received from clients) -----------------------
		remittances := core.NewBaseCollection("remittances")
		remittances.ListRule, remittances.ViewRule, remittances.CreateRule, remittances.UpdateRule, remittances.DeleteRule = rule, rule, rule, rule, rule
		remittances.Fields.Add(
			&core.RelationField{Name: "client", Required: true, CollectionId: clients.Id, MaxSelect: 1, CascadeDelete: false},
			&core.TextField{Name: "platform", Required: true, Max: 100},
			&core.NumberField{Name: "amount_usd", Required: true, Min: ptr(0.0)},
			&core.DateField{Name: "pay_day", Required: true},
			&core.TextField{Name: "notes", Max: 500},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		if err := app.Save(remittances); err != nil {
			return err
		}

		// ---- imports (USD actually converted to BRL) -----------------------
		imports := core.NewBaseCollection("imports")
		imports.ListRule, imports.ViewRule, imports.CreateRule, imports.UpdateRule, imports.DeleteRule = rule, rule, rule, rule, rule
		imports.Fields.Add(
			&core.TextField{Name: "platform", Required: true, Max: 100},
			&core.NumberField{Name: "amount_usd", Required: true, Min: ptr(0.0)},
			&core.DateField{Name: "convert_day", Required: true},
			&core.NumberField{Name: "rate", Required: true, Min: ptr(0.0)},
			&core.NumberField{Name: "amount_brl", Required: true, Min: ptr(0.0)},
			&core.TextField{Name: "notes", Max: 500},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		if err := app.Save(imports); err != nil {
			return err
		}

		// ---- expenses -------------------------------------------------------
		expenses := core.NewBaseCollection("expenses")
		expenses.ListRule, expenses.ViewRule, expenses.CreateRule, expenses.UpdateRule, expenses.DeleteRule = rule, rule, rule, rule, rule
		expenses.Fields.Add(
			&core.DateField{Name: "date", Required: true},
			&core.SelectField{Name: "category", MaxSelect: 1, Required: true, Values: []string{
				"HealthInsurance", "Internet", "Contabilizei", "GoWork",
				"DARF INSS", "DARF CSLL", "DARF IRPJ", "Outros",
			}},
			&core.NumberField{Name: "amount", Required: true, Min: ptr(0.0)},
			&core.TextField{Name: "notes", Max: 500},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		if err := app.Save(expenses); err != nil {
			return err
		}

		// ---- recurring_services (due-day alerts) ----------------------------
		services := core.NewBaseCollection("recurring_services")
		services.ListRule, services.ViewRule, services.CreateRule, services.UpdateRule, services.DeleteRule = rule, rule, rule, rule, rule
		services.Fields.Add(
			&core.TextField{Name: "name", Required: true, Presentable: true, Max: 100},
			&core.NumberField{Name: "exp_day", Required: true, OnlyInt: true, Min: ptr(1.0), Max: ptr(31.0)},
			&core.NumberField{Name: "default_amount", Min: ptr(0.0)},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		if err := app.Save(services); err != nil {
			return err
		}

		// ---- profit_distributions -------------------------------------------
		dist := core.NewBaseCollection("profit_distributions")
		dist.ListRule, dist.ViewRule, dist.CreateRule, dist.UpdateRule, dist.DeleteRule = rule, rule, rule, rule, rule
		dist.Fields.Add(
			&core.DateField{Name: "month", Required: true},
			&core.NumberField{Name: "amount", Required: true},
			&core.NumberField{Name: "cota_irrf"},
			&core.TextField{Name: "notes", Max: 500},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		if err := app.Save(dist); err != nil {
			return err
		}

		// ---- tax_periods (quarterly assessment snapshots) ---------------------
		taxes := core.NewBaseCollection("tax_periods")
		taxes.ListRule, taxes.ViewRule, taxes.CreateRule, taxes.UpdateRule, taxes.DeleteRule = rule, rule, rule, rule, rule
		taxes.Fields.Add(
			&core.NumberField{Name: "year", Required: true, OnlyInt: true},
			&core.NumberField{Name: "quarter", Required: true, OnlyInt: true, Min: ptr(1.0), Max: ptr(4.0)},
			&core.NumberField{Name: "revenue"},        // imported revenue in the quarter
			&core.NumberField{Name: "base_irpj"},      // revenue * presumption
			&core.NumberField{Name: "irpj"},           // base * rate
			&core.NumberField{Name: "irpj_adicional"}, // 10% surtax
			&core.NumberField{Name: "base_csll"},
			&core.NumberField{Name: "csll"},
			&core.NumberField{Name: "total"},
			&core.BoolField{Name: "locked"}, // freezes the value once the DARF is due/paid
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		if err := app.Save(taxes); err != nil {
			return err
		}

		// ---- other_taxes (manual/seasonal taxes) ------------------------------
		other := core.NewBaseCollection("other_taxes")
		other.ListRule, other.ViewRule, other.CreateRule, other.UpdateRule, other.DeleteRule = rule, rule, rule, rule, rule
		other.Fields.Add(
			&core.TextField{Name: "name", Required: true, Presentable: true, Max: 200},
			&core.DateField{Name: "reference"}, // competência (mês de referência)
			&core.DateField{Name: "due_date", Required: true},
			&core.NumberField{Name: "amount", Required: true, Min: ptr(0.0)},
			&core.BoolField{Name: "paid"},
			// Links to the expense auto-created when marked as paid (hooks.go).
			&core.TextField{Name: "expense_id", Max: 30},
			&core.TextField{Name: "notes", Max: 500},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		if err := app.Save(other); err != nil {
			return err
		}

		// ---- settings (singleton, tax params) ---------------------------------
		settings := core.NewBaseCollection("settings")
		settings.ListRule, settings.ViewRule, settings.CreateRule, settings.UpdateRule, settings.DeleteRule = rule, rule, rule, rule, rule
		settings.Fields.Add(
			&core.TextField{Name: "company_name", Max: 200},
			&core.TextField{Name: "cnpj", Max: 20},
			// Tax parameters (Lucro Presumido, exported services), editable.
			// IRPJ uses a tiered presumption: reduced rate up to the annual
			// revenue limit, full rate on the excess.
			&core.NumberField{Name: "irpj_presumption_reduced", Min: ptr(0.0), Max: ptr(1.0)},  // e.g. 0.16
			&core.NumberField{Name: "irpj_presumption_standard", Min: ptr(0.0), Max: ptr(1.0)}, // e.g. 0.32
			&core.NumberField{Name: "irpj_reduced_annual_limit"},                               // e.g. 120000 (revenue/year)
			&core.NumberField{Name: "irpj_rate", Min: ptr(0.0), Max: ptr(1.0)},                 // e.g. 0.15
			&core.NumberField{Name: "irpj_adicional_rate", Min: ptr(0.0), Max: ptr(1.0)},       // e.g. 0.10
			&core.NumberField{Name: "irpj_adicional_threshold"},                                // e.g. 60000 (base/quarter)
			// CSLL: always full presumption.
			&core.NumberField{Name: "csll_presumption", Min: ptr(0.0), Max: ptr(1.0)}, // e.g. 0.32
			&core.NumberField{Name: "csll_rate", Min: ptr(0.0), Max: ptr(1.0)},        // e.g. 0.09
			&core.NumberField{Name: "inss_monthly"},                                   // fixed monthly pró-labore INSS
			&core.NumberField{Name: "dollar_rate"},                                    // cached current FX rate
			&core.DateField{Name: "dollar_rate_at"},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		return app.Save(settings)
	}, func(app core.App) error {
		// down: drop in reverse dependency order
		for _, name := range []string{
			"settings", "other_taxes", "tax_periods", "profit_distributions",
			"recurring_services", "expenses", "imports", "remittances",
			"clients", "platforms",
		} {
			if c, _ := app.FindCollectionByNameOrId(name); c != nil {
				if err := app.Delete(c); err != nil {
					return err
				}
			}
		}
		return nil
	})
}
