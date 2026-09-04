---
AIGC:
  ContentProducer: '001191110102MAD55U9H0F10002'
  ContentPropagator: '001191110102MAD55U9H0F10002'
  Label: '1'
  ProduceID: 'abc38e44-c197-442c-9bb7-b4da08973ce9'
  PropagateID: 'abc38e44-c197-442c-9bb7-b4da08973ce9'
  ReservedCode1: '5ff9496e-48e7-4fc6-b00a-47ab2e0c8a65'
  ReservedCode2: '5ff9496e-48e7-4fc6-b00a-47ab2e0c8a65'
---

# 萌芽（MengYa）· 母婴全周期陪伴平台

> 从第一次胎动到第一次背书包，陪伴生命最初 3000 天。

萌芽是面向备孕 / 孕期 / 0-6 岁育儿家庭的**母婴全周期一站式平台**，涵盖全周期知识时间轴、14 大类母婴商品库、五维评分对比、智能待产包、健康记录与疫苗日历、AI 问答助手（支持联网搜索）等核心能力。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 后端 | Django 4.2 + Django REST Framework + SimpleJWT |
| 数据库 | SQLite（本地开发）/ PostgreSQL 15（Docker 部署） |
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS 3 + ECharts |
| AI | OpenAI 兼容接口（Agnes / OpenAI / 任意兼容服务）+ DuckDuckGo 联网搜索 |
| 编排 | Docker Compose（db / redis / backend / worker / frontend） |

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

## 核心功能

### 知识与工具

- **全周期时间轴**：备孕 → 孕期（按周）→ 0-3 岁 → 3-6 岁，31 条必读事件 + 商品关联
- **商品库**：14 大类、真实品牌与价格区间、安全认证标注、五维评分（安全/舒适/功能/易用/外观）
- **产品对比**：2-4 款商品五维雷达图 + 全渠道价格对比 + AI 购买建议
- **智能待产包**：按季节 × 分娩方式一键生成，含证件清单，支持逐项勾选进度追踪
- **健康中心**：产检记录、宝宝生长曲线（体重/身高/头围）、疫苗日历（21 种免疫规划疫苗）
- **品牌档案**：41 个主流母婴品牌定位、故事、官网直达

### AI 助手

- **多配置轮询**：支持配置多个 AI（OpenAI / Agnes / 任意兼容服务），按顺序尝试，全部失败后回退本地知识引擎
- **管理员共享**：管理员配置 API Key 后，可授权普通用户共享使用，无需用户自行配置
- **联网搜索**：当用户询问天气、新闻、实时信息时，自动通过 DuckDuckGo 搜索后让 AI 基于搜索结果回答
- **日期注入**：在 System Prompt 中注入当前日期，避免 LLM 使用训练截止日期回答日期相关问题
- **通用问答**：不限于母婴场景，只要 AI 接口可用即可回答任意问题

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
├── docker-compose.yml             # 五服务编排（db/redis/backend/worker/frontend）
├── .env.example                   # 环境变量模板
├── .gitignore
├── nginx/                         # Nginx 反向代理示例
├── backend/
│   ├── config/                    # Django 配置（settings / urls / celery）
│   ├── requirements.txt
│   └── apps/core/
│       ├── models/                # 15 张数据表
│       │   ├── user.py             # 用户（含 AI 配置、风控字段、密保）
│       │   ├── system.py           # 系统设置（风控阈值、注册模式、审计保留）
│       │   ├── audit.py            # 审计日志
│       │   ├── ai_log.py           # AI 查询日志
│       │   ├── baby.py / timeline.py / brand.py / product.py ...
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
        ├── pages/                  # 22 个页面
        │   ├── HomePage.tsx        # 首页
        │   ├── LoginPage.tsx       # 登录（含风控倒计时）
        │   ├── AIAssistantPage.tsx # AI 助手聊天
        │   ├── AIConfigPage.tsx    # AI 配置管理
        │   ├── UserManagePage.tsx  # 用户管理（含风控设置）
        │   ├── AuditLogPage.tsx    # 审计日志
        │   ├── RegistrationManagePage.tsx  # 注册管理
        │   ├── ProfilePage.tsx     # 个人中心
        │   ├── TimelinePage.tsx / ProductListPage.tsx / ComparePage.tsx ...
        ├── components/             # 雷达图 / 生长曲线 / 疫苗日历等
        ├── api/                    # axios 客户端 + 领域 API
        ├── store/                  # zustand 状态管理
        └── types/                  # 全局类型定义
```

## 数据模型（15 张核心表）

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
| HealthRecord | 健康记录（产检/体重/身高/头围） |
| UserFavorite | 商品收藏 |
| Notification | 站内通知 |
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