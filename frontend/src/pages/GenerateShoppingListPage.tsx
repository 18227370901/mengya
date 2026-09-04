import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { shoppingApi } from "@/api/services";

const SEASONS = [
  { key: "spring", label: "春季", desc: "3-5月 气候温和" },
  { key: "summer", label: "夏季", desc: "6-8月 炎热多汗" },
  { key: "autumn", label: "秋季", desc: "9-11月 凉爽干燥" },
  { key: "winter", label: "冬季", desc: "12-2月 寒冷干燥" },
];

const DELIVERY_METHODS = [
  { key: "vaginal", label: "顺产", desc: "住院3-4天" },
  { key: "c_section", label: "剖宫产", desc: "住院5-7天" },
];

export default function GenerateShoppingListPage() {
  const navigate = useNavigate();
  const [season, setSeason] = useState("");
  const [delivery, setDelivery] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const generate = async () => {
    if (!season || !delivery) {
      setError("请选择季节与分娩方式");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await shoppingApi.generate({
        season,
        delivery_method: delivery,
        name: name || undefined,
      });
      navigate(`/shopping-list/${data.id}`);
    } catch (e) {
      setError((e as Error).message || "生成失败，请稍后重试");
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <button
        className={`flex items-center gap-1 text-sm ${loading ? "pointer-events-none text-gray-300" : "text-gray-400 hover:text-brand-500"}`}
        onClick={() => navigate("/shopping-list")}
      >
        <ArrowLeft className="h-4 w-4" /> 返回
      </button>

      <div>
        <h1 className="text-2xl font-bold text-gray-800">智能待产包</h1>
        <p className="mt-1 text-sm text-gray-400">
          根据季节与分娩方式，结合 14 大类商品库自动生成专属清单
        </p>
      </div>

      {/* 季节选择 */}
      <section className="card">
        <h2 className="mb-3 font-semibold text-gray-800">选择季节</h2>
        <div className="grid grid-cols-2 gap-3">
          {SEASONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSeason(s.key)}
              className={`rounded-xl border p-3 text-left transition ${
                season === s.key ? "border-brand-400 bg-brand-50 ring-1 ring-brand-300" : "border-gray-100 hover:border-brand-200"
              }`}
            >
              <p className="font-medium text-gray-700">{s.label}</p>
              <p className="mt-0.5 text-xs text-gray-400">{s.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* 分娩方式 */}
      <section className="card">
        <h2 className="mb-3 font-semibold text-gray-800">选择分娩方式</h2>
        <div className="grid grid-cols-2 gap-3">
          {DELIVERY_METHODS.map((m) => (
            <button
              key={m.key}
              onClick={() => setDelivery(m.key)}
              className={`rounded-xl border p-3 text-left transition ${
                delivery === m.key ? "border-brand-400 bg-brand-50 ring-1 ring-brand-300" : "border-gray-100 hover:border-brand-200"
              }`}
            >
              <p className="font-medium text-gray-700">{m.label}</p>
              <p className="mt-0.5 text-xs text-gray-400">{m.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* 命名（可选） */}
      <section className="card">
        <label className="label">清单名称（可选）</label>
        <input className="input" placeholder="例如：春季顺产待产包" value={name} onChange={(e) => setName(e.target.value)} />
      </section>

      <button className="btn-primary w-full py-3 text-base" onClick={generate} disabled={loading}>
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
        {loading ? "正在智能生成…" : "一键生成待产包"}
      </button>
      {error && <p className="text-center text-sm text-red-500">{error}</p>}

      <p className="text-center text-xs text-gray-300">
        生成逻辑基于母婴健康共识，供参考，具体以医生建议为准
      </p>
    </div>
  );
}