import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, SendHorizonal, Sparkles, User } from "lucide-react";
import { aiApi } from "@/api/services";

interface Msg {
  role: "user" | "ai";
  content: string;
}

interface ChatData {
  response: string;
  used_openai?: boolean;
  used_config_name?: string;
  error_hint?: string;
}

const DEFAULT_SUGGESTIONS = [
  "待产包需要准备哪些东西？",
  "孕期每周需要补充什么营养？",
  "婴儿床怎么选更安全？",
  "顺产和剖宫产待产包有什么区别？",
];

export default function AIAssistantPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    aiApi.suggestions().then(setSuggestions).catch(() => {});
    aiApi.history().then((items) => {
      const msgs: Msg[] = [];
      for (const it of items.slice(-10)) {
        msgs.push({ role: "user", content: it.query });
        msgs.push({ role: "ai", content: it.response });
      }
      if (msgs.length) setMessages(msgs);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setLoading(true);
    try {
      const data = await aiApi.chat(q) as ChatData;
      setMessages((prev) => [...prev, { role: "ai", content: data.response }]);
      // 若使用了某个 AI 配置，显示配置名称
      if (data.used_openai && data.used_config_name) {
        setMessages((prev) => [...prev, {
          role: "ai",
          content: `（当前使用 AI 配置：${data.used_config_name}）`,
        }]);
      }
      // 若后端检测到 AI 配置问题，追加提示
      if (data.error_hint) {
        setMessages((prev) => [...prev, {
          role: "ai",
          content: `（提示：${data.error_hint}，如需使用 AI 请到「我的 - AI 助手配置」检查 API Key / Base URL / 模型名称）`,
        }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "ai", content: "抱歉，我暂时无法回答，请稍后再试。" }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col" style={{ height: "calc(100vh - 180px)" }}>
      {/* 头部 */}
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-brand-400 to-orange-400 p-2.5 text-white">
          <Bot className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-800">萌芽 AI 助手</h1>
          <p className="text-xs text-gray-400">孕期 / 育儿 / 比价问答，7×24 小时在线</p>
        </div>
      </div>

      {/* 消息区 */}
      <div className="flex-1 space-y-4 overflow-y-auto rounded-2xl bg-white p-4 shadow-sm">
        {messages.length === 0 && !loading && (
          <div className="py-8 text-center">
            <Sparkles className="mx-auto h-10 w-10 text-brand-200" />
            <p className="mt-3 text-sm text-gray-400">你好呀，我是萌小芽。关于怀孕、育儿、选品，都可以问我～</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  className="rounded-full border border-brand-100 bg-brand-50 px-3 py-1.5 text-xs text-brand-600 hover:bg-brand-100"
                  onClick={() => send(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            {m.role === "ai" && (
              <div className="rounded-xl bg-gradient-to-br from-brand-400 to-orange-400 p-1.5 text-white">
                <Bot className="h-4 w-4" />
              </div>
            )}
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                m.role === "user" ? "rounded-br-sm bg-brand-500 text-white" : "rounded-bl-sm bg-gray-50 text-gray-700"
              }`}
            >
              {m.content}
            </div>
            {m.role === "user" && (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100 text-orange-500">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start gap-2">
            <div className="rounded-xl bg-gradient-to-br from-brand-400 to-orange-400 p-1.5 text-white">
              <Bot className="h-4 w-4" />
            </div>
            <div className="rounded-2xl rounded-bl-sm bg-gray-50 px-4 py-2.5 text-sm text-gray-400">
              <Loader2 className="inline h-4 w-4 animate-spin" /> 思考中…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 输入区 */}
      <div className="mt-3 flex gap-2">
        <input
          className="input flex-1"
          placeholder="输入你的问题…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button className="btn-primary shrink-0 px-4" onClick={() => send()} disabled={loading || !input.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
        </button>
      </div>
      <p className="mt-2 text-center text-xs text-gray-300">
        AI 回答仅供参考，医疗问题请以医生建议为准
      </p>
    </div>
  );
}