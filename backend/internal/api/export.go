package api

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"slices"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// exportable lists the business collections safe to export. System/auth
// collections (users, _superusers, ...) are intentionally excluded so secrets
// like password hashes are never dumped.
var exportable = []string{
	"platforms",
	"clients",
	"remittances",
	"imports",
	"expenses",
	"recurring_services",
	"profit_distributions",
	"tax_periods",
	"settings",
	// Pessoa Física module (see migrations/1751920000_invest.go).
	"investments_invest",
	"settings_invest",
}

// registerExportRoutes wires the data-export endpoints.
//
//	GET /api/export/backup     -> full JSON dump of every business collection
//	GET /api/export/csv/{name} -> a single collection as CSV
func registerExportRoutes(app core.App, e *core.ServeEvent) {
	e.Router.GET("/api/export/backup", func(re *core.RequestEvent) error {
		dump := make(map[string]any, len(exportable))
		for _, name := range exportable {
			records, err := app.FindAllRecords(name)
			if err != nil {
				return err
			}
			dump[name] = records
		}
		re.Response.Header().Set("Content-Disposition", `attachment; filename="financeapp-backup.json"`)
		return re.JSON(http.StatusOK, dump)
	}).Bind(apis.RequireAuth())

	e.Router.GET("/api/export/csv/{name}", func(re *core.RequestEvent) error {
		name := re.Request.PathValue("name")
		if !slices.Contains(exportable, name) {
			return apis.NewNotFoundError("unknown collection", nil)
		}
		csvBytes, err := collectionToCSV(app, name)
		if err != nil {
			return err
		}
		re.Response.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.csv"`, name))
		return re.Blob(http.StatusOK, "text/csv; charset=utf-8", csvBytes)
	}).Bind(apis.RequireAuth())

	// POST /api/import/backup?mode=overwrite|append
	// Body: the JSON produced by /api/export/backup.
	e.Router.POST("/api/import/backup", func(re *core.RequestEvent) error {
		return importBackup(app, re)
	}).Bind(apis.RequireAuth())
}

type importResult struct {
	Mode     string         `json:"mode"`
	Imported map[string]int `json:"imported"`
}

func importBackup(app core.App, re *core.RequestEvent) error {
	mode := re.Request.URL.Query().Get("mode")
	if mode != "overwrite" && mode != "append" {
		return apis.NewBadRequestError("mode must be 'overwrite' or 'append'", nil)
	}

	var dump map[string][]map[string]any
	if err := json.NewDecoder(re.Request.Body).Decode(&dump); err != nil {
		return apis.NewBadRequestError("invalid JSON body", err)
	}

	imported := map[string]int{}
	err := app.RunInTransaction(func(tx core.App) error {
		// Overwrite: wipe collections in reverse dependency order so relations
		// (e.g. remittances -> clients) are removed before their targets.
		if mode == "overwrite" {
			for i := len(exportable) - 1; i >= 0; i-- {
				records, err := tx.FindAllRecords(exportable[i])
				if err != nil {
					return err
				}
				for _, r := range records {
					if err := tx.Delete(r); err != nil {
						return err
					}
				}
			}
		}

		// Insert in forward order (clients before remittances), preserving IDs
		// so relations stay intact.
		for _, name := range exportable {
			col, err := tx.FindCollectionByNameOrId(name)
			if err != nil {
				return err
			}
			for _, data := range dump[name] {
				id, _ := data["id"].(string)
				if mode == "append" && id != "" {
					if existing, _ := tx.FindRecordById(name, id); existing != nil {
						continue // keep existing record
					}
				}
				rec := core.NewRecord(col)
				if id != "" {
					rec.Set("id", id)
				}
				for _, f := range col.Fields {
					n := f.GetName()
					if n == "id" {
						continue
					}
					if v, ok := data[n]; ok {
						rec.Set(n, v)
					}
				}
				if err := tx.Save(rec); err != nil {
					return err
				}
				imported[name]++
			}
		}
		return nil
	})
	if err != nil {
		return apis.NewApiError(http.StatusUnprocessableEntity, "import failed: "+err.Error(), err)
	}

	return re.JSON(http.StatusOK, importResult{Mode: mode, Imported: imported})
}

func collectionToCSV(app core.App, name string) ([]byte, error) {
	collection, err := app.FindCollectionByNameOrId(name)
	if err != nil {
		return nil, err
	}

	// Columns are the collection fields in schema order ("id" is already
	// included among them in PocketBase v0.23+).
	fields := collection.Fields
	columns := make([]string, len(fields))
	for i, f := range fields {
		columns[i] = f.GetName()
	}

	records, err := app.FindAllRecords(name)
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	if err := w.Write(columns); err != nil {
		return nil, err
	}
	for _, r := range records {
		row := make([]string, len(columns))
		for i, name := range columns {
			row[i] = fmt.Sprintf("%v", r.Get(name))
		}
		if err := w.Write(row); err != nil {
			return nil, err
		}
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
