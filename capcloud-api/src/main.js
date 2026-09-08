import { createIcons, Blocks, ChevronDown, FlaskConical, Library, History, Search, FileSearch, ArrowUpRight, ChevronRight, ExternalLink, Download, TriangleAlert, ShieldCheck, BadgeCheck, Copy, LockKeyhole, RotateCcw, LoaderCircle, Play, Braces, CircleAlert, FileWarning, SearchX, Table2, Code2, Terminal, ChevronLeft, Check, ListFilter, CornerUpLeft, X, Database, Building2, Truck, Leaf, Zap, Warehouse, MapPin } from 'lucide';
import { endpoints, DISTRICTS, SOURCE_URL, SOURCE_BUNDLE, BASE_URL, VERIFIED_DATE, buildRequest } from '../shared/catalog.mjs';
import './style.css';
import { appPath } from './urls.js';

const app = document.querySelector('#app');
const icons = { Blocks, ChevronDown, FlaskConical, Library, History, Search, FileSearch, ArrowUpRight, ChevronRight, ExternalLink, Download, TriangleAlert, ShieldCheck, BadgeCheck, Copy, LockKeyhole, RotateCcw, LoaderCircle, Play, Braces, CircleAlert, FileWarning, SearchX, Table2, Code2, Terminal, ChevronLeft, Check, ListFilter, CornerUpLeft, X, Database, Building2, Truck, Leaf, Zap, Warehouse, MapPin };
const state = { selected: endpoints[0].id, view: 'test', resultTab: 'table', drafts: {}, results: {}, history: [], search: '', busy: false, controller: null, districts: DISTRICTS, connected: false, modal: false };
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const icon = (name, cls = '') => `<i data-lucide="${name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}" class="${cls}" aria-hidden="true"></i>`;
const current = () => endpoints.find(item => item.id === state.selected);
const draft = () => state.drafts[state.selected] ||= { page: '1', limit: '10' };
const result = () => state.results[state.selected];
const fmt = number => new Intl.NumberFormat('zh-CN').format(number ?? 0);
const time = value => new Date(value).toLocaleTimeString('zh-CN', { hour12: false });
const requestFor = () => buildRequest(state.selected, draft());
const isSuccess = response => Boolean(response?.data?.success === true && response.data.code === 2000 && response.meta?.httpStatus >= 200 && response.meta.httpStatus < 300);
const method = '<span class="method">GET</span>';
const tool = (action, glyph, label, disabled = false) => `<button class="icon-button" data-action="${action}" aria-label="${label}" title="${label}" ${disabled ? 'disabled' : ''}>${icon(glyph)}</button>`;

function toast(message) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = message; document.body.append(el);
  setTimeout(() => el.remove(), 3000);
}

function sidebar() {
  return `<aside class="sidebar">
    <a class="brand" href="#" aria-label="接口工作台首页"><span class="brand-mark">${icon('Blocks')}</span><span>城建数据<span class="brand-sub">API WORKSPACE</span></span></a>
    <div class="workspace-label"><span class="workspace-avatar">京</span><span>北京 · 资质查询</span>${icon('ChevronDown')}</div>
    <div class="nav-label">工作空间</div>
    <nav class="main-nav" aria-label="主导航">
      ${[['test', 'FlaskConical', '接口测试'], ['catalog', 'Library', '接口目录'], ['history', 'History', '调用记录']].map(([id, glyph, name]) => `<button data-view="${id}" class="nav-item ${state.view === id ? 'active' : ''}">${icon(glyph)}<span>${name}</span>${id === 'catalog' ? '<span class="nav-count">6</span>' : ''}</button>`).join('')}
    </nav>
    <div class="nav-label collection-label">资质查询接口 <span>6</span></div>
    <label class="sidebar-search">${icon('Search')}<input id="endpoint-search" aria-label="搜索接口" placeholder="搜索接口" value="${esc(state.search)}"></label>
    <nav class="endpoint-nav" aria-label="查询接口">${endpointButtons()}</nav>
    <div class="sidebar-bottom"><button data-action="source" class="source-button">${icon('FileSearch')}<span>来源与核验</span>${icon('ArrowUpRight')}</button><div class="local-note"><span class="status-dot"></span>本地工作空间 <span>v1.0</span></div></div>
  </aside>`;
}

function endpointButtons() {
  const items = endpoints.filter(item => `${item.name} ${item.path}`.toLowerCase().includes(state.search.toLowerCase()));
  return items.length ? items.map(item => `<button data-endpoint="${item.id}" class="endpoint-item ${state.selected === item.id && state.view === 'test' ? 'selected' : ''}"><span class="endpoint-number">${item.order}</span><span>${item.shortName}</span><span class="endpoint-dot"></span></button>`).join('') : '<p class="no-match">无匹配接口</p>';
}

function header() {
  return `<header class="topbar"><div class="breadcrumb">工作空间 ${icon('ChevronRight')} <span>资质信息查询</span></div><div class="topbar-right"><span class="connection ${state.connected ? 'online' : ''}"><span class="status-dot"></span>${state.connected ? '本地服务已连接' : '本地服务未连接'}</span><a class="icon-button" href="${SOURCE_URL}" target="_blank" rel="noopener noreferrer" title="打开来源网站" aria-label="打开来源网站">${icon('ExternalLink')}</a><span class="avatar">L</span></div></header>`;
}

function overview() {
  return `<section class="page-heading"><div><div class="eyebrow">BEIJING / PUBLIC QUALIFICATIONS</div><h1>资质查询<span class="heading-separator">/</span>接口工作台</h1><p class="heading-meta">北京市建筑垃圾管理与服务平台 <span>·</span> 公开查询</p></div><button class="button secondary" data-action="export-collection">${icon('Download')}导出接口集合</button></section>
    <div class="notice">${icon('TriangleAlert')}<span>来源平台已发布关停迁移通知，旧接口可能调整或停止服务。</span><button data-action="source">查看来源 ${icon('ArrowUpRight')}</button></div>
    <section class="metrics" aria-label="接口核验摘要"><div><span>查询接口</span><strong>06<small>项</small></strong></div><div><span>匿名抽样核验</span><strong>6 / 6<small class="green-text">通过</small></strong></div><div><span>请求方式</span><strong class="metric-method">GET<small>只读</small></strong></div><div><span>核验日期</span><strong class="metric-date">${VERIFIED_DATE}<small>北京时间</small></strong></div></section>
    <div class="section-tabs" role="tablist" aria-label="工作台视图">${[['test', '请求测试'], ['catalog', '接口目录'], ['history', '调用记录']].map(([id, label]) => `<button role="tab" aria-selected="${state.view === id}" data-view="${id}">${label}${id === 'history' ? `<span class="tab-count">${state.history.length}</span>` : ''}</button>`).join('')}<span class="tabs-end">${icon('ShieldCheck')} 匿名 · 不携带凭证</span></div>`;
}

function fieldMarkup(item) {
  const value = draft()[item.key] || '';
  const options = item.type === 'district' ? state.districts : item.options;
  const input = options ? `<select id="field-${item.key}" data-param="${item.key}"><option value="">全部</option>${options.map(option => { const v = typeof option === 'string' ? option : option.value; const label = typeof option === 'string' ? option : option.label; return `<option value="${esc(v)}" ${value === v ? 'selected' : ''}>${esc(label)}</option>`; }).join('')}</select>` : `<input id="field-${item.key}" data-param="${item.key}" type="${['date', 'datetime'].includes(item.type) ? 'date' : 'text'}" value="${esc(value.slice(0, ['date', 'datetime'].includes(item.type) ? 10 : 200))}" maxlength="200" autocomplete="off" ${item.type === 'text' ? 'placeholder="不限"' : ''}>`;
  return `<div class="field"><label for="field-${item.key}">${item.label} <code>${item.key}</code></label>${input}</div>`;
}

function requestPanel() {
  const endpoint = current();
  let path = ''; try { path = requestFor().url; } catch { path = BASE_URL + endpoint.path; }
  return `<section class="request-panel"><div class="endpoint-heading"><div class="endpoint-symbol">${icon(endpoint.icon)}</div><div><div class="small-label">${endpoint.category} <span>/ ${endpoint.order}</span></div><h2>${endpoint.name}</h2></div><span class="verified-label">${icon('BadgeCheck')}抽样已通过</span></div>
    <div class="request-url">${method}<code id="request-url" title="${esc(path)}">${esc(path)}</code>${tool('copy-url', 'Copy', '复制原始接口地址')}</div>
    <form id="request-form"><div class="parameters-header"><h3>查询参数</h3><span>Query parameters</span></div><fieldset ${state.busy ? 'disabled' : ''}><div class="fields">${endpoint.fields.map(fieldMarkup).join('')}</div>
      ${Object.keys(endpoint.fixed).length ? `<div class="fixed-params">${icon('LockKeyhole')}${Object.entries(endpoint.fixed).map(([key, value]) => `<code>${key}<span> = </span>${value}</code>`).join('')}</div>` : ''}
      <div class="request-actions"><div class="pagination-config"><label for="page-input">页码</label><input id="page-input" aria-label="页码" data-param="page" type="number" min="1" max="10000" value="${esc(draft().page)}"><label for="limit-input">每页</label><select id="limit-input" aria-label="每页条数" data-param="limit">${['1', '5', '10', '20'].map(v => `<option ${draft().limit === v ? 'selected' : ''}>${v}</option>`).join('')}</select><span>条</span></div><div class="action-group">${tool('reset', 'RotateCcw', '重置查询参数', state.busy)}<button type="submit" class="button primary" ${state.busy ? 'disabled' : ''}>${icon(state.busy ? 'LoaderCircle' : 'Play', state.busy ? 'spin' : '')}${state.busy ? '请求中' : '发送请求'}</button></div></div></fieldset></form>
    ${state.busy ? '<div class="running-bar"><span>正在查询来源平台…</span><button data-action="cancel">取消请求</button></div>' : ''}
  </section>`;
}

function displayValue(key, value) {
  if (value === null || value === undefined || value === '') return '<span class="muted">--</span>';
  if (key === 'validstate') return `<span class="state-chip">${esc(value)}</span>`;
  if (key === 'disposaltype') value = ({ '1': '建筑垃圾填埋场', '3': '建筑垃圾临时贮存点', '4': '固定式资源化处置设施', '5': '临时性资源化处置设施', '6': '建筑垃圾临时贮存点', '7': '临时性资源化处置设施', '11': '就地资源化处置设施' })[value] || value;
  return esc(typeof value === 'object' ? JSON.stringify(value) : value);
}

function tableMarkup() {
  const response = result();
  const rows = response?.data?.result?.rows;
  if (!response) return `<div class="empty-state">${icon('Braces')}<strong>等待请求</strong><span>${current().fields.length} 个查询参数 · GET · JSON</span></div>`;
  if (!isSuccess(response)) return `<div class="empty-state error-state">${icon('CircleAlert')}<strong>${esc(response.error || response.data?.message || '查询失败')}</strong><span>${response.data?.code === 6000 ? '来源平台要求登录，当前匿名调用不可用' : response.meta ? `HTTP ${response.meta.httpStatus} · 业务码 ${response.data?.code ?? '--'}` : '未取得有效响应'}</span></div>`;
  if (!Array.isArray(rows)) return `<div class="empty-state error-state">${icon('FileWarning')}<strong>返回结构与已核验结构不一致</strong><span>result.rows 不存在</span></div>`;
  if (!rows.length) return `<div class="empty-state">${icon('SearchX')}<strong>没有符合条件的记录</strong><span>本次查询返回 0 条</span></div>`;
  return `<div class="table-scroll"><table><thead><tr><th class="row-number">#</th>${current().columns.map(col => `<th>${col.label}<code>${col.key}</code></th>`).join('')}</tr></thead><tbody>${rows.map((row, index) => `<tr><td class="row-number">${(response.meta.page - 1) * response.meta.limit + index + 1}</td>${current().columns.map(col => `<td title="${esc(row[col.key] ?? '')}">${displayValue(col.key, row[col.key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function snippet(kind) {
  const req = requestFor();
  if (kind === 'curl') return `curl --get '${req.url}' \\\n  --header 'Accept: application/json'`;
  return `// 浏览器端：通过同源只读代理调用\nconst response = await fetch(${JSON.stringify(appPath(req.localUrl))});\nconst payload = await response.json();\nif (!response.ok || !payload.data?.success || payload.data.code !== 2000\n    || payload.meta?.httpStatus < 200 || payload.meta?.httpStatus >= 300) {\n  throw new Error(payload.error || payload.data?.message || '查询失败');\n}\nconst { rows, total } = payload.data.result;\nconsole.log(rows, total);`;
}

function responsePanel() {
  const response = result();
  const status = response ? isSuccess(response) ? '<span class="response-success">成功</span>' : '<span class="response-error">失败</span>' : '<span class="muted">未发送</span>';
  let content;
  if (state.resultTab === 'table') content = tableMarkup();
  else if (state.resultTab === 'json') content = `<pre class="code-view">${esc(response ? JSON.stringify(response.data ?? response, null, 2) : '// 尚无响应')}</pre>`;
  else { try { content = `<pre class="code-view">${esc(snippet(state.resultTab))}</pre>`; } catch (error) { content = `<div class="inline-error">${esc(error.message)}</div>`; } }
  const total = response?.data?.result?.total;
  const hasRows = isSuccess(response) && Array.isArray(response?.data?.result?.rows);
  const pages = hasRows ? Math.max(1, Math.ceil(total / response.meta.limit)) : 1;
  const page = response?.meta?.page || 1;
  return `<section class="response-panel"><div class="response-heading"><div><h3>响应结果</h3>${status}</div><div class="response-meta">${response?.meta ? `<span>HTTP <b>${response.meta.httpStatus}</b></span><span>${response.meta.durationMs} ms</span><span>${(response.meta.bytes / 1024).toFixed(1)} KB</span>` : '<span>-- ms</span><span>-- KB</span>'}</div></div>
    <div class="response-toolbar"><div class="response-tabs" role="tablist" aria-label="响应视图">${[['table', 'Table2', '数据表格'], ['json', 'Braces', '原始 JSON'], ['javascript', 'Code2', 'JavaScript'], ['curl', 'Terminal', 'cURL']].map(([id, glyph, label]) => `<button role="tab" aria-selected="${state.resultTab === id}" data-result-tab="${id}">${icon(glyph)}${label}</button>`).join('')}</div><div class="response-tools">${tool('copy-response', 'Copy', '复制当前内容', !response && ['json', 'table'].includes(state.resultTab))}${tool('download-response', 'Download', '下载原始响应 JSON', !response)}</div></div>
    <div id="response-content">${content}</div><footer class="response-footer"><span>${hasRows ? `共 <b>${fmt(total)}</b> 条记录` : 'result.rows / result.total'}${response?.meta ? `<span class="received-time">${time(response.meta.receivedAt)} 返回</span>` : ''}</span><div class="page-controls">${tool('previous', 'ChevronLeft', '上一页', !hasRows || page <= 1 || state.busy)}<span>${hasRows ? `${page} / ${pages}` : '-- / --'}</span>${tool('next', 'ChevronRight', '下一页', !hasRows || page >= pages || state.busy)}</div></footer></section>`;
}

function catalogPanel() {
  return `<section class="catalog-panel"><div class="panel-title"><h2>接口目录 <span>06</span></h2><button class="button secondary small" data-action="download-openapi">${icon('Download')}OpenAPI</button></div><div class="catalog-list">${endpoints.map(item => `<button class="catalog-row" data-endpoint="${item.id}"><span class="catalog-number">${item.order}</span><span class="catalog-icon">${icon(item.icon)}</span><span class="catalog-info"><strong>${item.name}</strong><code>${item.path}</code></span>${method}<span class="catalog-verification">${icon('Check')}核验通过</span>${icon('ArrowUpRight')}</button>`).join('')}</div><div class="dictionary-line">${icon('ListFilter')}<span>辅助接口 · 审批区字典</span><code>/dictionary/area/dictionaryValue?area=conferenceType</code></div></section>`;
}

function historyPanel() {
  return `<section class="history-panel"><div class="panel-title"><h2>调用记录 <span>${state.history.length}</span></h2><span class="muted">当前会话</span></div>${state.history.length ? `<div class="table-scroll"><table><thead><tr><th>请求时间</th><th>接口</th><th>状态</th><th>耗时</th><th>返回条数</th><th></th></tr></thead><tbody>${state.history.map((item, index) => `<tr><td>${time(item.at)}</td><td>${esc(endpoints.find(e => e.id === item.id).shortName)}</td><td><span class="${item.ok ? 'response-success' : 'response-error'}">${item.ok ? '成功' : '失败'}</span></td><td>${item.ms ?? '--'} ms</td><td>${item.count ?? '--'}</td><td><button class="icon-button" data-history="${index}" aria-label="恢复这次请求参数" title="恢复请求参数">${icon('CornerUpLeft')}</button></td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state">${icon('History')}<strong>暂无调用记录</strong><span>本次会话 · 0 次请求</span></div>`}</section>`;
}

function modalMarkup() {
  if (!state.modal) return '';
  return `<div class="modal-backdrop"><section class="source-modal" role="dialog" aria-modal="true" aria-labelledby="source-title"><div class="panel-title"><h2 id="source-title">来源与核验</h2>${tool('close-modal', 'X', '关闭来源说明')}</div><div class="source-body"><img class="source-image" src="${appPath('source-menu.png')}" alt="用户提供的来源网站资质查询菜单截图"><dl><dt>来源网站</dt><dd><a href="${SOURCE_URL}" target="_blank" rel="noopener noreferrer">北京市建筑垃圾管理与服务平台 ${icon('ExternalLink')}</a></dd><dt>核验范围</dt><dd>截图中的 6 项资质查询，以及审批区字典。未包含备案、曝光台、登录与管理操作。</dd><dt>核验结果</dt><dd>${VERIFIED_DATE}，不携带 Cookie 或 authToken，6 项查询各抽样 1 条，均为 HTTP 200、code 2000、success true。字典接口返回 18 个审批区。筛选参数取自原站前端，未穷举所有组合。</dd><dt>来源证据</dt><dd><a href="${SOURCE_BUNDLE}" target="_blank" rel="noopener noreferrer">app.0276dc10.js ${icon('ExternalLink')}</a>，API 模块 4ec3，基础地址模块 9109。</dd><dt>服务风险</dt><dd>原站公告称旧平台关停时间顺延一个月，未给出本次核验可确认的最终日期。上述可用性不代表长期服务承诺，也不等于第三方再发布授权。上游使用 HTTP。</dd></dl></div></section></div>`;
}

function render() {
  app.innerHTML = `${sidebar()}<div class="main-shell">${header()}<main>${overview()}${state.view === 'test' ? requestPanel() + responsePanel() : state.view === 'catalog' ? catalogPanel() : historyPanel()}<footer class="page-footer"><span>${icon('Database')}数据来源：首信云 · 北京市建筑垃圾管理与服务平台</span><span>仅本地会话 <span class="footer-divider">/</span> HTTP 上游</span></footer></main></div>${modalMarkup()}`;
  createIcons({ icons, attrs: { 'stroke-width': 1.7 } });
}

function collectDraft() {
  document.querySelectorAll('[data-param]').forEach(input => { draft()[input.dataset.param] = input.value; });
}

function updateUrl() {
  const el = document.querySelector('#request-url');
  if (!el) return;
  try {
    el.textContent = requestFor().url; el.title = el.textContent; el.classList.remove('invalid');
    if (['javascript', 'curl'].includes(state.resultTab)) document.querySelector('.code-view').textContent = snippet(state.resultTab);
  }
  catch (error) { el.textContent = error.message; el.classList.add('invalid'); }
}

function setParameter(input) {
  draft()[input.dataset.param] = input.value;
  if (input.dataset.param !== 'page') {
    draft().page = '1';
    document.querySelector('#page-input').value = '1';
  }
  updateUrl();
}

async function sendRequest() {
  if (state.busy) return;
  let request; try { request = requestFor(); } catch (error) { toast(error.message); return; }
  const id = state.selected;
  const values = { ...draft() };
  state.busy = true;
  state.controller = new AbortController();
  const controller = state.controller;
  const timer = setTimeout(() => controller.abort('timeout'), 20000);
  render();
  let response;
  try {
    const res = await fetch(appPath(request.localUrl), { signal: controller.signal });
    response = await res.json();
    if (!res.ok && !response.error) response = { error: `本地请求失败：HTTP ${res.status}` };
  } catch (error) { response = { error: controller.signal.aborted ? controller.signal.reason === 'timeout' ? '本地请求超时' : '请求已取消' : `本地服务连接失败：${error.message}` }; }
  finally { clearTimeout(timer); state.busy = false; state.controller = null; }
  state.results[id] = response;
  state.history.unshift({ id, values, at: new Date().toISOString(), ok: isSuccess(response), ms: response.meta?.durationMs, count: response.data?.result?.rows?.length });
  state.history = state.history.slice(0, 50);
  render();
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('已复制'); } catch { toast('无法访问剪贴板'); }
}

function downloadJson(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

app.addEventListener('input', event => {
  if (event.target.id === 'endpoint-search') {
    state.search = event.target.value;
    document.querySelector('.endpoint-nav').innerHTML = endpointButtons();
  }
  if (event.target.matches('[data-param]')) setParameter(event.target);
});
app.addEventListener('change', event => {
  if (event.target.matches('[data-param]')) setParameter(event.target);
});
app.addEventListener('submit', event => { if (event.target.id === 'request-form') { event.preventDefault(); collectDraft(); sendRequest(); } });
app.addEventListener('click', async event => {
  const target = event.target.closest('button, a.brand');
  if (!target || target.disabled) return;
  if (target.matches('a.brand')) { event.preventDefault(); state.view = 'test'; render(); return; }
  if (target.dataset.view) { collectDraft(); state.view = target.dataset.view; render(); return; }
  if (target.dataset.endpoint) { collectDraft(); state.selected = target.dataset.endpoint; state.view = 'test'; state.resultTab = 'table'; render(); return; }
  if (target.dataset.resultTab) { collectDraft(); state.resultTab = target.dataset.resultTab; render(); return; }
  if (target.dataset.history !== undefined) { const item = state.history[Number(target.dataset.history)]; state.selected = item.id; state.drafts[item.id] = { ...item.values }; state.view = 'test'; render(); return; }
  const action = target.dataset.action;
  try {
    if (action === 'source') { collectDraft(); state.modal = true; render(); document.querySelector('[data-action="close-modal"]').focus(); }
    if (action === 'close-modal') { state.modal = false; render(); document.querySelector('[data-action="source"]').focus(); }
    if (action === 'reset') { state.drafts[state.selected] = { page: '1', limit: '10' }; render(); }
    if (action === 'cancel') state.controller?.abort();
    if (action === 'copy-url') await copy(requestFor().url);
    if (action === 'copy-response') await copy(['javascript', 'curl'].includes(state.resultTab) ? snippet(state.resultTab) : JSON.stringify(state.resultTab === 'table' ? result()?.data?.result?.rows : result()?.data ?? result(), null, 2));
    if (action === 'download-response' && result()) downloadJson(result().data ?? result(), `${state.selected}-response.json`);
    if (action === 'export-collection' || action === 'download-openapi') {
      const file = action === 'export-collection' ? 'capcloud.postman_collection.json' : 'openapi.json';
      const res = await fetch(appPath(`exports/${file}`)); if (!res.ok) throw new Error('导出文件不可用'); downloadJson(await res.json(), file);
    }
    if (action === 'previous' || action === 'next') {
      const latest = state.history.find(item => item.id === state.selected);
      if (latest) state.drafts[state.selected] = { ...latest.values, page: String(result().meta.page + (action === 'next' ? 1 : -1)) };
      await sendRequest();
    }
  } catch (error) { toast(error.message); }
});

document.addEventListener('keydown', event => {
  if (!state.modal) return;
  if (event.key === 'Escape') { state.modal = false; render(); document.querySelector('[data-action="source"]').focus(); }
  if (event.key === 'Tab') {
    const nodes = [...document.querySelector('.source-modal').querySelectorAll('button, a')];
    if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1).focus(); }
    else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
  }
});

render();
fetch(appPath('api/health')).then(res => { state.connected = res.ok; const indicator = document.querySelector('.connection'); indicator.classList.toggle('online', res.ok); indicator.innerHTML = `<span class="status-dot"></span>${res.ok ? '本地服务已连接' : '本地服务未连接'}`; }).catch(() => {});
fetch(appPath('api/query/districts')).then(res => res.json()).then(payload => {
  if (payload.data?.success && Array.isArray(payload.data.result)) state.districts = payload.data.result.map(item => item.dicname).filter(Boolean);
}).catch(() => {});
