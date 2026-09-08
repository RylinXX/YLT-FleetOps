import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { categories, defaultFilters, selectRecords, todayInBeijing } from '../shared/directory.mjs';

const base = process.env.DIRECTORY_URL || 'http://127.0.0.1:5189';
const results = [];
for (const category of categories) {
  const started = Date.now();
  let dataset;
  while (Date.now() - started < 220000) {
    const res = await fetch(`${base}/api/datasets/${category.id}`, { signal: AbortSignal.timeout(20000) });
    dataset = await res.json();
    if (!res.ok) throw new Error(dataset.error);
    if (dataset.complete && !dataset.syncing) break;
    await delay(1500);
  }
  assert.ok(dataset.complete, 'Full dataset did not complete');
  assert.ok(!dataset.syncError, dataset.syncError);
  assert.equal(dataset.storage, 'sqlite', 'The database-backed release is not active');
  if (dataset.coverageComplete) assert.equal(dataset.rows.length, dataset.total);
  else assert.ok(dataset.warning, 'Incomplete coverage must be explicitly reported');
  const report = { id: category.id, total: dataset.total, loaded: dataset.rows.length, pages: dataset.pages, coverageComplete: dataset.coverageComplete, warning: dataset.warning, quality: dataset.quality, database: dataset.database, checkedAt: new Date().toISOString(), sourceUpdatedAt: dataset.updatedAt, durationMs: Date.now() - started };
  if (category.hasCapacity) {
    const rows = selectRecords(dataset.rows, { ...defaultFilters(), minCapacity: '5000', sort: 'capacityDesc' }, category);
    assert.ok(rows.every(row => row.capacity > 5000));
    assert.ok(rows.every((row, index) => !index || row.capacity <= rows[index - 1].capacity));
    report.capacityOver5000 = rows.length;
  }
  if (category.hasExpiry) {
    const rows = selectRecords(dataset.rows, { ...defaultFilters(), sort: 'expirySoon' }, category);
    const future = rows.filter(row => row.expires && row.expires >= todayInBeijing());
    assert.ok(future.every((row, index) => !index || row.expires >= future[index - 1].expires));
    report.knownExpiry = rows.filter(row => row.expires).length;
  }
  results.push(report);
  console.log(`${category.id}: ${dataset.rows.length}/${dataset.total}, ${dataset.pages} pages, checked`);
}
await writeFile(new URL('../docs/directory-verification.json', import.meta.url), JSON.stringify({ mode: 'Database-backed category validation; report contains metadata only', results }, null, 2));
