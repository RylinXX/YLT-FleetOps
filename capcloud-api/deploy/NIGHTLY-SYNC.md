# Database-only browsing / nightly sync rollout

Deployed 2026-09-07 to https://ylt.etgq.com/api/.

- Release: `/opt/capcloud-api/releases/20260907T063500Z`.
- Previous release retained: `/opt/capcloud-api/releases/20260906T091917Z`.
- Consistent pre-change backup: `/var/lib/capcloud-api/backups/directory-before-nightly-20260907T063500Z.sqlite`, quick_check `ok`.
- Database schema, existing records, systemd unit and Nginx configuration unchanged.
- Dataset reads no longer queue a source request, regardless of snapshot age or absence.
- Production process schedules sequential six-category synchronization for Beijing midnight. First scheduled run: 2026-09-08 00:00 +08:00, confirmed in service journal. This is a scheduled future run, not a claim of overnight completion.
- Manual refresh still queues only the selected category. Existing snapshots remain readable while syncing; failures preserve them.
- A restart schedules the next midnight without catch-up. Source workbench queries remain explicit diagnostic actions with their existing write-through behavior.

## Verification

- 44 tests passed locally and on the production server, including seven-day-old persisted snapshots, empty-database reads, Beijing date boundaries, six-category serialized scheduling, rearming after failure and shutdown cancellation.
- Read all six deployed datasets and compared database status before/after: identical synchronization metadata, all responses SQLite-backed and not syncing.
- Confirmed the deployed frontend contains the new policy text.
- Triggered the disposal-sites manual refresh and verified old rows remained visible during synchronization and the successful snapshot timestamp advanced.
- Application service is active and enabled at boot. Prior code and database backup retained for recovery.
