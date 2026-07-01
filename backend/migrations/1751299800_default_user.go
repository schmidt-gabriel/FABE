package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/security"
)

// Seeds a single app user with random credentials on a fresh database (only
// when the `users` collection is empty). The generated email and password are
// printed to the server log once so the owner can sign in to the app UI.
//
// The PocketBase admin (superuser) is intentionally NOT seeded, so the admin
// panel still shows its "create first superuser" screen on a fresh install.
func init() {
	m.Register(func(app core.App) error {
		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			// No users collection on this DB: nothing to seed.
			return nil
		}

		total, err := app.CountRecords("users")
		if err != nil {
			return err
		}
		if total > 0 {
			return nil
		}

		email := "user_" + security.RandomStringWithAlphabet(8, "abcdefghijklmnopqrstuvwxyz0123456789") + "@local.test"
		rec := core.NewRecord(users)
		rec.Set("email", email)
		rec.Set("emailVisibility", true)
		rec.Set("verified", true)
		password := rec.SetRandomPassword() // generates and returns a strong password
		if err := app.Save(rec); err != nil {
			return err
		}

		log.Printf(
			"\n========================================================\n"+
				" Default app user created (random, shown only once)\n"+
				"   email:    %s\n"+
				"   password: %s\n"+
				" Use these to sign in to the app UI (:5173).\n"+
				" The PocketBase admin (:8090/_/) will ask you to create\n"+
				" its own superuser separately.\n"+
				"========================================================\n",
			email, password,
		)
		return nil
	}, func(app core.App) error {
		// down: no-op (leave any manually created users untouched)
		return nil
	})
}
