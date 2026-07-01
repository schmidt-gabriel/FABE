// Package tax implements the Lucro Presumido quarterly assessment for an
// exporting service company (IRPJ + CSLL). PIS/COFINS are exempt on service
// exports, so they are not computed here.
package tax

// Params holds the (configurable) tax rates. Defaults live in the settings
// collection so they can be tuned without code changes.
type Params struct {
	// IRPJ uses a tiered presumption: revenue accumulated within the year up
	// to ReducedAnnualLimit is presumed at PresumptionReduced (e.g. 16%); the
	// excess at PresumptionStandard (e.g. 32%).
	IRPJPresumptionReduced  float64
	IRPJPresumptionStandard float64
	IRPJReducedAnnualLimit   float64
	IRPJRate                 float64 // e.g. 0.15
	IRPJAdicionalRate        float64 // e.g. 0.10
	IRPJAdicionalThreshold   float64 // e.g. 60000 (presumed base per quarter)

	// CSLL always uses the full presumption.
	CSLLPresumption float64 // e.g. 0.32
	CSLLRate        float64 // e.g. 0.09
}

// QuarterResult is the computed assessment for a single quarter.
type QuarterResult struct {
	Quarter       int     `json:"quarter"`
	Revenue       float64 `json:"revenue"`
	BaseIRPJ      float64 `json:"base_irpj"`
	IRPJ          float64 `json:"irpj"`
	IRPJAdicional float64 `json:"irpj_adicional"`
	BaseCSLL      float64 `json:"base_csll"`
	CSLL          float64 `json:"csll"`
	Total         float64 `json:"total"`
}

// ComputeYear computes IRPJ/CSLL for each quarter given the quarterly revenue
// (in BRL, already converted). Index 0 = Q1.
func ComputeYear(revenue [4]float64, p Params) [4]QuarterResult {
	var res [4]QuarterResult
	ytdBefore := 0.0
	for i := 0; i < 4; i++ {
		rev := revenue[i]

		baseIRPJ := tieredPresumptionBase(ytdBefore, rev, p)
		irpj := baseIRPJ * p.IRPJRate

		adicional := 0.0
		if baseIRPJ > p.IRPJAdicionalThreshold {
			adicional = (baseIRPJ - p.IRPJAdicionalThreshold) * p.IRPJAdicionalRate
		}

		baseCSLL := rev * p.CSLLPresumption
		csll := baseCSLL * p.CSLLRate

		res[i] = QuarterResult{
			Quarter:       i + 1,
			Revenue:       rev,
			BaseIRPJ:      baseIRPJ,
			IRPJ:          irpj,
			IRPJAdicional: adicional,
			BaseCSLL:      baseCSLL,
			CSLL:          csll,
			Total:         irpj + adicional + csll,
		}
		ytdBefore += rev
	}
	return res
}

// tieredPresumptionBase returns the IRPJ presumed base for `rev`, splitting it
// across the reduced and standard presumption rates based on how much of the
// annual reduced-rate room remains (given revenue already accumulated this year).
func tieredPresumptionBase(ytdBefore, rev float64, p Params) float64 {
	reduced := 0.0
	if room := p.IRPJReducedAnnualLimit - ytdBefore; room > 0 {
		if rev <= room {
			reduced = rev
		} else {
			reduced = room
		}
	}
	standard := rev - reduced
	return reduced*p.IRPJPresumptionReduced + standard*p.IRPJPresumptionStandard
}
