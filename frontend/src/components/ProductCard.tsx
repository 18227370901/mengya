import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import type { Product } from "@/types";

export default function ProductCard({ product }: { product: Product }) {
  return (
    <Link to={`/products/${product.id}`} className="card group hover:shadow-md transition">
      <div className="relative mb-3 aspect-[4/3] overflow-hidden rounded-xl bg-warm">
        <img
          src={product.image_url || "https://picsum.photos/seed/fallback/400/300"}
          alt={product.name}
          className="h-full w-full object-cover transition group-hover:scale-105"
          loading="lazy"
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            // 防止无限循环：仅在 src 不是 fallback 时才替换
            if (!img.src.includes("picsum.photos/seed/fallback")) {
              img.src = "https://picsum.photos/seed/fallback/400/300";
            }
          }}
        />
        {product.is_essential && (
          <span className="absolute left-2 top-2 rounded-full bg-brand-500 px-2 py-0.5 text-xs text-white">必备</span>
        )}
      </div>
      <h3 className="line-clamp-1 font-medium text-gray-800">{product.name}</h3>
      <p className="mt-0.5 text-sm text-gray-400">{product.brand}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="flex items-center gap-1 text-brand-500">
          <Star className="h-4 w-4 fill-current" />
          {product.overall_rating?.toFixed(1) ?? "-"}
        </span>
        <span className="text-sm font-semibold text-gray-800">
          {product.price_info?.range ? `${product.price_info.range}元` : ""}
        </span>
      </div>
    </Link>
  );
}