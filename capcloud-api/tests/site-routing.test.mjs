import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('complete site keeps bookkeeping and directory routes separate', async () => {
  const site = await readFile(new URL('../../deploy/ylt.etgq.com.conf', import.meta.url), 'utf8');
  const directory = await readFile(new URL('../deploy/capcloud-api-location.inc', import.meta.url), 'utf8');
  assert.match(site, /include .*capcloud-api-location\.inc;/);
  assert.match(site, /location \/\s*\{\s*proxy_pass http:\/\/127\.0\.0\.1:8002;/);
  assert.doesNotMatch(site, /root .*capcloud/);
  assert.match(directory, /location = \/api\/\s*\{/);
  assert.match(directory, /location \^~ \/api\/api\/\s*\{/);
  assert.match(directory, /location \^~ \/api\/assets\/\s*\{/);
  assert.doesNotMatch(directory, /location\s+(?:\^~\s+)?\/api\/\s*\{/);
  assert.doesNotMatch(directory, /location[^\n]*\/api\/(?:fleet|records|sync)/);
});
