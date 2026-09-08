# Database Rollout Complete

2026-09-06: the database-enabled release is active at https://ylt.etgq.com/api/ . All 40 tests passed locally and on the server. Public desktop/mobile checks showed no browser errors or horizontal overflow at 390px. Synthetic fixture data was not included in the deployment package.

## Live Deployment

The earlier connection interruption was resolved before activation. The real company source was checked before activation: reused company IDs across approval batches are distinguished by approval time rather than mutable vehicle counts.

The independent SQLite database is outside the application release and static directories. Its state directory has mode 0700 and its database file has mode 0600.

The main site's database and Nginx routing were not changed in this rollout. After server recovery, Nginx was stopped and its boot startup disabled; its existing configuration was validated and the existing service was started and enabled.

Deployment locations:

- Previous release retained: `/opt/capcloud-api/releases/20260906T082322Z`.
- Active release: `/opt/capcloud-api/releases/20260906T091917Z`.
- Staging: `/opt/capcloud-api/staging/20260906T091917Z`.
- Local package directory: `/tmp/capcloud-database.gCQVeZ/release`.
- Persistent database: `/var/lib/capcloud-api/directory.sqlite`.
- Baseline backup: `/var/lib/capcloud-api/backups/directory-baseline-20260906T105124Z.sqlite`.
- Previous service unit: `/opt/capcloud-api/backups/capcloud-api.service.before-database.20260906T091917Z`.

## Completed Checks

1. Persisted 17131 records across six categories: companies 1796; vehicles 12950; new-energy companies 290; new-energy vehicles 1632; disposal sites 85; reuse sites 378.
2. The source-company discrepancy (1798 reported versus 1796 returned, with 4 duplicate IDs) remains explicitly reported rather than silently treated as complete.
3. Repeated new-energy-company refresh inserted 0 records, updated 0 and retained 290 unchanged records. Existing results remained readable while syncing.
4. Restarted the service and read the same 290-row snapshot with the same run ID and timestamp, without starting an upstream fetch for that fresh snapshot.
5. A successful single-page workbench query also wrote through to SQLite, with no duplicate insertions. A real disposal-site refresh updated 3 records in place.
6. Both the live database and baseline backup passed SQLite quick_check. Database size was about 29 MiB, with a 16 MiB WAL.
7. The public page displayed its independent database status and populated results. Mobile layout at 390px had no horizontal overflow or console errors.

## Separate Parent-Site Issue

Post-deployment checks found that the separate `worksite-bookkeeping.service` on port 8002 returns HTTP 500 for `/api/soil_types`, including when called directly without Nginx. Its logs report `ModuleNotFoundError: No module named 'anyio._backends'` and `unable to open database file`. This service's files and data were not modified. It needs a separate investigation; it is not the independent query database.

No credentials are stored in these files. Do not publish database or backup files under the static directory.
