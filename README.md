---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'f304bae9-a4dd-402d-8e1c-becef00be999'
  PropagateID: 'f304bae9-a4dd-402d-8e1c-becef00be999'
  ReservedCode1: 'e15a713e-ae19-4508-b449-2f5c1491a458'
  ReservedCode2: 'e15a713e-ae19-4508-b449-2f5c1491a458'
---

# 萌芽（MengYa）· 母婴全周期陪伴平台

> 从第一次胎动到第一次背书包，陪伴生命最初 3000 天。

萌芽是面向备孕 / 孕期 / 0-6 岁育儿家庭的**母婴全周期一站式平台**，涵盖全周期知识时间轴、14 大类母婴商品库、五维评分对比、智能待产包、宝宝购物清单、健康记录与疫苗日历、站内通知、收藏夹、AI 问答助手（支持联网搜索）等核心能力。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Django 4.2 + Django REST Framework + SimpleJWT |
| 数据库 | SQLite（本地开发）/ PostgreSQL 15（Docker 部署） |
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS 3 + ECharts |
| AI | OpenAI 兼容接口（Agnes / OpenAI / 任意兼容服务）+ DuckDuckGo 联网搜索 |
| 编排 | Docker Compose（db / redis / backend / worker / frontend）+ run.sh 服务管理脚本 |

## 快速开始（本地开发）

### 后端

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate    # Windows
pip install -r requirements.txt
python manage.py migrate
python manage.py init_data
python manage.py runserver 0.0.0.0:8000
```

> 本地未配置 `DATABASE_URL` 时，settings 自动回退到 SQLite，无需 PostgreSQL。

### 前端

```bash
cd frontend
npm install
npm run dev        # 开发模式 http://localhost:5173
# 或
npm run build && npm run preview   # 预览构建产物
```

### 访问地址

| 服务 | 地址 | 说明 |
| --- | --- | --- |
| 前端页面 | http://localhost:5173 | 主站 |
| 后端 API | http://localhost:8000/api/ | RESTful 接口 |

### 演示账号

| 账号 | 密码 | 说明 |
| --- | --- | --- |
| 13800000001 | admin123 | 管理员账号 |
| 13800000000 | mengya123 | 演示用户（需邀请注册创建） |

> 注册模式支持「开放注册」和「仅限邀请注册」两种，管理员可在注册管理页面切换并生成邀请链接。

启动后首次 `init_data` 会自动初始化：**41 个品牌档案、约 70 条商品、31 条时间轴必读事件、21 种免疫规划疫苗**。

## Docker Compose 部署

```bash
# 1. 准备环境变量
cp .env.example .env

# 2. 一键启动
docker compose up -d --build

# 3. 查看日志
docker compose logs -f backend
```

## 服务管理脚本 run.sh（推荐）

> 服务器上建议使用 `run.sh` 统一管理服务，支持 Docker Compose 与传统本地方式双模式。

```bash
# 无参数执行：仅显示用法提示并退出（不启动服务）
./run.sh
sh run.sh            # 兼容 sh 方式执行（自动改用 bash 运行）

# 交互式选择启动方式（docker / local），并记住选择
./run.sh start

# 指定方式启动
MODE=docker ./run.sh start        # Docker Compose 方式（推荐，适合服务器）
MODE=local ./run.sh start         # 传统方式（本机 python3 + vite）

# 自定义账号与端口示例
ADMIN_USERNAME=admin_yy ADMIN_PASSWORD=mypassword MODE=local ./run.sh start
BACKEND_PORT=9000 EXTERNAL_PORT=20448 ./run.sh start

# 其他命令
./run.sh stop          # 停止全部服务
./run.sh restart       # 重启全部服务
./run.sh status        # 查看服务状态
./run.sh add_nginx     # 生成 nginx SSL 配置（生成到 /opt/service/nginx/conf.d/）
./run.sh help          # 帮助
```

### 启动方式说明

| 方式 | 适用场景 | 说明 |
| --- | --- | --- |
| `docker` | 服务器 / 容器环境（推荐） | 自动探测 `docker compose` / `docker-compose`，编排 db/redis/backend/worker/frontend/nginx |
| `local` | 本地开发 / 无 Docker 环境 | 后端 `python3` + venv 自动建环境装依赖；前端 `npm install` + vite dev |

> 无参数直接运行 `./run.sh` 或 `sh run.sh` 时：仅显示可用子命令提示并退出，**不启动任何服务**；需显式执行 `./run.sh start` 才会启动。脚本内部自动检测解释器，`sh` 方式会自动改用 bash 运行，兼容 bash 语法。

### 依赖自动校验（传统方式）

- 后端：自动创建 `.venv`，`pip check` 或关键模块（django/rest_framework/dotenv）缺失时自动安装 `requirements.txt`
- 前端：`node_modules` 缺失或 `npm ls` 不完整时自动 `npm install`

### 可配置环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ADMIN_USERNAME` | `13800000001` | 管理员账号 |
| `ADMIN_PASSWORD` | `admin123` | 管理员密码 |
| `ADMIN_NICKNAME` | `管理员` | 管理员昵称 |
| `BACKEND_PORT` | `8000` | 后端端口 |
| `FRONTEND_PORT` | `5173` | 前端端口 |
| `EXTERNAL_PORT` | `10224` | nginx 外部访问端口 |
| `NGINX_CONF_DIR` | `/opt/service/nginx/conf.d` | nginx 配置目录（add_nginx 生成位置） |
| `NGINX_CERT_DIR` | `/opt/service/nginx/ssl` | nginx 证书目录 |

> 服务器为 Ubuntu/Debian 时通常只有 `python3` 命令，run.sh 已自动探测 `python3` / `python`，无需手动创建虚拟环境。

## 核心功能

### 知识与工具

- **全周期时间轴**：备孕 → 孕期（按周）→ 0-3 岁 → 3-6 岁，31 条必读事件 + 商品关联
- **商品库**：14 大类、真实品牌与价格区间、安全认证标注、五维评分（安全/舒适/功能/易用/外观）
- **产品对比**：2-4 款商品五维雷达图 + 全渠道价格对比 + AI 购买建议
- **智能待产包**：按季节 × 分娩方式一键生成，含证件清单，支持逐项勾选进度追踪
- **宝宝购物清单**：按年龄段/场景生成宝宝用品清单，支持数据导入（BabyShoppingDetail）
- **健康中心**：产检记录、宝宝生长曲线（体重/身高/头围）、疫苗日历（21 种免疫规划疫苗）+ 日历总览
- **品牌档案**：41 个主流母婴品牌定位、故事、官网直达
- **通知中心**：站内通知（全部/未读筛选、单条标记已读、全部已读）
- **收藏夹**：商品/时间轴/待产包/对比结果统一收藏管理
- **胎教故事**：按孕周分阶段的胎教故事内容（中英双语）

### AI 助手

- **多配置轮询**：支持配置多个 AI（OpenAI / Agnes / 任意兼容服务），按顺序尝试，全部失败后回退本地知识引擎
- **管理员共享**：管理员配置 API Key 后，可授权普通用户共享使用，无需用户自行配置
- **联网搜索**：当用户询问天气、新闻、实时信息时，自动通过 DuckDuckGo 搜索后让 AI 基于搜索结果回答
- **日期注入**：在 System Prompt 中注入当前日期，避免 LLM 使用训练截止日期回答日期相关问题
- **通用问答**：不限于母婴场景，只要 AI 接口可用即可回答任意问题

---

## AI 配置与底层调用详解

本节详细说明 AI 助手的配置体系、调用链路、文件路径及关键源码逻辑，方便二次开发与运维排查。

### 配置层级与优先级

AI 配置共有 **4 个层级**，在 `ai_service.py` 的 `_build_config_list(user)` 函数中按以下优先级依次构建，先到的配置先尝试：

| 优先级 | 配置来源 | 存储位置 | 说明 |
| --- | --- | --- | --- |
| 1 | 用户多配置 `ai_configs` | `User.ai_configs` (JSONField) | 用户在「AI 配置页」添加的多个配置，按数组顺序依次尝试 |
| 2 | 用户旧版单配置 | `User.ai_api_key` / `ai_base_url` / `ai_model` | 向后兼容字段，仅当多配置中没有相同 key 时才追加 |
| 3 | 全局环境变量配置 | `settings.OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | Django settings 读取 `.env`，作为兜底配置 |
| 4 | 管理员共享配置 | 管理员用户的 `ai_configs` | 当用户无自己的配置且被 `ai_authorized` 授权时，使用管理员的第一个可用配置 |

> **关键逻辑**：只要前面层级的配置中有至少一个可用（`enabled=true` 且有 `api_key`），就不会使用后面层级。如果用户自己配置了 API Key，则管理员的共享配置不会生效——共享仅在用户「完全没有自己的配置」时触发。

### 配置文件路径

| 文件 | 路径 | 作用 |
| --- | --- | --- |
| 环境变量模板 | `.env.example` / `.env` | 全局 AI 配置（`OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_BASE_URL`） |
| Django settings | `backend/config/settings.py` (第 146-149 行) | 读取环境变量并设置为全局默认值 |
| 用户模型 | `backend/apps/core/models/user.py` (第 27-34 行) | 定义用户级 AI 配置字段 |
| AI 服务 | `backend/apps/core/services/ai_service.py` | 核心调用逻辑：配置构建、OpenAI 调用、联网搜索、本地兜底 |
| 联网搜索 | `backend/apps/core/services/web_search.py` | DuckDuckGo 搜索服务 |
| AI 视图 | `backend/apps/core/views.py` | API 端点：配置管理、聊天、对比、历史、建议 |
| AI 配置前端 | `frontend/src/pages/AIConfigPage.tsx` | AI 配置管理页面 |
| AI 聊天前端 | `frontend/src/pages/AIAssistantPage.tsx` | AI 聊天界面 |
| 前端 API | `frontend/src/api/auth.ts` | `aiConfig()` / `updateAIConfig()` / `aiAuthList()` / `aiAuthToggle()` |
| 前端 API | `frontend/src/api/services.ts` | `aiApi.chat()` / `aiApi.history()` / `aiApi.suggestions()` |
| AI 查询日志模型 | `backend/apps/core/models/ai_log.py` | 记录每次 AI 问答的日志 |

### 配置数据结构

#### 用户多配置 (`User.ai_configs` JSONField)

存储在数据库 `core_user` 表的 `ai_configs` 字段，JSON 数组格式：

```json
[
  {
    "name": "我的OpenAI",
    "api_key": "sk-xxxxxxxx",
    "base_url": "https://api.openai.com/v1",
    "model": "gpt-4o-mini",
    "enabled": true
  },
  {
    "name": "Agnes备用",
    "api_key": "xxxxxxxx",
    "base_url": "https://api.agnes.com/v1",
    "model": "agnes-2.5-flash",
    "enabled": true
  }
]
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | string | 配置名称（用户自定义，50 字符以内） |
| `api_key` | string | API 密钥（必填，空值会被过滤） |
| `base_url` | string | 接口地址（留空则使用 OpenAI 默认地址） |
| `model` | string | 模型名称（留空则使用 settings 中的 `OPENAI_MODEL`） |
| `enabled` | boolean | 是否启用（false 的配置会被跳过） |

#### 全局环境变量 (`.env`)

```bash
# 可选，不配置则使用内置本地回复引擎
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=
```

### 调用链路详解

以「用户在 AI 助手页面发送一条消息」为例，完整链路如下：

```
[前端] AIAssistantPage.tsx → aiApi.chat(query)
  ↓ POST /api/ai/chat/  (携 JWT token)
[后端] views.py:ai_chat(request)
  ↓ 1. 获取用户当前阶段 get_stage_info()
  ↓ 2. 调用 ai_service.ai_chat(query, stage_label, user)
[ai_service.py:ai_chat()]
  ↓ 3. 判断是否需要联网搜索 needs_search(query)
  │    └─ 匹配正则：天气/新闻/实时/日期/股价/搜索...
  │    └─ 是 → search_and_summarize(query) → 注入 search_context
  ↓ 4. 构建完整 Prompt（日期 + 搜索结果 + 用户问题 + 阶段）
  ↓ 5. _build_config_list(user) → 构建 AI 配置列表（4 层优先级）
  ↓ 6. for cfg in configs:
  │      _call_openai(prompt, api_key, base_url, model)
  │      └─ 成功 → 返回回复，记录 used_config_name
  │      └─ 失败 → 记录 error_hint，尝试下一个配置
  ↓ 7. 全部失败 → _local_question() 本地知识引擎兜底
  ↓ 8. 返回 {response, used_openai, used_config_name, used_search, error_hint, ...}
[后端] views.py:ai_chat
  ↓ 9. AIQueryLog.objects.create(...) 记录日志
  ↓ 10. Response → 前端
[前端] AIAssistantPage.tsx
  ↓ 11. 渲染 AI 回复，附带配置名称与错误提示
```

#### 联网搜索流程

位于 `web_search.py`，当 `needs_search()` 匹配到以下关键词时自动触发：

| 关键词类别 | 正则模式 | 示例 |
| --- | --- | --- |
| 天气 | `天气\|气温\|温度\|下雨\|下雪\|台风\|雾霾\|空气质量` | "今天天气怎么样" |
| 新闻/时事 | `新闻\|最新\|最近\|今天.*发生\|热点\|事件\|时事` | "最近的母婴新闻" |
| 实时信息 | `现在\|目前\|当前\|实时\|今天\|今日\|本月\|近期` | "现在的汇率是多少" |
| 搜索/查询 | `搜一下\|搜索\|查一下\|帮我查\|查询` | "帮我查一下北京天气" |
| 价格/汇率 | `股价\|汇率\|油价\|金价\|比特币\|基金\|股票\|理财\|利率` | "今天股价多少" |
| 人物/事件 | `是谁\|谁.*说\|谁.*做\|发生了什么` | "某某是谁" |
| 日期/节日 | `几号\|星期几\|节假日\|放假\|调休\|农历\|阴历\|阳历\|节气` | "今天农历几号" |

搜索流程：`DuckDuckGo API → 获取 5 条结果 → 格式化为文本 → 注入 Prompt 的 {search_context} 占位符 → AI 基于搜索结果回答`

> 搜索依赖 `ddgs` 包（`pip install ddgs`）。若未安装，搜索功能静默降级（不影响 AI 正常对话）。

#### OpenAI 兼容接口调用

`_call_openai()` 使用 `openai` Python SDK 创建客户端：

```python
client = OpenAI(api_key=api_key, base_url=base_url)  # base_url 可选
resp = client.chat.completions.create(
    model=model,           # 如 "gpt-4o-mini" / "agnes-2.5-flash"
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ],
    temperature=0.7,
    max_tokens=800,
)
```

> 兼容任何提供 OpenAI 格式 `/v1/chat/completions` 接口的服务，包括但不限于 OpenAI、Azure OpenAI、Agnes、通义千问、Moonshot 等。

#### 本地知识引擎兜底

当所有 AI 配置都不可用（未配置 / Key 失效 / 网络错误）时，`_local_question()` 提供基于关键词匹配的本地回复：

- 内置 13 条母婴领域知识（比价、安全座椅、推车、奶瓶、奶粉、辅食、黄疸、产检、疫苗、待产包等）
- 匹配到关键词 → 返回对应知识文本
- 未匹配 → 返回通用引导提示，建议用户配置 API Key

### API 端点

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| `POST` | `/api/ai/chat/` | 登录用户 | AI 问答（自动联网搜索 + 多配置轮询） |
| `POST` | `/api/ai/compare/` | 登录用户 | AI 产品对比分析 |
| `GET` | `/api/ai/history/` | 登录用户 | 获取当前用户最近 50 条 AI 问答记录 |
| `GET` | `/api/ai/suggestions/` | 登录用户 | 获取推荐问题列表 |
| `GET` | `/api/users/ai-config/` | 管理员或被授权用户 | 获取 AI 配置 |
| `PUT` | `/api/users/ai-config/` | 管理员或被授权用户 | 保存 AI 配置（多配置或旧版单配置） |
| `GET` | `/api/users/ai-auth/` | 管理员 | 获取所有用户的 AI 授权状态 |
| `POST` | `/api/users/ai-auth/` | 管理员 | 切换用户 AI 授权 |

### `ai_chat()` 返回字段说明

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "query": "今天天气怎么样",
    "response": "今天北京晴，气温...",
    "used_openai": true,
    "used_config_name": "我的OpenAI",
    "used_search": true,
    "latency_ms": 520,
    "suggestions": ["待产包应该准备哪些物品？", ...],
    "error_hint": ""
  }
}
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `query` | string | 用户原始问题 |
| `response` | string | AI 回复内容 |
| `used_openai` | boolean | 是否成功调用了远程 AI（false = 本地引擎兜底） |
| `used_config_name` | string | 实际使用的 AI 配置名称（空 = 本地模式） |
| `used_search` | boolean | 是否触发了联网搜索 |
| `latency_ms` | int | 响应耗时（毫秒） |
| `suggestions` | string[] | 推荐问题列表 |
| `error_hint` | string | 错误提示（全部 AI 配置失败时给出原因，空 = 无错误） |

### AI 授权管理

管理员可在「AI 配置页」底部的「AI 授权管理」面板中对普通用户进行授权：

- **管理员** (`is_staff=true`)：默认可使用 AI，不可被取消授权
- **被授权用户** (`ai_authorized=true`)：可访问 AI 配置页，在自己未配置 API Key 时共享管理员配置
- **未授权用户**：无法访问 AI 配置页，但全局配置（`.env` 中的 `OPENAI_API_KEY`）仍对其生效

授权 API：`POST /api/users/ai-auth/`，参数 `{ "user_id": 123, "ai_authorized": true }`

### System Prompt 设计

每次 AI 对话使用 `GENERAL_CHAT_PROMPT` 模板，包含以下注入变量：

| 占位符 | 内容 | 示例 |
| --- | --- | --- |
| `{today}` | 当前日期 | `2026年09月04日` |
| `{weekday}` | 星期 | `星期四` |
| `{search_context}` | 联网搜索结果（或"（无网络搜索结果）"） | `以下是关于「今天天气」的网络搜索结果...` |
| `{user_query}` | 用户问题 | `今天适合带宝宝出门吗` |
| `{user_stage}` | 用户当前阶段 | `孕期20周` / `宝宝6个月` / `未设置` |

System Prompt 中的关键指令：
1. 以 `{today}` 为准回答日期相关问题，不使用训练数据中的旧日期
2. 有搜索结果时优先引用，无搜索结果时按自身知识回答
3. 语气温暖耐心，母婴问题可结合用户阶段
4. 医疗问题提醒以医生建议为准

### 安全与管理

- **登录风控**：连续失败达阈值后要求输入验证码，超过锁定阈值后临时锁定账号并显示倒计时
- **风控配置**：管理员可自定义触发验证码次数、锁定账号次数、锁定时长（分钟）
- **审计日志**：记录所有关键操作，支持按类型筛选、关键词搜索、批量删除、保留期限设置
- **用户管理**：编辑/冻结/重置密码/设置密保/删除用户，管理员账号不可冻结或删除
- **注册管理**：开放注册 / 仅限邀请注册切换，邀请链接生成与管理
- **密保找回密码**：设置密保问题后可通过密保答案重置密码，找回密码同样受风控保护

### 系统设置

- **AI 配置页**：独立页面管理 AI 配置与授权
- **注册管理页**：独立页面管理注册模式与邀请链接
- **"我的"页面**：用户卡片、宝宝档案、常用入口、修改密码、密保设置、管理面板

## 项目结构

```
mengya/
├── run.sh                        # 服务管理脚本（start/stop/restart/status/add_nginx）
├── docker-compose.yml            # 五服务编排（db/redis/backend/worker/frontend）
├── .env.example                  # 环境变量模板
├── .gitignore
├── nginx/                        # Nginx 反向代理示例（nginx.conf / mengya_ssl.conf）
├── backend/
│   ├── config/                    # Django 配置（settings / urls / celery）
│   ├── requirements.txt
│   └── apps/core/
│       ├── models/                # 19 张数据表
│       │   ├── user.py             # 用户（含 AI 配置、风控字段、密保）
│       │   ├── system.py           # 系统设置（风控阈值、注册模式、审计保留）
│       │   ├── audit.py            # 审计日志
│       │   ├── ai_log.py           # AI 查询日志
│       │   ├── baby.py / timeline.py / brand.py / product.py ...
│       │   ├── baby_shopping.py    # 宝宝购物清单（新增）
│       │   ├── favorite.py         # 收藏
│       │   ├── notification.py     # 站内通知
│       │   └── fetal_story.py      # 胎教故事
│       ├── services/
│       │   ├── ai_service.py       # AI 调用（多配置轮询 + 管理员共享 + 日期注入）
│       │   ├── web_search.py       # DuckDuckGo 联网搜索
│       │   ├── shopping.py         # 待产包生成
│       │   └── compare.py          # 五维对比
│       ├── views.py                # 全部 API 视图（登录/风控/AI/用户管理/审计...）
│       ├── serializers/
│       ├── utils/
│       │   ├── rate_limit.py       # 风控限流
│       │   ├── exceptions.py       # 自定义异常处理
│       │   └── audit.py            # 审计日志工具
│       └── management/commands/init_data.py  # 初始数据
└── frontend/
    └── src/
        ├── pages/                  # 29 个页面
        │   ├── HomePage.tsx        # 首页
        │   ├── LoginPage.tsx       # 登录（含风控倒计时）
        │   ├── AIAssistantPage.tsx # AI 助手聊天
        │   ├── AIConfigPage.tsx    # AI 配置管理
        │   ├── UserManagePage.tsx  # 用户管理（含风控设置）
        │   ├── AuditLogPage.tsx    # 审计日志
        │   ├── RegistrationManagePage.tsx  # 注册管理
        │   ├── ProfilePage.tsx     # 个人中心
        │   ├── NotificationPage.tsx# 通知中心（新增）
        │   ├── FavoritePage.tsx    # 收藏夹（新增）
        │   ├── BabyShoppingDetailPage.tsx  # 宝宝购物清单（新增）
        │   ├── TimelinePage.tsx / ProductListPage.tsx / ComparePage.tsx ...
        ├── components/             # 雷达图 / 生长曲线 / 疫苗日历 / 健康日历 / 复制按钮
        ├── api/                    # axios 客户端 + 领域 API
        ├── store/                  # zustand 状态管理
        └── types/                  # 全局类型定义
```

## 数据模型（19 张核心表）

| 模型 | 说明 |
| --- | --- |
| User | 用户（含 AI 配置、风控字段、密保问题、邀请注册） |
| BabyProfile | 宝宝档案 |
| SystemSetting | 系统设置（风控阈值、注册模式、审计保留天数） |
| AuditLog | 审计日志 |
| AIQueryLog | AI 查询日志 |
| TimelineEvent | 时间轴事件 |
| Product / BrandProfile | 商品与品牌 |
| ProductComparison | 产品对比记录 |
| ShoppingList / ShoppingListItem | 待产包及清单项 |
| BabyShoppingItem | 宝宝购物清单项（新增） |
| HealthRecord | 健康记录（产检/体重/身高/头围） |
| UserFavorite | 收藏（商品/时间轴/待产包/对比） |
| Notification | 站内通知（未读/已读） |
| FetalStory | 胎教故事（按孕周分阶段） |
| InviteLink | 邀请链接 |

## 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `DJANGO_SECRET_KEY` | Django 密钥 | change-me-in-production |
| `DJANGO_DEBUG` | 调试模式 | True |
| `DATABASE_URL` | 数据库连接（留空则用 SQLite） | - |
| `OPENAI_API_KEY` | 全局 AI API Key（留空则用户自行配置） | - |
| `OPENAI_MODEL` | 默认 AI 模型 | gpt-4o-mini |
| `OPENAI_BASE_URL` | AI 接口地址 | - |

## 常用命令

```bash
# 服务管理（推荐）
./run.sh start                     # 启动（交互式选择 docker/local）
./run.sh stop                      # 停止
./run.sh restart                   # 重启
./run.sh status                    # 状态
./run.sh add_nginx                 # 生成 nginx SSL 配置

# 本地开发
python manage.py runserver 0.0.0.0:8000     # 启动后端
npm run dev                                  # 启动前端开发服务器
npm run build                                # 构建前端

# Docker
docker compose ps                             # 查看服务状态
docker compose logs -f backend                # 后端日志
docker compose exec backend python manage.py shell  # Django shell
docker compose down                           # 停止（保留数据卷）
docker compose down -v                        # 停止并清空数据库
```

## 免责声明

平台内容基于母婴健康领域公开共识整理，供学习与参考，不构成医疗建议。健康与医疗问题请以专业医生意见为准。

> AI生成