package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// A Simulação (o comparador hipotético "CDB ou LCI?") saiu do módulo Pessoa
// Física: sobrou a carteira real. Com ela vão embora os dois parâmetros que só
// ela usava, `amount` (valor a investir) e `months` (prazo simulado). O que
// resta em `settings_invest` é o `cdi_rate`, que indexa toda a carteira.
func init() {
	m.Register(func(app core.App) error {
		for _, f := range []string{"amount", "months"} {
			if err := dropField(app, "settings_invest", f); err != nil {
				return err
			}
		}
		return nil
	}, func(app core.App) error {
		if err := addField(app, "settings_invest", &core.NumberField{Name: "amount", Min: ptr(0.0)}); err != nil {
			return err
		}
		return addField(app, "settings_invest", &core.NumberField{Name: "months", OnlyInt: true, Min: ptr(1.0), Max: ptr(36.0)})
	})
}
