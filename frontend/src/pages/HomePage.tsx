import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Bot,
  PackageSearch,
  Sprout,
} from "lucide-react";
import { productApi, timelineApi } from "@/api/catalog";
import { useAuthStore } from "@/store/authStore";
import type { Product, TimelineItem } from "@/types";
import ProductCard from "@/components/ProductCard";

export default function HomePage() {
  const { user, stage } = useAuthStore();
  const [essentials, setEssentials] = useState<TimelineItem[]>([]);
  const [recommend, setRecommend] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([
      timelineApi.list({ essential: true }).catch(() => [] as TimelineItem[]),
      productApi.list({ sort: "rating" }).catch(() => [] as Product[]),
    ])
      .then(([e, r]) => {
        setEssentials(e);
        setRecommend(r.slice(0, 4));
      })
      .catch(() => setError("数据加载失败，请刷新重试"))
      .finally(() => setLoading(false));
  }, []);

  const quickEntries = [
    { to: "/shopping-list/generate", label: "智能待产包", icon: PackageSearch, desc: "季节+分娩方式自适应" },
    { to: "/health", label: "健康中心", icon: Activity, desc: "产检/生长曲线/疫苗" },
    { to: "/compare", label: "产品对比", icon: ArrowRight, desc: "五维雷达图对比" },
    { to: "/ai-assistant", label: "AI小助手", icon: Bot, desc: "7×24小时问答比价" },
  ];

  if (loading) {
    return <div className="py-20 text-center text-gray-400">加载中…</div>;
  }

  if (error) {
    return (
      <div className="card py-12 text-center">
        <p className="text-red-500">{error}</p>
        <button className="btn-secondary mt-4" onClick={() => window.location.reload()}>
          重新加载
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 顶部欢迎卡 */}
      <section className="rounded-3xl bg-gradient-to-r from-brand-500 to-orange-400 p-6 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm opacity-90">{user?.nickname || "准妈妈"}，你好呀</p>
            <h1 className="mt-1 text-2xl font-bold">{stage?.label || "欢迎来到萌芽"}</h1>
            <p className="mt-1 text-sm opacity-90">
              {stage?.trimester || stage?.period || "从第一次胎动到第一次背书包，我们陪您每一步"}
            </p>
          </div>
          <Sprout className="h-14 w-14 opacity-60" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs">全周期科学指导</span>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs">智能对比</span>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs">动态清单</span>
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs">AI 7×24</span>
        </div>
      </section>

      {/* 快捷入口 */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {quickEntries.map((entry) => (
          <Link key={entry.to} to={entry.to} className="card hover:shadow-md transition">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-brand-50 p-2.5">
                <entry.icon className="h-6 w-6 text-brand-500" />
              </div>
              <div>
                <p className="font-medium text-gray-800">{entry.label}</p>
                <p className="text-xs text-gray-400">{entry.desc}</p>
              </div>
            </div>
          </Link>
        ))}
      </section>

      {/* 本周重点 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">本周重点</h2>
          <Link to="/timeline" className="flex items-center text-sm text-brand-500 hover:underline">
            全部时间轴 <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
        {essentials.length === 0 ? (
          <div className="card py-8 text-center text-sm text-gray-400">
            暂无重点内容
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {essentials.slice(0, 3).map((item) => (
              <Link key={item.id} to={`/timeline/${item.id}`} className="card hover:shadow-md transition">
                <div className="mb-2 flex items-center gap-2">
                  <span className="tag">{item.stage_label}</span>
                  <span className="tag">{item.category_label}</span>
                  {item.is_essential && <span className="text-xs text-brand-500">必读</span>}
                </div>
                <h3 className="font-medium text-gray-800">{item.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-gray-500">{item.content}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 推荐商品 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">高分推荐</h2>
          <Link to="/products" className="flex items-center text-sm text-brand-500 hover:underline">
            全部商品 <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
        {recommend.length === 0 ? (
          <div className="card py-8 text-center text-sm text-gray-400">
            暂无推荐商品
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {recommend.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
