import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { shoppingApi } from "@/api/services";
import type { ShoppingList } from "@/types";

export default function ShoppingListPage() {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    shoppingApi
      .list()
      .then(setLists)
      .catch(() => setLists([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const [error, setError] = useState("");

  const remove = async (id: number) => {
    if (!confirm("确认删除这份待产包清单吗？")) return;
    setError("");
    try {
      await shoppingApi.remove(id);
      load();
    } catch (e) {
      setError((e as Error).message || "删除失败，请稍后重试");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">我的待产包</h1>
          <p className="mt-1 text-sm text-gray-400">按季节与分娩方式智能生成，随时勾选进度</p>
        </div>
        <Link to="/shopping-list/generate" className="btn-primary">
          <Plus className="h-4 w-4" /> 智能生成
        </Link>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">
          <span>{error}</span>
          <button className="text-red-400 hover:text-red-600" onClick={() => setError("")}>×</button>
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-gray-400">加载中…</p>
      ) : lists.length === 0 ? (
        <div className="card py-12 text-center">
          <ShoppingBag className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-3 text-gray-500">还没有待产包，去生成一份吧</p>
          <button className="btn-primary mt-4" onClick={() => navigate("/shopping-list/generate")}>
            立即生成
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {lists.map((list) => (
            <div key={list.id} className="card hover:shadow-md transition">
              <Link to={`/shopping-list/${list.id}`}>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-800">{list.name}</h3>
                  <div className="flex gap-1.5">
                    <span className="tag">{list.season}</span>
                    <span className="tag">{list.delivery_method}</span>
                  </div>
                </div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    已备 {list.prepared_count}/{list.total_items} 件
                  </span>
                  <span className="font-semibold text-brand-600">{list.progress_percent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-400 to-orange-400 transition-all"
                    style={{ width: `${list.progress_percent}%` }}
                  />
                </div>
              </Link>
              <div className="mt-3 flex justify-end">
                <button
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-400 hover:text-red-500"
                  onClick={() => remove(list.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> 删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}