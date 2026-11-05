# PR #90 staging deployment notes

## VPS configuration

The VPS already has `/root/Project1/.env`. **Do not commit this file or
copy secrets into GitHub Actions logs.** The deployment script copies it to
`/root/project1-config/.env` (mode 0600) before Git checkout and restores it
after checkout. Check that the directory and backup are accessible only to the
deployment user. The deployment will stop if `.env` does not exist.

The existing `.env` needs all application/SQL Server settings and
`FRONTEND_URL=https://<actual-vercel-domain>` for browser CORS access.
Multiple domains can be comma-separated. This PR does not guess the domain.
The container joins the existing external Docker network `football-network`.
SQL Server is provisioned separately; CI smoke tests do NOT test SQL operations.

## Safety and rollback

The deployment uses the exact successful CI commit SHA, retains the preceding
running container image, and checks `/ready` (SQL Server must answer SELECT 1).
If readiness fails it restores the previous image and recreates the backend
container. A full production rollback (including source, config, and database)
must be handled separately. Take a database backup before production changes.
Avoid manually editing tracked files on the VPS.

## Required checks before enabling deployment

1. Verify `FRONTEND_URL` matches the real Vercel origin (scheme + host).
2. Verify all SQL Server credentials in the VPS `.env` still work and the
   `football-network` exists.
3. Confirm GitHub Actions secrets VPS_HOST, VPS_USER, VPS_SSH_KEY, VPS_PORT,
   FRONTEND_SYNC_TOKEN are configured where needed.
4. Review SQL Server files and any secrets already in repository history;
   rotate any previously exposed credentials, then consider history cleanup
   with the team. Removing them from a new commit does not erase history.
5. Run a separate integration/E2E suite using an isolated database. The
   `api-test` CI job here only asserts database-free live HTTP smoke endpoints.
6. Confirm the Vercel fork frontend folder and project settings before sync.
