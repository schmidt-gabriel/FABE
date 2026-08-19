package migrations

import (
	"fmt"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// A third liquidity for a position: sold on the secondary market ("mercado"),
// beside daily redemption and holding to maturity. Display only, it does not
// change any calculation.
func init() {
	m.Register(func(app core.App) error {
		return setLiquidityValues(app, []string{"daily", "maturity", "market"})
	}, func(app core.App) error {
		return setLiquidityValues(app, []string{"daily", "maturity"})
	})
}

func setLiquidityValues(app core.App, values []string) error {
	col, err := app.FindCollectionByNameOrId("investments_invest")
	if err != nil {
		return err
	}
	field, ok := col.Fields.GetByName("liquidity").(*core.SelectField)
	if !ok {
		return fmt.Errorf("investments_invest.liquidity is not a select field")
	}
	field.Values = values
	return app.Save(col)
}
