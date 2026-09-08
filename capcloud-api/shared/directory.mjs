import { endpoints } from './catalog.mjs';

export const categories = endpoints.map(endpoint => ({ ...endpoint,
  hasCapacity: ['disposal-sites', 'reuse-sites'].includes(endpoint.id),
  hasExpiry: !['companies', 'energy-companies'].includes(endpoint.id),
  hasVehicleCount: ['companies', 'energy-companies'].includes(endpoint.id),
  capacityUnit: endpoint.id === 'disposal-sites' ? '吨' : '',
  noun: endpoint.id.includes('companies') ? '企业' : endpoint.id.includes('vehicles') ? '车辆' : '场所'
}));

const civilDay = /^\d{4}-\d{2}-\d{2}$/;
export function dateKey(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|[ T]\d{2}:\d{2}:\d{2})/.exec(value.trim());
  if (!match) return null;
  const date = new Date(`${match[1]}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === match[1] ? match[1] : null;
}

export function todayInBeijing(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(item => [item.type, item.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function numberOrNull(value) {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const text = value => value == null || ['null', 'undefined'].includes(String(value).trim()) ? '' : String(value).trim();
const first = (...values) => values.map(text).find(Boolean) || '';
const siteTypes = { '1': '建筑垃圾填埋场', '3': '建筑垃圾临时贮存点', '6': '建筑垃圾临时贮存点', '4': '固定式资源化处置设施', '5': '临时性资源化处置设施', '7': '临时性资源化处置设施', '11': '就地资源化处置设施' };

export function normalizeRecord(categoryId, raw, index) {
  const category = categories.find(item => item.id === categoryId);
  if (!category) throw new Error('未知信息分类');
  const title = first(raw.disposalname, raw.name, raw.plateCode, raw.platecodes, raw.companyName) || '名称未提供';
  return {
    key: `${categoryId}:${text(raw.id) || `row-${index}`}`, index,
    title, district: first(raw.bank, raw.fsection, raw.area),
    company: category.noun === '企业' ? title : first(raw.companyName, raw.operationunit, raw.unit, raw.applicant),
    address: first(raw.site, raw.usesoiladress, raw.address),
    type: categoryId === 'disposal-sites' ? siteTypes[raw.disposaltype] || text(raw.disposaltype) : categoryId === 'reuse-sites' ? '弃土综合利用点' : categoryId.includes('energy') ? first(raw.energyType, '新能源') : category.noun === '车辆' ? '普通运输车辆' : '运输企业',
    start: dateKey(raw.recordstarttime ?? raw.usesoiltime ?? raw.permitStartDate ?? raw.startDate),
    expires: dateKey(raw.recordendtime ?? raw.usesoilendtime ?? raw.permitEndDate ?? raw.endDate),
    capacity: numberOrNull(raw.capacityresidue), vehicleCount: numberOrNull(raw.energyCarNum ?? raw.carNum),
    contact: first(raw.principal, raw.legalRep), phone: text(raw.phone), approvalDate: dateKey(raw.spdate),
    sourceStatus: text(raw.validstate), frozen: String(raw.frozen) === '1',
    details: category.columns.map(column => ({ label: column.label, value: text(raw[column.key]) }))
  };
}

export function daysUntil(expires, today = todayInBeijing()) {
  if (!expires || !civilDay.test(today)) return null;
  return Math.round((Date.parse(`${expires}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
}

export function expiryStatus(record, today = todayInBeijing()) {
  const days = daysUntil(record.expires, today);
  if (days === null) return { code: 'unknown', label: '有效期未提供', days: null };
  if (days < 0) return { code: 'expired', label: '已到期', days };
  if (record.start && record.start > today) return { code: 'future', label: '尚未生效', days };
  if (days <= 30) return { code: 'soon', label: days === 0 ? '今日到期' : '临近到期', days };
  return { code: 'valid', label: '有效期内', days };
}

export const defaultFilters = () => ({ keyword: '', district: '', type: '', expiry: 'all', minCapacity: '', maxCapacity: '', minVehicles: '', expiresFrom: '', expiresTo: '', sort: 'source', onlyStarred: false });

export function validateFilters(filters, category) {
  for (const field of ['minCapacity', 'maxCapacity', 'minVehicles']) {
    if (filters[field] !== '' && filters[field] != null && (numberOrNull(filters[field]) === null || Number(filters[field]) < 0)) throw new Error('余量或车辆数必须是大于等于 0 的数字');
  }
  if (filters.minCapacity !== '' && filters.maxCapacity !== '' && Number(filters.minCapacity) >= Number(filters.maxCapacity)) throw new Error('余量上限必须大于下限');
  for (const field of ['expiresFrom', 'expiresTo']) if (filters[field] && !dateKey(filters[field])) throw new Error('有效期日期不正确');
  if (filters.expiresFrom && filters.expiresTo && filters.expiresFrom > filters.expiresTo) throw new Error('到期时间起始日期不能晚于结束日期');
  if (!category.hasCapacity && (filters.minCapacity !== '' || filters.maxCapacity !== '')) throw new Error('该分类没有余量字段');
  if (!category.hasExpiry && (filters.expiry !== 'all' || filters.expiresFrom || filters.expiresTo || filters.sort.startsWith('expiry'))) throw new Error('该分类没有有效期字段');
}

function missingLast(a, b, direction = 1) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a < b ? -1 : a > b ? 1 : 0) * direction;
}

export function selectRecords(records, filters, category, { today = todayInBeijing(), starred = new Set() } = {}) {
  validateFilters(filters, category);
  const keyword = filters.keyword.trim().toLocaleLowerCase('zh-CN');
  const selected = records.filter(record => {
    if (keyword && ![record.title, record.company, record.address].some(value => value.toLocaleLowerCase('zh-CN').includes(keyword))) return false;
    if (filters.district && record.district !== filters.district) return false;
    if (filters.type && record.type !== filters.type) return false;
    if (filters.onlyStarred && !starred.has(record.key)) return false;
    if (filters.minCapacity !== '' && (record.capacity === null || record.capacity <= Number(filters.minCapacity))) return false;
    if (filters.maxCapacity !== '' && (record.capacity === null || record.capacity > Number(filters.maxCapacity))) return false;
    if (filters.minVehicles !== '' && (record.vehicleCount === null || record.vehicleCount < Number(filters.minVehicles))) return false;
    if (filters.expiresFrom && (!record.expires || record.expires < filters.expiresFrom)) return false;
    if (filters.expiresTo && (!record.expires || record.expires > filters.expiresTo)) return false;
    const status = expiryStatus(record, today);
    if (filters.expiry === 'valid' && !['valid', 'soon'].includes(status.code)) return false;
    if (['expired', 'unknown', 'future'].includes(filters.expiry) && status.code !== filters.expiry) return false;
    if (/^soon(7|30|90)$/.test(filters.expiry) && (status.days === null || status.days < 0 || status.days > Number(filters.expiry.slice(4)))) return false;
    return true;
  });
  const collator = new Intl.Collator('zh-CN', { numeric: true });
  return selected.sort((a, b) => {
    let comparison = 0;
    if (filters.sort === 'expirySoon') {
      const group = row => row.expires === null ? 2 : row.expires < today ? 1 : 0;
      comparison = group(a) - group(b) || missingLast(a.expires, b.expires);
    } else if (filters.sort === 'expiryDesc') comparison = missingLast(a.expires, b.expires, -1);
    else if (filters.sort === 'capacityDesc') comparison = missingLast(a.capacity, b.capacity, -1);
    else if (filters.sort === 'capacityAsc') comparison = missingLast(a.capacity, b.capacity);
    else if (filters.sort === 'vehiclesDesc') comparison = missingLast(a.vehicleCount, b.vehicleCount, -1);
    else if (filters.sort === 'name') comparison = collator.compare(a.title, b.title);
    return comparison || a.index - b.index;
  });
}

export function csvFor(records, category) {
  const headers = ['名称', '审批区', '类别', ...(category.hasCapacity ? [`剩余容量${category.capacityUnit ? `（${category.capacityUnit}）` : '（原始单位）'}`] : []), ...(category.hasVehicleCount ? ['许可车辆数'] : []), ...(category.hasExpiry ? ['有效期起', '有效期止'] : []), '所属或经营单位', '地址'];
  const cell = value => {
    let str = value == null ? '' : String(value);
    if (/^[\t\r\n ]*[=+@-]/.test(str)) str = `'${str}`;
    return `"${str.replace(/"/g, '""')}"`;
  };
  const rows = records.map(row => [row.title, row.district, row.type, ...(category.hasCapacity ? [row.capacity] : []), ...(category.hasVehicleCount ? [row.vehicleCount] : []), ...(category.hasExpiry ? [row.start, row.expires] : []), row.company, row.address]);
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
}
