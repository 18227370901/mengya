import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarClock, ChevronLeft, ChevronRight, ClipboardList, RefreshCw, Search, Trash2, ShieldAlert } from "lucide-react";
import { auditApi, type AuditLogItem } from "@/api/auth";

const PAGE_SIZE = 20;

export default function AuditLogPage() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [actionLabels, setActionLabels] = useState<Array<[string, string]>>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  // 筛选
  const [actionFilter, setActionFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  // 选择
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // 分页
  const [page, setPage] = useState(1);

  // 保留期限
  const [retentionDays, setRetentionDays] = useState(90);
  const [showRetention, setShowRetention] = useState(false);
  const [retentionSaving, setRetentionSaving] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const load = async () => {
    setLoading(true);
    try {
      const data = await auditApi.list();
      setLogs(data.logs);
      setStats(data.stats);
      setActionLabels(data.action_labels || []);
      setRetentionDays(data.audit_retention_days);
      setPage(1);
    } catch { showToast("加载审计日志失败"); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // 前端筛选（后端已支持，这里简单复用：用内存数据做二次筛选，避免每次请求）
  const filtered = useMemo(() => {
    let list = logs;
    if (actionFilter) list = list.filter((l) => l.action === actionFilter);
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      list = list.filter((l) =>
        (l.username || "").toLowerCase().includes(kw) ||
        (l.target_name || "").toLowerCase().includes(kw) ||
        (l.detail || "").toLowerCase().includes(kw)
      );
    }
    if (dateFilter) list = list.filter((l) => (l.created_at || "").slice(0, 10) === dateFilter);
    return list;
  }, [logs, actionFilter, keyword, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageLogs = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // 全选
  const allSelected = pageLogs.length > 0 && pageLogs.every((l) => selected.has(l.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allSelected) {
      pageLogs.forEach((l) => next.delete(l.id));
    } else {
      pageLogs.forEach((l) => next.add(l.id));
    }
    setSelected(next);
  };
  const toggleOne = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`确认删除选中的 ${selected.size} 条日志？此操作不可恢复。`)) return;
    try {
      const res = await auditApi.deleteIds([...selected]);
      showToast(`已删除 ${res.data?.deleted ?? selected.size} 条日志`);
      setSelected(new Set());
      await load();
    } catch { showToast("删除失败"); }
  };

  const deleteAll = async () => {
    if (!window.confirm("确认清空全部审计日志？此操作不可恢复。")) return;
    try {
      await auditApi.deleteAll();
      showToast("已清空全部审计日志");
      await load();
    } catch { showToast("清空失败"); }
  };

  const saveRetention = async () => {
    if (retentionDays < 0 || retentionDays > 3650) { showToast("保留期限范围为 0-3650 天"); return; }
    setRetentionSaving(true);
    try {
      const res = await auditApi.setRetention(retentionDays);
      setRetentionDays(res.data?.audit_retention_days ?? retentionDays);
      setShowRetention(false);
      showToast("保留期限已更新");
    } catch { showToast("保存失败"); } finally { setRetentionSaving(false); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* 顶部 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button className="rounded-xl bg-white p-2 shadow-sm hover:shadow-md" onClick={() => navigate("/profile")}>
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-brand-500" />
            <h1 className="text-lg font-bold text-gray-800">审计日志</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs text-gray-500 shadow-sm hover:shadow-md"
            onClick={() => setShowRetention((v) => !v)}
          >
            <CalendarClock className="h-3.5 w-3.5" /> 保留期限：{retentionDays === 0 ? "永久" : `${retentionDays}天`}
          </button>
          <button
            className="flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs text-brand-500 hover:bg-brand-100"
            onClick={load}
          >
            <RefreshCw className="h-3.5 w-3.5" /> 刷新
          </button>
        </div>
      </div>

      {/* 保留期限设置 */}
      {showRetention && (
        <section className="card space-y-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-brand-500" />
            <h2 className="font-semibold text-gray-800">审计日志保留期限</h2>
          </div>
          <p className="text-xs text-gray-400">超过保留期限的日志会自动清理；填 0 表示永久保留</p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              max={3650}
              className="input flex-1"
              value={retentionDays}
              onChange={(e) => setRetentionDays(Number(e.target.value))}
            />
            <span className="text-sm text-gray-400">天</span>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={saveRetention} disabled={retentionSaving}>
              {retentionSaving ? "保存中…" : "保存"}
            </button>
            <button className="flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-500"
              onClick={() => setShowRetention(false)}>取消</button>
          </div>
        </section>
      )}

      {/* 筛选栏 */}
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="flex items-center gap-2">
          <label className="label mb-0 whitespace-nowrap">操作类型</label>
          <select className="input" value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}>
            <option value="">全部</option>
            {actionLabels.map(([k, v]) => (
              <option key={k} value={k}>{v}{stats[k] ? `（${stats[k]}）` : ""}</option>
            ))}
          </select>
        </div>
        <div className="flex min-w-[180px] flex-1 items-center gap-2">
          <Search className="h-4 w-4 text-gray-300" />
          <input
            className="input"
            placeholder="搜索账号/操作者/详情"
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
          />
        </div>
        <input type="date" className="input w-auto" value={dateFilter}
          onChange={(e) => { setDateFilter(e.target.value); setPage(1); }} />
        <button
          className="whitespace-nowrap rounded-lg px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
          onClick={() => { setActionFilter(""); setKeyword(""); setDateFilter(""); setPage(1); }}
        >
          重置
        </button>
      </div>

      {/* 批量操作栏 */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>共 {filtered.length} 条</span>
            {selected.size > 0 && <span className="text-brand-500">已选 {selected.size} 条</span>}
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <button
                className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-500 hover:bg-red-100"
                onClick={deleteSelected}
              >
                <Trash2 className="h-3.5 w-3.5" /> 删除所选
              </button>
            )}
            <button
              className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-400 hover:bg-red-100"
              onClick={deleteAll}
            >
              <Trash2 className="h-3.5 w-3.5" /> 清空全部
            </button>
          </div>
        </div>
      )}

      {/* 日志列表 */}
      {loading ? (
        <p className="py-10 text-center text-sm text-gray-400">加载中…</p>
      ) : filtered.length === 0 ? (
        <div className="py-10 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-gray-200" />
          <p className="mt-2 text-sm text-gray-400">暂无审计日志</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* 表头 */}
          <div className="hidden items-center gap-3 rounded-xl bg-gray-50 px-4 py-2 text-xs font-medium text-gray-400 md:flex">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-gray-300" />
            <span className="w-36 flex-shrink-0">时间</span>
            <span className="w-24 flex-shrink-0">操作者</span>
            <span className="w-28 flex-shrink-0">操作</span>
            <span className="flex-1">详情</span>
            <span className="w-24 flex-shrink-0 text-right">IP</span>
          </div>
          {pageLogs.map((log) => (
            <div key={log.id} className={`card flex items-start gap-3 px-4 py-3 ${selected.has(log.id) ? "ring-2 ring-brand-300" : ""}`}>
              <input
                type="checkbox"
                checked={selected.has(log.id)}
                onChange={() => toggleOne(log.id)}
                className="mt-1 h-4 w-4 rounded border-gray-300"
              />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-xs text-gray-400">{log.created_at?.slice(0, 16).replace("T", " ")}</span>
                  <span className="font-medium text-gray-700">{log.username || "系统"}</span>
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-600">
                    {log.action_label || log.action}
                  </span>
                  {log.target_name && <span className="text-xs text-gray-400">→ {log.target_name}</span>}
                </div>
                {log.detail && <p className="mt-1 text-xs text-gray-500">{log.detail}</p>}
              </div>
              <span className="hidden flex-shrink-0 text-xs text-gray-300 md:inline">{log.ip}</span>
            </div>
          ))}

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs text-gray-500 shadow-sm disabled:opacity-30"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" /> 上一页
              </button>
              <span className="text-sm text-gray-400">{page} / {totalPages}</span>
              <button
                className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs text-gray-500 shadow-sm disabled:opacity-30"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                下一页 <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
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