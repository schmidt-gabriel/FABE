package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// `investments_invest` started as a list of products to compare under a single
// hypothetical amount. It is the real thing: the positions actually bought. So
// each record carries what was put in it and when, plus the corretora it sits
// in (XP, Nubank, ...), and the page computes "quanto tenho hoje" from those
// instead of from the simulation's global "valor a investir".
//
// All three are optional so records created before this keep loading; a
// position without `amount` simply yields nothing until it is filled in.
func init() {
	m.Register(func(app core.App) error {
		if err := addField(app, "investments_invest", &core.NumberField{Name: "amount", Min: ptr(0.0)}); err != nil {
			return err
		}
		if err := addField(app, "investments_invest", &core.DateField{Name: "applied_at"}); err != nil {
			return err
		}
		return addField(app, "investments_invest", &core.TextField{Name: "broker", Max: 100})
	}, func(app core.App) error {
		for _, f := range []string{"amount", "applied_at", "broker"} {
			if err := dropField(app, "investments_invest", f); err != nil {
				return err
			}
		}
		return nil
	})
}
