import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bot, ChevronDown, ChevronUp, Plus, Settings, Trash2 } from "lucide-react";
import { authApi } from "@/api/auth";
import type { AIConfigItem } from "@/api/auth";

export default function AIConfigPage() {
  const navigate = useNavigate();
  const [aiConfigs, setAIConfigs] = useState<AIConfigItem[]>([]);
  const [aiHasGlobalKey, setAIHasGlobalKey] = useState(false);
  const [aiCanManage, setAICanManage] = useState(false);
  const [aiSaving, setAISaving] = useState(false);
  const [aiSaved, setAISaved] = useState(false);
  const [authUsers, setAuthUsers] = useState<Array<{ id: number; phone: string; nickname: string; is_staff: boolean; ai_authorized: boolean }>>([]);

  useEffect(() => {
    authApi.aiConfig().then((data) => {
      setAIConfigs(data.ai_configs || []);
      setAIHasGlobalKey(data.has_global_key);
      setAICanManage(data.can_manage);
      if (data.can_manage) {
        authApi.aiAuthList().then(setAuthUsers).catch(() => setAuthUsers([]));
      }
    }).catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* 顶部栏 */}
      <div className="flex items-center gap-3">
        <button className="rounded-xl bg-white p-2 shadow-sm hover:shadow-md" onClick={() => navigate("/profile")}>
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </button>
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-brand-500" />
          <h1 className="text-lg font-bold text-gray-800">AI 助手配置</h1>
        </div>
      </div>

      <section className="card">
        <p className="mb-4 text-sm text-gray-400">
          支持配置多个 AI，按顺序尝试调用——如果第一个配置失败会自动尝试下一个，全部失败后回退本地知识模式。
          {aiHasGlobalKey && <span className="ml-1 text-brand-500">（当前已有全局配置可用）</span>}
        </p>

        {/* 多配置列表 */}
        <div className="space-y-4">
          {aiConfigs.map((cfg, idx) => (
            <div key={idx} className={`rounded-xl border p-4 ${cfg.enabled ? "border-brand-200 bg-cream" : "border-gray-200 bg-gray-50 opacity-70"}`}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-xs font-bold text-white">{idx + 1}</span>
                  <input
                    className="input flex-1 text-sm font-medium"
                    placeholder="配置名称"
                    value={cfg.name}
                    onChange={(e) => setAIConfigs((prev) => prev.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-500 disabled:opacity-30"
                    disabled={idx === 0}
                    onClick={() => setAIConfigs((prev) => {
                      const arr = [...prev];
                      [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                      return arr;
                    })}
                    title="上移"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-500 disabled:opacity-30"
                    disabled={idx === aiConfigs.length - 1}
                    onClick={() => setAIConfigs((prev) => {
                      const arr = [...prev];
                      [arr[idx + 1], arr[idx]] = [arr[idx], arr[idx + 1]];
                      return arr;
                    })}
                    title="下移"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    className={`rounded-full px-2.5 py-1 text-xs transition ${
                      cfg.enabled ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-500"
                    }`}
                    onClick={() => setAIConfigs((prev) => prev.map((c, i) => i === idx ? { ...c, enabled: !c.enabled } : c))}
                  >
                    {cfg.enabled ? "已启用" : "已禁用"}
                  </button>
                  <button
                    className="rounded-lg p-1.5 text-red-400 hover:bg-red-50"
                    onClick={() => setAIConfigs((prev) => prev.filter((_, i) => i !== idx))}
                    title="删除此配置"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="label">API Key</label>
                  <input
                    className="input"
                    type="password"
                    placeholder="sk-..."
                    value={cfg.api_key}
                    onChange={(e) => setAIConfigs((prev) => prev.map((c, i) => i === idx ? { ...c, api_key: e.target.value } : c))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label">Base URL</label>
                    <input
                      className="input"
                      placeholder="https://api.openai.com/v1"
                      value={cfg.base_url}
                      onChange={(e) => setAIConfigs((prev) => prev.map((c, i) => i === idx ? { ...c, base_url: e.target.value } : c))}
                    />
                  </div>
                  <div>
                    <label className="label">模型名称</label>
                    <input
                      className="input"
                      placeholder="gpt-4o-mini"
                      value={cfg.model}
                      onChange={(e) => setAIConfigs((prev) => prev.map((c, i) => i === idx ? { ...c, model: e.target.value } : c))}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* 添加新配置按钮 */}
          <button
            className="w-full rounded-xl border-2 border-dashed border-brand-200 py-3 text-sm text-brand-500 hover:bg-brand-50"
            onClick={() => setAIConfigs((prev) => [...prev, { name: `配置 ${prev.length + 1}`, api_key: "", base_url: "", model: "", enabled: true }])}
          >
            <Plus className="mr-1 inline h-4 w-4" /> 添加 AI 配置
          </button>

          {/* 保存按钮 */}
          <button
            className="btn-primary w-full"
            disabled={aiSaving}
            onClick={async () => {
              setAISaving(true);
              setAISaved(false);
              try {
                const data = await authApi.updateAIConfig({ ai_configs: aiConfigs });
                setAIConfigs(data.ai_configs || []);
                setAISaved(true);
                setTimeout(() => setAISaved(false), 2000);
              } catch {
                /* ignore */
              } finally {
                setAISaving(false);
              }
            }}
          >
            {aiSaving ? "保存中…" : "保存 AI 配置"}
          </button>
          {aiSaved && (
            <p className="rounded-xl bg-green-50 p-2 text-center text-sm text-green-600">AI 配置已保存</p>
          )}
        </div>
      </section>

      {/* 管理员授权管理面板 */}
      {aiCanManage && authUsers.length > 0 && (
        <section className="card">
          <div className="mb-3 flex items-center gap-2">
            <Settings className="h-5 w-5 text-brand-500" />
            <h2 className="font-semibold text-gray-800">AI 授权管理</h2>
          </div>
          <p className="mb-3 text-xs text-gray-400">
            勾选允许使用 AI 的用户。被授权用户在未配置自己的 API Key 时，可共享管理员的 AI 配置。
          </p>
          <div className="space-y-2">
            {authUsers.map((au) => (
              <div key={au.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                <div>
                  <span className="text-sm font-medium text-gray-700">{au.nickname || au.phone}</span>
                  {au.is_staff && <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-600">管理员</span>}
                </div>
                <button
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    au.ai_authorized || au.is_staff
                      ? "bg-green-100 text-green-600"
                      : "bg-gray-100 text-gray-500"
                  }`}
                  disabled={au.is_staff}
                  onClick={async () => {
                    try {
                      await authApi.aiAuthToggle(au.id, !au.ai_authorized);
                      setAuthUsers((prev) => prev.map((u) => u.id === au.id ? { ...u, ai_authorized: !u.ai_authorized } : u));
                    } catch { /* ignore */ }
                  }}
                >
                  {au.is_staff ? "默认可用" : au.ai_authorized ? "已授权" : "未授权"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
