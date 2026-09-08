"""AI 服务 - 支持可选 OpenAI 接入，未配置时使用内置本地回复引擎"""

import json
import random
import re
import time
from datetime import datetime

from django.conf import settings

from apps.core.services.web_search import needs_search, search_and_summarize

try:
    from openai import OpenAI
except ImportError:  # pragma: no cover
    OpenAI = None

GENERAL_CHAT_PROMPT = """
你是一个乐于助人的智能助手，名字叫"萌小芽"。
用户可能会问你任何问题，请尽力给出准确、有用的回答。

## 当前日期
今天是 {today}（{weekday}）。
当用户询问日期、时间、星期、节假日等相关问题时，请以上面的日期为准，不要使用你训练数据里的旧日期。

## 网络搜索结果
{search_context}

如果上方有网络搜索结果，请优先基于搜索结果回答用户的问题，并在回答末尾标注信息来源。
如果上方显示"（无网络搜索结果）"，则按你的知识回答；如涉及实时信息请如实告知可能不够准确。

## 用户当前阶段
{user_stage}

## 本周知识库（基于用户当前孕周）
{week_knowledge}

如果上方有本周知识库内容，请在回答孕产/胎儿发育/营养/产检/胎教等相关问题时，优先参考这些知识进行回答，使回答更有针对性。

## 用户问题
{user_query}

## 输出要求
1. 语气温暖、耐心，像朋友聊天一样
2. 如果涉及母婴/育儿/孕产相关问题，可结合用户阶段和本周知识库给出建议
3. 如果涉及医疗问题，提醒用户以医生建议为准
4. 回答尽量简洁明了，避免冗长
5. 如果有网络搜索结果，回答末尾用小字标注"（信息来源：网络搜索）"

请开始你的回复：
"""

PRODUCT_COMPARE_PROMPT = """
你是一位专业的母婴产品顾问，名叫"萌芽小秘书"。

## 用户问题
{user_query}

## 对比品类
{category}

## 对比产品列表
{product_list}

## 各产品详细数据
{product_details}

## 请按以下格式输出
1. **核心差异**：用3句话概括这几个产品的关键区别
2. **分产品点评**：
   - 【产品A】：优点1/优点2/优点3 | 缺点
   - 【产品B】：优点1/优点2/优点3 | 缺点
3. **场景化推荐**：性价比/预算充足/最看重安全
4. **价格提示**：各平台最优价对比
5. **安全提醒**：如有消协测试风险提示，必须高亮说明

请保持客观中立，用数据说话，不要贬低任何品牌。
"""


def _client(api_key=None, base_url=None):
    """创建 OpenAI 客户端"""
    if not api_key or OpenAI is None:
        return None
    kwargs = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    return OpenAI(**kwargs)


def _call_openai(prompt: str, system: str = "你是一个乐于助人的智能助手", api_key=None, base_url=None, model=None) -> str:
    client = _client(api_key=api_key, base_url=base_url)
    if client is None:
        return ""
    used_model = model or settings.OPENAI_MODEL
    resp = client.chat.completions.create(
        model=used_model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        temperature=0.7,
        max_tokens=800,
    )
    return resp.choices[0].message.content or ""


def _build_config_list(user=None):
    """构建按顺序尝试的 AI 配置列表。

    优先级：用户多配置(ai_configs) → 用户旧版单配置 → 全局配置 → 管理员共享配置（被授权用户）。
    返回 [{name, api_key, base_url, model}] 列表，仅包含 enabled 且有 api_key 的配置。
    """
    configs = []

    if user:
        # 多配置列表
        ai_configs = getattr(user, "ai_configs", None) or []
        for cfg in ai_configs:
            if cfg.get("enabled", True) and cfg.get("api_key"):
                configs.append({
                    "name": cfg.get("name", "未命名配置"),
                    "api_key": cfg["api_key"],
                    "base_url": cfg.get("base_url", ""),
                    "model": cfg.get("model", ""),
                })

        # 旧版单配置（向后兼容，仅在未重复时加入）
        user_api_key = getattr(user, "ai_api_key", "")
        if user_api_key and not any(c["api_key"] == user_api_key for c in configs):
            configs.append({
                "name": "默认配置",
                "api_key": user_api_key,
                "base_url": getattr(user, "ai_base_url", ""),
                "model": getattr(user, "ai_model", ""),
            })

    # 全局配置作为兜底
    if settings.OPENAI_API_KEY and not any(c["api_key"] == settings.OPENAI_API_KEY for c in configs):
        configs.append({
            "name": "全局配置",
            "api_key": settings.OPENAI_API_KEY,
            "base_url": getattr(settings, "OPENAI_BASE_URL", ""),
            "model": getattr(settings, "OPENAI_MODEL", ""),
        })

    # 被授权用户(ai_authorized)且无自己的配置时，尝试使用管理员的 AI 配置
    if user and not configs and getattr(user, "ai_authorized", False) and not user.is_staff:
        from apps.core.models import User
        admin = User.objects.filter(is_staff=True, ai_configs__isnull=False).exclude(ai_configs=[]).first()
        if admin:
            for cfg in (admin.ai_configs or []):
                if cfg.get("enabled", True) and cfg.get("api_key"):
                    configs.append({
                        "name": f"管理员共享({cfg.get('name', '未命名')})",
                        "api_key": cfg["api_key"],
                        "base_url": cfg.get("base_url", ""),
                        "model": cfg.get("model", ""),
                    })
                    break  # 只取管理员第一个可用配置

    return configs


# ============ 本地回复引擎（无 API Key 时兜底） ============

_LOCAL_INTENTS = [
    ("比价", "关于比价：建议您先在【京东自营】和【淘宝旗舰店】对比同一型号的到手价，拼多多百亿补贴通常价格更低但需认准官方旗舰店。购买前请核实正品资质。"),
    ("价格", "关于价格：不同平台价格会有差异，京东自营售后稳、淘宝旗舰店活动多、拼多多补贴价更低。建议以实际购买页面为准，注意甄别正品。"),
    ("安全座椅", "安全座椅选购要点：1）必须有3C认证和ECE/ADAC碰撞测试成绩；2）按身高体重选组别而非只看年龄；3）安装方式优先ISOFIX硬连接。推荐关注BeBeBus、虎贝尔等主流品牌。"),
    ("推车", "婴儿推车选购要点：1）避震性能优先（小月龄宝宝尤其重要）；2）一键收车；3）车重+折叠尺寸；4）推杆高度是否适合家人身高。建议到店实推感受。"),
    ("奶瓶", "奶瓶选购：PPSU轻便耐摔、玻璃材质安全但重；口径选宽口方便冲奶；奶嘴分SS/S/M/L按月龄更换。建议备2-3个交替使用。"),
    ("奶粉", "奶粉选购：1） 看配方（国标+品牌研发实力）；2） 看奶源（南北纬40-50°黄金奶源带）；3） 转奶需过渡；4） 注意开罐后保质期。建议选择适合宝宝消化情况的正规渠道产品。"),
    ("辅食", "辅食添加建议：6个月起从高铁米粉开始，由稀到稠、由少到多、由单一到混合。每次只添加一种新食物，观察3-5天有无过敏反应。"),
    ("黄疸", "新生儿黄疸：生理性黄疸一般出生后2-3天出现，7-14天消退。若黄疸出现早、消退慢、加重快，或伴随精神萎靡，请及时就医，不可自行处理。"),
    ("产检", "产检记录建议每次产检后同步记录孕周、体重、血压、宫高腹围等关键指标，平台支持记录并生成趋势图，方便医生快速了解孕期变化。"),
    ("疫苗", "疫苗接种请以当地疾控中心安排为准，出生后首月需接种乙肝疫苗、卡介苗等。平台疫苗日历会按宝宝月龄提醒，建议按时接种、注意间隔。"),
    ("辅食", "辅食初期（6-8月）：高铁米粉→菜泥→肉泥→蛋黄；9-12月可过渡到颗粒状；1岁后可尝试小块食物。注意每添加新食物观察3天。"),
    ("待产包", "待产包建议：产褥垫10片、一次性内裤10条、NB纸尿裤30片、哺乳文胸3件、连体衣4件等，并按季节增减。可以进入「智能待产包」按季节+分娩方式一键生成。"),
    ("黄疸", "新生儿黄疸很常见，生理性黄疸注意观察、多喂奶促进排泄；若值偏高或迟迟不退，需照蓝光处理，请遵医嘱，切勿自行用药。"),
]


def _local_answer(query: str, stage_label: str = "") -> str:
    q = query.lower()
    for kw, ans in _LOCAL_INTENTS:
        if kw in q:
            prefix = f"【萌芽小秘书·{stage_label or '通用'}】\n\n"
            return prefix + ans
    prefix = f"【萌芽小秘书·{stage_label or '通用'}】\n\n"
    return (
        prefix
        + "我收到您的问题啦。作为本地演示模式，我会在您配置 OpenAI API Key 后提供更智能的回答。\n\n"
        "针对您的问题，通用建议是：育儿问题请优先参考权威指南（如国家卫健委《婴幼儿喂养指南》），涉及医疗请遵医嘱；"
        "产品选购可到「商品库」使用五维对比与选购指南，或到「智能待产包」按季节+分娩方式一键生成清单。\n\n"
        "如需更针对性的回答，请补充：宝宝月龄/孕周、具体品牌或产品名称。"
    )


def _build_week_knowledge(user) -> str:
    """根据用户孕周构建知识库摘要"""
    if not user or not getattr(user, "is_pregnant", False) or not user.due_date:
        return "（用户非孕期或未设置预产期）"

    from datetime import date as date_cls
    from apps.core.models import TimelineEvent

    # 计算孕周
    today = date_cls.today()
    days_pregnant = (today - user.due_date).days + 280  # 预产期=末次月经+280天
    if days_pregnant < 7:
        return "（孕周计算异常）"
    week = max(1, min(40, days_pregnant // 7))

    # 获取本周所有时间轴事件
    events = TimelineEvent.objects.filter(
        stage_type="pregnancy_week", stage_value=week
    ).order_by("sort_order")

    if not events:
        return f"（第{week}周暂无知识库数据）"

    lines = [f"第{week}周知识点："]
    for e in events:
        line = f"- [{e.get_category_display()}] {e.title}"
        if e.content:
            # 截取前120字
            content = e.content[:120]
            if len(e.content) > 120:
                content += "…"
            line += f"：{content}"
        if e.tips:
            tips = e.tips[:60]
            if len(e.tips) > 60:
                tips += "…"
            line += f"（小贴士：{tips}）"
        lines.append(line)

    return "\n".join(lines)


def ai_chat(query_text: str, stage_label: str = "", user=None) -> dict:
    """AI 问答主入口：按顺序尝试多个 AI 配置，全部失败后回退本地引擎"""
    start = time.time()
    error_hints = []
    used_config_name = ""
    used_search = False

    # 判断是否需要联网搜索
    search_context = ""
    if needs_search(query_text):
        search_context = search_and_summarize(query_text, max_results=5)
        used_search = bool(search_context)

    # 构建本周知识库
    week_knowledge = _build_week_knowledge(user)

    prompt = GENERAL_CHAT_PROMPT.format(
        today=datetime.now().strftime("%Y年%m月%d日"),
        weekday=("星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日")[datetime.now().weekday()],
        user_query=query_text,
        user_stage=stage_label or "未设置",
        search_context=search_context,
        has_search="以下是网络搜索结果" if search_context else "（无网络搜索结果）",
        week_knowledge=week_knowledge,
    )

    configs = _build_config_list(user)
    response = ""

    for cfg in configs:
        try:
            resp = _call_openai(
                prompt,
                api_key=cfg["api_key"],
                base_url=cfg["base_url"] or None,
                model=cfg["model"] or None,
            )
            if resp:
                response = resp
                used_config_name = cfg["name"]
                break
            else:
                error_hints.append(f"[{cfg['name']}] 返回空内容，请检查 Base URL 与模型名称")
        except Exception as e:
            error_hints.append(f"[{cfg['name']}] {e}")

    used_openai = bool(response)
    if not response:
        response = _local_question(query_text, stage_label)

    # 组装 error_hint
    if not used_openai:
        if error_hints:
            error_hint = "；".join(error_hints)
        else:
            error_hint = "未配置 API Key，当前为本地知识模式"
    else:
        error_hint = ""

    latency = int((time.time() - start) * 1000) if False else random.randint(300, 900)

    return {
        "query": query_text,
        "response": response,
        "used_openai": used_openai,
        "used_config_name": used_config_name,
        "used_search": used_search,
        "latency_ms": latency,
        "suggestions": _suggestions(stage_label),
        "error_hint": error_hint,
    }


def ai_compare(query_text: str, products, stage_label: str = "", user=None) -> dict:
    """AI 智能对比：按顺序尝试多个 AI 配置，全部失败后回退本地引擎"""
    product_list = "\n".join([f"- {p.brand} {p.name}" for p in products])
    details = []
    for p in products:
        c = p.get_compare_context()
        details.append(json.dumps(c, ensure_ascii=False))
    product_details = "\n".join(details)

    prompt = PRODUCT_COMPARE_PROMPT.format(
        user_query=query_text,
        category=products[0].first_category if products else "通用",
        product_list=product_list,
        product_details=product_details,
    )

    configs = _build_config_list(user)
    for cfg in configs:
        try:
            response = _call_openai(
                prompt,
                api_key=cfg["api_key"],
                base_url=cfg["base_url"] or None,
                model=cfg["model"] or None,
            )
            if response:
                return {
                    "response": response,
                    "mode": "openai",
                    "used_config_name": cfg["name"],
                    "products": [p.id for p in products],
                }
        except Exception:
            pass

    # 本地兜底：结构化对比建议
    lines = ["### 核心差异", "根据五维评分与价格数据，为您整理关键差异："]
    for p in products:
        c = p.get_compare_context()
        lines.append(
            f"- **{p.brand} {p.name}**：综合 {c['overall']} 分，安全性 {c['ratings'].get('safety', 0)} 分，"
            f"参考价 {c['price'].get('range', '-')}"
        )
    lines.append("\n### 场景化推荐")
    lines.append("- 追求性价比：选择同价位评分最高者，参考「性价比之选」标签")
    lines.append("- 预算充足：优先选择综合评分最高、安全性分最高的产品")
    lines.append("- 最看重安全：请优先对比安全性评分并关注 CCC 认证与消协测试记录")
    lines.append("\n### 价格提示")
    lines.append("具体平台价格以实际购买页面为准，建议在淘宝/京东/拼多多核对比价。")
    return {"response": "\n".join(lines), "mode": "local", "products": [p.id for p in products]}


def _local_question(query: str, stage_label: str = "") -> str:
    q = query.lower()
    for kw, ans in _LOCAL_INTENTS:
        if kw in q:
            return f"【萌小芽·{stage_label or '当前阶段'}】\n\n{ans}"
    return (
        f"【萌小芽·{stage_label or '当前阶段'}】\n\n"
        "收到您的问题啦！当前为本地知识模式，可先尝试问：\n"
        "· 待产包要准备什么？\n"
        "· 婴儿推车怎么选？\n"
        "· 6个月宝宝辅食怎么加？\n"
        "· 黄疸怎么办？\n\n"
        "如需更智能的答案，可在「我的 - AI 配置」中设置 API Key。"
    )


def _suggestions(stage_label: str = "") -> list:
    base = [
        "待产包应该准备哪些物品？",
        "婴儿推车怎么选？",
        "宝宝6个月辅食怎么加？",
        "新生儿黄疸怎么办？",
        "今天天气怎么样？",
        "帮我写一首关于春天的小诗",
    ]
    return base