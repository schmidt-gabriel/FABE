package tax

import (
	"math"
	"testing"
)

func defaultParams() Params {
	return Params{
		IRPJPresumptionReduced:  0.16,
		IRPJPresumptionStandard: 0.32,
		IRPJReducedAnnualLimit:  120000,
		IRPJRate:                0.15,
		IRPJAdicionalRate:       0.10,
		IRPJAdicionalThreshold:  60000,
		CSLLPresumption:         0.32,
		CSLLRate:                0.09,
	}
}

func approx(a, b float64) bool { return math.Abs(a-b) < 0.5 }

// Once the annual reduced-rate room is exhausted, the full 32% presumption
// applies: revenue 100000 -> base 32000 -> IRPJ 4800, CSLL 2880.
func TestStandardPresumption(t *testing.T) {
	p := defaultParams()
	const rev = 100000.0
	// Simulate a quarter where the annual reduced room is already exhausted.
	res := ComputeYear([4]float64{200000, rev, 0, 0}, p)
	q := res[1] // Q2, after Q1 already consumed the 120k reduced room

	if !approx(q.CSLL, 2880) {
		t.Errorf("CSLL = %.2f, want ~2880", q.CSLL)
	}
	if !approx(q.IRPJ, 4800) {
		t.Errorf("IRPJ = %.2f, want ~4800 (full 32%% presumption)", q.IRPJ)
	}
}

// CSLL must always use the full 32% presumption regardless of the IRPJ tier.
func TestCSLLAlwaysFullPresumption(t *testing.T) {
	p := defaultParams()
	res := ComputeYear([4]float64{100000, 0, 0, 0}, p)
	want := 100000 * 0.32 * 0.09
	if !approx(res[0].CSLL, want) {
		t.Errorf("CSLL = %.2f, want %.2f", res[0].CSLL, want)
	}
}

// The reduced 16% presumption applies to the first 120k of yearly revenue.
func TestReducedPresumptionFirstQuarter(t *testing.T) {
	p := defaultParams()
	res := ComputeYear([4]float64{100000, 0, 0, 0}, p)
	wantBase := 100000 * 0.16
	if !approx(res[0].BaseIRPJ, wantBase) {
		t.Errorf("base IRPJ = %.2f, want %.2f", res[0].BaseIRPJ, wantBase)
	}
}

// Revenue spanning the 120k limit must split across both presumption rates.
func TestTieredSplitAcrossLimit(t *testing.T) {
	p := defaultParams()
	res := ComputeYear([4]float64{150000, 0, 0, 0}, p)
	wantBase := 120000*0.16 + 30000*0.32 // 19200 + 9600
	if !approx(res[0].BaseIRPJ, wantBase) {
		t.Errorf("base IRPJ = %.2f, want %.2f", res[0].BaseIRPJ, wantBase)
	}
}
