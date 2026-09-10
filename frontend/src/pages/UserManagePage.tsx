import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ClipboardList, Eye, EyeOff, KeyRound, Search, Settings, ShieldCheck, ShieldQuestion, Snowflake, Trash2, UserCog, Users } from "lucide-react";
import { authApi, type UserManageItem, type UserManageData } from "@/api/auth";
import { useAuthStore } from "@/store/authStore";

// 与后端 User.ROLE_CHOICES 对齐：mother/father/grandma/caregiver + admin(管理员)
const ROLE_LABELS = [
  { key: "", label: "全部角色" },
  { key: "mother", label: "妈妈" },
  { key: "father", label: "爸爸" },
  { key: "grandma", label: "奶奶/外婆" },
  { key: "caregiver", label: "其他照护者" },
  { key: "admin", label: "管理员" },
];

const SECURITY_QUESTIONS = [
  { key: "pet", label: "你的宠物叫什么名字？" },
  { key: "city", label: "你出生的城市是哪里？" },
  { key: "teacher", label: "你小学班主任姓什么？" },
  { key: "food", label: "你最爱的食物是什么？" },
  { key: "book", label: "你最喜欢的一本书叫什么？" },
];

const SECURITY_Q_MAP: Record<string, string> = Object.fromEntries(SECURITY_QUESTIONS.map((q) => [q.key, q.label]));

export default function UserManagePage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<UserManageItem[]>([]);
  const [secConfig, setSecConfig] = useState({ login_captcha_threshold: 3, login_freeze_threshold: 10, login_lock_minutes: 5 });
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ nickname: "", role: "mother", is_staff: false, is_active: true });
  const [resetId, setResetId] = useState<number | null>(null);
  const [resetPwd, setResetPwd] = useState({ pwd: "", confirm: "", showPwd: false, showConfirm: false });
  const [secId, setSecId] = useState<number | null>(null);
  const [secForm, setSecForm] = useState({ question: "", answer: "" });
  const [toast, setToast] = useState("");
  const [filterRole, setFilterRole] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [showSecConfig, setShowSecConfig] = useState(false);
  const [secConfigForm, setSecConfigForm] = useState({ login_captcha_threshold: 3, login_freeze_threshold: 10, login_lock_minutes: 5 });
  const [secConfigSaving, setSecConfigSaving] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data: UserManageData = await authApi.userManageList();
      setUsers(data.users);
      setSecConfig(data.security_config);
      setSecConfigForm(data.security_config);
    } catch { showToast("加载用户列表失败"); } finally { setLoading(false); }
  };

  useEffect(() => { loadUsers(); }, []);

  const startEdit = (u: UserManageItem) => {
    setEditingId(u.id);
    setEditForm({ nickname: u.nickname, role: u.role, is_staff: u.is_staff, is_active: u.is_active });
    setResetId(null); setSecId(null);
  };

  const saveEdit = async (userId: number) => {
    try {
      await authApi.userManageUpdate(userId, editForm);
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, ...editForm } : u));
      setEditingId(null);
      showToast("用户信息已更新");
    } catch { showToast("更新失败"); }
  };

  const toggleFreeze = async (u: UserManageItem) => {
    try {
      await authApi.userManageUpdate(u.id, { is_active: !u.is_active });
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, is_active: !u.is_active } : x));
      showToast(u.is_active ? "已冻结该账号" : "已解冻该账号");
    } catch { showToast("操作失败"); }
  };

  const doResetPassword = async (userId: number) => {
    if (resetPwd.pwd.length < 6) { showToast("密码至少6位"); return; }
    if (resetPwd.pwd !== resetPwd.confirm) { showToast("两次输入的密码不一致"); return; }
    try {
      await authApi.userManageResetPassword(userId, resetPwd.pwd);
      setResetId(null);
      setResetPwd({ pwd: "", confirm: "", showPwd: false, showConfirm: false });
      showToast("密码已重置");
    } catch { showToast("重置失败"); }
  };

  const deleteUser = async (u: UserManageItem) => {
    if (!window.confirm(`确认删除用户「${u.nickname || u.phone}」？此操作不可恢复。`)) return;
    try {
      await authApi.userManageDelete(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      showToast("用户已删除");
    } catch { showToast("删除失败"); }
  };

  const startSecurity = (u: UserManageItem) => {
    setSecId(u.id);
    setSecForm({ question: u.security_question || "", answer: "" });
    setEditingId(null); setResetId(null);
  };

  const saveSecurity = async (userId: number) => {
    if (!secForm.question || !secForm.answer.trim()) { showToast("请选择密保问题并填写答案"); return; }
    try {
      await authApi.userManageSecurity(userId, { security_question: secForm.question, security_answer: secForm.answer });
      setSecId(null);
      showToast("密保已更新");
    } catch { showToast("密保更新失败"); }
  };

  const roleLabel = (role: string) => {
    const map: Record<string, string> = { mother: "妈妈", father: "爸爸", grandma: "奶奶/外婆", caregiver: "其他照护者", admin: "管理员" };
    return map[role] || role;
  };

  const saveSecConfig = async () => {
    if (secConfigForm.login_captcha_threshold < 1) { showToast("验证码阈值至少为1"); return; }
    if (secConfigForm.login_freeze_threshold < 2) { showToast("冻结阈值至少为2"); return; }
    if (secConfigForm.login_freeze_threshold <= secConfigForm.login_captcha_threshold) {
      showToast("冻结阈值应大于验证码阈值");
      return;
    }
    setSecConfigSaving(true);
    try {
      const res = await authApi.updateSecurityConfig(secConfigForm);
      setSecConfig(res.data || secConfigForm);
      setShowSecConfig(false);
      showToast("安全风控配置已更新");
    } catch { showToast("保存失败"); } finally { setSecConfigSaving(false); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {/* 顶部栏 */}
      <div className="flex items-center gap-3">
        <button className="rounded-xl bg-white p-2 shadow-sm hover:shadow-md" onClick={() => navigate("/profile")}>
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </button>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-brand-500" />
          <h1 className="text-lg font-bold text-gray-800">用户账号管理</h1>
        </div>
      </div>

{/* 筛选与统计栏 */}
      <div className="card space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="label mb-0 whitespace-nowrap">角色筛选</label>
          <select
            className="input flex-1"
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
          >
            {ROLE_LABELS.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[140px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
            <input
              className="w-full rounded-xl border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-300"
              placeholder="搜索昵称或手机号…"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
          </div>
          <button
            className="flex items-center gap-1 whitespace-nowrap rounded-lg bg-brand-50 px-3 py-1.5 text-xs text-brand-500 hover:bg-brand-100"
            onClick={() => navigate("/admin/audit-logs")}
          >
            <ClipboardList className="h-3.5 w-3.5" /> 审计日志
          </button>
          <button
            className="flex items-center gap-1 whitespace-nowrap rounded-lg bg-brand-50 px-3 py-1.5 text-xs text-brand-500 hover:bg-brand-100"
            onClick={() => { setShowSecConfig((v) => !v); setSecConfigForm(secConfig); }}
          >
            <Settings className="h-3.5 w-3.5" /> 安全风控设置
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
          <span className="rounded-full bg-gray-50 px-2.5 py-1">共 {users.length} 位用户</span>
          <span className="rounded-full bg-brand-50 px-2.5 py-1 text-brand-500">管理员 {users.filter((u) => u.is_staff).length} 位</span>
          <span className="rounded-full bg-red-50 px-2.5 py-1 text-red-400">冻结 {users.filter((u) => !u.is_active).length} 位</span>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-500">
            触发风控 {users.filter((u) => (u.login_fail_count ?? 0) >= secConfig.login_captcha_threshold).length} 位
          </span>
        </div>
      </div>

      {/* 安全风控配置面板 */}
      {showSecConfig && (
        <section className="card space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-brand-500" />
            <h2 className="font-semibold text-gray-800">登录安全风控配置</h2>
          </div>
          <p className="text-xs text-gray-400">
            当前：连续失败 {secConfig.login_captcha_threshold} 次后需输入验证码；连续失败 {secConfig.login_freeze_threshold} 次后锁定账号 {secConfig.login_lock_minutes} 分钟
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">触发验证码次数（≥1）</label>
              <input
                type="number"
                min={1}
                className="input"
                value={secConfigForm.login_captcha_threshold}
                onChange={(e) => setSecConfigForm((f) => ({ ...f, login_captcha_threshold: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="label">锁定账号次数（≥2）</label>
              <input
                type="number"
                min={2}
                className="input"
                value={secConfigForm.login_freeze_threshold}
                onChange={(e) => setSecConfigForm((f) => ({ ...f, login_freeze_threshold: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="label">锁定时长（分钟）</label>
              <input
                type="number"
                min={0}
                className="input"
                value={secConfigForm.login_lock_minutes}
                onChange={(e) => setSecConfigForm((f) => ({ ...f, login_lock_minutes: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={saveSecConfig} disabled={secConfigSaving}>
              {secConfigSaving ? "保存中…" : "保存配置"}
            </button>
            <button className="flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-500"
              onClick={() => { setShowSecConfig(false); setSecConfigForm(secConfig); }}>
              取消
            </button>
          </div>
        </section>
      )}

      {/* 用户列表 */}
      {loading ? (
        <p className="py-8 text-center text-sm text-gray-400">加载中…</p>
      ) : users.filter((u) => !filterRole || (filterRole === "admin" ? u.is_staff : u.role === filterRole)).filter((u) => {
        if (!searchKeyword.trim()) return true;
        const kw = searchKeyword.trim().toLowerCase();
        return (u.nickname || "").toLowerCase().includes(kw) || (u.phone || "").includes(kw);
      }).length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">暂无用户</p>
      ) : (
        <div className="space-y-3">
          {users
            .filter((u) => !filterRole || (filterRole === "admin" ? u.is_staff : u.role === filterRole))
            .filter((u) => {
              if (!searchKeyword.trim()) return true;
              const kw = searchKeyword.trim().toLowerCase();
              return (u.nickname || "").toLowerCase().includes(kw) || (u.phone || "").includes(kw);
            })
            .map((u) => (
            <div key={u.id} className="card">
              {/* 用户基本信息 */}
              <div className="flex items-start gap-3">
                <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-lg font-bold ${
                  u.is_staff ? "bg-brand-100 text-brand-600" : "bg-gray-100 text-gray-400"
                }`}>
                  {(u.nickname || u.phone || "?").slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800">{u.nickname || "未设置昵称"}</span>
                    {u.is_staff && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-600">管理员</span>}
                    {!u.is_active && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-400">已冻结</span>}
                    {u.security_answer && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-400">已设密保</span>}
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {u.phone} · {u.username} · {roleLabel(u.role)}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-300">
                    注册时间：{u.created_at?.slice(0, 10)}
                    {u.security_question && ` · 密保：${SECURITY_Q_MAP[u.security_question] || u.security_question}`}
                    {(u.login_fail_count || u.security_fail_count) ? (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {(u.login_fail_count ?? 0) > 0 && (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            (u.login_fail_count ?? 0) >= secConfig.login_captcha_threshold
                              ? "bg-red-50 text-red-500"
                              : "bg-amber-50 text-amber-500"
                          }`}>
                            登录失败 {u.login_fail_count} 次
                            {(u.login_fail_count ?? 0) >= secConfig.login_freeze_threshold
                              ? "（已达冻结阈值）"
                              : (u.login_fail_count ?? 0) >= secConfig.login_captcha_threshold
                                ? "（需验证码）"
                                : `（阈值 ${secConfig.login_captcha_threshold} 次触发验证码）`}
                          </span>
                        )}
                        {(u.security_fail_count ?? 0) > 0 && (
                          <span className="rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-500">
                            密保失败 {u.security_fail_count} 次
                          </span>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* 编辑表单 */}
              {editingId === u.id ? (
                <div className="mt-4 space-y-3 rounded-xl bg-cream p-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">昵称</label>
                      <input className="input" value={editForm.nickname}
                        onChange={(e) => setEditForm((f) => ({ ...f, nickname: e.target.value }))} />
                    </div>
                    <div>
                      <label className="label">角色</label>
                      <select className="input" value={editForm.role}
                        onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}>
                        <option value="mother">妈妈</option>
                        <option value="father">爸爸</option>
                        <option value="grandma">奶奶/外婆</option>
                        <option value="caregiver">其他照护者</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <input type="checkbox" checked={editForm.is_staff}
                        onChange={(e) => setEditForm((f) => ({ ...f, is_staff: e.target.checked }))} />
                      管理员
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <input type="checkbox" checked={editForm.is_active}
                        onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.checked }))} />
                      正常状态
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-primary flex-1" onClick={() => saveEdit(u.id)}>保存</button>
                    <button className="flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-500"
                      onClick={() => setEditingId(null)}>取消</button>
                  </div>
                </div>
              ) : resetId === u.id ? (
                <div className="mt-4 space-y-3 rounded-xl bg-cream p-4">
                  <div>
                    <label className="label">新密码（至少6位）</label>
                    <div className="relative">
                      <input
                        type={resetPwd.showPwd ? "text" : "password"}
                        className="input pr-10"
                        placeholder="输入新密码"
                        value={resetPwd.pwd}
                        onChange={(e) => setResetPwd((f) => ({ ...f, pwd: e.target.value }))}
                      />
                      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        onClick={() => setResetPwd((f) => ({ ...f, showPwd: !f.showPwd }))} tabIndex={-1}>
                        {resetPwd.showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="label">确认新密码</label>
                    <div className="relative">
                      <input
                        type={resetPwd.showConfirm ? "text" : "password"}
                        className="input pr-10"
                        placeholder="再次输入新密码"
                        value={resetPwd.confirm}
                        onChange={(e) => setResetPwd((f) => ({ ...f, confirm: e.target.value }))}
                      />
                      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        onClick={() => setResetPwd((f) => ({ ...f, showConfirm: !f.showConfirm }))} tabIndex={-1}>
                        {resetPwd.showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-primary flex-1" onClick={() => doResetPassword(u.id)}>确认重置</button>
                    <button className="flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-500"
                      onClick={() => { setResetId(null); setResetPwd({ pwd: "", confirm: "", showPwd: false, showConfirm: false }); }}>取消</button>
                  </div>
                </div>
              ) : secId === u.id ? (
                <div className="mt-4 space-y-3 rounded-xl bg-cream p-4">
                  <div>
                    <label className="label">密保问题</label>
                    <select className="input" value={secForm.question}
                      onChange={(e) => setSecForm((f) => ({ ...f, question: e.target.value }))}>
                      <option value="">请选择密保问题</option>
                      {SECURITY_QUESTIONS.map((q) => (
                        <option key={q.key} value={q.key}>{q.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">密保答案</label>
                    <input className="input" placeholder="输入答案"
                      value={secForm.answer}
                      onChange={(e) => setSecForm((f) => ({ ...f, answer: e.target.value }))} />
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-primary flex-1" onClick={() => saveSecurity(u.id)}>保存密保</button>
                    <button className="flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-500"
                      onClick={() => setSecId(null)}>取消</button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <button
                    className="flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1.5 text-xs text-brand-500 hover:bg-brand-100"
                    onClick={() => startEdit(u)}
                    disabled={u.id === currentUser?.id}
                  >
                    <UserCog className="h-3.5 w-3.5" /> 编辑
                  </button>
                  <button
                    className="flex items-center gap-1 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-500 hover:bg-amber-100"
                    onClick={() => { setResetId(u.id); setResetPwd({ pwd: "", confirm: "", showPwd: false, showConfirm: false }); setEditingId(null); setSecId(null); }}
                  >
                    <KeyRound className="h-3.5 w-3.5" /> 重置密码
                  </button>
                  <button
                    className="flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-500 hover:bg-blue-100"
                    onClick={() => startSecurity(u)}
                  >
                    <ShieldQuestion className="h-3.5 w-3.5" /> 密保
                  </button>
                  {u.is_active ? (
                    <button
                      className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-400 hover:bg-red-100"
                      onClick={() => toggleFreeze(u)}
                      disabled={u.id === currentUser?.id}
                    >
                      <Snowflake className="h-3.5 w-3.5" /> 冻结
                    </button>
                  ) : (
                    <button
                      className="flex items-center gap-1 rounded-lg bg-green-50 px-3 py-1.5 text-xs text-green-500 hover:bg-green-100"
                      onClick={() => toggleFreeze(u)}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" /> 解冻
                    </button>
                  )}
                  <button
                    className="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-400 hover:bg-red-100"
                    onClick={() => deleteUser(u)}
                    disabled={u.id === currentUser?.id}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> 删除
                  </button>
                  {u.id === currentUser?.id && <span className="text-xs text-gray-300">（当前账号）</span>}
                </div>
              )}
            </div>
          ))}
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
