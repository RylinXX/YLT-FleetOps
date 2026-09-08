# Production Deployment

Deployed on 2026-09-06 to https://ylt.etgq.com/api/ .

## Runtime

- Server: `192.144.171.234`.
- Service: `capcloud-api.service`, enabled at boot, restarted on failure.
- Application: `/opt/capcloud-api/current` -> `releases/20260907T063500Z`.
- Node.js: dedicated Node 24.20.0 LTS under `/opt/capcloud-api/runtime`.
- Listener: `127.0.0.1:5189`; no additional public port was opened.
- Origin: `https://ylt.etgq.com`, configured through `PUBLIC_ORIGIN`.
- Process: systemd dynamic user, read-only application filesystem, private temporary directory, 512 MiB memory limit. Its dedicated state directory is writable for SQLite.
- Database: `/var/lib/capcloud-api/directory.sqlite`, persistent across code deployments and restarts; see `../docs/DATABASE.md`.
- Public entry: `/api/`; `/api` redirects to `/api/`.
- The previous `/API` and `/API/` links redirect to their lowercase equivalents.
- Diagnostic workbench: `/api/lab.html`.

The existing Node installation and the main site's port 8002 service were not replaced.

## Reverse Proxy

- Site config: `/www/server/panel/vhost/nginx/ylt.etgq.com.conf`.
- Added include: `/www/server/panel/vhost/nginx/extension/capcloud-api-location.inc`.
- Dedicated rate-limit zones: `/www/server/panel/vhost/nginx/capcloud-api-limits.conf`.
- Original site config backup: `/opt/capcloud-api/backups/ylt.etgq.com.conf.20260906T082322Z`.
- Only `/api/`, the application's exact static entry files and its `/api/assets/`, `/api/exports/`, `/api/api/` subtrees are routed to this application. Do not add a blanket `/api/` prefix location: the parent site's existing `/api/records`, `/api/soil_types`, `/api/absorptive/*` and other API routes must remain untouched.
- Shared proxy settings: `/www/server/panel/vhost/nginx/extension/capcloud-api-proxy.inc`.
- HTTPS uses the existing domain certificate. GET/HEAD only at the new proxy route; APIs remain GET-only. Per-IP limit is 4 requests/second with a burst of 30 and 16 simultaneous connections.

## Checks

40 automated tests passed locally and on the server, including deployment subpaths, HTTPS Origin validation, startup through a release symlink, incremental database updates and rollback/retention behavior.

Verified the directory's public homepage, six database-backed category datasets, source image, favicon, workbench, OpenAPI export, API health, filtering and mobile layout. Foreign Origin and write-method checks remain rejected. The parent site's separate bookkeeping service has errors recorded in `DATABASE-ROLLOUT.md`; it was not modified.

The ordinary-company source still reports 1798 records but returns 1796 with 4 duplicate identifiers. The application retains its explicit completeness warning. Other categories passed count and identifier checks. See `../docs/directory-verification.json` for the latest public-host validation.

## Maintenance

```sh
systemctl status capcloud-api.service
journalctl -u capcloud-api.service -n 100 --no-pager
systemctl restart capcloud-api.service
curl -fsS http://127.0.0.1:5189/api/health
```

Build future releases with the deployment prefix, separately from local builds:

```sh
npm test
npm run build -- --base=/api/ --outDir dist-deploy
```

Copy `dist-deploy` as the next release's `dist` directory, alongside `server.mjs`, `directory-service.mjs`, `directory-store.mjs`, `directory-scheduler.mjs`, `scripts/database-admin.mjs`, `shared/` and `package.json`. Production does not need node_modules. Keep prior releases and the external database for recovery, switch `current` to the new release and restart the service only after validating it. Never replace or delete the state directory during a code release.

The production process schedules all six categories at Beijing 00:00, independently of visitors. Reads never initiate upstream requests, even with an old or empty database. Manual refresh synchronizes the selected category, with the existing 10-second cooldown and serial queue. Restarts schedule the next midnight, not an immediate catch-up. Check the `Nightly sync scheduled` journal entry to verify the next run. No additional public endpoint, external scheduler, or main-site change is needed.

For rollback of the entire subpage, compare the current Nginx site config with the backup and remove only the added include; do not overwrite unrelated changes made since deployment. Validate Nginx before reloading. The initial installer is guarded against repeated execution and is not an update command.

No server passwords, private keys, or login tokens are stored in the project or deployment files. Upstream credentials and visitor cookies are not forwarded. Query results are persisted in a separate SQLite database, with memory-backed views and private local supplement fields. The source platform's migration and data-use restrictions remain applicable.
