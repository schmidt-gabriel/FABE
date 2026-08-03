package api

import (
	"testing"

	"financeapp/backend/internal/fx"
)

func TestQuoteCacheEmpty(t *testing.T) {
	var c quoteCache
	if _, ok := c.get(); ok {
		t.Error("expected no quote before anything is stored")
	}
}

// A cached quote is by definition older than the request it answers, so it must
// come back flagged for the UI without the stored copy being mutated.
func TestQuoteCacheMarksStale(t *testing.T) {
	var c quoteCache
	c.set(fx.Quote{Rate: 5.07, Date: "2026-08-03", Source: "awesomeapi"})

	got, ok := c.get()
	if !ok {
		t.Fatal("expected the stored quote")
	}
	if got.Rate != 5.07 || got.Date != "2026-08-03" {
		t.Errorf("got %+v", got)
	}
	if !got.Stale {
		t.Error("cached quote should be flagged stale")
	}
	if c.quote.Stale {
		t.Error("the stored quote itself should not be mutated")
	}
}

func TestQuoteCacheKeepsLatest(t *testing.T) {
	var c quoteCache
	c.set(fx.Quote{Rate: 5.01})
	c.set(fx.Quote{Rate: 5.42})

	got, _ := c.get()
	if got.Rate != 5.42 {
		t.Errorf("rate = %v, want the most recent 5.42", got.Rate)
	}
}
