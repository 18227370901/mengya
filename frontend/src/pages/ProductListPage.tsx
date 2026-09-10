import { useEffect, useRef, useState } from "react";
import { productApi } from "@/api/catalog";
import type { Product } from "@/types";
import ProductCard from "@/components/ProductCard";

const CATEGORIES = [
  { key: "", label: "全部" },
  { key: "food", label: "食品" },
  { key: "feeding", label: "食具" },
  { key: "clothing", label: "服装" },
  { key: "diaper", label: "尿裤" },
  { key: "bedding", label: "寝具" },
  { key: "furniture", label: "家具" },
  { key: "bath", label: "洗护" },
  { key: "health_tool", label: "护理工具" },
  { key: "travel", label: "出行" },
  { key: "toy", label: "早教玩具" },
  { key: "mama_pregnancy", label: "妈妈·孕期" },
  { key: "mama_postpartum", label: "妈妈·产后" },
  { key: "mama_nursing", label: "妈妈·哺乳" },
  { key: "appliance", label: "电子电器" },
];

const SORTS = [
  { key: "", label: "综合" },
  { key: "rating", label: "评分" },
  { key: "price_asc", label: "价格↑" },
  { key: "price_desc", label: "价格↓" },
];

export default function ProductListPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 搜索防抖 300ms
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQ(q), 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [q]);

  useEffect(() => {
    setLoading(true);
    setError("");
    productApi
      .list({ category: category || undefined, sort: sort || undefined, q: debouncedQ || undefined, page: 1, page_size: 50 })
      .then((data) => setProducts(data.items))
      .catch(() => { setProducts([]); setError("加载失败，请稍后重试"); })
      .finally(() => setLoading(false));
  }, [category, sort, debouncedQ]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">商品库</h1>
          <p className="mt-1 text-sm text-gray-400">14 大类 · 真实品牌数据 · 五维评分</p>
        </div>
        <input className="input max-w-xs" placeholder="搜索商品…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="flex flex-1 items-center gap-2">
          <label className="label mb-0 whitespace-nowrap">分类</label>
          <select
            className="input flex-1"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 items-center gap-2">
          <label className="label mb-0 whitespace-nowrap">排序</label>
          <select
            className="input flex-1"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="py-6 text-center text-sm text-red-500">{error}</p>
      )}

      {loading ? (
        <p className="py-10 text-center text-gray-400">加载中…</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
          {!loading && products.length === 0 && !error && (
            <p className="col-span-full py-10 text-center text-gray-400">暂无商品</p>
          )}
        </div>
      )}
    </div>
  );
}
