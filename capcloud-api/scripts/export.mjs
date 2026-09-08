import { mkdir, writeFile } from 'node:fs/promises';
import { allEndpoints, BASE_URL, SOURCE_BUNDLE, VERIFIED_DATE, buildRequest } from '../shared/catalog.mjs';

const output = new URL('../public/exports/', import.meta.url);
await mkdir(output, { recursive: true });
const collection = {
  info: { name: '北京市建筑垃圾 · 资质公开查询', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json', description: `核验日期 ${VERIFIED_DATE}。6 项查询及审批区字典。仅匿名 GET。来源 ${SOURCE_BUNDLE}。旧平台已发布关停迁移通知；公开可访问不等于再发布授权。` },
  variable: [{ key: 'baseUrl', value: BASE_URL }, { key: 'page', value: '1' }, { key: 'limit', value: '10' }],
  item: allEndpoints.map(endpoint => {
    const req = buildRequest(endpoint.id);
    return {
      name: `${endpoint.order || '07'} ${endpoint.name}`,
      request: {
        method: 'GET', auth: { type: 'noauth' }, header: [{ key: 'Accept', value: 'application/json' }],
        url: {
          raw: '{{baseUrl}}' + endpoint.path.replace('{page}', '{{page}}').replace('{limit}', '{{limit}}') + (Object.keys(req.params).length ? '?' + new URLSearchParams(req.params) : ''),
          host: ['{{baseUrl}}'], path: endpoint.path.slice(1).replace('{page}', '{{page}}').replace('{limit}', '{{limit}}').split('/'),
          query: [...Object.entries(req.params).map(([key, value]) => ({ key, value, description: '原站固定参数或分页参数' })), ...endpoint.fields.map(field => ({ key: field.key, value: '', disabled: true, description: `${field.label}${field.type === 'datetime' ? '，yyyy-MM-dd 00:00:00' : field.type === 'date' ? '，yyyy-MM-dd' : ''}` }))]
        }, description: `来源页面：${endpoint.route || '各查询页审批区下拉框'}。参数按原站前端提取，未穷举所有组合。`
      }, response: []
    };
  })
};

const parameter = (name, location, schema, description, required = false) => ({ name, in: location, required, schema, description });
const paths = {};
for (const endpoint of allEndpoints) {
  const parameters = [];
  if (endpoint.pagination !== 'none') {
    const location = endpoint.pagination === 'path' ? 'path' : 'query';
    parameters.push(parameter('page', location, { type: 'integer', minimum: 1, default: 1 }, '页码', location === 'path'));
    parameters.push(parameter('limit', location, { type: 'integer', minimum: 1, maximum: 20, default: 10 }, '每页条数；20 为本地测试工具保护上限，不代表上游最大值', location === 'path'));
  }
  for (const field of endpoint.fields) {
    const schema = { type: 'string' };
    if (field.type === 'date') schema.format = 'date';
    if (field.type === 'datetime') schema.pattern = '^\\d{4}-\\d{2}-\\d{2} 00:00:00$';
    if (field.options) schema.enum = field.options.map(option => typeof option === 'string' ? option : option.value);
    parameters.push(parameter(field.key, 'query', schema, `${field.label}；来源于原站 UI/前端，具体匹配边界待核验`));
  }
  for (const [key, value] of Object.entries(endpoint.fixed)) parameters.push(parameter(key, 'query', { type: 'string', enum: [value], default: value }, '对应截图入口的固定查询条件'));
  paths[endpoint.path] = { get: { operationId: endpoint.id, summary: endpoint.name, security: [], parameters, responses: { '200': { description: '须同时检查 success、code；HTTP 200 不代表业务成功。分页列表位于 result.rows 和 result.total。', content: { 'application/json': { schema: { type: 'object', properties: { success: { type: 'boolean' }, code: { type: 'integer' }, message: { type: 'string' }, result: endpoint.id === 'districts' ? { type: 'array', items: { type: 'object', properties: { dicname: { type: 'string' } }, additionalProperties: true } } : { type: 'object', properties: { rows: { type: 'array', items: { type: 'object', additionalProperties: true } }, total: { type: 'integer' } }, additionalProperties: true } }, additionalProperties: true } } } } } } };
}
const openapi = { openapi: '3.0.3', info: { title: '北京市建筑垃圾公开查询接口（非官方整理）', version: '2026-09-05', description: '根据原站前端整理并匿名抽样核验。旧平台存在关停风险；本文件不是官方接口或服务承诺。' }, servers: [{ url: BASE_URL }], paths };
await writeFile(new URL('capcloud.postman_collection.json', output), JSON.stringify(collection, null, 2));
await writeFile(new URL('openapi.json', output), JSON.stringify(openapi, null, 2));
await writeFile(new URL('catalog.json', output), JSON.stringify({ baseUrl: BASE_URL, verifiedDate: VERIFIED_DATE, sourceBundle: SOURCE_BUNDLE, endpoints: allEndpoints }, null, 2));
console.log('Exported Postman collection, OpenAPI, and catalog.');
