import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildRequest, endpoints, BASE_URL, VERIFIED_DATE } from './shared/catalog.mjs';
import { createDirectoryService } from './directory-service.mjs';
import { DirectoryStore } from './directory-store.mjs';
import { startNightlySync } from './directory-scheduler.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const MAX_RESPONSE = 2 * 1024 * 1024;

function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}

export function createApiHandler({ fetcher = fetch, timeoutMs = 15000, maxPerMinute = 30, maxResponse = MAX_RESPONSE, publicOrigin = '', directoryService = createDirectoryService({ fetcher }) } = {}) {
  if (publicOrigin) {
    const origin = new URL(publicOrigin);
    if (origin.protocol !== 'https:' || origin.origin !== publicOrigin) throw new Error('PUBLIC_ORIGIN must be an HTTPS origin without a path');
  }
  let active = 0;
  let recent = [];
  return async (req, res) => {
    if (!req.url.startsWith('/api/')) return false;
    try {
      const host = req.headers.host || '';
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) { json(res, 403, { error: '仅允许本机访问' }); return true; }
      if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== `http://${host}` && req.headers.origin !== publicOrigin)) { json(res, 403, { error: '不接受跨站请求' }); return true; }
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); json(res, 405, { error: '只允许 GET 查询' }); return true; }
      if (req.url.length > 4096) { json(res, 414, { error: '请求地址过长' }); return true; }
      const requestUrl = new URL(req.url, 'http://localhost');
      if (requestUrl.pathname === '/api/health') { json(res, 200, { ok: true, mode: 'read-only', baseUrl: BASE_URL }); return true; }
      if (requestUrl.pathname === '/api/catalog') { json(res, 200, { baseUrl: BASE_URL, verifiedDate: VERIFIED_DATE, endpoints }); return true; }
      if (requestUrl.pathname === '/api/database/status') { json(res, 200, directoryService.databaseStatus()); return true; }
      const datasetMatch = /^\/api\/datasets\/([a-z-]+)$/.exec(requestUrl.pathname);
      if (datasetMatch) {
        try {
          if ([...requestUrl.searchParams.keys()].some(key => key !== 'refresh') || requestUrl.searchParams.getAll('refresh').length > 1 || (requestUrl.searchParams.has('refresh') && requestUrl.searchParams.get('refresh') !== '1')) throw new Error('无效数据查询参数');
          const dataset = directoryService.get(datasetMatch[1], { refresh: requestUrl.searchParams.get('refresh') === '1' });
          json(res, dataset.status === 'error' ? 502 : dataset.complete || dataset.status === 'empty' ? 200 : 202, dataset);
        } catch (error) { json(res, 400, { error: error.message }); }
        return true;
      }
      const match = /^\/api\/query\/([a-z-]+)$/.exec(requestUrl.pathname);
      if (!match) { json(res, 404, { error: '未收录的接口' }); return true; }
      let request;
      try {
        const values = {};
        for (const [key, value] of requestUrl.searchParams) {
          if (Object.hasOwn(values, key)) throw new Error(`参数 ${key} 不可重复`);
          Object.defineProperty(values, key, { value, enumerable: true });
        }
        request = buildRequest(match[1], values);
      } catch (error) { json(res, 400, { error: error.message }); return true; }
      const now = Date.now();
      recent = recent.filter(time => now - time < 60000);
      if (recent.length >= maxPerMinute || active >= 2) { res.setHeader('Retry-After', '60'); json(res, 429, { error: '查询过于频繁，请稍后再试' }); return true; }
      recent.push(now);
      active++;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const disconnect = () => { if (!res.writableEnded) controller.abort(); };
      res.on('close', disconnect);
      try {
        // The target comes only from the fixed catalog. No cookies, tokens, or client headers are forwarded.
        const upstream = await fetcher(request.url, { method: 'GET', redirect: 'error', signal: controller.signal, headers: { Accept: 'application/json' } });
        let size = 0;
        const chunks = [];
        for await (const chunk of upstream.body) {
          size += chunk.byteLength;
          if (size > maxResponse) { controller.abort(); throw new Error('返回数据超过本地大小限制'); }
          chunks.push(Buffer.from(chunk));
        }
        const body = Buffer.concat(chunks).toString('utf8');
        const meta = { url: request.url, httpStatus: upstream.status, durationMs: Date.now() - now, bytes: size, receivedAt: new Date().toISOString(), page: request.page, limit: request.limit };
        let data;
        try { data = JSON.parse(body); } catch { json(res, 502, { error: '上游未返回 JSON，可能正在维护或迁移', meta }); return true; }
        if (upstream.ok && data.success === true && data.code === 2000 && Array.isArray(data.result?.rows) && match[1] !== 'districts') {
          try { meta.database = { saved: true, ...directoryService.observe(match[1], data.result.rows, { total: data.result.total, pages: 1 }) }; }
          catch (error) { json(res, 502, { error: `查询返回成功，但数据库写入失败：${error.message}`, meta }); return true; }
        }
        json(res, 200, { meta, data });
      } catch (error) {
        if (!res.destroyed) json(res, controller.signal.aborted ? 504 : 502, { error: controller.signal.aborted ? '上游查询超时或请求已取消' : `上游连接失败：${error.message}` });
      } finally { clearTimeout(timeout); res.off('close', disconnect); active--; }
    } catch { if (!res.headersSent) json(res, 500, { error: '本地服务发生错误' }); }
    return true;
  };
}

export async function startServer({ port = Number(process.env.PORT || 5188), production = process.argv.includes('--production') } = {}) {
  const store = new DirectoryStore(process.env.DATABASE_PATH || path.join(root, 'data', 'directory.sqlite'));
  store.recoverInterrupted();
  const directoryService = createDirectoryService({ store });
  const api = createApiHandler({ publicOrigin: process.env.PUBLIC_ORIGIN || '', directoryService });
  const vite = production ? null : await (await import('vite')).createServer({ root, server: { middlewareMode: true, hmr: false }, appType: 'spa' });
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.svg': 'image/svg+xml' };
  const server = http.createServer(async (req, res) => {
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) { json(res, 403, { error: '仅允许本机访问' }); return; }
    if (await api(req, res)) return;
    if (vite) { vite.middlewares(req, res); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') { json(res, 405, { error: '不支持的请求方法' }); return; }
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const target = path.resolve(root, 'dist', `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!target.startsWith(path.join(root, 'dist') + path.sep)) { json(res, 403, { error: '无效路径' }); return; }
      const body = await readFile(target);
      res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { json(res, 404, { error: '文件不存在' }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  const stopNightlySync = production ? startNightlySync(directoryService) : () => {};
  server.on('close', () => { stopNightlySync(); directoryService.close().catch(error => console.error(error.message)); });
  console.log(`API workbench: http://127.0.0.1:${server.address().port}`);
  return { server, vite, directoryService };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) startServer().catch(error => { console.error(error.message); process.exitCode = 1; });
