"""网络搜索服务 - 为 AI 提供实时信息获取能力

当用户询问天气、新闻、最新信息等需要联网的内容时，
先通过 DuckDuckGo 搜索获取摘要，再让 AI 基于搜索结果回答。
"""

import re

try:
    from ddgs import DDGS
    _DDGS_AVAILABLE = True
except ImportError:
    try:
        from duckduckgo_search import DDGS
        _DDGS_AVAILABLE = True
    except ImportError:
        _DDGS_AVAILABLE = False

# 需要联网搜索的关键词模式
_SEARCH_PATTERNS = [
    # 天气
    r"天气|气温|温度|下雨|下雪|台风|雾霾|空气质量",
    # 新闻/时事
    r"新闻|最新|最近|今天.*发生|热点|事件|时事",
    # 实时信息
    r"现在|目前|当前|实时|今天|今日|本月|近期",
    # 搜索/查询
    r"搜一下|搜索|查一下|帮我查|查询|查一下",
    # 价格/汇率/股价
    r"股价|汇率|油价|金价|比特币|加密货币|基金|股票|理财|利率",
    # 人物/事件
    r"是谁|谁.*说|谁.*做|发生了什么",
    # 日期/节日
    r"几号|星期几|节假日|放假|调休|农历|阴历|阳历|节气",
]


def needs_search(query: str) -> bool:
    """判断用户问题是否需要联网搜索"""
    for pattern in _SEARCH_PATTERNS:
        if re.search(pattern, query):
            return True
    return False


def web_search(query: str, max_results: int = 5) -> list:
    """通过 DuckDuckGo 搜索，返回结果列表

    返回格式: [{"title": "...", "body": "...", "href": "..."}]
    """
    if not _DDGS_AVAILABLE:
        return []

    try:
        results = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=max_results):
                results.append({
                    "title": r.get("title", ""),
                    "body": r.get("body", ""),
                    "href": r.get("href", ""),
                })
        return results
    except Exception:
        return []


def search_and_summarize(query: str, max_results: int = 5) -> str:
    """搜索并返回格式化的摘要文本，用于注入 AI prompt

    返回空字符串表示搜索失败或无结果。
    """
    results = web_search(query, max_results=max_results)
    if not results:
        return ""

    lines = [f"以下是关于「{query}」的网络搜索结果，请基于这些信息回答用户：\n"]
    for i, r in enumerate(results, 1):
        title = r["title"][:100]
        body = r["body"][:200]
        lines.append(f"{i}. 【{title}】\n   {body}\n")
    return "\n".join(lines)
