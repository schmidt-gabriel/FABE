package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/security"
)

// Seeds a single app user with random credentials on a fresh database (only
// when the `users` collection is empty), so the app has an account to sign in
// with. The credentials are NOT logged: set/reset this user's password from the
// PocketBase admin once a superuser exists.
//
// The PocketBase admin (superuser) is intentionally NOT seeded. On a fresh DB
// PocketBase already prints the dashboard URL and the "create first superuser"
// install link (only while the _superusers table is empty).
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
		rec.SetRandomPassword() // random password, not exposed anywhere
		return app.Save(rec)
	}, func(app core.App) error {
		// down: no-op (leave any manually created users untouched)
		return nil
	})
}
