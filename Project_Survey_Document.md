---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: '6c7c86eb-6079-4077-9201-4c585394c623'
  PropagateID: '6c7c86eb-6079-4077-9201-4c585394c623'
  ReservedCode1: '57a32ab7-5cd2-425e-8f84-b021d46f6943'
  ReservedCode2: '57a32ab7-5cd2-425e-8f84-b021d46f6943'
---

# 萌芽（mengya）母婴全周期平台 —— 项目深度调研与架构评估文档

> 文档版本：v1.0
> 调研日期：2026-09-08
> 调研对象：`C:\Users\cheng\.local\share\TeleAgent\TeleAgent的工作空间\mengya`
> 文档性质：项目现状全面调研（Survey），非改造方案；为后续 PSD（产品/系统设计）阶段提供事实基础与决策输入
> 角色定位：企业级软件架构、信息安全与领域驱动设计视角

---

## 目录

1. [项目概览与定位](#1-项目概览与定位)
2. [架构现状分析](#2-架构现状分析)
3. [安全边界与风险现状评估](#3-安全边界与风险现状评估)
4. [业务逻辑深度梳理](#4-业务逻辑深度梳理)
5. [数据架构与存储现状](#5-数据架构与存储现状)
6. [API/接口契约现状](#6-api接口契约现状)
7. [可观测性现状](#7-可观测性现状)
8. [外部依赖与集成现状](#8-外部依赖与集成现状)
9. [前端/客户端现状](#9-前端客户端现状)
10. [现存问题与风险清单](#10-现存问题与风险清单)
11. [待明确的架构决策点](#11-待明确的架构决策点)

---

## 1. 项目概览与定位

### 1.1 一句话定位

**萌芽** 是一个面向「备孕 → 孕期 → 0-6 岁育儿」全周期的母婴家庭知识服务与工具平台，核心价值主张为「生命最初 3000 天陪伴」。

### 1.2 业务方向

| 维度 | 现状 |
|---|---|
| 业务赛道 | 母婴垂直领域（知识 + 工具 + 商品库，**非**电商交易闭环、**非** UGC 社区） |
| 服务对象 | 准妈妈 / 新手父母 / 0-6 岁育儿家庭 |
| 核心场景 | 全周期知识时间轴、孕期食谱、新生儿护理百科、14 大类母婴商品库、五维评分对比、智能待产包、健康记录 / 疫苗日历、AI 问答助手 |
| 变现设想（推断） | 商品库导购（比价/推荐，无交易）、AI 助手（增值授权）、未来可能的电商/付费内容 |

### 1.3 阶段判断

- **形态**：接近 **MVP → 演示生产（Demo-Production）** 阶段。
  - 已有 Docker Compose 一键部署、种子数据（init_data）、JWT 认证、管理员后台（4 个管理页）。
  - **缺失**：支付/订单/退款、商家入驻、社区内容（帖子/评论/私信）、服务预约、消息推送等商业闭环模块。
- **成熟度**：单仓库、单体应用、单开发者协作模式；无 CI/CD、无自动化测试、无监控告警、无灰度发布。

### 1.4 用户规模现状（数据实测）

- 当前 SQLite 数据库中 **业务表合计仅 1047 行**，其中：
  - 用户 5 人（含演示账号）、宝宝档案 2 条、健康记录 7 条、聊天会话 5 个、聊天消息 14 条。
- 属**种子/演示数据阶段**，尚无真实规模用户；架构决策窗口期充裕。

### 1.5 项目类型

- **Web 应用**（移动端优先响应式设计，非小程序 / 非原生 App）。
- 前后端分离：React 18 SPA + Django REST API。
- 部署形态：Docker Compose 本地/单机部署，nginx 反代。

---

## 2. 架构现状分析

### 2.1 顶层目录结构

```
mengya/
├── backend/                    # Django 后端
│   ├── config/                 # 项目配置（settings/urls/celery/asgi/wsgi）
│   ├── apps/core/              # 核心业务 app（唯一业务 app）
│   │   ├── models/             # 17 个模型文件（按域拆分）
│   │   ├── views.py            # 1883 行，全部视图与 API
│   │   ├── serializers/        # 序列化器
│   │   ├── services/           # 业务服务层（AI/商品对比/待产包/搜索）
│   │   ├── utils/              # 限流/阶段工具/审计/统一响应/异常
│   │   ├── management/commands/init_data.py  # 种子数据
│   │   └── migrations/         # 14 个迁移
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/                   # React 前端
│   ├── src/
│   │   ├── api/                # axios 封装（client/auth/catalog/compare/services）
│   │   ├── store/              # Zustand 状态（authStore/chatStore）
│   │   ├── pages/              # 27 个页面
│   │   ├── components/         # 组件（雷达图/生长曲线/疫苗日历等）
│   │   ├── layouts/            # MainLayout（含移动端底部导航）
│   │   └── types/              # TS 类型定义
│   ├── Dockerfile
│   └── vite.config.ts
├── nginx/nginx.conf            # 反向代理
├── docker-compose.yml          # 5 服务编排
├── .env.example                # 环境变量样例
├── agent.md                    # AI 助手模块开发指南（847 行）
└── README.md                   # 437 行
```

### 2.2 技术栈清单

| 层 | 技术 | 版本（按 requirements/package 推断） |
|---|---|---|
| 后端框架 | Django + DRF | Django 4.2.x / DRF 3.14+ |
| 认证 | SimpleJWT | djangorestframework-simplejwt |
| API 文档 | drf-spectacular | — |
| 数据库 | SQLite（开发）/ PostgreSQL 15（Docker） | psycopg2 |
| 缓存/队列 | Redis 7（Docker）/ Celery | redis-py + celery |
| AI | openai SDK + DuckDuckGo 搜索（ddgs） | 自定义多配置轮询 |
| 图片 | Pillow（验证码生成） | — |
| 前端 | React 18 + TypeScript + Vite | Tailwind CSS 3 + Zustand + ECharts + axios |
| 部署 | Docker Compose + nginx | python:3.11-slim / node:20-alpine |

### 2.3 架构模式评估

- **模块化单体（Modular Monolith）**：Django 单 app `apps.core`，模型按域拆分到 `models/` 子目录，但**无独立业务模块边界**（如 commerce / community / ai 各自独立 app 均未拆分）。
- **分层风格**：Controller-Service-DAO 轻量分层（views.py → serializers → services → models），**非严格 DDD**（无聚合根/领域事件/仓储模式）。
- **可扩展性评估**：当前单体适合 MVP；若未来上电商/社区/多端，需先拆分模块边界（可参考第 11 章决策点）。

### 2.4 模块依赖关系（后端）

```
config (settings/urls/celery)
  └── apps.core
        ├── models/            # 业务实体（17 个）
        ├── serializers/       # 序列化（319 行）
        ├── services/          # 业务服务
        │   ├── ai_service.py        # AI 多配置轮询 + 本地知识兜底
        │   ├── product_comparator.py# 五维评分对比 + 价格对比
        │   ├── shopping_list_generator.py # 待产包生成
        │   └── web_search.py        # DuckDuckGo 联网搜索
        └── utils/
            ├── rate_limit.py        # 内存线程安全限流
            ├── stage_utils.py       # 孕周/月龄计算
            ├── audit.py             # 审计日志
            ├── renderer.py          # 统一响应
            └── exceptions.py        # 统一异常
```

### 2.5 部署架构

```
用户浏览器
   │
   ▼
nginx (:80)
   ├── / → frontend（Vite dev :5173 / 生产构建静态）
   └── /api/、/admin/ → backend（Django :8000）
                           ├── PostgreSQL 15（:5433）
                           ├── Redis 7（:6380）
                           └── Celery worker（任务队列，当前无实质任务）
```

> 注意：当前 Dockerfile 使用 `runserver`（开发服务器）与 `vite dev`（开发服务器）而非生产级 gunicorn/nginx 静态托管，**仅适合演示，不可直接上生产**。

---

## 3. 安全边界与风险现状评估

### 3.1 认证与授权

| 项 | 现状 | 风险评级 |
|---|---|---|
| 认证方式 | JWT（SimpleJWT），access 12h / refresh 14d；手机号+密码或用户名登录 | 中（refresh 长期有效，无吊销机制） |
| 注册模式 | 支持 open / invitation_only；邀请码（InviteLink） | 低 |
| 找回密码 | 密保问题 + 验证码三重流程 | 中（密保答案强度依赖用户设置） |
| 验证码 | PIL 生成 4 位数字，session 存答案；**接口返回 debug_code** 给前端展示 | **高**（验证码可被脚本直接读取绕过） |
| 限流/锁定 | 内存线程安全（threading+deque）实现；阈值/锁定时间可配 | 中（单进程有效；多 worker 失效） |
| 管理员权限 | is_staff 标记 + 自定义权限检查（多数用 `user.is_staff`） | 低（未用 Django permission，需确保所有接口覆盖） |

### 3.2 数据安全

| 项 | 现状 | 风险评级 |
|---|---|---|
| API Key 存储 | **明文存储在数据库**（用户 ai_configs JSON 字段、全局环境变量） | **高（严重）** |
| 密码存储 | Django 内置 PBKDF2 哈希 | 低 |
| 传输加密 | 无 HTTPS 证书配置（nginx 仅 80 端口） | 高（公网部署必配） |
| 数据备份 | 无自动备份机制 | 高 |
| 敏感信息日志 | 审计日志记录关键操作，未见密码/Token 泄漏到日志 | 低 |

### 3.3 业务安全

| 项 | 现状 | 风险评级 |
|---|---|---|
| 支付安全 | **无支付流程**（金额校验/回调验签/防重放均不存在） | —（未实现） |
| UGC 内容审核 | 无社区/UGC 模块 | —（未实现） |
| AI 内容安全 | 无输入输出内容审核（可被诱导输出不当内容） | 中 |
| 越权访问 | 需逐一检查（用户数据基本按 owner 过滤） | 待验证 |

### 3.4 输入校验

- 使用 DRF Serializer 校验（必填/类型/长度），但**未发现**对复杂输入（如 XSS、SQL 注入）的特殊处理；前端 React 天然规避大部分 XSS。
- 商品导入/时间轴导入 CSV 功能：需检查 CSV 解析是否有注入风险（低风险，但建议限制文件大小）。

### 3.5 第三方依赖 CVE

- 版本基于 requirements.txt 推断；**未做自动化漏洞扫描（无 dependabot / snyk）**。
- 建议：为 requirements.txt / package.json 增加依赖审计（pip-audit、npm audit）。

### 3.6 数据备份

- **无备份机制**。SQLite 单文件即数据库；Docker 卷无定时快照。
- 建议：生产上 PostgreSQL 后立即引入 pg_dump 定时备份 + 异地存储。

---

## 4. 业务逻辑深度梳理

### 4.1 母婴领域模型

| 域 | 实体 | 说明 |
|---|---|---|
| 用户 | User（扩展 AbstractUser，含 role/phone/due_date/is_pregnant）、BabyProfile（宝宝档案，支持多胎、primary 标记） | 家庭视角（妈妈+宝宝） |
| 知识 | TimelineEvent（时间轴）、Recipe（食谱）、KidsEncyclopedia（儿童百科） | 全周期知识库 |
| 商品 | Product（商品）、BrandProfile（品牌） | 14 大类知识型商品库（非交易） |
| 工具 | ShoppingList（待产包/购物清单）、HealthRecord（健康记录）、Vaccine（疫苗）、Notification（通知） | 个性化工具 |
| AI | ChatSession、ChatMessage、AIQueryLog、AIConfig（ai_configs JSON） | 智能助手 |
| 管理 | SystemSetting（系统配置单例）、InviteLink（邀请链接）、AuditLog（审计）、ProductComparison（对比记录） | 运维支持 |

### 4.2 核心业务流程（文字流程图）

**① 用户注册 / 登录流程**
```
注册页（手机号+密码+验证码）
  → [邀请模式] 需邀请链接/邀请码
  → POST /api/auth/register（校验手机号唯一、密码≥6位）
  → 自动登录返回 JWT → 存入 authStore → 首页
登录页（手机号/用户名+密码）
  → 失败次数 ≥ 阈值 → 需要图形验证码（debug_code 明文返回）
  → 失败次数 ≥ 锁定阈值 → 账号锁定 wait_seconds
  → 成功 → 发 JWT → 进入首页
忘记密码（3 步）：
  手机号 → 获取密保问题 → 回答+验证码 → 重置密码
```

**② 智能待产包生成（shopping_list_generator）**
```
用户选择孕周/预产期/宝宝情况
  → 基于阶段规则 + 商品库匹配
  → 生成 ShoppingList + ShoppingListItem（带数量/备注）
  → 用户在购物清单页可增删改 → 完成
```

**③ AI 问答（ai_service）**
```
用户提问（ChatSession/ChatMessage）
  → 会话级限流检查（内存）
  → 选择 AI 配置（用户配置 → 旧配置 → 全局 env → 管理员共享）
  → 构造 prompt（注入日期/阶段/孕周/知识库/搜索）
  → 若触发「联网搜索」关键词 → DuckDuckGo 搜索 → 摘要喂给模型
  → 模型回答 → 存 AIQueryLog / ChatMessage → 返回
  → 全部配置失败 → 本地知识引擎兜底（12 个意图）
```

**④ 商品对比（product_comparator）**
```
选择 2-4 款商品 → 调 compare API
  → 五维评分（安全/舒适/功能/易用/外观）聚合 → 雷达图
  → 价格对比（taobao/jd/pdd 价格字段 + 均价 + 区间）
  → 推荐标签（labels/alerts）
  → 可选 AI 对比建议（调 AI 服务）
```

**⑤ 时间轴知识库（Timeline）**
```
管理员可新增/编辑/删除（is_staff 校验）
  → 支持 CSV 导入/导出
  → 用户按 stage（孕周/宝宝月龄）筛选 → 展示卡片
  → 详情页展示内容+tips+关联商品（关联关系未填）
```

### 4.3 业务规则清单

| 规则编号 | 规则 | 位置 |
|---|---|---|
| BR-01 | 手机号唯一，注册需密码≥6位 | User model / serializer |
| BR-02 | 登录失败 3 次需验证码，失败 5 次锁定（可配） | login view + rate_limit |
| BR-03 | 注册模式（open/invitation_only）由 SystemSetting 控制 | register view |
| BR-04 | 找回密码必须答对密保问题 | forgot_password 流程 |
| BR-05 | AI 配置启用顺序：用户 ai_configs → 旧版单配置 → 全局环境变量 → 管理员共享 | ai_service |
| BR-06 | 商品对比最多 4 款（前端约束） | ComparePage |
| BR-07 | 待产包生成按孕周/预产期规则匹配 | shopping_list_generator |
| BR-08 | 健康记录分产检/生长/疫苗类型，AI 可解读 | HealthPage |
| BR-09 | 审计日志保留天数由 SystemSetting 配置（可清理） | audit.py |
| BR-10 | AI 授权：is_staff 默认可用，普通用户需 ai_authorized | ai_config API |

### 4.4 状态机

| 领域 | 状态机 |
|---|---|
| 用户注册模式 | `open ⇄ invitation_only`（SystemSetting 单例） |
| 商品 | `active（上架） ⇄ inactive（暂存）`（is_active 字段） |
| 登录风控 | `normal → need_captcha → locked → (等待) → normal` |
| 待产包/购物清单 | 无状态机（仅 item 列表） |
| 通知 | 无状态（仅 Notification 记录，未实现已读） |

### 4.5 逻辑缺陷 / 待改进点

| 缺陷 | 描述 | 影响 |
|---|---|---|
| LOGIC-01 | 图形验证码 debug_code 明文返回给前端 | 风控形同虚设（可被脚本绕过） |
| LOGIC-02 | 无交易闭环：商品库与支付/订单无衔接 | 无法变现 |
| LOGIC-03 | 时间轴事件「关联商品」关系为空（0 条） | 商品导购链路未打通 |
| LOGIC-04 | 通知模块表存在但无写入逻辑（0 条） | 疫苗/产检提醒未实现 |
| LOGIC-05 | AI 会话无会话级限流（仅登录限流） | 滥用风险 |
| LOGIC-06 | 商品价格字段为 JSON 快照（avg/taobao/jd/pdd），无实时同步 | 价格可能过期 |

---

## 5. 数据架构与存储现状

### 5.1 表结构与 ER 关系（核心）

```
User (id, username, phone, password_hash, nickname, role, due_date, is_pregnant, is_staff, ai_authorized, ai_configs JSON)
 ├── BabyProfile (user FK, name, gender, birthday, birth_weight, is_primary)
 │    └── HealthRecord (user FK + baby FK, record_type, record_date, gestational_week, height, weight, head_circumference, ai_analysis)
 ├── ShoppingList (user FK, baby FK, name, stage) → ShoppingListItem (product FK)
 ├── ChatSession (user FK) → ChatMessage (session FK)
 ├── InviteLink (created_by FK, code, is_active)
 └── AIQueryLog (user FK, query, response, model, latency, created_at)

Product (brand FK/brand_profile FK, first_category, second_category, price_info JSON, ratings JSON, overall_rating, is_active, is_essential)
 ├── ProductComparison (user FK) ⇄ M2M products
 └── ShoppingListItem

BrandProfile (name, logo_url, established, ...)
TimelineEvent (stage_type, stage_value, category, title, subtitle, content, tips, is_essential) ⇄ M2M products（空）
KidsEncyclopedia (chapter, question_number, question, answer)
Recipe (period, period_month, nutrient_tag, title, ingredients, steps)
SystemSetting (单行 id=1: register_mode / login_threshold / login_lock_threshold / login_lock_seconds / audit_retention_days)
```

### 5.2 数据量实测（SQLite 2026-09-08）

| 表 | 行数 | 表 | 行数 |
|---|---|---|---|
| core_recipe | 288 | core_aiquerylog | 31 |
| core_timelineevent | 204 | core_productcomparison | 24 |
| core_productcomparison_products | 65 | core_userfavorite | 0 |
| core_product | 62 | core_notification | 0 |
| core_kidsencyclopedia | 57 | core_chatmessage | 14 |
| core_auditlog | 45 | core_chatsession | 5 |
| core_brandprofile | 41 | core_invitelink | 5 |
| core_user | 5 | core_shoppinglist | 3 |
| core_shoppinglistitem | 92 | core_healthrecord | 7 |
| core_babyprofile | 2 | core_systemsetting | 1 |

- 总计：**1047 行**（业务表，不含 django 系统表）。
- 数据库文件：db.sqlite3 = 1.24 MB（含种子数据）。

### 5.3 索引分析（实测）

- 已建索引覆盖主要外键与常用筛选列（category/brand/overall_rating/is_essential/stage_type+stage_value+category/period/period_month/nutrient_tag 等）。
- **缺口**：
  - Product.price_info（JSONField）的 `avg` 排序查询（`price_info__avg`）无法走索引 —— 大数据量下价格排序性能差。
  - AI 相关（AIQueryLog/AI）查询未按时间排序索引。
  - 全文检索（q 参数模糊搜索商品）无 FTS（全文索引），数据量增大后需引入 PostgreSQL 的 pg_trgm 或 FTS。

### 5.4 一致性机制

- 数据库：外键约束由 Django ORM 维护（默认无物理外键为强约束，实际 MySQL/SQLite 可能软约束）。
- **无事务保证的显式说明**：Django 默认 `ATOMIC_REQUESTS` 未开启（建议生产开启）。
- 缓存一致性：Redis 未用于业务缓存（仅队列）。

### 5.5 生命周期管理

- 审计日志：有保留天数清理机制（可配）。
- **其他数据无生命周期策略**（通知/日志/AI 会话无限增长）。

---

## 6. API/接口契约现状

### 6.1 接口清单（按模块）

| 模块 | 接口（前缀 /api/） | 说明 |
|---|---|---|
| 认证 | POST /auth/register、POST /auth/login、POST /auth/refresh、GET /auth/captcha/new、POST /auth/forgot-password/… | 含验证码、忘记密码 |
| 用户 | GET /auth/me、GET /auth/babies、POST /auth/babies、PUT /auth/babies/{id}/primary、PUT /auth/password | 个人中心 |
| 知识 | GET/POST/PUT/DELETE /timeline/、/timeline/{id}/、/timeline/export/、/timeline/import/、/recipes/、/kids-encyclopedia/ | 时间轴/食谱/百科 |
| 商品 | GET/POST/PUT/DELETE /products/、/products/export/、/products/import/、/brands/ | 商品库/品牌 |
| 对比 | POST /compare/、POST /compare/ai/ | 商品对比 |
| 购物清单 | GET/POST /shopping-lists/、/shopping-lists/generate/、/shopping-lists/{id}/items/ | 待产包/清单 |
| 健康 | GET/POST/DELETE /health-records/、GET /vaccines/ | 产检/生长/疫苗 |
| AI | POST /ai/chat/、GET/POST /ai/sessions/、/ai/config/、/ai/auth/… | 助手/配置/授权 |
| 管理 | GET /admin/users/、GET /admin/audit-logs/、GET/POST /admin/system-settings/ | 后台管理 |

> 具体端点以 `core/urls.py` + `config/urls.py` 为准（未逐一展开）。

### 6.2 版本管理

- **无 API 版本化**（无 `/api/v1/` 前缀）。依赖路径 `/api/` + 命名空间（namespace 推测为 `core`）。
- 风险：后端数据结构演进时将破坏前端兼容，建议尽早引入版本化。

### 6.3 文档规范

- **drf-spectacular** 已集成（settings 中可生成 schema），但**未见 Swagger 页面可访问的明确路径**（需确认 `/api/schema/`、`/api/docs/` 是否开放）。

### 6.4 幂等性 / 限流 / 超时

| 项 | 现状 |
|---|---|
| 幂等性 | 无显式幂等设计（如创建商品重复点击会重复创建） |
| 限流 | 登录接口有内存限流；**业务接口（AI/对比/CSV 导入）无限流** |
| 超时 | 前端 axios timeout=30s；AI 请求无后端超时兜底 |

### 6.5 错误码体系

- 统一响应格式：`{code: 0, message: "success", data: ...}`。
- 自定义异常处理 `custom_exception_handler` 统一错误格式。
- **代码（部分已知）**：
  - 4000 限流（wait_seconds）
  - 1010/1011 需验证码
  - 1012 账号锁定
  - 其它 4xx 直接透传 HTTP 状态码 + message。
- **缺口**：无完整错误码文档，前端靠 code 特判，维护成本高。

---

## 7. 可观测性现状

| 维度 | 现状 | 评级 |
|---|---|---|
| 日志 | Django 默认 console/文件日志；无结构化日志、无日志级别集中管理 | 中 |
| 监控告警 | **无**（无 Prometheus/Grafana、无 Sentry、无告警） | 高（缺失） |
| 链路追踪 | **无**（无 OpenTelemetry / Jaeger） | 高（缺失） |
| 业务指标大盘 | **无**（无用户数/DAU/转化/商品对比次数等看板） | 中（缺失） |
| 审计日志 | 已实现（AuditLog 表，登录/注册/密码/管理操作） | 中（已有） |

---

## 8. 外部依赖与集成现状

| 依赖 | 用途 | 容错方案 | 密钥管理 |
|---|---|---|---|
| OpenAI 兼容 API | AI 对话/对比建议 | 多配置轮询 + 本地知识兜底 | API Key 明文存 DB/环境变量（**高危**） |
| DuckDuckGo | 联网搜索 | 失败静默降级 | 无密钥 |
| Redis | Celery 队列 | Docker 必配 | 本地无密码 |
| PostgreSQL | 生产数据库 | Docker 必配 | .env 配置 |
| 电商平台（淘宝/京东/拼多多） | 商品价格（JSON 快照） | 无（价格不会实时更新） | TAOBAO_APP_KEY 等 env（未使用） |
| picsum.photos / placehold.co | 占位图 | 离线时图片缺失 | 无 |

**容错方案**：AI 模块容错最完善（多配置轮询→本地兜底）；其余依赖基本无降级方案。

---

## 9. 前端/客户端现状

### 9.1 技术栈

React 18 + TypeScript + Vite + Tailwind CSS 3 + Zustand + ECharts（雷达图/生长曲线）+ axios + react-router-dom + lucide-react。

### 9.2 页面清单（27 页）

| 分类 | 页面 |
|---|---|
| 认证 | Login、Register |
| 首页 | Home |
| 知识 | Timeline、TimelineDetail、PregnancyWeekly、PregnancyRecipe、KidsEncyclopedia |
| 商品 | ProductList、ProductDetail、Compare、BrandList、BrandDetail |
| 购物 | ShoppingList、ShoppingListDetail、GenerateShoppingList |
| 健康 | Health |
| AI | AIAssistant、AIConfig |
| 个人 | Profile、NotFound |
| 管理 | ProductAdmin、UserManage、AuditLog、RegistrationManage |

### 9.3 状态管理

- `authStore`（Zustand）：token 持久化 + fetchMe + 自动刷新 access token + 登出。
- `chatStore`（Zustand + persist → localStorage `mengya-chat`）：聊天会话/消息持久化，**修复了切换页面后聊天记录丢失的问题**。
- 其余页面局部 useState。

### 9.4 通信封装

- `api/client.ts`：axios 实例，baseURL `/api`，timeout 30s，请求拦截附 JWT，响应拦截统一解包 `{code,message,data}`，401 跳登录。
- API 层按域拆分（auth/product/catalog/compare/services）。

### 9.5 离线能力 / 多端适配

- **无离线能力**（PWA/service worker 未实现）。
- **移动端优先**：底部导航 5 tab（首页/时间轴/商品库/AI助手/我的）；响应式 grid。

### 9.6 前端安全隐患

- 图片 URL 直接外链（picsum.photos 等第三方），存在隐私外泄与内容被替换风险。
- token 存 localStorage（XSS 风险需自行防护）。

---

## 10. 现存问题与风险清单

> 分级：P0（立即处理）/ P1（尽快处理）/ P2（规划处理）。风险等级：严重 / 高 / 中 / 低。

| 编号 | 级别 | 问题 | 影响范围 | 风险等级 | 建议 |
|---|---|---|---|---|---|
| R-01 | P0 | API Key 明文存储（DB ai_configs + env） | AI 模块 / 全平台 | **严重** | 生产用密钥托管（如 Vault/Secret Manager），DB 中仅存脱敏引用或加密 |
| R-02 | P0 | 无 TLS/HTTPS，明文传输密码与 JWT | 全站 | 高 | 立即配置证书（Let's Encrypt）+ nginx 443 + HSTS |
| R-03 | P0 | 图形验证码 debug_code 明文接口 | 认证风控 | 高 | 删除明文返回；改为前端无法直读的挑战方式 |
| R-04 | P1 | 无监控告警/链路追踪 | 运维 | 高 | 引入 Sentry（错误） + Prometheus+Grafana（指标） |
| R-05 | P1 | 无数据备份 | 数据安全 | 高 | 生产库启用 pg_dump 定时备份 + 异地存储 |
| R-06 | P1 | 无 CI/CD 与依赖审计 | 交付/供应链 | 中 | GitHub Actions + pip-audit + npm audit + Docker 镜像扫描 |
| R-07 | P1 | 生产用 runserver/vite dev | 性能/稳定性 | 高 | 换 gunicorn/uvicorn + 静态资源 CDN/nginx |
| R-08 | P1 | AI 无内容审核与滥用限制 | 合规 | 中高 | 引入内容安全 API + 会话/Token 级限流 |
| R-09 | P1 | 商品价格 JSON 无更新机制 | 业务准确 | 中 | 引入定时同步任务（Celery beat）或对接电商 API |
| R-10 | P1 | 接口无版本化 | 演进 | 中 | API 前缀加版本 v1；契约文档完善 |
| R-11 | P2 | 通知模块空实现 | 产品 | 中 | 疫苗提醒/产检提醒等消息触达（短信/推送） |
| R-12 | P2 | 待办清单无状态机/生命周期 | 数据增长 | 中 | 明确状态与清理策略 |
| R-13 | P2 | JSON 字段（price_info）性能隐患 | 数据量增长 | 中 | 迁移到 PostgreSQL 专用类型或拆分表 |
| R-14 | P2 | 本地 SQLite 无并发保障 | 生产规模 | 中 | 生产强制 PostgreSQL |
| R-15 | P2 | 无系统错误码表/文档 | 协作 | 低 | 建立统一错误码字典 |

---

## 11. 待明确的架构决策点

> 共 18 个决策点，覆盖用户体系/商品/库存/支付/营销/配送/售后/内容审核/消息通知/数据权限/多语言/高并发/埋点/合规等。每个决策点含背景、可选答案、推荐。

### D-01 用户体系扩展方向
- 背景：当前仅手机号+密码；未来可能有微信登录、小程序。
- 可选：A. 维持手机号+密码 + 可扩展 OAuth；B. 引入三方 OAuth（微信等）；C. 抽象 UserProvider 模型。
- **推荐**：A（MVP 阶段维持，预留字段）。

### D-02 多孩/多角色（父亲/老人）模型
- 背景：当前 User+BabyProfile 已支持多宝宝。
- 可选：A. 每个用户可维护多个宝宝档案（当前实现）。B. 增加家庭组（FamilyGroup）模型。
- **推荐**：A（一期够用），二期评估 B。

### D-03 商品模型（SKU/规格）
- 背景：当前 Product 为单层（无 SKU、无规格库存）。
- 可选：A. 保持单层（知识型导购）。B. 引入 SKU + 规格属性模型。C. 引入商品 SPU→SKU 两级。
- **推荐**：A（非交易平台），若未来电商再升级 C。

### D-04 库存体系
- 背景：无库存概念。
- 可选：A. 不引入（纯导购）。B. 引入库存字段。C. 引入独立库存服务。
- **推荐**：A（当前业务无交易需求）。

### D-05 价格体系
- 背景：price_info JSON 快照。
- 可选：A. 维持快照（定时更新）。B. 对接电商开放 API。C. 用户上报 + 爬虫。
- **推荐**：A（低成本），配合定时任务定期刷新。

### D-06 支付集成
- 背景：无支付。
- 可选：A. 一期不接入。B. 接入微信支付/支付宝（交易闭环）。
- **推荐**：A（先跑通知识+工具），若电商再走 B，需引入金额校验/回调验签/防重放。

### D-07 营销体系
- 背景：无营销活动。
- 可选：A. 不引入。B. 引入优惠券/限时折扣（简单）。C. 引入完整营销引擎。
- **推荐**：B（若有变现需求，先简单券类）。

### D-08 配送/履约
- 背景：无配送。
- 可选：A. 不引入（导购跳转）。B. 引入自营配送单。
- **推荐**：A。

### D-09 售后/客服
- 背景：无售后。
- 可选：A. 客服表单（邮箱/微信）。B. 工单系统。
- **推荐**：A（一期）。

### D-10 内容审核与 AI 安全
- 背景：AI 无审核。
- 可选：A. 引入内容安全 API（如蓝燕/阿里云盾）。B. 关键词过滤 + 人工审核。C. 自研审核模型。
- **推荐**：A（合规优先），输出侧同样审核。

### D-11 消息通知体系
- 背景：Notification 表空。
- 可选：A. 站内信（Notification）。B. 短信（阿里云/腾讯云）。C. 微信模板消息/推送。
- **推荐**：B（提醒类）+ A（站内）。

### D-12 数据权限与多租户
- 背景：单租户。
- 可选：A. 单租户（每用户隔离）。B. 多租户（机构版）。
- **推荐**：A（个人工具平台），若做园所/机构版再评估。

### D-13 多语言/i18n
- 背景：纯中文。
- 可选：A. 保持中文。B. 引入 i18n 框架。
- **推荐**：B（低成本预留，代码层面避免硬编码文案）。

### D-14 高并发/性能目标
- 背景：MVP 无指标。
- 可选：A. 目标 100 QPS（单机）。B. 1000 QPS（引入缓存+CDN）。
- **推荐**：A（先保证功能与正确性），随用户量增加再扩容。

### D-15 埋点与数据分析
- 背景：无埋点。
- 可选：A. 自建简单埋点。B. 接入第三方（如神策/GA）。
- **推荐**：B（免费版起步），关键转化事件埋点。

### D-16 合规（GDPR / 个人信息保护）
- 背景：涉及孕妇与儿童敏感数据（医疗/健康记录）。
- 可选：A. 隐私政策 + 用户授权（必须）。B. 数据加密 + 权限最小化。
- **推荐**：A+B 同步（健康数据为敏感数据，必须合规）。

### D-17 后台管理/运营端
- 背景：现有 4 个管理页（商品/用户/审计/注册）。
- 可选：A. 扩充现有前端管理页。B. 使用 Django Admin 后台（现有）。
- **推荐**：B（快速） + A（关键业务自建）。

### D-18 服务端渲染 vs 客户端渲染
- 背景：当前 CSR。
- 可选：A. 保持 CSR。B. 引入 SSR（Next.js）。
- **推荐**：A（MVP 优先），SEO 需求出现再评估。

---

## 附录 A：关键文件索引

| 文件 | 说明 |
|---|---|
| `backend/config/settings.py` | 项目配置（JWT/DB/Redis/AI） |
| `backend/apps/core/models/` | 17 个模型定义 |
| `backend/apps/core/views.py` | 全部 API 视图（1883 行） |
| `backend/apps/core/services/ai_service.py` | AI 多配置轮询与本地兜底 |
| `backend/apps/core/utils/rate_limit.py` | 内存限流实现 |
| `backend/apps/core/management/commands/init_data.py` | 种子数据（品牌/商品/时间轴/演示用户） |
| `frontend/src/api/client.ts` | axios 封装（JWT/超时/解包） |
| `frontend/src/store/authStore.ts` | 登录态持久化 |
| `frontend/src/store/chatStore.ts` | 聊天持久化 |
| `docker-compose.yml` | 5 服务编排 |
| `nginx/nginx.conf` | 反向代理 |

## 附 B：已知验证结论

- 数据库实测：业务表 1047 行（种子数据规模）。
- 索引：覆盖常用查询，但 JSON price_info 排序无索引支持。
- 认证风控：验证码明文返回（R-03）；登录限流为内存实现（单进程）。
- AI：多配置轮询与本地兜底完善（容错强）；但 Key 明文存储（R-01）。

---

*文档结束。本调研基于代码静态审阅与数据库实测，未做运行期压测与安全扫描；涉及具体行数/版本请以仓库实际为准。*

> AI生成