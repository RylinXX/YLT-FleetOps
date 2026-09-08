import { setTimeout as delay } from 'node:timers/promises';
import { buildRequest, endpoints } from './shared/catalog.mjs';
import { DirectoryStore, canonicalJson } from './directory-store.mjs';

export function createDirectoryService({ fetcher = fetch, batchSize = 20000, intervalMs = 500, ttlMs = 300000, maxRows = 20000, maxPages = 100, now = Date.now, store = new DirectoryStore() } = {}) {
  const entries = new Map();
  let queue = Promise.resolve();

  async function load(entry) {
    entry.status = 'loading';
    entry.startedAt = now();
    const records = [];
    const ids = new Set();
    const fingerprints = new Set();
    let duplicateIds = 0;
    let duplicateRows = 0;
    let returned = 0;
    try {
      for (let page = 1; page <= maxPages; page++) {
        if (now() - entry.startedAt > 180000) throw new Error('完整数据加载超时，请稍后重试');
        const request = buildRequest(entry.id, { page, limit: batchSize }, { maxLimit: batchSize });
        // A bounded single result avoids unstable ordering at upstream page boundaries.
        const response = await fetcher(request.url, { method: 'GET', redirect: 'error', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(90000) });
        if (!response.ok) throw new Error(`来源平台返回 HTTP ${response.status}`);
        if (Number(response.headers.get('content-length')) > 4 * 1024 * 1024) throw new Error('单页响应超过大小限制');
        let bytes = 0; const chunks = [];
        for await (const chunk of response.body) {
          bytes += chunk.byteLength;
          if (bytes > 4 * 1024 * 1024) throw new Error('单页响应超过大小限制');
          chunks.push(Buffer.from(chunk));
        }
        let data;
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('来源平台没有返回有效数据，可能正在维护'); }
        if (data.success !== true || data.code !== 2000) throw new Error(data.code === 6000 ? '来源平台当前要求登录，无法匿名查询' : `来源平台查询失败：${data.message || data.code}`);
        const rows = data.result?.rows;
        const total = Number(data.result?.total);
        if (!Array.isArray(rows) || !Number.isSafeInteger(total) || total < 0) throw new Error('来源平台的返回结构发生变化');
        if (total > maxRows) throw new Error(`该分类有 ${total} 条，超过当前完整加载上限 ${maxRows} 条`);
        if (page === 1) entry.total = total;
        if (entry.total !== total) throw new Error('来源数据在加载期间发生变化，请刷新重试');
        returned += rows.length;
        for (const row of rows) {
          const fingerprint = canonicalJson(row);
          if (fingerprints.has(fingerprint)) { duplicateRows++; continue; }
          fingerprints.add(fingerprint);
          if (row.id != null) {
            const key = String(row.id);
            if (ids.has(key)) duplicateIds++;
            ids.add(key);
          }
          records.push(row);
        }
        entry.loaded = records.length;
        entry.pages = page;
        if (page >= Math.max(1, Math.ceil(total / batchSize))) {
          const coverageComplete = records.length === total && returned === total && duplicateRows === 0 && duplicateIds === 0;
          store.commitSync(entry.runId, records, {
            total, pages: page, coverageComplete,
            quality: { sourceTotal: total, returned, uniqueRows: records.length, duplicateRows, duplicateIds },
            warning: coverageComplete ? undefined : `来源标注 ${total} 条，本次取得 ${records.length} 条去重记录。来源分页存在数量或标识差异，无法确认完整性。`,
            updatedAt: new Date(now()).toISOString()
          });
          entry.snapshot = store.readCategory(entry.id);
          entry.error = undefined;
          entry.status = 'ready';
          return;
        }
        if (rows.length === 0) throw new Error('来源平台没有返回后续分页，已停止加载');
        if (intervalMs) await delay(intervalMs);
      }
      throw new Error('超过完整加载页数上限，请稍后再试');
    } catch (error) {
      entry.status = 'error'; entry.error = error.name === 'TimeoutError' ? '来源数据读取超时，请稍后重试' : error.message; entry.failedAt = now();
      store.failSync(entry.runId, entry.error, new Date(now()).toISOString());
      entry.snapshot = store.readCategory(entry.id);
    }
  }

  return {
    get(id, { refresh = false } = {}) {
      if (!endpoints.some(endpoint => endpoint.id === id)) throw new Error('未知信息分类');
      let entry = entries.get(id);
      if (!entry) {
        const snapshot = store.readCategory(id);
        entry = { id, snapshot, status: snapshot ? 'ready' : 'empty', loaded: 0, total: null, pages: 0, requestedAt: snapshot?.database.lastAttemptAt ? Date.parse(snapshot.database.lastAttemptAt) : 0 };
        entries.set(id, entry);
      }
      const mayRefresh = !['queued', 'loading'].includes(entry.status) && now() - entry.requestedAt >= 10000;
      // Reading a dataset never initiates an upstream request, including an empty database.
      if (refresh && mayRefresh) {
        entry.status = 'queued'; entry.loaded = 0; entry.total = null; entry.pages = 0; entry.requestedAt = now(); entry.error = undefined;
        entry.runId = store.beginSync(id, 'category', new Date(now()).toISOString());
        queue = queue.then(() => load(entry)).catch(() => {});
      }
      const syncing = ['queued', 'loading'].includes(entry.status);
      if (entry.snapshot) return { ...entry.snapshot, cacheSeconds: ttlMs / 1000, syncing, syncState: entry.status,
        syncError: entry.error || entry.snapshot.syncError, stale: Boolean(entry.error || entry.snapshot.syncError || !entry.snapshot.database.lastSyncAt),
        progress: syncing ? { loaded: entry.loaded, total: entry.total } : undefined };
      return { id, status: entry.status, loaded: entry.loaded, total: entry.total, pages: entry.pages, complete: false, syncing, cacheSeconds: ttlMs / 1000, error: entry.error };
    },
    observe(id, rows, metadata) {
      const runId = store.beginSync(id, 'observation', new Date(now()).toISOString());
      try {
        const unique = [...new Map(rows.map(row => [canonicalJson(row), row])).values()];
        const result = store.commitSync(runId, unique, { ...metadata, updatedAt: new Date(now()).toISOString(), coverageComplete: false });
        const entry = entries.get(id);
        if (entry) entry.snapshot = store.readCategory(id);
        return result;
      } catch (error) { store.failSync(runId, error.message, new Date(now()).toISOString()); throw error; }
    },
    databaseStatus() { return { engine: 'sqlite', categories: store.summary() }; },
    async refreshAll() {
      for (const endpoint of endpoints) {
        if (endpoint.id !== 'districts') this.get(endpoint.id, { refresh: true });
      }
      await queue;
    },
    async idle() { await queue; },
    async close() { await queue; store.close(); }
  };
}
