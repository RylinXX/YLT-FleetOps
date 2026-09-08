import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DirectoryStore } from '../directory-store.mjs';
import { createDirectoryService } from '../directory-service.mjs';

const firstTime = '2026-09-06T09:00:00.000Z';
const secondTime = '2026-09-06T10:00:00.000Z';
const site = (id, capacity = '100') => ({ id, disposalname: `场所${id}`, area: '海淀区', capacityresidue: capacity, recordendtime: '2027-09-01' });
const sync = (store, rows, { category = 'disposal-sites', timestamp = firstTime, complete = true, kind = 'category' } = {}) => {
  const runId = store.beginSync(category, kind, timestamp);
  try { return store.commitSync(runId, rows, { total: rows.length, pages: 1, coverageComplete: complete, updatedAt: timestamp }); }
  catch (error) { store.failSync(runId, error.message, timestamp); throw error; }
};

test('SQLite records survive close/reopen and restart does not require the upstream', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'capcloud-persistence-'));
  const filename = join(directory, 'directory.sqlite');
  const original = new DirectoryStore(filename);
  sync(original, [site(1)]);
  original.close();
  const reopened = new DirectoryStore(filename);
  let requests = 0;
  const service = createDirectoryService({ store: reopened, now: () => Date.parse(firstTime) + 7 * 86400000, fetcher: async () => { requests++; throw new Error('offline'); } });
  t.after(() => service.close());
  const response = service.get('disposal-sites');
  assert.equal(response.complete, true);
  assert.equal(response.storage, 'sqlite');
  assert.equal(response.rows[0].capacity, 100);
  assert.equal(requests, 0);
});

test('upsert does not duplicate records and only actual changes enter the change log', t => {
  const store = new DirectoryStore(); t.after(() => store.close());
  assert.equal(sync(store, [site(1), site(2)]).inserted, 2);
  const repeated = sync(store, [site(2), site(1)], { timestamp: secondTime });
  assert.equal(repeated.inserted, 0); assert.equal(repeated.updated, 0); assert.equal(repeated.unchanged, 2);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM records').get().n, 2);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM record_changes').get().n, 2);
  const updated = sync(store, [site(1, '350'), site(2), site(3)], { timestamp: secondTime });
  assert.equal(updated.inserted, 1); assert.equal(updated.updated, 1);
  const record = store.readCategory('disposal-sites').rows.find(row => row.key === 'disposal-sites:1');
  assert.equal(record.capacity, 350);
  assert.equal(record.database.firstSeenAt, firstTime);
  assert.equal(record.database.changedAt, secondTime);
});

test('local notes are not overwritten or exposed while source fields are enriched', t => {
  const store = new DirectoryStore(); t.after(() => store.close());
  sync(store, [{ ...site(1), additional: '已知信息' }]);
  store.setLocalFields('disposal-sites', 'disposal-sites:1', { notes: 'private-test-note', tags: ['重点'] });
  sync(store, [{ ...site(1, '300'), newlyProvided: '新字段' }], { timestamp: secondTime });
  const row = store.db.prepare('SELECT raw_json,local_json FROM records').get();
  assert.equal(JSON.parse(row.raw_json).additional, '已知信息');
  assert.equal(JSON.parse(row.raw_json).newlyProvided, '新字段');
  assert.equal(JSON.parse(row.local_json).notes, 'private-test-note');
  assert.equal(JSON.stringify(store.readCategory('disposal-sites')).includes('private-test-note'), false);
  sync(store, [{ ...site(1), additional: null }], { timestamp: secondTime });
  assert.equal(JSON.parse(store.db.prepare('SELECT raw_json FROM records').get().raw_json).additional, null);
});

test('duplicate source IDs use stable business identities rather than mutable capacities or row order', t => {
  const store = new DirectoryStore(); t.after(() => store.close());
  const rows = [{ id: 1, companyName: '企业甲', bank: '海淀区', carNum: 10 }, { id: 1, companyName: '企业乙', bank: '朝阳区', carNum: 20 }];
  sync(store, rows, { category: 'companies', complete: false });
  const before = new Map(store.readCategory('companies').rows.map(row => [row.title, row.key]));
  const changed = sync(store, [{ ...rows[1], carNum: 30 }, { ...rows[0], carNum: 40 }], { category: 'companies', complete: false, timestamp: secondTime });
  assert.equal(changed.inserted, 0); assert.equal(changed.updated, 2);
  for (const row of store.readCategory('companies').rows) assert.equal(row.key, before.get(row.title));
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM records').get().n, 2);
});

test('ambiguous duplicate identities reject the batch without growing or corrupting the database', t => {
  const store = new DirectoryStore(); t.after(() => store.close());
  sync(store, [site(1)]);
  assert.throws(() => sync(store, [site(1, '200'), site(1, '300')], { timestamp: secondTime }), /无法区分/);
  assert.equal(store.readCategory('disposal-sites').rows[0].capacity, 100);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM records').get().n, 1);
});

test('historical approval batches sharing a company ID remain distinct while their vehicle counts update in place', t => {
  const store = new DirectoryStore(); t.after(() => store.close());
  const company = { id: 'shared', companyName: '同一企业', bank: '海淀区' };
  const oldBatch = { ...company, spdate: '2019-02-01 00:00:00.0', carNum: 10 };
  const newBatch = { ...company, spdate: '2026-02-13 15:15:01.0', carNum: 30 };
  sync(store, [oldBatch, newBatch], { category: 'companies', complete: false });
  const keys = new Map(store.readCategory('companies').rows.map(row => [row.approvalDate, row.key]));
  const result = sync(store, [{ ...newBatch, spdate: '2026-02-13 15:15:01', carNum: 35 }, oldBatch], { category: 'companies', complete: false, timestamp: secondTime });
  assert.equal(result.inserted, 0);
  assert.equal(result.updated, 1);
  assert.equal(store.readCategory('companies').rows.length, 2);
  for (const row of store.readCategory('companies').rows) assert.equal(row.key, keys.get(row.approvalDate));
});

test('incomplete updates retain unseen records as unconfirmed with their original last-seen dates', t => {
  const store = new DirectoryStore(); t.after(() => store.close());
  sync(store, [site(1), site(2)]);
  const result = sync(store, [site(1, '300')], { timestamp: secondTime, complete: false });
  assert.equal(result.retained, 1);
  const data = store.readCategory('disposal-sites');
  assert.equal(data.rows.length, 2); assert.equal(data.coverageComplete, false);
  const retained = data.rows.find(row => row.key === 'disposal-sites:2');
  assert.equal(retained.database.presence, 'unconfirmed');
  assert.equal(retained.database.lastSeenAt, firstTime);
  assert.match(data.warning, /待核实/);
});

test('a complete update archives missing rows without deleting them and restores reappearing rows', t => {
  const store = new DirectoryStore(); t.after(() => store.close());
  sync(store, [site(1), site(2)]);
  store.setLocalFields('disposal-sites', 'disposal-sites:2', { notes: 'retain' });
  assert.equal(sync(store, [site(1)], { timestamp: secondTime }).archived, 1);
  assert.equal(store.readCategory('disposal-sites').rows.length, 1);
  assert.equal(store.readCategory('disposal-sites', { includeHistory: true }).rows.length, 2);
  assert.equal(store.readCategory('disposal-sites').database.historicalTotal, 1);
  sync(store, [site(1), site(2, '400')], { timestamp: secondTime });
  assert.equal(store.readCategory('disposal-sites').rows.length, 2);
  assert.equal(JSON.parse(store.db.prepare("SELECT local_json FROM records WHERE record_key='disposal-sites:2'").get().local_json).notes, 'retain');
});

test('an unexpected empty category cannot wipe or archive the existing database', t => {
  const store = new DirectoryStore(); t.after(() => store.close());
  sync(store, [site(1)]);
  sync(store, [], { timestamp: secondTime });
  const data = store.readCategory('disposal-sites');
  assert.equal(data.rows.length, 1); assert.equal(data.coverageComplete, false);
  assert.equal(data.rows[0].database.presence, 'unconfirmed');
});

test('SQL failure rolls back both records and field-change history', t => {
  const store = new DirectoryStore(); t.after(() => store.close());
  sync(store, [site(1), site(2)]);
  store.db.exec("CREATE TRIGGER reject_test BEFORE UPDATE ON records WHEN NEW.record_key='disposal-sites:2' BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  assert.throws(() => sync(store, [site(1, '700'), site(2, '800')], { timestamp: secondTime }), /test failure/);
  assert.deepEqual(store.readCategory('disposal-sites').rows.map(row => row.capacity), [100, 100]);
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM record_changes').get().n, 2);
});

test('stored results remain readable during refresh and after an upstream failure', async t => {
  const store = new DirectoryStore();
  sync(store, [site(1)]);
  const service = createDirectoryService({ store, now: () => Date.parse(secondTime), fetcher: async () => { throw new Error('upstream offline'); } });
  t.after(() => service.close());
  const during = service.get('disposal-sites', { refresh: true });
  assert.equal(during.complete, true); assert.equal(during.syncing, true); assert.equal(during.rows[0].capacity, 100);
  await service.idle();
  const after = service.get('disposal-sites');
  assert.equal(after.complete, true); assert.equal(after.status, 'ready'); assert.equal(after.syncing, false);
  assert.match(after.syncError, /offline/); assert.equal(after.updatedAt, firstTime);
});

test('filtered observations enrich the database but never mark other records missing', async t => {
  const store = new DirectoryStore(); sync(store, [site(1), site(2)]);
  const service = createDirectoryService({ store, now: () => Date.parse(secondTime) });
  t.after(() => service.close());
  const result = service.observe('disposal-sites', [{ ...site(1, '500'), extraSourceField: 'added' }], { total: 1 });
  assert.equal(result.updated, 1);
  const data = store.readCategory('disposal-sites');
  assert.equal(data.rows.length, 2);
  assert.ok(data.rows.every(row => row.database.presence === 'current'));
  assert.equal(data.database.lastSyncAt, firstTime);
  assert.equal(data.database.lastWriteAt, secondTime);
});

test('restart recovery marks interrupted syncs without losing the last good dataset', t => {
  const store = new DirectoryStore(); t.after(() => store.close());
  sync(store, [site(1)]);
  store.beginSync('disposal-sites', 'category', secondTime);
  store.recoverInterrupted(secondTime);
  assert.equal(store.readCategory('disposal-sites').rows.length, 1);
  assert.match(store.readCategory('disposal-sites').syncError, /重启中断/);
});

test('database backups restore records and pass integrity checks without overwriting existing backups', async t => {
  const store = new DirectoryStore(); t.after(() => store.close());
  sync(store, [site(1)]);
  const dir = await mkdtemp(join(tmpdir(), 'capcloud-backup-'));
  const file = join(dir, 'snapshot.sqlite');
  await store.backupTo(file);
  const restored = new DatabaseSync(file, { readOnly: true }); t.after(() => restored.close());
  assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM records').get().n, 1);
  assert.equal(restored.prepare('PRAGMA quick_check').get().quick_check, 'ok');
  await assert.rejects(() => store.backupTo(file), /已存在/);
});
