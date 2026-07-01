// Package fx fetches USD/BRL exchange rates from AwesomeAPI.
package fx

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

const baseURL = "https://economia.awesomeapi.com.br/json"

// Quote is a single USD/BRL exchange rate observation.
type Quote struct {
	Rate   float64 `json:"rate"`
	Date   string  `json:"date"`   // YYYY-MM-DD
	Source string  `json:"source"` // "awesomeapi"
}

// Client fetches quotes. The HTTP client and base URL are injectable for tests.
type Client struct {
	HTTP    *http.Client
	BaseURL string
}

// NewClient returns a Client with sane defaults.
func NewClient() *Client {
	return &Client{
		HTTP:    &http.Client{Timeout: 10 * time.Second},
		BaseURL: baseURL,
	}
}

// Fetch returns the USD/BRL rate for the given date (YYYY-MM-DD). An empty date
// means the latest available quote.
func (c *Client) Fetch(ctx context.Context, date string) (Quote, error) {
	if date == "" {
		return c.fetchLatest(ctx)
	}
	return c.fetchByDate(ctx, date)
}

func (c *Client) fetchLatest(ctx context.Context) (Quote, error) {
	body, err := c.get(ctx, c.BaseURL+"/last/USD-BRL")
	if err != nil {
		return Quote{}, err
	}
	rate, err := parseLast(body)
	if err != nil {
		return Quote{}, err
	}
	return Quote{Rate: rate, Date: time.Now().Format("2006-01-02"), Source: "awesomeapi"}, nil
}

func (c *Client) fetchByDate(ctx context.Context, date string) (Quote, error) {
	d, err := time.Parse("2006-01-02", date)
	if err != nil {
		return Quote{}, fmt.Errorf("invalid date %q: %w", date, err)
	}
	ymd := d.Format("20060102")
	url := fmt.Sprintf("%s/daily/USD-BRL/?start_date=%s&end_date=%s", c.BaseURL, ymd, ymd)
	body, err := c.get(ctx, url)
	if err != nil {
		return Quote{}, err
	}
	rate, err := parseDaily(body)
	if err != nil {
		return Quote{}, err
	}
	return Quote{Rate: rate, Date: date, Source: "awesomeapi"}, nil
}

func (c *Client) get(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("awesomeapi returned status %d", resp.StatusCode)
	}
	return io.ReadAll(resp.Body)
}

// parseLast extracts the bid from the /last/USD-BRL response shape:
// {"USDBRL":{"bid":"5.15", ...}}
func parseLast(body []byte) (float64, error) {
	var out map[string]struct {
		Bid string `json:"bid"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return 0, err
	}
	q, ok := out["USDBRL"]
	if !ok {
		return 0, fmt.Errorf("USDBRL not present in response")
	}
	return strconv.ParseFloat(q.Bid, 64)
}

// parseDaily extracts the bid from the /daily/USD-BRL response shape:
// [{"bid":"5.15", ...}, ...]
func parseDaily(body []byte) (float64, error) {
	var out []struct {
		Bid string `json:"bid"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return 0, err
	}
	if len(out) == 0 {
		return 0, fmt.Errorf("no quote available for the requested date")
	}
	return strconv.ParseFloat(out[0].Bid, 64)
}
