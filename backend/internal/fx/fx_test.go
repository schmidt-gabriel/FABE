package fx

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// Keep the retry tests fast.
func init() { retryDelay = time.Millisecond }

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
	body := []byte(`[{"bid":"5.20","timestamp":"1785531571","create_date":"2026-06-26 13:00:00"}]`)
	rate, ts, err := parseDaily(body)
	if err != nil {
		t.Fatal(err)
	}
	if rate != 5.20 {
		t.Errorf("rate = %v, want 5.20", rate)
	}
	if ts != 1785531571 {
		t.Errorf("timestamp = %v, want 1785531571", ts)
	}
}

func TestParseDailyEmpty(t *testing.T) {
	if _, _, err := parseDaily([]byte(`[]`)); err == nil {
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

// A weekend or holiday has no quote of its own, so the request must span a
// window ending on that date and report the business day actually returned.
func TestFetchByDateFallsBackToPreviousBusinessDay(t *testing.T) {
	var gotQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
		// 1785531571 = 2026-07-31, the Friday before the requested Saturday.
		w.Write([]byte(`[{"bid":"5.0736","timestamp":"1785531571"}]`))
	}))
	defer srv.Close()

	c := &Client{HTTP: srv.Client(), BaseURL: srv.URL}
	q, err := c.Fetch(context.Background(), "2026-08-01")
	if err != nil {
		t.Fatal(err)
	}
	if q.Rate != 5.0736 {
		t.Errorf("rate = %v, want 5.0736", q.Rate)
	}
	want := time.Unix(1785531571, 0).Format("2006-01-02")
	if q.Date != want {
		t.Errorf("date = %q, want %q (the previous business day)", q.Date, want)
	}
	if !strings.Contains(gotQuery, "end_date=20260801") {
		t.Errorf("query = %q, want it to end on the requested date", gotQuery)
	}
	if strings.Contains(gotQuery, "start_date=20260801") {
		t.Errorf("query = %q, want a look-back window, not a single day", gotQuery)
	}
}

func TestGetRetriesTransientFailure(t *testing.T) {
	var calls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		if calls < 3 {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		w.Write([]byte(`{"USDBRL":{"bid":"5.11"}}`))
	}))
	defer srv.Close()

	c := &Client{HTTP: srv.Client(), BaseURL: srv.URL}
	q, err := c.Fetch(context.Background(), "")
	if err != nil {
		t.Fatalf("expected the retry to succeed, got %v", err)
	}
	if q.Rate != 5.11 {
		t.Errorf("rate = %v, want 5.11", q.Rate)
	}
	if calls != 3 {
		t.Errorf("calls = %d, want 3", calls)
	}
}

// A 4xx is a definitive answer; retrying it only delays the error.
func TestGetDoesNotRetryClientError(t *testing.T) {
	var calls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	c := &Client{HTTP: srv.Client(), BaseURL: srv.URL}
	if _, err := c.Fetch(context.Background(), ""); err == nil {
		t.Fatal("expected an error")
	}
	if calls != 1 {
		t.Errorf("calls = %d, want 1", calls)
	}
}

func TestGetGivesUpAfterMaxAttempts(t *testing.T) {
	var calls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls++
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer srv.Close()

	c := &Client{HTTP: srv.Client(), BaseURL: srv.URL}
	if _, err := c.Fetch(context.Background(), ""); err == nil {
		t.Fatal("expected an error")
	}
	if calls != maxAttempts {
		t.Errorf("calls = %d, want %d", calls, maxAttempts)
	}
}
