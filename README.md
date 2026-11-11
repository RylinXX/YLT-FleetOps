# 营力特调度 YLT-FleetOps · 车队运输与绩效运营中台

**YLT-FleetOps** · 运输对账、车队人员人效与建筑垃圾电子运单中台。

[![GitHub](https://img.shields.io/badge/GitHub-RylinXX%2FYLT--FleetOps-181717?logo=github)](https://github.com/RylinXX/YLT-FleetOps)
![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-API-009688?logo=fastapi&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-24-339933?logo=node.js&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-embedded-003B57?logo=sqlite&logoColor=white)
![License](https://img.shields.io/badge/License-GPL--3.0-blue)

## 项目简介

营力特面向工程运输项目，把电子运单、车辆台账、吨数与收入核算、司机绩效，以及企业和处置场所信息放在同一套业务入口中。项目已从早期车牌识别原型演进为运输运营平台；车牌识别是保留的可选模块，不再代表整个项目。

[运输对账](https://ylt.etgq.com/) · [人员人效](https://ylt.etgq.com/fleet/) · [公开信息查询](https://ylt.etgq.com/api/) · [部署说明](deploy/README.md)

## 核心能力

| 模块 | 解决的问题 | 主要能力 |
| --- | --- | --- |
| 运输对账 `/` | 哪天运了多少、去了哪里、对应多少收入？ | 运单同步、每日车次与吨数、车辆交叉台账、项目明细、收入统计 |
| 人员人效 `/fleet/` | 不同司机、车辆和班次的产出如何比较？ | 分月看板、每日排名、公平人效、出车流水、计价规则、车辆与排班、报表导出 |
| 公开信息 `/api/` | 企业、车辆和处置场所有哪些公开资质？ | 六类信息目录、区域与有效期筛选、详情、关注、CSV 导出、接口工作台 |

### 运输对账

- 同步电子运单，保留时间、车辆、承运方、目的地、货物类型和运输量。
- 按全周期、近 7 天或指定范围查看趋势、车辆台账和收入汇总。
- 支持现有项目台账的补录与维护。

**当前业务口径不是通用财务规则。** 首页面向中央电视台项目，按首建恒纪相关运单形成台账，并使用开槽砂石的既定计价规则。其他目的地的运单可能已经同步，却不会进入这张首页台账。部署到其他项目之前，应核对筛选规则、计量单位和单价，不能把同步总数直接当作首页车次。

### 人员人效

- 区分运输流水、车次数量、产值和出勤人天。
- 通过同日对比的公平人效指标，辅助查看司机产出差异。
- 支持按月分析、价格调整后重算、车辆排班规则与流水维护。
- 使用独立 JSON 数据存储，与主站运单数据库不是自动合并的一张表。

### 建筑垃圾公开信息查询

覆盖运输企业、运输车辆、新能源运输企业、新能源运输车辆、消纳场与临时处置点、弃土综合利用点。

页面读取独立 SQLite 数据库，支持后台增量同步和变更留档。普通访问不会触发上游抓取，来源异常时继续提供已有数据。这是非官方查询服务，数据以主管部门及来源平台公示为准；匿名可访问不等于获得再利用授权。

## 技术栈

| 层次 | 选型 | 说明 |
| --- | --- | --- |
| 主站与人效 | Python 3.11、FastAPI、Uvicorn、SQLite、JSON、HTML/JavaScript | 生产监听 `127.0.0.1:8002`，单进程运行 |
| 公开信息目录 | Node.js 24+、Vite 7、内置 SQLite | 生产监听 `127.0.0.1:5189`，独立 systemd 服务 |
| 统一入口 | Nginx、HTTPS、按路径转发 | 对外域名 `ylt.etgq.com` |
| 数据处理 | pandas、openpyxl、requests/httpx、APScheduler | 报表导出与定时同步 |
| 车牌识别（可选） | PyTorch/ONNX/OpenVINO 模型环境 | 缺失时旧模块进入模拟模式，仅用于演示 |
| 测试 | `unittest`/pytest、`node --test` | 主站与目录服务分别验证 |

## 目录结构

```text
YLT-FleetOps/
├── web-server.py       主站接口、运单同步与项目统计
├── fleet_router.py     人效业务接口
├── fleet/              人效页面与历史基准数据
├── templates/          主站页面
├── static/             主站静态资源
├── capcloud-api/       公开信息目录前后端、测试与接口说明
│   ├── src/            目录前端与 Node 服务端
│   ├── docs/           数据库与接口文档
│   └── deploy/         目录服务生产部署说明
├── deploy/             整站路由、服务配置与数据保护说明
├── tests/              主站测试
├── data/               训练与数据处理脚本（勿在生产执行）
├── docs/               设计文档
├── requirements.txt    主站 Python 依赖
└── package.json
```

**路由边界必须保留：** `/api/` 是目录页面入口，但 `/api/fleet/*`、`/api/records`、`/api/sync/*` 仍属于主站。目录业务接口位于 `/api/api/*`。不要将整个 `/api/*` 转发给目录服务，也不要用目录构建产物替换主站首页。

## 快速开始

在独立开发副本中操作，不要把线上业务数据库用作测试库。首次启动会初始化数据库；仓库中的旧人效 JSON 仅为历史基准，不代表最新账目。

### 主站与人效

在项目根目录运行（macOS / Linux）：

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn web-server:app --host 127.0.0.1 --port 8002 --workers 1
```

访问 `http://127.0.0.1:8002/`；人效模块为 `http://127.0.0.1:8002/fleet/`。

采用单进程是因为人效模块在内存中维护可写 JSON 状态。不要未经改造就启用多个 worker，否则可能出现各进程数据不一致。

同步需要有效的来源平台凭据。新数据库可通过启动前的 `YLT_SYNC_TOKEN` 环境变量初始化，也可通过应用配置维护；环境变量不会覆盖已有数据库配置。不要把凭据写入源码或提交到 Git。首次运行前请核对自动同步设置，不要在未获授权时请求来源平台。

### 公开信息目录

在另一个终端运行：

```sh
cd capcloud-api
npm ci
npm run dev
```

独立开发入口是 `http://127.0.0.1:5188/`，不同于生产环境的 `/api/`。完整目录读取数据库已有数据，空库不会因打开网页自动抓取。初始化与同步流程见 [目录数据说明](capcloud-api/docs/DATABASE.md)。

## 配置

| 配置项 | 作用 | 说明 |
| --- | --- | --- |
| `YLT_SYNC_TOKEN` | 主站初始化来源平台同步凭据 | 仅在新数据库首次启动前使用，不覆盖已有数据库配置；禁止入库 |
| `PUBLIC_ORIGIN` | 目录服务允许的来源域 | 生产为 `https://ylt.etgq.com`，用于同源校验 |
| `127.0.0.1:8002` | 主站与人效服务监听 | 仅本机监听，由 Nginx 对外转发 |
| `127.0.0.1:5189` | 公开信息目录服务监听 | 仅本机监听，生产数据在 `/var/lib/capcloud-api/` |

完整的环境变量、systemd 单元与 Nginx 路由配置以 [deploy/README.md](deploy/README.md) 和 [目录服务部署说明](capcloud-api/deploy/README.md) 为准。

## 部署

生产环境使用两个独立服务，代码更新与数据恢复必须分开执行：

- 主站与人效：`ylt-app.service`，生产路径 `/www/wwwroot/ylt.rlxtc.com`，Python 3.11 独立 `.venv`，单 worker。
- 公开信息目录：`capcloud-api.service`，release 符号链接 + Node 24 运行时，数据在 `/var/lib/capcloud-api/directory.sqlite`，更新代码不覆盖数据库。
- Nginx 按路径转发：`/`、`/fleet/`、`/api/fleet/*`、`/api/records`、`/api/sync/*` → `8002`；精确 `/api/` 及 `/api/assets/`、`/api/api/` 等子路径 → `5189`。限流 zone 配置在 HTTP 上下文，不放在 server 块内。

公开信息模块的测试和生产构建：

```sh
cd capcloud-api
npm test
npm run build -- --base=/api/ --outDir dist-deploy
```

测试覆盖目录数据处理、同步失败保护、备份恢复、请求边界及整站路由分离；不代表主站全部写入流程已通过自动化验收。部署后还应检查首页数据、人效内嵌页面和公开信息查询页面。

## 数据与安全边界

- **代码仓库不是线上数据备份。** 既有 `fleet/data/*.json` 是历史基准文件，不能覆盖最新线上数据。
- 独立备份主站 `worksite_plate.db`、人效当前 JSON、目录 `directory.sqlite`、上传文件和部署配置。
- SQLite 运行中应使用备份 API 生成一致性副本，不要只复制主文件而遗漏 WAL 数据。
- 同步成功不代表所有业务口径完整；应核对日期范围、来源返回数、目的地筛选与项目统计。
- 主站保留历史管理与写入接口，不能假设具备完整的用户认证和权限隔离。公网部署应配置访问控制，并保护同步配置接口。
- 车牌识别依赖可选模型环境，缺失时旧模块可能进入模拟模式。模拟结果不能作为真实运输、计费或结算凭据。
- 不要在生产环境运行历史 seed、reset 或演示数据脚本。
- 部署时不要覆盖线上 `worksite_plate.db*`、`fleet/data/`、`uploaded_imgs/` 与虚拟环境；不要把 `.git`、凭据、TLS 私钥或本地数据库带上生产。

## 项目沿革与许可

项目最初聚焦车牌识别和进出记录，随后加入电子运单、项目对账、人员人效及独立的建筑垃圾公开信息目录。现在以 **营力特 · YLT 运输运营平台** 统一描述这些能力。

历史算法代码和许可文件保留，不因改名删除来源记录。本仓库采用 GPL-3.0，许可信息见 [LICENSE](LICENSE)。
