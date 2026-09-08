import { DatabaseSync, backup } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdirSync, existsSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { endpoints } from './shared/catalog.mjs';
import { normalizeRecord, dateKey } from './shared/directory.mjs';

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

const clean = value => value == null || ['null', 'undefined'].includes(String(value).trim()) ? '' : String(value).normalize('NFKC').trim();
const digest = value => createHash('sha256').update(value).digest('hex').slice(0, 24);
const validCategory = category => {
  if (!endpoints.some(endpoint => endpoint.id === category)) throw new Error('未知信息分类');
};

function identityFor(category, raw) {
  const name = category.includes('companies') ? raw.companyName : category.includes('vehicles') ? raw.plateCode ?? raw.platecodes : raw.disposalname ?? raw.name;
  const district = raw.bank ?? raw.fsection ?? raw.area;
  if (!clean(name)) return '';
  const identity = [clean(name), category.includes('vehicles') ? '' : clean(district)];
  if (category.includes('companies')) {
    // The source reuses company IDs across approval batches; counts and expiry dates are not identity fields.
    const day = dateKey(raw.spdate);
    const clock = /[ T](\d{2}:\d{2}:\d{2})/.exec(clean(raw.spdate))?.[1] || '00:00:00';
    identity.push(day ? `${day} ${clock}` : '');
  }
  return canonicalJson(identity);
}

function changedFields(before, after) {
  const changes = Object.create(null);
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (canonicalJson(before[key]) !== canonicalJson(after[key])) changes[key] = { before: before[key] ?? null, after: after[key] ?? null };
  }
  return changes;
}

export class DirectoryStore {
  constructor(filename = ':memory:') {
    const isNew = filename !== ':memory:' && !existsSync(filename);
    if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.filename = filename;
    this.db = new DatabaseSync(filename);
    if (isNew) chmodSync(filename, 0o600);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=1000; PRAGMA journal_size_limit=16777216;');
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 1) { this.db.close(); throw new Error('数据库版本高于当前程序，已停止启动'); }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY, snapshot_json TEXT, last_sync_at TEXT, last_write_at TEXT,
        last_attempt_at TEXT, last_error TEXT, last_run_id INTEGER
      );
      CREATE TABLE IF NOT EXISTS records (
        category TEXT NOT NULL REFERENCES categories(id), record_key TEXT NOT NULL,
        source_id TEXT NOT NULL, identity_json TEXT NOT NULL, raw_json TEXT NOT NULL CHECK(json_valid(raw_json)),
        normalized_json TEXT NOT NULL CHECK(json_valid(normalized_json)),
        local_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(local_json)),
        first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, changed_at TEXT NOT NULL,
        presence TEXT NOT NULL DEFAULT 'current' CHECK(presence IN ('current','unconfirmed','absent')),
        ordinal INTEGER NOT NULL, last_run_id INTEGER NOT NULL,
        PRIMARY KEY(category, record_key)
      );
      CREATE INDEX IF NOT EXISTS records_source_id ON records(category, source_id);
      CREATE INDEX IF NOT EXISTS records_presence ON records(category, presence, ordinal);
      CREATE TABLE IF NOT EXISTS sync_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL REFERENCES categories(id),
        kind TEXT NOT NULL CHECK(kind IN ('category','observation')),
        status TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT,
        source_total INTEGER, received INTEGER, inserted INTEGER NOT NULL DEFAULT 0,
        updated INTEGER NOT NULL DEFAULT 0, unchanged INTEGER NOT NULL DEFAULT 0,
        retained INTEGER NOT NULL DEFAULT 0, archived INTEGER NOT NULL DEFAULT 0,
        coverage_complete INTEGER NOT NULL DEFAULT 0, warning TEXT, error TEXT
      );
      CREATE TABLE IF NOT EXISTS record_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL, record_key TEXT NOT NULL,
        run_id INTEGER, changed_at TEXT NOT NULL, kind TEXT NOT NULL, changes_json TEXT NOT NULL CHECK(json_valid(changes_json))
      );
      CREATE INDEX IF NOT EXISTS changes_record ON record_changes(category, record_key, id);
      PRAGMA user_version=1;
    `);
  }

  beginSync(category, kind = 'category', timestamp = new Date().toISOString()) {
    validCategory(category);
    this.db.prepare('INSERT OR IGNORE INTO categories(id) VALUES (?)').run(category);
    const result = this.db.prepare('INSERT INTO sync_runs(category,kind,status,started_at) VALUES (?,?,?,?)').run(category, kind, 'running', timestamp);
    if (kind === 'category') this.db.prepare('UPDATE categories SET last_attempt_at=? WHERE id=?').run(timestamp, category);
    return Number(result.lastInsertRowid);
  }

  failSync(runId, error, timestamp = new Date().toISOString()) {
    const run = this.db.prepare('SELECT * FROM sync_runs WHERE id=?').get(runId);
    if (!run) return;
    this.db.prepare("UPDATE sync_runs SET status='failed',finished_at=?,error=? WHERE id=?").run(timestamp, String(error).slice(0, 1000), runId);
    if (run.kind === 'category') this.db.prepare('UPDATE categories SET last_error=? WHERE id=?').run(String(error).slice(0, 1000), run.category);
  }

  recoverInterrupted(timestamp = new Date().toISOString()) {
    for (const run of this.db.prepare("SELECT id FROM sync_runs WHERE status='running'").all()) this.failSync(run.id, '上次同步因服务重启中断，数据库旧记录已保留', timestamp);
  }

  commitSync(runId, rawRows, metadata) {
    const run = this.db.prepare('SELECT * FROM sync_runs WHERE id=?').get(runId);
    if (!run || run.status !== 'running') throw new Error('无效同步批次');
    if (!Array.isArray(rawRows)) throw new Error('同步记录格式不正确');
    const category = run.category;
    const timestamp = metadata.updatedAt || new Date().toISOString();
    const existing = this.db.prepare('SELECT * FROM records WHERE category=?').all(category);
    const byId = new Map();
    for (const row of existing) { const list = byId.get(row.source_id) || []; list.push(row); byId.set(row.source_id, list); }
    const incoming = rawRows.map(raw => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('来源记录不是有效对象');
      if (raw.id != null && !['string', 'number'].includes(typeof raw.id)) throw new Error('来源记录标识格式无效');
      if (typeof raw.id === 'number' && !Number.isSafeInteger(raw.id)) throw new Error('来源数字标识超出安全范围');
      return { raw, sourceId: clean(raw.id), identity: identityFor(category, raw) };
    });
    const incomingCounts = new Map();
    for (const row of incoming) incomingCounts.set(row.sourceId, (incomingCounts.get(row.sourceId) || 0) + 1);
    const seenKeys = new Set();
    const lastOrdinal = existing.reduce((value, row) => Math.max(value, row.ordinal), -1);
    const prepared = incoming.map((row, position) => {
      const candidates = byId.get(row.sourceId) || [];
      let match;
      if (row.sourceId && incomingCounts.get(row.sourceId) === 1 && candidates.length === 1) match = candidates[0];
      else {
        const matching = candidates.filter(candidate => candidate.identity_json === row.identity);
        if (matching.length > 1) throw new Error('来源标识存在歧义，已停止入库以保护现有记录');
        match = matching[0];
      }
      let key = match?.record_key;
      if (!key) {
        if (row.sourceId && incomingCounts.get(row.sourceId) === 1 && candidates.length === 0) key = `${category}:${row.sourceId}`;
        else if (row.identity) key = `${category}:${row.sourceId || 'business'}:${digest(row.identity)}`;
        else throw new Error('来源记录缺少稳定标识，已停止入库');
      }
      if (seenKeys.has(key)) throw new Error('同一来源标识无法区分多条记录，已停止入库');
      seenKeys.add(key);
      const ordinal = run.kind === 'observation' ? match?.ordinal ?? lastOrdinal + position + 1 : position;
      const before = match ? JSON.parse(match.raw_json) : {};
      // Omitted source fields retain their last known values; an explicit null still clears the source field.
      const merged = { ...before, ...row.raw };
      const rawJson = canonicalJson(merged);
      const normalized = normalizeRecord(category, merged, ordinal);
      normalized.key = key;
      return { ...row, ordinal, key, match, merged, rawJson, normalizedJson: JSON.stringify(normalized), changes: changedFields(before, merged) };
    });
    const stats = { inserted: 0, updated: 0, unchanged: 0, retained: 0, archived: 0 };
    const activeBefore = existing.filter(row => row.presence !== 'absent').length;
    const emptyAnomaly = run.kind === 'category' && activeBefore > 0 && prepared.length === 0;
    const duplicateIds = [...incomingCounts].some(([id, count]) => id && count > 1);
    const coverageComplete = run.kind === 'category' && Boolean(metadata.coverageComplete) && !emptyAnomaly && !duplicateIds;
    const warnings = [metadata.warning, duplicateIds && !metadata.warning ? '来源包含重复标识，未返回的旧记录保留待核实' : '', emptyAnomaly ? '来源本次返回空集，旧记录保留并标为待核实' : ''].filter(Boolean);
    const upsert = this.db.prepare(`INSERT INTO records(category,record_key,source_id,identity_json,raw_json,normalized_json,first_seen_at,last_seen_at,changed_at,presence,ordinal,last_run_id)
      VALUES (?,?,?,?,?,?,?,?,?,'current',?,?)
      ON CONFLICT(category,record_key) DO UPDATE SET source_id=excluded.source_id,identity_json=excluded.identity_json,
      raw_json=excluded.raw_json,normalized_json=excluded.normalized_json,last_seen_at=excluded.last_seen_at,
      changed_at=excluded.changed_at,presence='current',ordinal=excluded.ordinal,last_run_id=excluded.last_run_id`);
    const addChange = this.db.prepare('INSERT INTO record_changes(category,record_key,run_id,changed_at,kind,changes_json) VALUES (?,?,?,?,?,?)');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of prepared) {
        const changed = !row.match || row.match.raw_json !== row.rawJson;
        if (!row.match) stats.inserted++;
        else if (changed) stats.updated++;
        else stats.unchanged++;
        upsert.run(category, row.key, row.sourceId, row.identity, row.rawJson, row.normalizedJson, row.match?.first_seen_at || timestamp, timestamp, changed ? timestamp : row.match.changed_at, row.ordinal, runId);
        if (changed) addChange.run(category, row.key, runId, timestamp, row.match ? 'update' : 'insert', JSON.stringify(row.changes));
        if (row.match && row.match.presence !== 'current') addChange.run(category, row.key, runId, timestamp, 'presence', JSON.stringify({ presence: { before: row.match.presence, after: 'current' } }));
      }
      if (run.kind === 'category') {
        const updatePresence = this.db.prepare('UPDATE records SET presence=? WHERE category=? AND record_key=?');
        for (const row of existing) {
          if (seenKeys.has(row.record_key) || row.presence === 'absent') continue;
          const presence = coverageComplete ? 'absent' : 'unconfirmed';
          if (presence === 'absent') stats.archived++; else stats.retained++;
          updatePresence.run(presence, category, row.record_key);
          if (presence !== row.presence) addChange.run(category, row.record_key, runId, timestamp, 'presence', JSON.stringify({ presence: { before: row.presence, after: presence } }));
        }
        if (stats.retained) warnings.push(`本库另外保留 ${stats.retained} 条本次未返回的记录，状态为待核实`);
        const snapshot = { ...metadata, id: category, coverageComplete, warning: warnings.join('；') || undefined, updatedAt: timestamp, loaded: prepared.length };
        this.db.prepare('UPDATE categories SET snapshot_json=?,last_sync_at=?,last_write_at=?,last_error=NULL,last_run_id=? WHERE id=?').run(JSON.stringify(snapshot), timestamp, timestamp, runId, category);
      } else {
        const previous = this.db.prepare('SELECT snapshot_json FROM categories WHERE id=?').get(category).snapshot_json;
        const snapshot = previous ? JSON.parse(previous) : { id: category, total: null, pages: 0, loaded: prepared.length, updatedAt: timestamp };
        if (!previous || stats.inserted) { snapshot.coverageComplete = false; snapshot.warning = '数据库包含零散查询补充的记录，尚待下一次分类同步核验'; }
        this.db.prepare('UPDATE categories SET snapshot_json=?,last_write_at=? WHERE id=?').run(JSON.stringify(snapshot), timestamp, category);
      }
      this.db.prepare(`UPDATE sync_runs SET status=?,finished_at=?,source_total=?,received=?,inserted=?,updated=?,unchanged=?,retained=?,archived=?,coverage_complete=?,warning=? WHERE id=?`)
        .run(coverageComplete ? 'completed' : 'partial', timestamp, metadata.total ?? null, prepared.length, stats.inserted, stats.updated, stats.unchanged, stats.retained, stats.archived, Number(coverageComplete), warnings.join('；') || null, runId);
      const cutoff = new Date(Date.parse(timestamp) - 90 * 86400000).toISOString();
      this.db.prepare('DELETE FROM record_changes WHERE changed_at < ?').run(cutoff);
      this.db.exec('DELETE FROM record_changes WHERE id NOT IN (SELECT id FROM record_changes ORDER BY id DESC LIMIT 50000)');
      this.db.exec("DELETE FROM sync_runs WHERE status!='running' AND id NOT IN (SELECT id FROM sync_runs ORDER BY id DESC LIMIT 10000)");
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return { ...stats, runId };
  }

  readCategory(category, { includeHistory = false } = {}) {
    validCategory(category);
    const info = this.db.prepare('SELECT * FROM categories WHERE id=?').get(category);
    if (!info?.snapshot_json) return null;
    const counts = this.db.prepare(`SELECT COUNT(*) AS total, SUM(presence='current') AS current,
      SUM(presence='unconfirmed') AS unconfirmed,SUM(presence='absent') AS historical FROM records WHERE category=?`).get(category);
    const rows = this.db.prepare(`SELECT record_key,normalized_json,first_seen_at,last_seen_at,changed_at,presence
      FROM records WHERE category=? ${includeHistory ? '' : "AND presence!='absent'"} ORDER BY ordinal,record_key`).all(category).map(row => ({
      ...JSON.parse(row.normalized_json), key: row.record_key,
      database: { firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at, changedAt: row.changed_at, presence: row.presence }
    }));
    const lastRun = info.last_run_id ? this.db.prepare('SELECT id,status,started_at,finished_at,inserted,updated,unchanged,retained,archived FROM sync_runs WHERE id=?').get(info.last_run_id) : null;
    const snapshot = JSON.parse(info.snapshot_json);
    return { ...snapshot, rows, complete: true, status: 'ready', storage: 'sqlite',
      database: { storedTotal: counts.total, currentTotal: counts.current || 0, retainedTotal: counts.unconfirmed || 0, historicalTotal: counts.historical || 0,
        lastSyncAt: info.last_sync_at, lastWriteAt: info.last_write_at, lastAttemptAt: info.last_attempt_at, lastError: info.last_error, lastRun },
      syncError: info.last_error || undefined
    };
  }

  setLocalFields(category, key, value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('补充信息必须是对象');
    const result = this.db.prepare('UPDATE records SET local_json=? WHERE category=? AND record_key=?').run(JSON.stringify(value), category, key);
    if (!result.changes) throw new Error('记录不存在');
  }

  summary() {
    return this.db.prepare(`SELECT c.id AS category,c.last_sync_at,c.last_write_at,c.last_attempt_at,c.last_error,
      COUNT(r.record_key) AS stored_total,SUM(r.presence='current') AS current_total,
      SUM(r.presence='unconfirmed') AS retained_total,SUM(r.presence='absent') AS historical_total
      FROM categories c LEFT JOIN records r ON c.id=r.category GROUP BY c.id ORDER BY c.id`).all();
  }

  async backupTo(filename) {
    mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    if (existsSync(filename)) throw new Error('备份文件已存在，请使用新的文件名');
    await backup(this.db, filename);
    chmodSync(filename, 0o600);
  }

  close() { this.db.close(); }
}
