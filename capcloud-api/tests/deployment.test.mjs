import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { mkdtemp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { withBasePath } from '../shared/deployment.mjs';
import { createApiHandler } from '../server.mjs';

test('assets, API requests and query strings remain inside the deployment subpath', () => {
  assert.equal(withBasePath('', '/api/'), '/api/');
  assert.equal(withBasePath('/api/query/companies?page=1&limit=10', '/api/'), '/api/api/query/companies?page=1&limit=10');
  assert.equal(withBasePath('source-menu.png', '/api/'), '/api/source-menu.png');
  assert.equal(withBasePath('lab.html', '/api/'), '/api/lab.html');
  assert.equal(withBasePath('/api/health'), '/api/health');
  assert.throws(() => withBasePath('api/health', '//evil/'));
});

test('reverse proxy accepts only the configured HTTPS origin and still rejects cross-site requests', async t => {
  const handler = createApiHandler({ publicOrigin: 'https://ylt.etgq.com' });
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/api/health`;
  assert.equal((await fetch(url, { headers: { Origin: 'https://ylt.etgq.com' } })).status, 200);
  assert.equal((await fetch(url, { headers: { Origin: 'https://other.example' } })).status, 403);
  assert.equal((await fetch(url, { headers: { Origin: 'http://ylt.etgq.com' } })).status, 403);
  assert.equal((await fetch(url, { headers: { Origin: 'https://ylt.etgq.com', 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.throws(() => createApiHandler({ publicOrigin: 'https://ylt.etgq.com/api/' }));
  assert.throws(() => createApiHandler({ publicOrigin: 'http://ylt.etgq.com' }));
});

test('production entrypoint starts when invoked through a release symlink', async t => {
  const temporary = await mkdtemp(join(tmpdir(), 'capcloud-entrypoint-'));
  const linked = join(temporary, 'server.mjs');
  await symlink(fileURLToPath(new URL('../server.mjs', import.meta.url)), linked);
  const child = spawn(process.execPath, [linked, '--production'], { env: { ...process.env, PORT: '0', DATABASE_PATH: join(temporary, 'directory.sqlite') }, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(child, 'exit');
  t.after(async () => { if (child.exitCode === null) { child.kill(); await exited; } });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const url = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start through symlink')), 5000);
    child.stdout.on('data', chunk => {
      const match = /http:\/\/127\.0\.0\.1:\d+/.exec(String(chunk));
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
    child.once('exit', () => { clearTimeout(timer); reject(new Error(`Server exited early: ${stderr}`)); });
  });
  assert.equal((await fetch(`${url}/api/health`)).status, 200);
});
