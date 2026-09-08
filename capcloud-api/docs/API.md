# 查询接口分析

核验日期：2026-09-05（北京时间）。范围：用户截图中的“资质信息查询”六项，按截图顺序整理。

来源页面：<http://ztxn.capcloud.com.cn:8080/dist/index.html#/login>

来源前端：<http://ztxn.capcloud.com.cn:8080/dist/assets/js/app.0276dc10.js>

基础地址模块 `9109`，接口方法模块 `4ec3`。页面路由不是后端接口；不要把 `#/transportCompany` 当成 API。

## 共同约定

基础地址：`http://ztxn.capcloud.com.cn:8080/dregs_service-dev`

所有接口均为 `GET`，筛选条件放在 URL 查询参数中，没有请求体。六项查询各匿名抽样一条，均返回 HTTP 200、`code: 2000`、`success: true`。审批区字典同样成功。不发送 Cookie、authToken 或 Authorization，没有尝试登录或绕过鉴权。

原站通用请求封装使用 `authToken` 请求头（匿名时为空），不是 Bearer Authorization。对于本次六项接口，实测完全不带该请求头也成功。原站封装会把业务码 `6000` 视为未登录；未来若出现该结果，不能当成空列表或通过绕过鉴权继续请求。

原始分页响应结构如下；表内字段因接口而异：

```json
{
  "success": true,
  "code": 2000,
  "message": "操作成功",
  "result": {
    "rows": [],
    "total": 0
  }
}
```

上例只说明结构，空数组和 0 是占位，不是真实查询数据。务必同时检查 HTTP 状态、`success`、`code` 和响应结构。

## 六项接口

以下路径均加在上述基础地址之后。`{page}` 从 1 开始；`{limit}` 为每页条数。筛选项均可省略；“固定参数”需保持与截图对应入口一致。全部字段来源于原站前端，不等于所有组合与边界都已实测。

| 顺序 | 查询 | GET 路径 | 分页 |
| --- | --- | --- | --- |
| 01 | 北京市建筑垃圾运输企业名录 | `/putOnRecords/trans-company-info/pageList/{page}/{limit}` | 路径 |
| 02 | 建筑垃圾运输车辆信息 | `/putOnRecords/transport-permmit/pageList` | 查询参数 `page`、`limit` |
| 03 | 新能源建筑垃圾运输企业名录 | `/putOnRecords/trans-company-info/pageListEnergy/{page}/{limit}` | 路径 |
| 04 | 新能源建筑垃圾运输车辆信息 | `/putOnRecords/transport-permmit/pageListEnergy` | 查询参数 `page`、`limit` |
| 05 | 建筑垃圾消纳场、临时处置点信息 | `/putOnRecords/unijz-unit-absorptive/pageListNoToken/{page}/{limit}` | 路径 |
| 06 | 弃土综合利用点信息 | `/putOnRecords/unijz-unit-comprehensive/pageListNoToken/{page}/{limit}` | 路径 |

### 01 运输企业名录

- 原站页面：`#/transportCompany`，组件 `9941`，方法 `getcompany`。
- 参数：`companyName` 企业名称、`qxname` 审批区中文名称、`spdate` 审批日期（`yyyy-MM-dd`）。
- 主要返回字段：`companyName`、`address`、`bank`（审批区）、`spdate`、`legalRep`、`phone`、`carNum`、`frozen`。
- 抽样时总数：1798。属于核验时点的快照，不是长期固定值。

### 02 运输车辆信息

- 原站页面：`#/transportCar`，组件 `b81c`，方法 `getpermmit`（原站确实如此拼写）。
- 参数：`platecodes` 车牌号、`companyName` 所属企业、`fSection` 审批区中文名称。
- 许可开始时间区间：`startBeforeTime`（原站左侧日期）、`startAfterTime`（原站右侧日期）。
- 许可结束时间区间：`endBeforeTime`（左侧）、`endAfterTime`（右侧）。
- 四个日期参数采用原站格式 `yyyy-MM-dd HH:mm:ss`；日期选择器实际发 `yyyy-MM-dd 00:00:00`。不擅自改为 23:59:59，不推定服务端区间是否含边界。
- 主要返回字段：`platecodes`、`companyName`、`fsection`（注意与入参 `fSection` 大小写不同）、`startDate`、`endDate`。
- 抽样时总数：12882。

### 03 新能源运输企业

- 原站页面：`#/newEnergyTransportCompany`，组件 `8ffe`，方法 `getcompanyeEnergy`（原站拼写）。
- 筛选参数同 01；额外固定参数 `isNewEnergyComp=1`。
- 主要返回字段：`companyName`、`address`、`area`、`spdate`、`legalRep`、`phone`、`energyCarNum`。
- 区域与车辆数字段分别是 `area`、`energyCarNum`，不是普通企业的 `bank`、`carNum`。
- 抽样时总数：290。

### 04 新能源运输车辆

- 原站页面：`#/newEnergyTransportCar`，组件 `8a61`，方法 `getpermmitEnergy`。
- 筛选参数同 02；额外固定 `isNewEnergyCar=1`，可选 `newEnergyType=氢燃料` 或 `电动`。
- 入参车牌仍是 `platecodes`，返回车牌却是 `plateCode`。
- 主要返回字段：`plateCode`、`companyName`、`energyType`、`area`、`permitStartDate`、`permitEndDate`。
- 抽样时总数：1632。

### 05 消纳场及临时处置点

- 原站页面：`#/transportXnc?type=1`，组件 `bcf0`，方法 `gettreatmentLogin`。
- 参数：`disposalname` 场所名、`area` 审批区、`state` 审核状态（原站下拉只有“已通过”，默认空）、`type` 场所类型、`recordstarttime` 备案开始日期、`recordendtime` 备案结束日期。
- 日期实际格式：`yyyy-MM-dd 00:00:00`。
- 场所类型：`1` 填埋场、`3` 临时贮存点、`11` 就地资源化设施、`4` 固定式资源化设施、`5` 临时性资源化设施。
- 页面路由中的 `type=1` 只是入口标记，**不能直接复制为接口的场所类型筛选**。原页面进入后并未自动设置 `state=已通过`，测试工具保留其默认行为。
- 主要返回字段：`disposalname`、`area`、`site`、`principal`、`phone`、`recordstarttime`、`recordendtime`、`disposaltype`、`capacityresidue`、`floorarea`、`validstate`。
- 抽样时总数：85。

### 06 弃土综合利用点

- 原站页面：`#/transportZhlyd?type=1`，组件 `14ec`，方法 `getLoginZhlyd`。
- 参数：`name` 场所名、`area` 审批区、`principal` 联系人、`usesoiltime` 备案开始日期、`usesoilendtime` 备案结束日期（均为 `yyyy-MM-dd`）。
- 固定参数：`validstate=已通过`，这是原页面把路由 `type=1` 转换后的实际接口参数。
- 主要返回字段：`name`、`operationunit`、`applicant`、`area`、`usesoiladress`（原站拼写）、`principal`、`phone`、`usesoiltime`、`usesoilendtime`、`validstate`、`capacityresidue`。
- 抽样时总数：379。

## 辅助接口

`GET /dictionary/area/dictionaryValue?area=conferenceType`

原方法 `addysqe`。结果直接是 `result` 数组，中文审批区名取 `dicname`，核验时共有 18 项。企业查询传 `qxname`，车辆查询传 `fSection`，场所查询传 `area`，都使用中文名称而非自行猜测行政区编码。

## 调用示例

服务器端或终端直接调用原接口：

```sh
curl --get 'http://ztxn.capcloud.com.cn:8080/dregs_service-dev/putOnRecords/trans-company-info/pageList/1/10' \
  --data-urlencode 'qxname=海淀区' \
  --header 'Accept: application/json'
```

浏览器调用本项目的同源转发接口：

```js
const response = await fetch('/api/query/companies?page=1&limit=10&qxname=' + encodeURIComponent('海淀区'));
const payload = await response.json();
if (!response.ok || !payload.data?.success || payload.data.code !== 2000
    || payload.meta?.httpStatus < 200 || payload.meta?.httpStatus >= 300) {
  throw new Error(payload.error || payload.data?.message || '查询失败');
}
const { rows, total } = payload.data.result;
```

本地 ID 按顺序为 `companies`、`vehicles`、`energy-companies`、`energy-vehicles`、`disposal-sites`、`reuse-sites`。区划字典为 `districts`。本地接口统一把 `page`、`limit` 放在查询参数，由服务端映射回原始分页方式。原始数据完整保留在 `data`，状态、耗时、页码、时间戳等放在 `meta`。

## 接入限制与风险

- **迁移风险**：原站在核验时显示“旧平台关停时间顺延一个月”的通知，同时给出新系统 <https://ywxt.csglw.beijing.gov.cn/jzlj/jzlj/sso/>。公告可见内容没有明确可确认的最终关停日期，因此不能据此推算哪一天停用。本次没有测试新系统，也没有把旧接口路径套到新系统上。
- **跨域与 HTTP**：无 Origin 的直接抽样未见 `Access-Control-Allow-Origin`，这不足以证明所有 Origin 都被拒绝。未验证完整 CORS 策略；而 HTTPS 网站直接调用 HTTP 还可能被混合内容规则阻止。使用自己服务端的同源转发。
- **授权**：这些是网站公开查询使用的接口，不是经过确认的官方开放 API 契约。匿名访问成功不自动授予第三方再发布、商业使用或批量复制的权利。上线前请确认授权和新接口安排。
- **数据最小化**：响应可能含法人、联系人、手机号、地址等字段。展示范围、保存期限和导出权限应按实际业务需要控制，不建议将这些字段公开索引或批量传播。
- **验证边界**：已验证六项默认列表、字典接口的匿名可用性；参数来自公开前端。未验证所有筛选组合、日期边界、空值与 null 的全部情况，也没有承诺数据准确、完整或实时。
- **安全范围**：只开放固定目标上的七个 GET 查询；无任意 URL 代理、无凭证转发、无写操作。开发服务器不能直接暴露到公网；部署需单独配置身份验证和站点白名单。

逐项请求时间、HTTP 状态、业务码、统计总数与返回字段见同目录 `verification.json`。未保存真实行数据。
