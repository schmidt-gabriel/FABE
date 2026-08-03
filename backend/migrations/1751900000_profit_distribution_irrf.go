package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

// Replaces profit_distributions.cota_irrf with `irrf`.
//
// `cota_irrf` had two contradictory meanings and no reader: the frontend wrote
// it as "remaining tax-free quota for the month" (R$50k - amount, negative when
// the month went over), while sample_data.json stored the IRRF withheld. The
// Overview never read either, recomputing 10% on its own.
//
// The new field has a single meaning: **IRRF alta renda actually withheld on
// this record** (BRL, DARF cód. 1841), and it is the source of truth for every
// withheld total in the UI. The form pre-fills it with the computed 10% of the
// month, but the user can override it with what the DARF actually came out to
// (rounding, retroactive correction, profits accrued through 2025 that stay
// exempt even in a month above the threshold). The remaining quota it used to
// hold is trivially derived and is now computed for display only.
//
// The old column is dropped rather than renamed on purpose: its values mean
// something else entirely, so carrying them over would silently turn a quota
// into a withholding. Existing records are backfilled with the computed value.

const (
	irrfThreshold = 50000.0 // monthly distribution above which IRRF applies
	irrfRate      = 0.10    // 10% on the full month's amount
	irrfStartYear = 2026    // Lei 15.270/2025 only applies from 2026 on
)

func init() {
	m.Register(func(app core.App) error {
		return swapDistributionIrrfField(app,
			&core.NumberField{Name: "irrf", Min: ptr(0.0)},
			"irrf",
			// Backfill: 10% of each record in a month that went over the
			// threshold. Summed per month this equals 10% of the month's
			// total, which is what the law charges.
			func(amount float64, monthTotal float64, year int) float64 {
				if year < irrfStartYear || monthTotal <= irrfThreshold {
					return 0
				}
				return amount * irrfRate
			},
		)
	}, func(app core.App) error {
		return swapDistributionIrrfField(app,
			&core.NumberField{Name: "cota_irrf"},
			"cota_irrf",
			// down: back to the old "remaining tax-free quota" meaning.
			func(amount float64, _ float64, _ int) float64 {
				return irrfThreshold - amount
			},
		)
	})
}

// swapDistributionIrrfField drops whichever of the two fields exists on
// profit_distributions, adds `field`, and fills it for every record using
// `value(amount, monthTotal, year)`.
func swapDistributionIrrfField(app core.App, field core.Field, name string, value func(amount, monthTotal float64, year int) float64) error {
	col, err := app.FindCollectionByNameOrId("profit_distributions")
	if err != nil {
		return err
	}
	col.Fields.RemoveByName("cota_irrf")
	col.Fields.RemoveByName("irrf")
	col.Fields.Add(field)
	if err := app.Save(col); err != nil {
		return err
	}

	// Re-fetch against the new schema, then total each month before writing:
	// the threshold applies to the month as a whole, not to a single record.
	records, err := app.FindAllRecords("profit_distributions")
	if err != nil {
		return err
	}
	monthTotal := map[string]float64{}
	for _, r := range records {
		monthTotal[r.GetDateTime("month").Time().Format("2006-01")] += r.GetFloat("amount")
	}
	for _, r := range records {
		month := r.GetDateTime("month").Time()
		key := month.Format("2006-01")
		r.Set(name, value(r.GetFloat("amount"), monthTotal[key], month.Year()))
		if err := app.Save(r); err != nil {
			return err
		}
	}
	return nil
}
