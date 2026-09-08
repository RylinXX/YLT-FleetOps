import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, existsSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const file = process.env.DATABASE_PATH;
if (!file || !existsSync(file)) throw new Error('DATABASE_PATH must point to an existing database');
const db = new DatabaseSync(file, { readOnly: true });
try {
  const command = process.argv[2] || 'status';
  if (command === 'backup') {
    const destination = process.argv[3];
    if (!destination || resolve(destination) === resolve(file) || existsSync(destination)) throw new Error('Provide a new backup filename');
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    await backup(db, destination);
    chmodSync(destination, 0o600);
    const check = new DatabaseSync(destination, { readOnly: true });
    const integrity = check.prepare('PRAGMA quick_check').get();
    check.close();
    if (integrity.quick_check !== 'ok') throw new Error('Backup integrity check failed');
    console.log(JSON.stringify({ backup: destination, integrity }));
  } else if (command === 'status') {
    console.log(JSON.stringify({
      integrity: db.prepare('PRAGMA quick_check').get(),
      categories: db.prepare(`SELECT c.id,c.last_sync_at,c.last_error,COUNT(r.record_key) AS stored,
        SUM(r.presence='current') AS current,SUM(r.presence='unconfirmed') AS unconfirmed,
        SUM(r.presence='absent') AS historical FROM categories c LEFT JOIN records r ON c.id=r.category GROUP BY c.id`).all(),
      runs: db.prepare('SELECT id,category,kind,status,inserted,updated,unchanged,finished_at,error FROM sync_runs ORDER BY id DESC LIMIT 12').all(),
      changes: db.prepare('SELECT COUNT(*) AS count FROM record_changes').get()
    }, null, 2));
  } else throw new Error('Use status or backup');
} finally { db.close(); }
