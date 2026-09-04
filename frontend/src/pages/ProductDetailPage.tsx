import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ShieldCheck, Star } from "lucide-react";
import { productApi } from "@/api/catalog";
import type { Product } from "@/types";

export default function ProductDetailPage() {
  const { id } = useParams();
  const [product, setProduct] = useState<Product | null>(null);

  useEffect(() => {
    if (id) productApi.detail(Number(id)).then(setProduct).catch(() => {});
  }, [id]);

  if (!product) return <div className="py-20 text-center text-gray-400">加载中…</div>;

  const ratings = product.ratings ?? {};
  const dims = [
    { key: "safety", label: "安全性" },
    { key: "comfort", label: "舒适性" },
    { key: "functionality", label: "功能性" },
    { key: "usability", label: "易用性" },
    { key: "appearance", label: "美观性" },
  ] as const;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to="/products" className="flex items-center text-sm text-brand-500 hover:underline">
        <ArrowLeft className="mr-1 h-4 w-4" /> 返回商品库
      </Link>

      <div className="card grid gap-6 md:grid-cols-2">
        <div className="overflow-hidden rounded-2xl bg-warm">
          <img
            src={product.image_url || "https://picsum.photos/seed/fallback/600/400"}
            alt={product.name}
            className="h-64 w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "https://picsum.photos/seed/fallback/600/400";
            }}
          />
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="tag">{product.first_category_label || product.first_category}</span>
            <span className="tag">{product.second_category}</span>
            {product.has_ccc_certification && (
              <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-600">
                <ShieldCheck className="h-3 w-3" /> CCC认证
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-800">{product.name}</h1>
          <p className="mt-1 text-gray-500">{product.brand}</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="flex items-center gap-1 text-lg font-bold text-brand-500">
              <Star className="h-5 w-5 fill-current" />
              {product.overall_rating?.toFixed(1)}
            </span>
            <span className="text-sm text-gray-400">综合推荐指数</span>
          </div>
          {product.price_info?.range && (
            <p className="mt-2 text-xl font-semibold text-gray-800">
              参考价：{product.price_info.range} 元
              <span className="ml-2 text-sm font-normal text-gray-400">
                {product.price_info.taobao ? `淘宝${product.price_info.taobao} / ` : ""}
                {product.price_info.jd ? `京东${product.price_info.jd} / ` : ""}
                {product.price_info.pdd ? `拼多多${product.price_info.pdd}` : ""}
              </span>
            </p>
          )}

          {/* 五维评分 */}
          <div className="mt-5 space-y-2">
            {dims.map((d) => (
              <div key={d.key} className="flex items-center gap-3 text-sm">
                <span className="w-16 text-gray-500">{d.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-brand-400"
                    style={{ width: `${(ratings[d.key] ?? 0) * 10}%` }}
                  />
                </div>
                <span className="w-8 text-right text-gray-600">{(ratings[d.key] ?? 0).toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 安全提醒 */}
      {product.safety_alert && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600">
          <strong>安全风险提示：</strong>
          {product.safety_alert}
          {product.test_report_source && <span className="mt-1 block text-xs text-red-400">来源：{product.test_report_source}</span>}
        </div>
      )}

      {/* 规格参数 */}
      {product.specifications && Object.keys(product.specifications).length > 0 && (
        <div className="card">
          <h2 className="mb-3 text-lg font-bold text-gray-800">规格参数</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {Object.entries(product.specifications).map(([k, v]) => (
              <div key={k} className="rounded-xl bg-gray-50 p-3">
                <p className="text-xs text-gray-400">{k}</p>
                <p className="mt-0.5 text-sm text-gray-700">{String(v)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 描述与选购指南 */}
      {product.description && (
        <div className="card">
          <h2 className="mb-2 text-lg font-bold text-gray-800">产品描述</h2>
          <p className="whitespace-pre-wrap text-gray-600">{product.description}</p>
        </div>
      )}
      {product.purchase_guide && (
        <div className="card">
          <h2 className="mb-2 text-lg font-bold text-gray-800">选购指南</h2>
          <p className="whitespace-pre-wrap text-gray-600">{product.purchase_guide}</p>
        </div>
      )}
    </div>
  );
}