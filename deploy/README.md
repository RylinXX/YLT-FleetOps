# Complete YLT Deployment

## Route Ownership

| Public route | Service |
| --- | --- |
| `/`, `/fleet/`, `/api/fleet/*`, `/api/records`, `/api/sync/*` | `ylt-app`, localhost:8002 |
| Exact `/api/` and selected `/api/assets/`, `/api/api/` subpaths | `capcloud-api`, localhost:5189 |

Use `ylt.etgq.com.conf` with the includes in `../capcloud-api/deploy/`.
The rate-limit zones belong in the Nginx HTTP context, not inside a server block.
Do not replace the main site's root with the directory application's dist folder.
Do not introduce a blanket `location /api/` proxy to port 5189.

## Main Application

The verified production path is `/www/wwwroot/ylt.rlxtc.com`.
Use Python 3.11 and an isolated `.venv`, installing `requirements.txt`.
Run the supplied `ylt-app.service` with a single worker because FleetMaster keeps
mutable JSON data in process memory. Keep only one service bound to port 8002.
The duplicate legacy `worksite-bookkeeping.service` was disabled during recovery.
Existing installations may have a systemd drop-in; inspect `systemctl cat ylt-app`
before replacing the unit. Validate units before reloading systemd.

The optional image recognizer needs a separately validated PyTorch environment.
Without it the legacy application uses its simulation fallback; do not treat
simulated recognition as real vehicle evidence.

## Directory Application

See `../capcloud-api/deploy/README.md` for the separate Node 24 service.
Build from `capcloud-api/` with:

```sh
npm ci
npm test
npm run build -- --base=/api/ --outDir dist-deploy
```

Publish `dist-deploy/` as `dist/` in a new release alongside the server modules,
shared modules, scripts and package metadata. Preserve the database under
`/var/lib/capcloud-api/`. The historical `install-initial.sh` is a one-time,
timestamp-bound installer, not an update script.

## Data Protection

Back up these independently of Git before every deployment:

- `worksite_plate.db`, using SQLite's backup API while live (not a raw copy).
- `fleet/data/fleet_data_current.json` and the baseline JSON, with the service
  stopped or writes otherwise paused for a consistent copy.
- `/var/lib/capcloud-api/directory.sqlite`, using SQLite's backup API.
- Current Nginx configuration and service units/drop-ins.

Never deploy `.git`, credentials, TLS private keys or a local database over live
business data. Preserve `worksite_plate.db*`, `fleet/data/`, `uploaded_imgs/` and
the virtual environment when updating code. Git-tracked fleet JSON files are
historical baselines, not production backups. Do not run seed/reset scripts.

The 2026-09-08 recovery restored 6,336 remote waybills, 980 vehicle records and
1,133 fleet records from the user's local project. A subsequent user-triggered
sync updated the live database; those later changes are not stored in Git.
Automatic main-site syncing was disabled during recovery, pending review.
Directory nightly syncing is an independent service and was left unchanged.

## Verification and Rollback

Before publishing routes, verify localhost:8002 and localhost:5189 independently.
Run `nginx -t` before reload. Confirm the master is running and the PID file is
valid; do not blindly start a second master. Verify the homepage's data, embedded
fleet view, `/api/` directory and both services' APIs in a browser.
On failure restore the backed-up configuration/code, not an older database.

Recovery files on the production host: `/root/ylt-restore-20260908/`.
These private backups are deliberately excluded from this repository.
