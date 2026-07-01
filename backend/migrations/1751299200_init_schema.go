package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// authRule restricts access to authenticated users only. Since this is a
// single-user app, any logged-in user (the owner) has full access.
func authRule() *string {
	s := `@request.auth.id != ""`
	return &s
}

func ptr[T any](v T) *T { return &v }

func init() {
	m.Register(func(app core.App) error {
		rule := authRule()

		platformValues := []string{"Remessa Online", "Deel", "Higlobal", "Wise", "Outro"}

		// ---- clients ----------------------------------------------------
		clients := core.NewBaseCollection("clients")
		clients.ListRule, clients.ViewRule, clients.CreateRule, clients.UpdateRule, clients.DeleteRule = rule, rule, rule, rule, rule
		clients.Fields.Add(
			&core.TextField{Name: "name", Required: true, Presentable: true, Max: 200},
			&core.SelectField{Name: "default_platform", Values: platformValues, MaxSelect: 1},
			&core.BoolField{Name: "active"},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		if err := app.Save(clients); err != nil {
			return err
		}

		// ---- remittances (USD received from clients) --------------------
		remittances := core.NewBaseCollection("remittances")
		remittances.ListRule, remittances.ViewRule, remittances.CreateRule, remittances.UpdateRule, remittances.DeleteRule = rule, rule, rule, rule, rule
		remittances.Fields.Add(
			&core.RelationField{Name: "client", Required: true, CollectionId: clients.Id, MaxSelect: 1, CascadeDelete: false},
			&core.SelectField{Name: "platform", Values: platformValues, MaxSelect: 1, Required: true},
			&core.NumberField{Name: "amount_usd", Required: true, Min: ptr(0.0)},
			&core.DateField{Name: "pay_day", Required: true},
			&core.TextField{Name: "notes", Max: 500},
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		if err := app.Save(remittances); err != nil {
			return err
		}

		// ---- imports (USD actually converted to BRL) --------------------
		imports := core.NewBaseCollection("imports")
		imports.ListRule, imports.ViewRule, imports.CreateRule, imports.UpdateRule, imports.DeleteRule = rule, rule, rule, rule, rule
		imports.Fields.Add(
			&core.SelectField{Name: "platform", Values: platformValues, MaxSelect: 1, Required: true},
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

		// ---- expenses ---------------------------------------------------
		expenses := core.NewBaseCollection("expenses")
		expenses.ListRule, expenses.ViewRule, expenses.CreateRule, expenses.UpdateRule, expenses.DeleteRule = rule, rule, rule, rule, rule
		expenses.Fields.Add(
			&core.DateField{Name: "date", Required: true},
			&core.SelectField{Name: "category", MaxSelect: 1, Required: true, Values: []string{
				"Unimed", "Internet", "Contabilizei", "GoWork",
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

		// ---- recurring_services (due dates) -----------------------------
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

		// ---- profit_distributions (DIST LUCROS) -------------------------
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

		// ---- tax_periods (computed quarterly assessment) ----------------
		taxes := core.NewBaseCollection("tax_periods")
		taxes.ListRule, taxes.ViewRule, taxes.CreateRule, taxes.UpdateRule, taxes.DeleteRule = rule, rule, rule, rule, rule
		taxes.Fields.Add(
			&core.NumberField{Name: "year", Required: true, OnlyInt: true},
			&core.NumberField{Name: "quarter", Required: true, OnlyInt: true, Min: ptr(1.0), Max: ptr(4.0)},
			&core.NumberField{Name: "revenue"},        // imported revenue in the quarter
			&core.NumberField{Name: "base_irpj"},       // revenue * presumption
			&core.NumberField{Name: "irpj"},            // base * rate
			&core.NumberField{Name: "irpj_adicional"},  // 10% surtax
			&core.NumberField{Name: "base_csll"},
			&core.NumberField{Name: "csll"},
			&core.NumberField{Name: "total"},
			&core.BoolField{Name: "locked"}, // freezes the value once the DARF is paid
			&core.AutodateField{Name: "created", OnCreate: true},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		if err := app.Save(taxes); err != nil {
			return err
		}

		// ---- settings (singleton) ---------------------------------------
		settings := core.NewBaseCollection("settings")
		settings.ListRule, settings.ViewRule, settings.CreateRule, settings.UpdateRule, settings.DeleteRule = rule, rule, rule, rule, rule
		settings.Fields.Add(
			&core.TextField{Name: "company_name", Max: 200},
			&core.TextField{Name: "cnpj", Max: 20},
			// Tax parameters (Lucro Presumido, exported services) — editable.
			// IRPJ uses a tiered presumption: reduced rate up to the annual
			// revenue limit, full rate on the excess.
			&core.NumberField{Name: "irpj_presumption_reduced", Min: ptr(0.0), Max: ptr(1.0)},   // e.g. 0.16
			&core.NumberField{Name: "irpj_presumption_standard", Min: ptr(0.0), Max: ptr(1.0)},  // e.g. 0.32
			&core.NumberField{Name: "irpj_reduced_annual_limit"},                                 // e.g. 120000 (revenue/year)
			&core.NumberField{Name: "irpj_rate", Min: ptr(0.0), Max: ptr(1.0)},                  // e.g. 0.15
			&core.NumberField{Name: "irpj_adicional_rate", Min: ptr(0.0), Max: ptr(1.0)},        // e.g. 0.10
			&core.NumberField{Name: "irpj_adicional_threshold"},                                  // e.g. 60000 (base/quarter)
			// CSLL: always full presumption.
			&core.NumberField{Name: "csll_presumption", Min: ptr(0.0), Max: ptr(1.0)},           // e.g. 0.32
			&core.NumberField{Name: "csll_rate", Min: ptr(0.0), Max: ptr(1.0)},                  // e.g. 0.09
			&core.NumberField{Name: "inss_monthly"},                                              // fixed monthly pró-labore INSS
			&core.NumberField{Name: "dollar_rate"},                                               // cached current FX rate
			&core.DateField{Name: "dollar_rate_at"},
			&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
		)
		if err := app.Save(settings); err != nil {
			return err
		}

		return seedDefaults(app, settings, services, clients)
	}, func(app core.App) error {
		// down: drop in reverse dependency order
		for _, name := range []string{
			"settings", "tax_periods", "profit_distributions", "recurring_services",
			"expenses", "imports", "remittances", "clients",
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

func seedDefaults(app core.App, settings, services, clients *core.Collection) error {
	// settings singleton with standard Lucro Presumido defaults
	s := core.NewRecord(settings)
	s.Set("company_name", "")
	s.Set("cnpj", "")
	s.Set("irpj_presumption_reduced", 0.16)
	s.Set("irpj_presumption_standard", 0.32)
	s.Set("irpj_reduced_annual_limit", 120000.0)
	s.Set("irpj_rate", 0.15)
	s.Set("irpj_adicional_rate", 0.10)
	s.Set("irpj_adicional_threshold", 60000.0)
	s.Set("csll_presumption", 0.32)
	s.Set("csll_rate", 0.09)
	s.Set("inss_monthly", 0.0)
	if err := app.Save(s); err != nil {
		return err
	}

	// recurring services with their due days (Vencimentos)
	svc := []struct {
		name string
		day  int
	}{
		{"INTERNET", 10}, {"UNIMED", 10}, {"GOWORK", 14}, {"CONTABILIZEI", 15}, {"DARF INSS", 17},
	}
	for _, v := range svc {
		r := core.NewRecord(services)
		r.Set("name", v.name)
		r.Set("exp_day", v.day)
		if err := app.Save(r); err != nil {
			return err
		}
	}

	// Clients are added by the user in-app (no seed to avoid shipping real names).
	_ = clients

	return nil
}
