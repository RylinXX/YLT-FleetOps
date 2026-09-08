import { createIcons, Building2, Truck, Leaf, Zap, Warehouse, MapPin, Search, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, ChevronDown, ArrowUpRight, ArrowUpDown, ArrowDownWideNarrow, CalendarClock, CalendarDays, CircleCheck, CircleAlert, CircleHelp, X, Star, Download, RotateCcw, SlidersHorizontal, ExternalLink, Database, LoaderCircle, LayoutGrid, FileSearch, Copy, ArrowRight, PackageOpen, ListFilter, Check, ShieldCheck } from 'lucide';
import { SOURCE_URL, DISTRICTS } from '../shared/catalog.mjs';
import { categories, defaultFilters, selectRecords, validateFilters, expiryStatus, daysUntil, todayInBeijing, csvFor } from '../shared/directory.mjs';
import './portal.css';
import { appPath } from './urls.js';

const icons = { Building2, Truck, Leaf, Zap, Warehouse, MapPin, Search, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight, ChevronDown, ArrowUpRight, ArrowUpDown, ArrowDownWideNarrow, CalendarClock, CalendarDays, CircleCheck, CircleAlert, CircleHelp, X, Star, Download, RotateCcw, SlidersHorizontal, ExternalLink, Database, LoaderCircle, LayoutGrid, FileSearch, Copy, ArrowRight, PackageOpen, ListFilter, Check, ShieldCheck };
const app = document.querySelector('#app');
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const icon = (name, cls = '') => `<i data-lucide="${name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}" class="${cls}" aria-hidden="true"></i>`;
const fmt = value => value == null ? '--' : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
const compactTime = value => value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '--';
const favoritesKey = 'capcloud.directory.favorites.v1';
let starred = new Set();
try { const saved = JSON.parse(localStorage.getItem(favoritesKey) || '[]'); if (Array.isArray(saved)) starred = new Set(saved.filter(value => typeof value === 'string').slice(0, 5000)); } catch { /* Storage may be disabled by the browser. */ }
const state = { category: 'disposal-sites', filters: defaultFilters(), draft: defaultFilters(), data: {}, errors: {}, loading: new Set(), page: 1, limit: 10, more: false, detail: null, source: false, invalid: '', activeQuick: 'all' };
const category = () => categories.find(item => item.id === state.category);
const dataset = () => state.data[state.category];
const records = () => dataset()?.rows || [];
const currentRows = () => dataset()?.complete ? selectRecords(records(), state.filters, category(), { starred }) : [];
const buttonIcon = (action, glyph, label, disabled = false, extra = '') => `<button type="button" class="icon-button ${extra}" data-action="${action}" title="${label}" aria-label="${label}" ${disabled ? 'disabled' : ''}>${icon(glyph)}</button>`;
const empty = value => value || '未提供';
const initialCategory = new URL(location.href).searchParams.get('category');
if (categories.some(item => item.id === initialCategory)) state.category = initialCategory;
state.filters.sort = category().hasExpiry ? 'expirySoon' : 'source'; state.draft = { ...state.filters };

function notify(message) {
  document.querySelector('.toast')?.remove();
  const toast = document.createElement('div'); toast.className = 'toast'; toast.setAttribute('role', 'status'); toast.textContent = message; document.body.append(toast);
  setTimeout(() => toast.remove(), 3200);
}

function sidebar() {
  return `<aside class="sidebar"><a class="brand" href="${appPath('')}" aria-label="京城建废首页"><span class="brand-icon">${icon('Building2')}</span><span>京城建废<small>BEIJING CONSTRUCTION DATA</small></span></a>
    <div class="workspace"><span class="location-symbol">京</span><div>建筑垃圾信息查询<small>北京市 · 公开信息</small></div></div>
    <div class="sidebar-label">信息分类 <span>06</span></div><nav class="category-nav" aria-label="信息分类">${categories.map(item => `<button data-category="${item.id}" aria-current="${state.category === item.id ? 'page' : 'false'}" class="category-link ${state.category === item.id ? 'active' : ''}">${icon(item.icon)}<span>${item.shortName}</span>${state.category === item.id ? '<span class="nav-indicator"></span>' : ''}</button>`).join('')}</nav>
    <div class="sidebar-separator"></div><button class="favorites-nav ${state.filters.onlyStarred ? 'selected' : ''}" data-action="favorites">${icon('Star')}<span>本类关注</span><b>${records().filter(row => starred.has(row.key)).length || ''}</b></button>
    <div class="sidebar-bottom"><button data-action="source" class="sidebar-source">${icon('FileSearch')}数据来源与说明${icon('ArrowUpRight')}</button><a href="${appPath('lab.html')}" class="lab-link">${icon('SlidersHorizontal')}接口工作台${icon('ArrowUpRight')}</a><div class="sidebar-foot"><span class="live-dot"></span>公开数据 · 只读查询</div></div>
  </aside>`;
}

function statusBadge(row) {
  if (row.database?.presence === 'unconfirmed') return '<span class="badge soon" title="本次同步未返回，保留上次确认的数据"><span></span>源站待核实</span>';
  if (!category().hasExpiry) return `<span class="badge ${row.frozen ? 'expired' : 'neutral'}"><span></span>${row.frozen ? '冻结' : '已收录'}</span>`;
  const status = expiryStatus(row);
  return `<span class="badge ${status.code}"><span></span>${status.label}</span>`;
}

function header() {
  const loading = state.loading.has(state.category);
  return `<header class="topbar"><div class="breadcrumbs"><span>信息查询</span>${icon('ChevronRight')}<strong>${category().shortName}</strong></div><div class="header-tools"><span class="city">${icon('MapPin')}北京市</span><span class="header-divider"></span><button data-action="source" class="source-link">来源网站${icon('ExternalLink')}</button></div></header>
    <section class="page-title"><div><div class="eyebrow">公开资质信息 <span>/</span> ${category().category}</div><h1>${category().shortName}</h1><p>${category().name}</p></div><div class="heading-actions"><span class="updated">${icon(loading ? 'LoaderCircle' : 'Database', loading ? 'spin' : '')}${loading ? (dataset()?.complete ? '后台同步中' : '读取数据中') : dataset()?.updatedAt ? `${compactTime(dataset().updatedAt)} 更新` : '待更新'}</span><button class="button secondary" data-action="refresh" ${loading ? 'disabled' : ''}>${icon('RotateCcw')}刷新数据</button></div></section>
    <div class="source-notice">${icon('CircleAlert')}<span>来源平台处于新旧系统过渡期，信息以主管部门最新公示为准。</span><button data-action="source">查看说明${icon('ArrowUpRight')}</button></div>`;
}

function databaseStatus() {
  const data = dataset();
  if (!data?.database) return '';
  const db = data.database;
  const loading = state.loading.has(state.category);
  const error = data.syncError || state.errors[state.category];
  const lastRun = db.lastRun;
  return `<section class="database-status" aria-label="数据库状态"><span class="database-label">${icon('Database')}独立数据库</span><span>累计收录 <b>${fmt(db.storedTotal)}</b> 条</span>${db.historicalTotal ? `<span>历史留档 <b>${fmt(db.historicalTotal)}</b> 条</span>` : ''}${db.retainedTotal ? `<span>待核实 <b>${fmt(db.retainedTotal)}</b> 条</span>` : ''}<span class="database-sync">${loading ? `${icon('LoaderCircle', 'spin')}后台同步中` : lastRun ? `最近同步：新增 ${fmt(lastRun.inserted)} · 更新 ${fmt(lastRun.updated)}` : '已保存查询记录'}</span></section>${error ? `<div class="quality-warning" role="status">${icon('CircleAlert')}<span>同步未完成，当前显示数据库已保存的记录。${esc(error)}</span></div>` : ''}`;
}

function stats() {
  const cat = category(); const ready = dataset()?.complete; const rows = currentRows();
  const today = todayInBeijing();
  const expiring = rows.filter(row => { const d = daysUntil(row.expires, today); return d !== null && d >= 0 && d <= 30; }).length;
  const valid = rows.filter(row => ['valid', 'soon'].includes(expiryStatus(row, today).code)).length;
  const hasCapacity = rows.filter(row => row.capacity !== null && row.capacity > 0).length;
  const countVehicles = rows.reduce((total, row) => total + (row.vehicleCount || 0), 0);
  const metrics = [
    { name: dataset()?.database ? '本库可查' : ready && !dataset().coverageComplete ? '本次取得' : `全部${cat.noun}`, value: ready ? records().length : null, unit: '条', glyph: 'LayoutGrid', color: 'charcoal', sub: ready && !dataset().coverageComplete ? `来源标注 ${fmt(dataset().total)} 条` : '当前分类已保存记录' },
    { name: '筛选匹配', value: ready ? rows.length : null, unit: '条', glyph: 'ListFilter', color: 'blue', sub: state.filters.onlyStarred ? '仅关注信息' : '当前筛选结果' },
    { name: cat.hasExpiry ? '30 天内到期' : '许可车辆合计', value: ready ? cat.hasExpiry ? expiring : countVehicles : null, unit: cat.hasExpiry ? '条' : '辆', glyph: cat.hasExpiry ? 'CalendarClock' : 'Truck', color: 'amber', sub: cat.hasExpiry ? '包含今日到期，不含已到期' : '当前结果 · 已提供数量' },
    { name: cat.hasCapacity ? '尚有剩余容量' : cat.hasExpiry ? '有效期内' : '覆盖审批区', value: ready ? cat.hasCapacity ? hasCapacity : cat.hasExpiry ? valid : new Set(rows.map(row => row.district).filter(Boolean)).size : null, unit: cat.hasCapacity || cat.hasExpiry ? '条' : '个', glyph: cat.hasCapacity ? 'Warehouse' : 'CircleCheck', color: 'green', sub: cat.hasCapacity ? '余量大于 0，排除未提供' : cat.hasExpiry ? '包含临近到期' : '当前筛选结果' }
  ];
  return `<section class="metrics" aria-label="查询概览">${metrics.map(item => `<div class="metric ${item.color}"><div class="metric-label">${item.name}${icon(item.glyph)}</div><strong>${fmt(item.value)}<small>${item.unit}</small></strong><p>${item.sub}</p></div>`).join('')}</section>`;
}

const selectOptions = (options, value, allLabel = '全部') => `<option value="">${allLabel}</option>${options.map(option => { const val = typeof option === 'string' ? option : option.value; const label = typeof option === 'string' ? option : option.label; return `<option value="${esc(val)}" ${String(value) === val ? 'selected' : ''}>${esc(label)}</option>`; }).join('')}`;
const expiryOptions = [{ value: 'all', label: '全部有效期' }, { value: 'valid', label: '有效期内' }, { value: 'soon7', label: '7 天内到期' }, { value: 'soon30', label: '30 天内到期' }, { value: 'soon90', label: '90 天内到期' }, { value: 'expired', label: '已到期' }, { value: 'future', label: '尚未生效' }, { value: 'unknown', label: '有效期未提供' }];
const sortOptions = () => [{ value: 'source', label: '来源顺序' }, ...(category().hasExpiry ? [{ value: 'expirySoon', label: '临近到期优先' }, { value: 'expiryDesc', label: '到期时间从远到近' }] : []), ...(category().hasCapacity ? [{ value: 'capacityDesc', label: '剩余容量从高到低' }, { value: 'capacityAsc', label: '剩余容量从低到高' }] : []), ...(category().hasVehicleCount ? [{ value: 'vehiclesDesc', label: '许可车辆数从多到少' }] : []), { value: 'name', label: '名称排序' }];
const choices = (options, value) => options.map(option => `<option value="${option.value}" ${value === option.value ? 'selected' : ''}>${option.label}</option>`).join('');

function filters() {
  const cat = category(); const draft = state.draft;
  const districts = [...new Set(records().map(row => row.district).filter(Boolean))];
  const types = [...new Set(records().map(row => row.type).filter(Boolean))];
  return `<section class="filters-section"><form id="search-form"><div class="search-row"><label class="keyword-field">${icon('Search')}<input name="keyword" aria-label="关键词" autocomplete="off" maxlength="100" placeholder="${cat.noun === '车辆' ? '搜索车牌号、所属企业' : cat.noun === '企业' ? '搜索企业名称、地址' : '搜索场所名称、经营单位、地址'}" value="${esc(draft.keyword)}"></label><label class="district-field"><span>审批区</span><select name="district" aria-label="审批区">${selectOptions(districts.length ? districts.sort(new Intl.Collator('zh-CN').compare) : DISTRICTS, draft.district, '全部区域')}</select></label><button class="button primary" type="submit">${icon('Search')}查询</button></div>
    <div class="filter-row">${cat.hasExpiry ? `<label class="filter-item"><span>有效期</span><select name="expiry" aria-label="有效期">${choices(expiryOptions, draft.expiry)}</select></label>` : ''}
    ${cat.hasCapacity ? `<label class="filter-item capacity-field"><span>余量大于</span><div class="number-unit"><input type="number" name="minCapacity" aria-label="余量大于" min="0" step="any" placeholder="不限" value="${esc(draft.minCapacity)}"><span>${cat.capacityUnit || '原始单位'}</span></div></label>` : ''}
    ${cat.hasVehicleCount ? `<label class="filter-item"><span>许可车辆不少于</span><div class="number-unit"><input type="number" name="minVehicles" aria-label="许可车辆不少于" min="0" step="1" placeholder="不限" value="${esc(draft.minVehicles)}"><span>辆</span></div></label>` : ''}
    ${types.length > 1 ? `<label class="filter-item type-field"><span>${cat.noun === '车辆' ? '车辆类型' : '场所类型'}</span><select name="type" aria-label="类型">${selectOptions(types, draft.type, '全部类型')}</select></label>` : ''}
    <div class="filter-row-actions">${cat.hasExpiry || cat.hasCapacity ? `<button type="button" class="text-button ${state.more ? 'is-active' : ''}" data-action="more" aria-expanded="${state.more}">${icon('SlidersHorizontal')}更多筛选${icon('ChevronDown', state.more ? 'rotate' : '')}</button>` : ''}<button type="button" data-action="reset" class="text-button muted">${icon('RotateCcw')}重置</button></div></div>
    ${state.more ? `<div class="advanced-filters">${cat.hasExpiry ? `<label class="filter-item"><span>到期日期不早于</span><input type="date" name="expiresFrom" aria-label="到期日期不早于" value="${esc(draft.expiresFrom)}"></label><label class="filter-item"><span>到期日期不晚于</span><input type="date" name="expiresTo" aria-label="到期日期不晚于" value="${esc(draft.expiresTo)}"></label>` : ''}${cat.hasCapacity ? `<label class="filter-item"><span>余量不超过</span><div class="number-unit"><input type="number" name="maxCapacity" aria-label="余量不超过" min="0" step="any" placeholder="不限" value="${esc(draft.maxCapacity)}"><span>${cat.capacityUnit || '原始单位'}</span></div></label>` : ''}</div>` : ''}
    ${state.invalid ? `<p class="validation" role="alert">${icon('CircleAlert')}${esc(state.invalid)}</p>` : ''}</form></section>`;
}

function quickFilters() {
  const cat = category();
  const quick = [{ id: 'all', label: '全部信息' }, ...(cat.hasExpiry ? [{ id: 'soon30', label: '30 天内到期' }, { id: 'expired', label: '已到期' }] : []), ...(cat.hasCapacity ? [{ id: 'capacity', label: '有剩余容量' }] : [])];
  return `<div class="results-tabs"><div class="quick-filters" role="tablist" aria-label="快捷筛选">${quick.map(item => `<button role="tab" data-quick="${item.id}" aria-selected="${state.activeQuick === item.id}">${item.label}${item.id === 'soon30' ? '<span class="amber-dot"></span>' : ''}</button>`).join('')}</div><label class="starred-toggle"><input type="checkbox" id="only-starred" ${state.filters.onlyStarred ? 'checked' : ''}>${icon('Star')}仅看关注</label></div>`;
}

function appliedTags() {
  const f = state.filters; const cat = category();
  const tags = [['keyword', f.keyword], ['district', f.district], ['type', f.type], ['expiry', f.expiry !== 'all' ? expiryOptions.find(option => option.value === f.expiry)?.label : ''], ['minCapacity', f.minCapacity !== '' ? `余量 > ${f.minCapacity}${cat.capacityUnit}` : ''], ['maxCapacity', f.maxCapacity !== '' ? `余量 ≤ ${f.maxCapacity}${cat.capacityUnit}` : ''], ['minVehicles', f.minVehicles !== '' ? `车辆 ≥ ${f.minVehicles}` : ''], ['expiresFrom', f.expiresFrom ? `到期 ≥ ${f.expiresFrom}` : ''], ['expiresTo', f.expiresTo ? `到期 ≤ ${f.expiresTo}` : '']].filter(([, value]) => value);
  return tags.length ? `<div class="applied-tags"><span>已选条件</span>${tags.map(([key, value]) => `<button data-remove-filter="${key}">${esc(value)}${icon('X')}</button>`).join('')}<button class="clear-all" data-action="reset">清空</button></div>` : '';
}

function dateCell(row) {
  if (!row.expires) return '<span class="missing">未提供</span>';
  const status = expiryStatus(row);
  return `<strong class="date-text">${row.expires}</strong><small class="days-text ${status.code}">${status.days === 0 ? '今日到期' : status.days < 0 ? `已到期 ${fmt(-status.days)} 天` : `距到期 ${fmt(status.days)} 天`}</small>`;
}

function starButton(row) {
  return `<button class="icon-button star-button ${starred.has(row.key) ? 'starred' : ''}" data-star="${esc(row.key)}" aria-label="${starred.has(row.key) ? '取消关注' : '关注'}${esc(row.title)}" aria-pressed="${starred.has(row.key)}" title="${starred.has(row.key) ? '取消关注' : '关注'}">${icon('Star')}</button>`;
}

function table(rows) {
  const cat = category();
  return `<div class="desktop-results table-scroll"><table><thead><tr><th class="star-column"></th><th class="name-column">${cat.noun === '车辆' ? '车牌号 / 所属企业' : `${cat.noun}名称`}</th><th>审批区</th>${cat.noun === '场所' ? '<th>场所类型</th>' : ''}${cat.hasCapacity ? `<th class="numeric"><button data-sort="${state.filters.sort === 'capacityDesc' ? 'capacityAsc' : 'capacityDesc'}">剩余容量${cat.capacityUnit ? `（${cat.capacityUnit}）` : ''}${icon('ArrowUpDown')}</button></th>` : ''}${cat.hasVehicleCount ? `<th class="numeric"><button data-sort="vehiclesDesc">许可车辆数${icon('ArrowUpDown')}</button></th>` : ''}${cat.hasExpiry ? `<th><button data-sort="${state.filters.sort === 'expirySoon' ? 'expiryDesc' : 'expirySoon'}">到期日期${icon('ArrowUpDown')}</button></th>` : '<th>审批日期</th>'}<th>${cat.hasExpiry ? '有效期状态' : '收录状态'}</th><th class="detail-column"></th></tr></thead><tbody>${rows.map(row => `<tr><td class="star-column">${starButton(row)}</td><td class="name-column"><button class="record-name" data-detail="${esc(row.key)}">${esc(row.title)}</button><div class="record-subtitle" title="${esc(cat.noun === '车辆' ? row.company : row.address)}">${esc(cat.noun === '车辆' ? empty(row.company) : empty(row.address))}</div></td><td class="district-cell">${esc(empty(row.district))}</td>${cat.noun === '场所' ? `<td class="type-cell"><span>${esc(row.type)}</span></td>` : ''}${cat.hasCapacity ? `<td class="numeric capacity-cell">${row.capacity === null ? '<span class="missing">未提供</span>' : `<strong class="${row.capacity <= 0 ? 'zero' : ''}">${fmt(row.capacity)}</strong>`}</td>` : ''}${cat.hasVehicleCount ? `<td class="numeric capacity-cell"><strong>${fmt(row.vehicleCount)}</strong></td>` : ''}<td>${cat.hasExpiry ? dateCell(row) : `<span class="date-text">${row.approvalDate || '未提供'}</span>`}</td><td>${statusBadge(row)}</td><td><button class="icon-button" data-detail="${esc(row.key)}" aria-label="查看${esc(row.title)}详情" title="查看详情">${icon('ArrowUpRight')}</button></td></tr>`).join('')}</tbody></table></div>
    <div class="mobile-results">${rows.map(row => `<article class="mobile-record"><div class="mobile-record-header"><button data-detail="${esc(row.key)}" class="record-name">${esc(row.title)}</button>${starButton(row)}</div><div class="mobile-record-location">${icon('MapPin')}${esc(empty(row.district))}<span>·</span>${esc(row.type)}</div><div class="mobile-record-values">${cat.hasCapacity ? `<div><span>剩余容量${cat.capacityUnit ? `（${cat.capacityUnit}）` : ''}</span><strong>${fmt(row.capacity)}</strong></div>` : cat.hasVehicleCount ? `<div><span>许可车辆数</span><strong>${fmt(row.vehicleCount)}</strong></div>` : ''}<div><span>${cat.hasExpiry ? '到期日期' : '审批日期'}</span>${cat.hasExpiry ? dateCell(row) : `<strong>${row.approvalDate || '未提供'}</strong>`}</div><div>${statusBadge(row)}</div></div></article>`).join('')}</div>`;
}

function progress() {
  const data = dataset(); const percent = data?.total ? Math.min(99, Math.round((data.loaded / data.total) * 100)) : 0;
  return `<div class="loading-state" role="status"><div class="loading-icon">${icon('LoaderCircle', 'spin')}</div><h3>${data?.status === 'queued' ? '等待加载数据' : '正在加载完整查询结果'}</h3><p>${data?.total == null ? '正在读取来源数据' : `已读取 ${fmt(data.loaded)} / ${fmt(data.total)} 条`}</p><progress max="100" ${data?.total ? `value="${percent}"` : ''} aria-label="完整数据加载进度"></progress></div>`;
}

function results() {
  const rows = currentRows(); const count = rows.length; const pages = Math.max(1, Math.ceil(count / state.limit)); state.page = Math.min(state.page, pages);
  const pageRows = rows.slice((state.page - 1) * state.limit, state.page * state.limit);
  const ready = dataset()?.complete; const loading = state.loading.has(state.category);
  let body;
  if (loading && !ready) body = progress();
  else if (state.errors[state.category] && !ready) body = `<div class="empty-state error-state">${icon('CircleAlert')}<h3>暂时无法获取完整信息</h3><p>${esc(state.errors[state.category])}</p><button class="button secondary" data-action="refresh">${icon('RotateCcw')}重新加载</button></div>`;
  else if (!count) body = `<div class="empty-state">${icon('PackageOpen')}<h3>${state.filters.onlyStarred ? '没有符合条件的关注信息' : '没有符合条件的信息'}</h3><p>当前分类${ready ? `共 ${fmt(records().length)} 条记录` : '尚未加载'}</p><button class="button secondary" data-action="reset">清空筛选</button></div>`;
  else body = table(pageRows);
  return `<section class="results-section">${quickFilters()}${appliedTags()}${dataset()?.warning ? `<div class="quality-warning" role="status">${icon('CircleAlert')}<span>${esc(dataset().warning)} 筛选、排序和导出仅覆盖已取得的记录。</span></div>` : ''}<div class="results-heading"><div><h2>查询结果 <span>${ready ? fmt(count) : '--'}</span></h2>${ready ? `<span class="result-scope">${icon(dataset().coverageComplete ? 'Check' : 'CircleAlert')}${dataset().storage === 'sqlite' ? '本库' : dataset().coverageComplete ? '全量' : '实取'} ${fmt(records().length)} 条已载入</span>` : ''}</div><div class="results-actions"><label class="sort-control">${icon('ArrowDownWideNarrow')}<select id="sort-order" aria-label="排序方式">${choices(sortOptions(), state.filters.sort)}</select></label><button class="button export-button" data-action="export" ${!ready || !count ? 'disabled' : ''}>${icon('Download')}导出结果</button></div></div>${body}
    <footer class="pagination"><span>${ready ? `${count ? (state.page - 1) * state.limit + 1 : 0}–${Math.min(state.page * state.limit, count)} 条，共 ${fmt(count)} 条` : '完整数据载入后显示结果'}</span><div class="pager"><label>每页<select id="page-size" aria-label="每页条数">${[10, 20, 50].map(value => `<option ${state.limit === value ? 'selected' : ''}>${value}</option>`).join('')}</select>条</label>${buttonIcon('first-page', 'ChevronsLeft', '第一页', state.page <= 1 || !ready)}${buttonIcon('previous-page', 'ChevronLeft', '上一页', state.page <= 1 || !ready)}<span class="page-position">${state.page}<span>/ ${pages}</span></span>${buttonIcon('next-page', 'ChevronRight', '下一页', state.page >= pages || !ready)}${buttonIcon('last-page', 'ChevronsRight', '最后一页', state.page >= pages || !ready)}</div></footer></section>`;
}

function detailDrawer() {
  const row = records().find(item => item.key === state.detail);
  if (!row) return '';
  const cat = category();
  return `<div class="modal-overlay" data-dismiss="detail"><section class="detail-drawer" role="dialog" aria-modal="true" aria-labelledby="detail-title"><header><span>${cat.noun}详情</span>${buttonIcon('close-detail', 'X', '关闭详情')}</header><div class="drawer-content"><span class="drawer-icon">${icon(cat.icon)}</span><h2 id="detail-title">${esc(row.title)}</h2><div class="drawer-badges">${statusBadge(row)}<span>${esc(row.district)}</span></div><div class="detail-actions">${starButton(row)}<button class="text-button" data-action="copy-name">${icon('Copy')}复制名称</button><a href="http://ztxn.capcloud.com.cn:8080/dist/index.html#${cat.route}" target="_blank" rel="noopener noreferrer" class="text-button">原站查询${icon('ExternalLink')}</a></div>
    ${cat.hasCapacity || cat.hasExpiry ? `<div class="drawer-key-values">${cat.hasCapacity ? `<div><span>剩余容量${cat.capacityUnit ? `（${cat.capacityUnit}）` : '（原始单位）'}</span><strong>${fmt(row.capacity)}</strong></div>` : ''}${cat.hasExpiry ? `<div><span>到期日期</span>${dateCell(row)}</div>` : ''}</div>` : ''}
    <h3>登记信息</h3><dl>${row.details.map(detail => `<div><dt>${detail.label}</dt><dd>${esc(empty(detail.value))}</dd></div>`).join('')}</dl><div class="detail-note">${icon('Database')}本条最近确认 ${new Date(row.database?.lastSeenAt || dataset().updatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</div></div></section></div>`;
}

function sourceModal() {
  return state.source ? `<div class="modal-overlay source-overlay" data-dismiss="source"><section class="source-modal" role="dialog" aria-modal="true" aria-labelledby="source-title"><header><h2 id="source-title">数据来源与范围</h2>${buttonIcon('close-source', 'X', '关闭来源说明')}</header><div class="source-body"><img src="${appPath('source-menu.png')}" alt="来源网站的六项资质信息查询菜单"><dl><dt>来源平台</dt><dd><a href="${SOURCE_URL}" target="_blank" rel="noopener noreferrer">北京市建筑垃圾管理与服务平台${icon('ExternalLink')}</a></dd><dt>数据范围</dt><dd>六类公开查询信息保存在独立数据库。打开页面只读取本库，不触发源站更新。北京时间每日 00:00 自动同步全部六类数据；点击刷新数据可立即同步当前分类。新记录补入、变化更新，缺失记录留档或标记待核实；同步失败保留旧数据。</dd><dt>有效期口径</dt><dd>按北京时间的自然日计算，截止当天仍计入有效期。“临近到期优先”将未到期记录排在前面，之后为已到期和日期未提供记录。日期状态不代替行政许可或经营状态认定。</dd><dt>容量口径</dt><dd>消纳场余量单位为吨；综合利用点原站未注明容量单位，保留原始数值。空值不作为零。大于条件不含等于。</dd><dt>服务边界</dt><dd>来源平台已发布关停迁移通知。当前网站为非官方查询服务，数据使用范围以平台授权及主管部门规定为准。关注仅在当前浏览器保存记录标识。</dd></dl></div></section></div>` : '';
}

function render() {
  app.innerHTML = `${sidebar()}<div class="main-shell"><div class="page-content">${header()}<main>${databaseStatus()}${stats()}${filters()}${results()}<footer class="page-footer"><span>${icon('ShieldCheck')}来源：北京市建筑垃圾管理与服务平台</span><span>北京时间 ${todayInBeijing()}<i>·</i>非官方查询服务</span></footer></main></div></div>${detailDrawer()}${sourceModal()}`;
  createIcons({ icons, attrs: { 'stroke-width': 1.65 } });
  document.body.classList.toggle('dialog-open', Boolean(state.detail || state.source));
}

function readDraft() {
  const form = document.querySelector('#search-form');
  if (form) for (const [key, value] of new FormData(form)) state.draft[key] = value;
}

function applyFilters() {
  readDraft();
  commitFilters();
}

function commitFilters() {
  try { validateFilters(state.draft, category()); state.filters = { ...state.draft }; state.invalid = ''; state.page = 1; state.activeQuick = state.filters.expiry === 'soon30' ? 'soon30' : state.filters.expiry === 'expired' ? 'expired' : state.filters.minCapacity === '0' ? 'capacity' : 'all'; }
  catch (error) { state.invalid = error.message; }
  render();
}

async function loadCategory(id, refresh = false) {
  if (state.loading.has(id)) return;
  if (!refresh && state.data[id]?.complete && !state.data[id].syncError && Date.now() - Date.parse(state.data[id].database?.lastSyncAt || state.data[id].updatedAt) < 300000) { render(); return; }
  state.loading.add(id); delete state.errors[id]; render();
  try {
    let refreshOnce = refresh;
    const deadline = Date.now() + 360000;
    while (Date.now() < deadline) {
      const response = await fetch(appPath(`api/datasets/${id}${refreshOnce ? '?refresh=1' : ''}`), { signal: AbortSignal.timeout(25000) });
      refreshOnce = false;
      const data = await response.json();
      if (!response.ok || data.status === 'error') throw new Error(data.error || `查询失败：${response.status}`);
      if (data.status === 'empty' && !data.syncing) throw new Error('本库暂未收录此类数据，请点击刷新数据，或等待北京时间每日 00:00 自动同步。');
      const previous = state.data[id];
      state.data[id] = data;
      if (data.complete && !data.syncing) { state.loading.delete(id); if (id === state.category) { readDraft(); render(); } return; }
      if (id === state.category && (!previous || previous.complete !== data.complete || previous.updatedAt !== data.updatedAt || previous.syncing !== data.syncing || previous.loaded !== data.loaded)) { readDraft(); render(); }
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
    throw new Error('数据等待超时，请刷新重试');
  } catch (error) { state.errors[id] = error.message; state.loading.delete(id); if (id === state.category) render(); }
}

function resetFilters() { state.filters = defaultFilters(); state.filters.sort = category().hasExpiry ? 'expirySoon' : 'source'; state.draft = { ...state.filters }; state.page = 1; state.invalid = ''; state.activeQuick = 'all'; }
function scrollResults() { document.querySelector('.results-section')?.scrollIntoView({ behavior: 'instant', block: 'start' }); }

app.addEventListener('submit', event => { if (event.target.id === 'search-form') { event.preventDefault(); applyFilters(); } });
app.addEventListener('input', event => { if (event.target.closest('#search-form')) state.draft[event.target.name] = event.target.value; });
app.addEventListener('change', event => {
  if (event.target.closest('#search-form')) state.draft[event.target.name] = event.target.value;
  if (event.target.id === 'sort-order') { state.draft.sort = event.target.value; applyFilters(); }
  if (event.target.id === 'page-size') { readDraft(); state.limit = Number(event.target.value); state.page = 1; render(); }
  if (event.target.id === 'only-starred') { state.draft.onlyStarred = event.target.checked; applyFilters(); }
});

app.addEventListener('click', async event => {
  const target = event.target.closest('button');
  if (!target || target.disabled) return;
  if (target.dataset.category) {
    state.category = target.dataset.category; state.detail = null; state.more = false; resetFilters();
    history.replaceState(null, '', `?category=${state.category}`); render(); loadCategory(state.category); return;
  }
  if (target.dataset.quick) {
    readDraft(); state.draft.expiry = 'all'; state.draft.minCapacity = '';
    if (['soon30', 'expired'].includes(target.dataset.quick)) { state.draft.expiry = target.dataset.quick; state.draft.sort = 'expirySoon'; }
    if (target.dataset.quick === 'capacity') state.draft.minCapacity = '0';
    commitFilters(); return;
  }
  if (target.dataset.removeFilter) { const key = target.dataset.removeFilter; state.draft[key] = defaultFilters()[key]; state.filters[key] = defaultFilters()[key]; state.page = 1; state.invalid = ''; state.activeQuick = 'all'; render(); return; }
  if (target.dataset.sort) { readDraft(); state.draft.sort = target.dataset.sort; applyFilters(); return; }
  if (target.dataset.star) {
    const key = target.dataset.star; starred.has(key) ? starred.delete(key) : starred.add(key);
    try { localStorage.setItem(favoritesKey, JSON.stringify([...starred])); } catch { notify('浏览器未允许保存，关注仅在本次会话保留'); }
    readDraft(); render(); return;
  }
  if (target.dataset.detail) { readDraft(); state.detail = target.dataset.detail; render(); document.querySelector('[data-action="close-detail"]').focus(); return; }
  const action = target.dataset.action;
  if (action === 'refresh') loadCategory(state.category, true);
  if (action === 'more') { readDraft(); state.more = !state.more; render(); }
  if (action === 'reset') { resetFilters(); render(); }
  if (action === 'favorites') { state.draft.onlyStarred = !state.filters.onlyStarred; applyFilters(); }
  if (action === 'source') { readDraft(); state.source = true; render(); document.querySelector('[data-action="close-source"]').focus(); }
  if (action === 'close-source') { state.source = false; render(); }
  if (action === 'close-detail') { state.detail = null; render(); }
  if (action === 'copy-name') { try { await navigator.clipboard.writeText(records().find(row => row.key === state.detail).title); notify('名称已复制'); } catch { notify('无法访问剪贴板'); } }
  if (action === 'export') {
    const rows = currentRows();
    const url = URL.createObjectURL(new Blob([csvFor(rows, category())], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${category().shortName}_${todayInBeijing()}${dataset().coverageComplete ? '' : '_来源数据不完整'}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify(`已导出 ${fmt(rows.length)} 条筛选结果`);
  }
  if (['first-page', 'previous-page', 'next-page', 'last-page'].includes(action)) {
    const pages = Math.max(1, Math.ceil(currentRows().length / state.limit));
    state.page = action === 'first-page' ? 1 : action === 'last-page' ? pages : Math.min(pages, Math.max(1, state.page + (action === 'next-page' ? 1 : -1))); readDraft(); render(); scrollResults();
  }
});

app.addEventListener('click', event => { if (event.target.classList.contains('modal-overlay')) { state.detail = null; state.source = false; render(); } });
document.addEventListener('keydown', event => {
  const modal = document.querySelector('[role="dialog"]'); if (!modal) return;
  if (event.key === 'Escape') { state.detail = null; state.source = false; render(); }
  if (event.key === 'Tab') {
    const nodes = [...modal.querySelectorAll('button,a[href],input,select')];
    if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
    else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
  }
});

render();
loadCategory(state.category);
