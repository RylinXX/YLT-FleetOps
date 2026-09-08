import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { buildRequest, endpoints, BASE_URL } from '../shared/catalog.mjs';
import { createApiHandler } from '../server.mjs';

test('six query endpoints are ordered as the source screenshot', () => {
  assert.equal(endpoints.length, 6);
  assert.deepEqual(endpoints.map(item => item.order), ['01', '02', '03', '04', '05', '06']);
});

test('company pagination is in path; vehicle pagination is in query', () => {
  const company = buildRequest('companies', { page: '2', limit: '5', companyName: '北京 & 测试' });
  assert.equal(new URL(company.url).pathname, '/dregs_service-dev/putOnRecords/trans-company-info/pageList/2/5');
  assert.equal(new URL(company.url).searchParams.get('companyName'), '北京 & 测试');
  assert.equal(new URL(company.url).searchParams.has('page'), false);
  const vehicle = new URL(buildRequest('vehicles', { page: '2', limit: '5' }).url);
  assert.equal(vehicle.searchParams.get('page'), '2');
  assert.equal(vehicle.searchParams.get('limit'), '5');
});

test('source-specific fixed filters and datetime serialization are preserved', () => {
  assert.equal(buildRequest('energy-companies').params.isNewEnergyComp, '1');
  assert.equal(buildRequest('energy-vehicles').params.isNewEnergyCar, '1');
  assert.equal(buildRequest('reuse-sites').params.validstate, '已通过');
  assert.equal(buildRequest('disposal-sites').params.state, undefined);
  assert.equal(buildRequest('districts').params.area, 'conferenceType');
  assert.equal(buildRequest('vehicles', { startBeforeTime: '2026-09-01' }).params.startBeforeTime, '2026-09-01 00:00:00');
  assert.equal(buildRequest('reuse-sites', { usesoiltime: '2026-09-01' }).params.usesoiltime, '2026-09-01');
});

test('invalid inputs, arbitrary target URLs, and tampered fixed filters are rejected', () => {
  for (const params of [{ page: '0' }, { page: '-1' }, { page: '1.2' }, { page: '1e2' }, { limit: '21' }, { page: '10001' }, { url: 'http://127.0.0.1' }, { companyName: ['a', 'b'] }, { spdate: '2026-02-30' }, { companyName: 'x'.repeat(201) }]) assert.throws(() => buildRequest('companies', params));
  assert.throws(() => buildRequest('login'));
  assert.throws(() => buildRequest('energy-companies', { isNewEnergyComp: '0' }));
  assert.throws(() => buildRequest('energy-vehicles', { newEnergyType: 'invalid' }));
  assert.throws(() => buildRequest('vehicles', { startBeforeTime: '2026-09-03', startAfterTime: '2026-09-02' }));
});

async function withServer(t, options = {}) {
  const api = createApiHandler(options);
  const server = http.createServer(async (req, res) => { if (!(await api(req, res))) { res.writeHead(404); res.end(); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
const successful = { success: true, code: 2000, message: '操作成功', result: { total: 1, rows: [{ companyName: 'TEST' }] } };

test('proxy only forwards catalog URL and does not forward auth or cookies', async t => {
  let target; let options;
  const base = await withServer(t, { fetcher: async (url, opts) => { target = url; options = opts; return Response.json(successful); } });
  const response = await fetch(`${base}/api/query/companies?limit=1`, { headers: { Cookie: 'secret=1', authToken: 'secret' } });
  const payload = await response.json();
  assert.equal(target, `${BASE_URL}/putOnRecords/trans-company-info/pageList/1/1`);
  assert.deepEqual(options.headers, { Accept: 'application/json' });
  assert.equal(options.redirect, 'error');
  assert.equal(payload.data.result.rows[0].companyName, 'TEST');
  assert.equal(payload.meta.httpStatus, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('HTTP and business failure states remain visible in the response', async t => {
  const base = await withServer(t, { fetcher: async () => Response.json({ code: 6000, success: false, message: '未登录' }, { status: 403 }) });
  const payload = await (await fetch(`${base}/api/query/companies`)).json();
  assert.equal(payload.meta.httpStatus, 403);
  assert.equal(payload.data.code, 6000);
  assert.equal(payload.data.success, false);
});

test('writes, cross-site origins, unknown routes, duplicate parameters and host rebinding are denied', async t => {
  let requests = 0;
  const base = await withServer(t, { fetcher: async () => { requests++; return Response.json(successful); } });
  assert.equal((await fetch(`${base}/api/query/companies`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${base}/api/query/companies`, { headers: { Origin: 'https://other.example' } })).status, 403);
  assert.equal((await fetch(`${base}/api/query/companies`, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await fetch(`${base}/api/query/login`)).status, 400);
  assert.equal((await fetch(`${base}/api/not-allowed`)).status, 404);
  assert.equal((await fetch(`${base}/api/query/companies?page=1&page=2`)).status, 400);
  const status = await new Promise(resolve => { http.get(`${base}/api/query/companies`, { headers: { Host: 'rebind.example' } }, res => { res.resume(); resolve(res.statusCode); }); });
  assert.equal(status, 403);
  assert.equal(requests, 0);
});

test('non-JSON upstream is reported without forwarding HTML', async t => {
  const base = await withServer(t, { fetcher: async () => new Response('<html>maintenance</html>') });
  const response = await fetch(`${base}/api/query/companies`);
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /JSON/);
});

test('timeouts and rate limiting are enforced', async t => {
  const base = await withServer(t, { timeoutMs: 20, fetcher: async (_, options) => { await once(options.signal, 'abort'); throw new Error('timeout'); } });
  assert.equal((await fetch(`${base}/api/query/companies`)).status, 504);
  const limited = await withServer(t, { maxPerMinute: 1, fetcher: async () => Response.json(successful) });
  assert.equal((await fetch(`${limited}/api/query/companies`)).status, 200);
  const response = await fetch(`${limited}/api/query/companies`);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
});

test('oversized upstream replies are not forwarded', async t => {
  const base = await withServer(t, { maxResponse: 20, fetcher: async () => new Response('x'.repeat(100)) });
  const response = await fetch(`${base}/api/query/companies`);
  assert.notEqual(response.status, 200);
  assert.ok((await response.json()).error);
});
