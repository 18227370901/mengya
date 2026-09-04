import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { shoppingApi } from "@/api/services";
import type { ShoppingList } from "@/types";

export default function ShoppingListDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [list, setList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);
  const [toggleError, setToggleError] = useState("");

  const load = () => {
    if (!id) return;
    setLoading(true);
    shoppingApi
      .detail(Number(id))
      .then(setList)
      .catch(() => setList(null))
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const toggle = async (itemId: number) => {
    setToggling(itemId);
    setToggleError("");
    try {
      await shoppingApi.toggleCheck(Number(id), itemId);
      load();
    } catch (e) {
      setToggleError((e as Error).message || "操作失败，请稍后重试");
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return <p className="py-10 text-center text-gray-400">加载中…</p>;
  }

  if (!list) {
    return (
      <div className="card py-12 text-center">
        <p className="text-gray-500">待产包不存在或已被删除</p>
        <button className="btn-secondary mt-4" onClick={() => navigate("/shopping-list")}>
          返回列表
        </button>
      </div>
    );
  }

  const categories: Record<string, ShoppingList["items"]> = {};
  for (const item of list.items || []) {
    const key = item.product?.first_category_label || item.product?.first_category || "其他";
    (categories[key] = categories[key] || []).push(item);
  }

  return (
    <div className="space-y-5">
      <button className="flex items-center gap-1 text-sm text-gray-400 hover:text-brand-500" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" /> 返回
      </button>

      {/* 头部进度 */}
      <section className="card bg-gradient-to-r from-brand-500 to-orange-400 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{list.name}</h1>
            <p className="mt-1 text-sm opacity-90">
              {list.season} · {list.delivery_method}
            </p>
          </div>
          <CheckCircle2 className="h-10 w-10 opacity-60" />
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-sm">
            <span>已备选 {list.prepared_count}/{list.total_items} 件</span>
            <span>{list.progress_percent}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/25">
            <div
              className="h-full rounded-full bg-white transition-all"
              style={{ width: `${list.progress_percent}%` }}
            />
          </div>
        </div>
      </section>

      {toggleError && (
        <div className="flex items-center justify-between rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
          <span>{toggleError}</span>
          <button className="text-red-400 hover:text-red-600" onClick={() => setToggleError("")}>×</button>
        </div>
      )}

      {/* 分类勾选列表 */}
      {Object.keys(categories).length === 0 ? (
        <div className="card py-12 text-center">
          <p className="text-gray-400">清单暂无物品</p>
        </div>
      ) : (
        <>
      {Object.entries(categories).map(([cat, items]) => (
        <section key={cat} className="card">
          <h2 className="mb-3 font-semibold text-gray-800">{cat}</h2>
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className={`flex items-center gap-3 rounded-xl border p-3 transition ${
                  item.is_checked ? "border-green-100 bg-green-50/50" : "border-gray-100"
                }`}
              >
                <button
                  className="shrink-0"
                  onClick={() => toggle(item.id)}
                  disabled={toggling === item.id}
                  aria-label={item.is_checked ? "取消勾选" : "勾选已准备"}
                >
                  {item.is_checked ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  ) : (
                    <Circle className="h-6 w-6 text-gray-300 hover:text-brand-400" />
                  )}
                </button>
                {item.product?.image_url && (
                  <img src={item.product.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={`font-medium ${item.is_checked ? "text-gray-400 line-through" : "text-gray-700"}`}>
                    {item.product?.name || item.custom_name}
                  </p>
                  {item.product?.brand && <p className="text-xs text-gray-400">{item.product.brand}</p>}
                  {item.note && <p className="mt-0.5 text-xs text-brand-500">{item.note}</p>}
                </div>
                <span className="shrink-0 text-sm text-gray-500">
                  {item.quantity_prepared ?? 0}/{item.quantity} {item.unit || "件"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
        </>
      )}

      {list.note && (
        <p className="rounded-xl bg-cream p-3 text-sm text-gray-500">
          温馨提示：{list.note}
        </p>
      )}
      <p className="text-center text-xs text-gray-300">
        本品类建议来自母婴专家共识，具体以个人情况与医生建议为准
      </p>
    </div>
  );
}