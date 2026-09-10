import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, Loader2, Package, ShoppingBag, Trash2 } from "lucide-react";
import api from "@/api/client";
import type { ApiResponse } from "@/types";

interface FavoriteItem {
  id: number;
  favorite_type: string;
  object_id: number;
  note: string;
  created_at: string;
}

const TYPE_META: Record<string, { label: string; icon: typeof Heart; color: string; link: (id: number) => string }> = {
  product: { label: "商品", icon: Package, color: "bg-brand-50 text-brand-500", link: (id) => `/products/${id}` },
  timeline: { label: "内容", icon: Heart, color: "bg-pink-50 text-pink-500", link: (id) => `/timeline/${id}` },
  shopping_list: { label: "清单", icon: ShoppingBag, color: "bg-green-50 text-green-500", link: (id) => `/shopping-list/${id}` },
  comparison: { label: "对比", icon: Package, color: "bg-amber-50 text-amber-500", link: () => `/compare` },
};

export default function FavoritePage() {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const [toast, setToast] = useState("");
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const load = () => {
    setLoading(true);
    api.get<ApiResponse<FavoriteItem[]>>("/favorites/")
      .then((r) => setFavorites(r.data.data))
      .catch(() => setFavorites([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const remove = async (id: number) => {
    if (!window.confirm("确认取消收藏？")) return;
    try {
      await api.delete(`/favorites/${id}/`);
      setFavorites((prev) => prev.filter((f) => f.id !== id));
      showToast("已取消收藏");
    } catch {
      showToast("操作失败");
    }
  };

  const filtered = filter ? favorites.filter((f) => f.favorite_type === filter) : favorites;
  const types = Array.from(new Set(favorites.map((f) => f.favorite_type)));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* 标题 */}
      <div className="flex items-center gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-pink-400 to-orange-400 p-2.5 text-white">
          <Heart className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-800">我的收藏</h1>
          <p className="text-xs text-gray-400">商品 · 内容 · 清单 · 对比</p>
        </div>
      </div>

      {/* 类型筛选 */}
      {types.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            className={`rounded-xl px-3 py-1.5 text-sm transition ${!filter ? "bg-brand-500 text-white" : "bg-white text-gray-500 hover:bg-brand-50"}`}
            onClick={() => setFilter("")}
          >
            全部 ({favorites.length})
          </button>
          {types.map((t) => {
            const meta = TYPE_META[t] || { label: t, color: "bg-gray-100 text-gray-500" };
            return (
              <button
                key={t}
                className={`rounded-xl px-3 py-1.5 text-sm transition ${filter === t ? "bg-brand-500 text-white" : "bg-white text-gray-500 hover:bg-brand-50"}`}
                onClick={() => setFilter(t)}
              >
                {meta.label} ({favorites.filter((f) => f.favorite_type === t).length})
              </button>
            );
          })}
        </div>
      )}

      {/* 收藏列表 */}
      {loading ? (
        <div className="py-16 text-center text-gray-400">
          <Loader2 className="mx-auto h-6 w-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-16 text-center">
          <Heart className="mx-auto h-12 w-12 text-gray-200" />
          <p className="mt-3 text-sm text-gray-400">
            {favorites.length === 0 ? "还没有收藏任何内容" : "该分类暂无收藏"}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((f) => {
            const meta = TYPE_META[f.favorite_type] || TYPE_META.product;
            const Icon = meta.icon;
            return (
              <div key={f.id} className="card group hover:shadow-md transition">
                <div
                  className="flex cursor-pointer items-start gap-3"
                  onClick={() => navigate(meta.link(f.object_id))}
                >
                  <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${meta.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${meta.color}`}>{meta.label}</span>
                    <p className="mt-1.5 font-medium text-gray-700">
                      {f.note || `${meta.label} #${f.object_id}`}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-300">
                      收藏于 {f.created_at?.slice(0, 10)}
                    </p>
                  </div>
                  <button
                    className="flex-shrink-0 rounded-lg p-1.5 text-gray-300 transition hover:bg-red-50 hover:text-red-500"
                    onClick={(e) => { e.stopPropagation(); remove(f.id); }}
                    title="取消收藏"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl bg-gray-800 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
