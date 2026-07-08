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

	// Optional master superuser from env (MASTER_EMAIL + MASTER_PASSWORD), so a
	// fresh deploy can log in without the manual pbinstall step.
	app.OnBootstrap().BindFunc(func(e *core.BootstrapEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		ensureMasterUser(app)
		return nil
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
