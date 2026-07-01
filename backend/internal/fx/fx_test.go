package fx

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParseLast(t *testing.T) {
	body := []byte(`{"USDBRL":{"code":"USD","codein":"BRL","bid":"5.1543","ask":"5.16"}}`)
	rate, err := parseLast(body)
	if err != nil {
		t.Fatal(err)
	}
	if rate != 5.1543 {
		t.Errorf("rate = %v, want 5.1543", rate)
	}
}

func TestParseDaily(t *testing.T) {
	body := []byte(`[{"bid":"5.20","create_date":"2026-06-26 13:00:00"}]`)
	rate, err := parseDaily(body)
	if err != nil {
		t.Fatal(err)
	}
	if rate != 5.20 {
		t.Errorf("rate = %v, want 5.20", rate)
	}
}

func TestParseDailyEmpty(t *testing.T) {
	if _, err := parseDaily([]byte(`[]`)); err == nil {
		t.Error("expected error for empty daily response")
	}
}

func TestFetchByDate(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte(`[{"bid":"5.33"}]`))
	}))
	defer srv.Close()

	c := &Client{HTTP: srv.Client(), BaseURL: srv.URL}
	q, err := c.Fetch(context.Background(), "2026-01-14")
	if err != nil {
		t.Fatal(err)
	}
	if q.Rate != 5.33 || q.Date != "2026-01-14" {
		t.Errorf("got %+v", q)
	}
}
