import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectoryService } from '../directory-service.mjs';
import { nextMidnight, startNightlySync } from '../directory-scheduler.mjs';

test('Beijing midnight is independent of server timezone, including month/year rollover', () => {
  for (const [input, expected] of [
    ['2026-09-07T15:59:59.999Z', '2026-09-07T16:00:00.000Z'],
    ['2026-09-07T16:00:00.000Z', '2026-09-08T16:00:00.000Z'],
    ['2026-12-31T16:00:00.000Z', '2027-01-01T16:00:00.000Z']
  ]) assert.equal(new Date(nextMidnight(Date.parse(input))).toISOString(), expected);
});

test('empty database reads never fetch or create sync runs', async t => {
  let requests = 0;
  const service = createDirectoryService({ fetcher: async () => { requests++; throw new Error('must not fetch'); } });
  t.after(() => service.close());
  for (let i = 0; i < 3; i++) {
    const result = service.get('vehicles');
    assert.equal(result.status, 'empty');
    assert.equal(result.syncing, false);
  }
  await service.idle();
  assert.equal(requests, 0);
  assert.equal(service.databaseStatus().categories.length, 0);
});

test('nightly timer waits until midnight, updates six categories serially and rearms', async t => {
  let clock = Date.parse('2026-09-07T15:59:59.000Z');
  let requests = 0; let active = 0; let peak = 0;
  const service = createDirectoryService({ now: () => clock, fetcher: async () => {
    requests++; active++; peak = Math.max(peak, active);
    await Promise.resolve(); active--;
    return Response.json({ success: true, code: 2000, result: { rows: [], total: 0 } });
  } });
  t.after(() => service.close());
  const timers = []; const cancelled = [];
  const stop = startNightlySync(service, { now: () => clock, log: () => {},
    schedule: (callback, ms) => { const timer = { callback, ms }; timers.push(timer); return timer; },
    cancel: timer => cancelled.push(timer)
  });
  assert.equal(requests, 0); assert.equal(timers[0].ms, 1000);
  clock += 1000;
  await timers[0].callback();
  assert.equal(requests, 6); assert.equal(peak, 1);
  assert.equal(service.databaseStatus().categories.length, 6);
  assert.equal(timers[1].ms, 86400000);
  service.get('vehicles'); await service.idle(); assert.equal(requests, 6);
  stop(); assert.equal(cancelled[0], timers[1]);
});

test('failed nightly task rearms for tomorrow; stopping an active task prevents rearming', async () => {
  const timers = [];
  let finish;
  const stop = startNightlySync({ refreshAll: () => new Promise(resolve => { finish = resolve; }), databaseStatus: () => ({ categories: [] }) }, {
    schedule: callback => { timers.push(callback); return callback; }, cancel: () => {}, log: () => {}
  });
  const running = timers[0](); stop(); finish(); await running;
  assert.equal(timers.length, 1);
  const failedTimers = [];
  const stopFailed = startNightlySync({ refreshAll: async () => { throw new Error('offline'); } }, {
    schedule: callback => { failedTimers.push(callback); return callback; }, cancel: () => {}, log: () => {}
  });
  await failedTimers[0](); assert.equal(failedTimers.length, 2); stopFailed();
});
