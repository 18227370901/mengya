import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Upload } from "lucide-react";
import { timelineApi } from "@/api/catalog";
import { useAuthStore } from "@/store/authStore";
import type { TimelineItem } from "@/types";

const STAGE_TABS = [
  { key: "", label: "全部" },
  { key: "pregnancy", label: "孕期" },
  { key: "baby", label: "0-1岁" },
  { key: "toddler", label: "1-3岁" },
  { key: "preschool", label: "3-6岁" },
];

const CATEGORIES = [
  { key: "", label: "全部" },
  { key: "food", label: "饮食" },
  { key: "clothing", label: "穿衣" },
  { key: "housing", label: "居家" },
  { key: "travel", label: "出行" },
  { key: "health", label: "健康" },
  { key: "shopping", label: "购物" },
  { key: "milestone", label: "里程碑" },
  { key: "emotion", label: "心理" },
];

export default function TimelinePage() {
  const { user } = useAuthStore();
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [stage, setStage] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  useEffect(() => {
    setLoading(true);
    timelineApi
      .list({ stage: stage || undefined, category: category || undefined })
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [stage, category]);

  const handleExport = async () => {
    try {
      const blob = await timelineApi.exportCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "timeline_export.csv";
      a.click();
      URL.revokeObjectURL(url);
      showToast("导出成功");
    } catch { showToast("导出失败"); }
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const res = await timelineApi.importCsv(file);
      showToast(res.message || `导入完成：成功 ${res.data.created} 条`);
      setLoading(true);
      timelineApi.list({ stage: stage || undefined, category: category || undefined })
        .then(setItems).catch(() => setItems([])).finally(() => setLoading(false));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "导入失败");
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await timelineApi.importTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "timeline_import_template.csv";
      a.click();
      URL.revokeObjectURL(url);
      showToast("模板已下载");
    } catch { showToast("下载失败"); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">时间轴知识库</h1>
        <p className="mt-1 text-sm text-gray-400">按孕周/月龄精准推送的科学内容</p>
      </div>
      {user?.is_staff && (
        <div className="flex gap-2">
          <button
            className="flex items-center gap-1 rounded-lg bg-green-50 px-3 py-1.5 text-xs text-green-600 hover:bg-green-100"
            onClick={handleExport}
          >
            <Download className="h-3.5 w-3.5" /> 导出
          </button>
          <button
            className="flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-100"
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
          >
            <Upload className="h-3.5 w-3.5" /> {importing ? "导入中…" : "导入"}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); }}
          />
          <button
            className="flex items-center gap-1 rounded-lg bg-gray-50 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
            onClick={handleDownloadTemplate}
          >
            <Download className="h-3.5 w-3.5" /> 模板
          </button>
        </div>
      )}

      {/* 筛选栏 */}
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="flex flex-1 items-center gap-2">
          <label className="label mb-0 whitespace-nowrap">阶段</label>
          <select className="input flex-1" value={stage} onChange={(e) => setStage(e.target.value)}>
            {STAGE_TABS.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 items-center gap-2">
          <label className="label mb-0 whitespace-nowrap">分类</label>
          <select className="input flex-1" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 卡片列表 */}
      {loading ? (
        <p className="py-10 text-center text-gray-400">加载中…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Link key={item.id} to={`/timeline/${item.id}`} className="card hover:shadow-md transition">
              <div className="mb-2 flex items-center gap-2">
                <span className="tag">{item.stage_label} {item.stage_value}</span>
                <span className="tag">{item.category_label}</span>
              </div>
              <h3 className="font-medium text-gray-800">{item.title}</h3>
              {item.subtitle && <p className="mt-0.5 text-xs text-brand-400">{item.subtitle}</p>}
              <p className="mt-2 line-clamp-2 text-sm text-gray-500">{item.content}</p>
              {item.is_essential && (
                <span className="mt-2 inline-block rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-500">必读重点</span>
              )}
            </Link>
          ))}
          {!loading && items.length === 0 && (
            <p className="col-span-full py-10 text-center text-gray-400">该阶段暂无内容</p>
          )}
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