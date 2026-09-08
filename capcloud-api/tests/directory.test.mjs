import test from 'node:test';
import assert from 'node:assert/strict';
import { categories, numberOrNull, dateKey, todayInBeijing, normalizeRecord, expiryStatus, defaultFilters, selectRecords, csvFor } from '../shared/directory.mjs';
import { createDirectoryService } from '../directory-service.mjs';

const sites = categories.find(item => item.id === 'disposal-sites');
const companies = categories.find(item => item.id === 'companies');
const today = '2026-09-05';
const raw = [
  { id: 'a', disposalname: '远期场所', recordendtime: '2027-01-01', capacityresidue: '10000', area: '海淀区' },
  { id: 'b', disposalname: '临期场所', recordendtime: '2026-09-12', capacityresidue: '5001.5', area: '朝阳区' },
  { id: 'c', disposalname: '到期场所', recordendtime: '2026-09-04', capacityresidue: '5000', area: '海淀区' },
  { id: 'd', disposalname: '缺失场所', recordendtime: 'null', capacityresidue: 'null', area: '海淀区' },
  { id: 'e', disposalname: '今天场所', recordendtime: '2026-09-05 08:00:00', capacityresidue: '0', area: '海淀区' },
  { id: 'f', disposalname: '未生效', recordstarttime: '2026-10-01', recordendtime: '2026-12-01', capacityresidue: '', area: '海淀区' }
];
const rows = raw.map((row, index) => normalizeRecord('disposal-sites', row, index));
const select = changes => selectRecords(rows, { ...defaultFilters(), ...changes }, sites, { today });

test('missing numeric strings are never interpreted as zero', () => {
  for (const value of [null, undefined, '', '  ', 'null', 'NaN', Infinity, false, {}, '0x20']) assert.equal(numberOrNull(value), null);
  assert.equal(numberOrNull('0'), 0);
  assert.equal(numberOrNull(' 5001.5 '), 5001.5);
  assert.equal(numberOrNull(-1), -1);
});

test('expiry dates follow Beijing calendar days including the end date', () => {
  assert.equal(todayInBeijing(new Date('2026-09-04T16:01:00Z')), today);
  assert.equal(dateKey('2026-02-30'), null);
  assert.equal(dateKey('invalid'), null);
  assert.equal(expiryStatus(rows[4], today).days, 0);
  assert.equal(expiryStatus(rows[4], today).code, 'soon');
  assert.equal(expiryStatus(rows[2], today).code, 'expired');
  assert.equal(expiryStatus(rows[3], today).code, 'unknown');
  assert.equal(expiryStatus(rows[5], today).code, 'future');
});

test('capacity greater than is exclusive and optional upper bound inclusive', () => {
  assert.deepEqual(select({ minCapacity: '5000' }).map(row => row.key), ['disposal-sites:a', 'disposal-sites:b']);
  assert.deepEqual(select({ minCapacity: '5000', maxCapacity: '10000' }).map(row => row.key), ['disposal-sites:a', 'disposal-sites:b']);
  assert.equal(select({ minCapacity: '0' }).length, 3);
});

test('nearest expiry sorts future expirations before expired and missing dates', () => {
  assert.deepEqual(select({ sort: 'expirySoon' }).map(row => row.key), ['disposal-sites:e', 'disposal-sites:b', 'disposal-sites:f', 'disposal-sites:a', 'disposal-sites:c', 'disposal-sites:d']);
  assert.equal(select({ sort: 'expiryDesc' }).at(-1).expires, null);
});

test('capacity sort is numeric, stable, missing-last in either direction', () => {
  assert.deepEqual(select({ sort: 'capacityDesc' }).map(row => row.capacity), [10000, 5001.5, 5000, 0, null, null]);
  assert.deepEqual(select({ sort: 'capacityAsc' }).map(row => row.capacity), [0, 5000, 5001.5, 10000, null, null]);
});

test('expiry windows, date bounds, district and keyword combine over all records', () => {
  assert.equal(select({ expiry: 'soon7' }).length, 2);
  assert.equal(select({ expiry: 'expired' }).length, 1);
  assert.equal(select({ expiry: 'unknown' }).length, 1);
  assert.equal(select({ expiry: 'valid' }).length, 3);
  assert.deepEqual(select({ district: '海淀区', keyword: '场所', minCapacity: '5000' }).map(row => row.title), ['远期场所']);
  assert.equal(select({ expiresFrom: today, expiresTo: '2026-09-12' }).length, 2);
});

test('company mapping does not fabricate expiration and honors count fields', () => {
  const regular = normalizeRecord('companies', { id: 1, companyName: '企业', bank: '海淀区', carNum: 9, spdate: today }, 0);
  const energy = normalizeRecord('energy-companies', { id: 1, companyName: '新能源', area: '朝阳区', energyCarNum: 20 }, 0);
  assert.equal(regular.expires, null);
  assert.equal(regular.district, '海淀区');
  assert.equal(energy.vehicleCount, 20);
  assert.equal(selectRecords([regular], { ...defaultFilters(), minVehicles: '10' }, companies).length, 0);
  assert.throws(() => selectRecords([regular], { ...defaultFilters(), sort: 'expirySoon' }, companies));
});

test('invalid filters are rejected and favorites use stable identifiers', () => {
  for (const filters of [{ minCapacity: '-1' }, { minCapacity: 'abc' }, { minCapacity: '50', maxCapacity: '40' }, { expiresFrom: '2026-09-06', expiresTo: '2026-09-05' }]) assert.throws(() => select(filters));
  assert.equal(selectRecords(rows, { ...defaultFilters(), onlyStarred: true }, sites, { today, starred: new Set(['disposal-sites:c']) })[0].key, 'disposal-sites:c');
});

test('CSV uses filtered records, escapes formulas, quotes, commas and Unicode', () => {
  const csv = csvFor([{ ...rows[0], title: '=HYPERLINK("x")', address: '测试,地址' }], sites);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /'=HYPERLINK/);
  assert.match(csv, /"测试,地址"/);
  assert.ok(!csv.includes('联系方式'));
});

const response = (items, total = items.length) => Response.json({ success: true, code: 2000, result: { rows: items, total } });

test('dataset loads all pages before publishing rows and deduplicates concurrent reads', async () => {
  let requests = 0;
  const service = createDirectoryService({ batchSize: 2, intervalMs: 0, fetcher: async () => { const start = requests++ * 2; return response(raw.slice(start, start + 2), 6); } });
  const first = service.get('disposal-sites', { refresh: true });
  assert.equal(first.status, 'queued'); assert.equal(first.rows, undefined);
  service.get('disposal-sites'); service.get('disposal-sites');
  await service.idle();
  const complete = service.get('disposal-sites');
  assert.equal(complete.complete, true); assert.equal(complete.rows.length, 6); assert.equal(requests, 3);
  service.get('disposal-sites'); assert.equal(requests, 3);
});

test('missing pages, changing totals and oversized datasets fail closed', async () => {
  for (const replies of [
    [response(raw.slice(0, 2), 5), response([], 5)],
    [response(raw.slice(0, 2), 3), response(raw.slice(2, 3), 4)],
    [response(raw.slice(0, 2), 20001)]
  ]) {
    const service = createDirectoryService({ batchSize: 2, intervalMs: 0, fetcher: async () => replies.shift() });
    service.get('disposal-sites', { refresh: true }); await service.idle();
    assert.equal(service.get('disposal-sites').status, 'error');
    assert.equal(service.get('disposal-sites').rows, undefined);
  }
});

test('native count mismatches and repeated records are explicitly marked as incomplete coverage', async () => {
  const replies = [response(raw.slice(0, 2), 3), response(raw.slice(0, 1), 3)];
  const service = createDirectoryService({ batchSize: 2, intervalMs: 0, fetcher: async () => replies.shift() });
  service.get('disposal-sites', { refresh: true }); await service.idle();
  const result = service.get('disposal-sites');
  assert.equal(result.complete, true);
  assert.equal(result.coverageComplete, false);
  assert.equal(result.rows.length, 2);
  assert.equal(result.quality.duplicateRows, 1);
  assert.match(result.warning, /无法确认完整性/);
});

test('ordinary reads never refresh, explicit refresh has a cooldown and auth failures are reported', async () => {
  let clock = 1800000000000; let requests = 0;
  const service = createDirectoryService({ now: () => clock, ttlMs: 300000, fetcher: async () => { requests++; return response(raw.slice(0, 1)); } });
  service.get('disposal-sites', { refresh: true }); await service.idle();
  service.get('disposal-sites', { refresh: true }); await service.idle(); assert.equal(requests, 1);
  clock += 10001; service.get('disposal-sites', { refresh: true }); await service.idle(); assert.equal(requests, 2);
  clock += 86400001; service.get('disposal-sites'); await service.idle(); assert.equal(requests, 2);
  const failed = createDirectoryService({ fetcher: async () => Response.json({ success: false, code: 6000 }) });
  failed.get('vehicles', { refresh: true }); await failed.idle(); assert.match(failed.get('vehicles').error, /登录/);
  assert.throws(() => failed.get('login'));
});
