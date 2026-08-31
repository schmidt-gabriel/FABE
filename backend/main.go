package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/pocketbase/pocketbase/tools/hook"

	"financeapp/backend/internal/api"

	// auto-register Go migrations (collections + seed data)
	_ "financeapp/backend/migrations"
)

func main() {
	app := pocketbase.New()

	isGoRun := strings.HasPrefix(os.Args[0], os.TempDir())

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		// migrations are authored in Go under ./migrations
		Automigrate: isGoRun,
	})

	// custom business endpoints (tax computation, etc.)
	api.Register(app)

	// Startup bootstrap, once the DB and migrations are ready (OnServe runs
	// after bootstrap): the optional master superuser (MASTER_EMAIL +
	// MASTER_PASSWORD) so a fresh deploy can log in without the pbinstall step,
	// and a default settings record so /api/tax/* works before any import.
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		ensureMasterUser(app)
		ensureSettings(app)
		ensureInvestSettings(app)
		return e.Next()
	})

	// Serve the built SPA (frontend) from ./pb_public with index.html fallback.
	app.OnServe().Bind(&hook.Handler[*core.ServeEvent]{
		Func: func(e *core.ServeEvent) error {
			if !e.Router.HasRoute(http.MethodGet, "/{path...}") {
				e.Router.GET("/{path...}", apis.Static(os.DirFS(publicDir()), true))
			}
			return e.Next()
		},
		Priority: 999,
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

func publicDir() string {
	if strings.HasPrefix(os.Args[0], os.TempDir()) {
		return "./pb_public"
	}
	return filepath.Join(filepath.Dir(os.Args[0]), "pb_public")
}

// ensureMasterUser upserts a superuser from MASTER_EMAIL/MASTER_PASSWORD when
// both are set, keeping the password in sync on every startup. A no-op when
// the vars are absent.
func ensureMasterUser(app core.App) {
	email := strings.TrimSpace(os.Getenv("MASTER_EMAIL"))
	password := os.Getenv("MASTER_PASSWORD")
	if email == "" || password == "" {
		return
	}

	superusers, err := app.FindCollectionByNameOrId(core.CollectionNameSuperusers)
	if err != nil {
		log.Printf("master user: %v", err)
		return
	}

	record, err := app.FindAuthRecordByEmail(superusers, email)
	if err != nil {
		record = core.NewRecord(superusers)
	}
	record.SetEmail(email)
	record.SetPassword(password)
	if err := app.Save(record); err != nil {
		log.Printf("master user: %v", err)
		return
	}
	log.Printf("master user ready: %s", email)
}

// ensureSettings seeds the singleton settings record (Lucro Presumido tax
// params) with the documented defaults when the collection is empty, so a
// fresh DB serves /api/tax/* instead of 404-ing on a missing record. It never
// touches an existing record, so imported/edited values are preserved. The
// defaults match the README table (validated against the real DARFs).
func ensureSettings(app core.App) {
	records, err := app.FindAllRecords("settings")
	if err != nil {
		log.Printf("settings: %v", err)
		return
	}
	if len(records) > 0 {
		return
	}

	col, err := app.FindCollectionByNameOrId("settings")
	if err != nil {
		log.Printf("settings: %v", err)
		return
	}
	rec := core.NewRecord(col)
	rec.Set("irpj_presumption_reduced", 0.16)
	rec.Set("irpj_presumption_standard", 0.32)
	rec.Set("irpj_reduced_annual_limit", 120000.0)
	rec.Set("irpj_rate", 0.15)
	rec.Set("irpj_adicional_rate", 0.10)
	rec.Set("irpj_adicional_threshold", 60000.0)
	rec.Set("csll_presumption", 0.32)
	rec.Set("csll_rate", 0.09)
	if err := app.Save(rec); err != nil {
		log.Printf("settings: %v", err)
		return
	}
	log.Printf("settings seeded with default tax params")
}

// ensureInvestSettings seeds the singleton settings_invest record (Pessoa
// Física / investimentos) with a default CDI, so the page has a record to edit
// on a fresh DB. Never touches an existing one.
func ensureInvestSettings(app core.App) {
	records, err := app.FindAllRecords("settings_invest")
	if err != nil {
		log.Printf("settings_invest: %v", err)
		return
	}
	if len(records) > 0 {
		return
	}

	col, err := app.FindCollectionByNameOrId("settings_invest")
	if err != nil {
		log.Printf("settings_invest: %v", err)
		return
	}
	rec := core.NewRecord(col)
	rec.Set("cdi_rate", 13.90) // % a.a.
	if err := app.Save(rec); err != nil {
		log.Printf("settings_invest: %v", err)
		return
	}
	log.Printf("settings_invest seeded with the default CDI")
}
