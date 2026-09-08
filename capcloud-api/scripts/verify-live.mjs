import { writeFile, mkdir } from 'node:fs/promises';
import { allEndpoints, BASE_URL, SOURCE_BUNDLE, buildRequest } from '../shared/catalog.mjs';

const results = [];
for (const endpoint of allEndpoints) {
  const { url } = buildRequest(endpoint.id, endpoint.pagination === 'none' ? {} : { page: '1', limit: '1' });
  const start = Date.now();
  try {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Accept: 'application/json' } });
    const data = await response.json();
    const rows = data.result?.rows;
    const record = { id: endpoint.id, name: endpoint.name, url, checkedAt: new Date().toISOString(), httpStatus: response.status, code: data.code, success: data.success, message: data.message, durationMs: Date.now() - start, total: data.result?.total, returnedRows: rows?.length, fields: rows?.[0] ? Object.keys(rows[0]) : [], dictionarySize: Array.isArray(data.result) ? data.result.length : undefined };
    results.push(record);
    console.log(`${endpoint.id}: HTTP ${record.httpStatus}, code ${record.code}, success ${record.success}, count ${record.returnedRows ?? record.dictionarySize}`);
    if (!response.ok || data.success !== true || data.code !== 2000) process.exitCode = 1;
  } catch (error) { results.push({ id: endpoint.id, checkedAt: new Date().toISOString(), error: error.message }); process.exitCode = 1; console.log(`${endpoint.id}: ${error.message}`); }
}
const directory = new URL('../docs/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('verification.json', directory), JSON.stringify({ baseUrl: BASE_URL, sourceBundle: SOURCE_BUNDLE, auth: 'No cookies or authToken supplied', sampling: 'One record per query endpoint; no full dataset or personal records persisted.', results }, null, 2));
