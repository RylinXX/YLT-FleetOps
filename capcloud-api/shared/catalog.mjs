export const SOURCE_URL = 'http://ztxn.capcloud.com.cn:8080/dist/index.html#/login';
export const SOURCE_BUNDLE = 'http://ztxn.capcloud.com.cn:8080/dist/assets/js/app.0276dc10.js';
export const BASE_URL = 'http://ztxn.capcloud.com.cn:8080/dregs_service-dev';
export const VERIFIED_DATE = '2026-09-05';
export const DISTRICTS = ['东城区', '西城区', '海淀区', '朝阳区', '昌平区', '丰台区', '石景山区', '通州区', '门头沟区', '房山区', '顺义区', '大兴区', '平谷区', '怀柔区', '密云区', '延庆区', '北京市经济技术开发区', '北京大兴国际机场临空经济区（大兴）'];

const field = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
const column = (key, label) => ({ key, label });
const companyFields = [field('companyName', '运输企业名称'), field('qxname', '审批区', 'district'), field('spdate', '审批时间', 'date')];
const carFields = [field('platecodes', '车牌号'), field('companyName', '所属企业'), field('fSection', '审批区', 'district'), field('startBeforeTime', '许可开始时间 · 起', 'datetime'), field('startAfterTime', '许可开始时间 · 止', 'datetime'), field('endBeforeTime', '许可结束时间 · 起', 'datetime'), field('endAfterTime', '许可结束时间 · 止', 'datetime')];

export const endpoints = [
  {
    id: 'companies', order: '01', shortName: '运输企业名录', name: '北京市建筑垃圾运输企业名录', category: '企业资质', icon: 'Building2',
    route: '/transportCompany', sourceModule: '9941', sourceFunction: 'getcompany',
    path: '/putOnRecords/trans-company-info/pageList/{page}/{limit}', pagination: 'path',
    fields: companyFields, fixed: {}, sampleTotal: 1798,
    columns: [column('companyName', '企业名称'), column('bank', '审批区'), column('carNum', '许可车辆数'), column('spdate', '审批时间'), column('address', '地址'), column('legalRep', '企业法人'), column('phone', '联系方式')]
  },
  {
    id: 'vehicles', order: '02', shortName: '运输车辆信息', name: '建筑垃圾运输车辆信息', category: '车辆资质', icon: 'Truck',
    route: '/transportCar', sourceModule: 'b81c', sourceFunction: 'getpermmit',
    path: '/putOnRecords/transport-permmit/pageList', pagination: 'query', fields: carFields, fixed: {}, sampleTotal: 12882,
    columns: [column('platecodes', '车牌号'), column('companyName', '所属企业'), column('fsection', '审批区'), column('startDate', '许可开始时间'), column('endDate', '许可结束时间')]
  },
  {
    id: 'energy-companies', order: '03', shortName: '新能源运输企业', name: '新能源建筑垃圾运输企业名录', category: '新能源资质', icon: 'Leaf',
    route: '/newEnergyTransportCompany', sourceModule: '8ffe', sourceFunction: 'getcompanyeEnergy',
    path: '/putOnRecords/trans-company-info/pageListEnergy/{page}/{limit}', pagination: 'path', fields: companyFields, fixed: { isNewEnergyComp: '1' }, sampleTotal: 290,
    columns: [column('companyName', '企业名称'), column('area', '审批区'), column('energyCarNum', '新能源许可车辆数'), column('spdate', '审批时间'), column('address', '地址'), column('legalRep', '企业法人'), column('phone', '联系方式')]
  },
  {
    id: 'energy-vehicles', order: '04', shortName: '新能源运输车辆', name: '新能源建筑垃圾运输车辆信息', category: '新能源资质', icon: 'Zap',
    route: '/newEnergyTransportCar', sourceModule: '8a61', sourceFunction: 'getpermmitEnergy',
    path: '/putOnRecords/transport-permmit/pageListEnergy', pagination: 'query', fields: [...carFields.slice(0, 3), field('newEnergyType', '新能源类型', 'select', { options: ['氢燃料', '电动'] }), ...carFields.slice(3)], fixed: { isNewEnergyCar: '1' }, sampleTotal: 1632,
    columns: [column('plateCode', '车牌号'), column('companyName', '所属企业'), column('energyType', '新能源类型'), column('area', '审批区'), column('permitStartDate', '许可开始时间'), column('permitEndDate', '许可结束时间')]
  },
  {
    id: 'disposal-sites', order: '05', shortName: '消纳场与临时处置点', name: '建筑垃圾消纳场、临时处置点信息', category: '场所资质', icon: 'Warehouse',
    route: '/transportXnc?type=1', sourceModule: 'bcf0', sourceFunction: 'gettreatmentLogin',
    path: '/putOnRecords/unijz-unit-absorptive/pageListNoToken/{page}/{limit}', pagination: 'path', fixed: {}, sampleTotal: 85,
    fields: [field('disposalname', '场所名称'), field('area', '审批区', 'district'), field('state', '审核状态', 'select', { options: ['已通过'] }), field('type', '场所类型', 'select', { options: [{ value: '1', label: '建筑垃圾填埋场' }, { value: '3', label: '建筑垃圾临时贮存点' }, { value: '11', label: '建筑垃圾就地资源化处置设施' }, { value: '4', label: '固定式建筑垃圾资源化处置设施' }, { value: '5', label: '临时性建筑垃圾资源化处置设施' }] }), field('recordstarttime', '备案开始时间', 'datetime'), field('recordendtime', '备案结束时间', 'datetime')],
    columns: [column('disposalname', '场所名称'), column('area', '审批区'), column('disposaltype', '场所类型'), column('validstate', '经营状态'), column('capacityresidue', '剩余容量（吨）'), column('floorarea', '建设规模（亩）'), column('recordstarttime', '备案开始时间'), column('recordendtime', '备案结束时间'), column('site', '详细地址'), column('principal', '联系人'), column('phone', '联系电话')]
  },
  {
    id: 'reuse-sites', order: '06', shortName: '弃土综合利用点', name: '弃土综合利用点信息', category: '场所资质', icon: 'MapPin',
    route: '/transportZhlyd?type=1', sourceModule: '14ec', sourceFunction: 'getLoginZhlyd',
    path: '/putOnRecords/unijz-unit-comprehensive/pageListNoToken/{page}/{limit}', pagination: 'path', fixed: { validstate: '已通过' }, sampleTotal: 379,
    fields: [field('name', '场所名称'), field('area', '审批区', 'district'), field('principal', '联系人'), field('usesoiltime', '备案开始时间', 'date'), field('usesoilendtime', '备案结束时间', 'date')],
    columns: [column('name', '场所名称'), column('area', '审批区'), column('validstate', '审核状态'), column('capacityresidue', '剩余容量'), column('operationunit', '经营单位'), column('applicant', '申请单位'), column('usesoiladress', '详细地址'), column('usesoiltime', '备案开始时间'), column('usesoilendtime', '备案结束时间'), column('principal', '联系人'), column('phone', '联系电话')]
  }
];

export const districtEndpoint = { id: 'districts', name: '审批区字典', path: '/dictionary/area/dictionaryValue', pagination: 'none', fixed: { area: 'conferenceType' }, fields: [], columns: [] };
export const allEndpoints = [...endpoints, districtEndpoint];

function integer(value, fallback, max, label) {
  const text = String(value ?? fallback);
  if (!/^[1-9]\d*$/.test(text) || Number(text) > max) throw new Error(`${label}须为 1 至 ${max} 的整数`);
  return Number(text);
}

export function buildRequest(id, values = {}, { maxLimit = 20 } = {}) {
  const endpoint = allEndpoints.find(item => item.id === id);
  if (!endpoint) throw new Error('未收录的接口');
  const allowed = new Set([...endpoint.fields.map(item => item.key), ...Object.keys(endpoint.fixed), ...(endpoint.pagination === 'none' ? [] : ['page', 'limit'])]);
  for (const [key, value] of Object.entries(values)) {
    if (!allowed.has(key)) throw new Error(`不支持参数：${key}`);
    if (typeof value !== 'string' && typeof value !== 'number') throw new Error(`参数 ${key} 必须为单值`);
    if (String(value).length > 200 || /[\x00-\x1f\x7f]/.test(String(value))) throw new Error(`参数 ${key} 格式不合法`);
    if (key in endpoint.fixed && String(value) !== endpoint.fixed[key]) throw new Error(`参数 ${key} 固定为 ${endpoint.fixed[key]}`);
  }
  const page = endpoint.pagination === 'none' ? undefined : integer(values.page, 1, 10000, '页码');
  const limit = endpoint.pagination === 'none' ? undefined : integer(values.limit, 10, Math.min(maxLimit, 20000), '每页条数');
  const params = new URLSearchParams();
  for (const item of endpoint.fields) {
    let value = String(values[item.key] ?? '').trim();
    if (!value) continue;
    if (item.type === 'date' || item.type === 'datetime') {
      const pattern = item.type === 'date' ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}( 00:00:00)?$/;
      if (!pattern.test(value)) throw new Error(`${item.label}日期格式不正确`);
      const day = value.slice(0, 10);
      const parsed = new Date(`${day}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) throw new Error(`${item.label}日期不存在`);
      value = item.type === 'datetime' ? `${day} 00:00:00` : day;
    }
    if (item.options && !item.options.some(option => (typeof option === 'string' ? option : option.value) === value)) throw new Error(`${item.label}选项无效`);
    params.set(item.key, value);
  }
  for (const [start, end] of [['startBeforeTime', 'startAfterTime'], ['endBeforeTime', 'endAfterTime']]) {
    if (params.has(start) && params.has(end) && params.get(start) > params.get(end)) throw new Error('时间区间起始日期不能晚于结束日期');
  }
  for (const [key, value] of Object.entries(endpoint.fixed)) params.set(key, value);
  if (endpoint.pagination === 'query') { params.set('page', page); params.set('limit', limit); }
  const path = endpoint.path.replace('{page}', page).replace('{limit}', limit);
  const url = `${BASE_URL}${path}${params.size ? `?${params}` : ''}`;
  const localParams = new URLSearchParams(params);
  if (endpoint.pagination === 'path') { localParams.set('page', page); localParams.set('limit', limit); }
  return { endpoint, page, limit, url, path, params: Object.fromEntries(params), localUrl: `/api/query/${id}${localParams.size ? `?${localParams}` : ''}` };
}
