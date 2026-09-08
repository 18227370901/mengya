import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, Baby, Eye, EyeOff, Heart, KeyRound, LogOut, Package, Plus, Settings, ShieldCheck, Trash2, UserCheck, Users, ClipboardList } from "lucide-react";
import { authApi } from "@/api/auth";
import { useAuthStore } from "@/store/authStore";
import type { BabyProfile } from "@/types";

export default function ProfilePage() {
  const { user, stage, logout } = useAuthStore();
  const navigate = useNavigate();
  const [babies, setBabies] = useState<BabyProfile[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [babyForm, setBabyForm] = useState({
    name: "",
    gender: "unknown",
    birthday: new Date().toISOString().slice(0, 10),
    birth_weight: "",
  });

  // 修改密码
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [pwdForm, setPwdForm] = useState({ old_password: "", new_password: "", confirm_password: "" });
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdToast, setPwdToast] = useState("");
  const [pwdVisible, setPwdVisible] = useState({ old: false, new: false, confirm: false });

  // AI 授权状态（用于决定是否显示 AI 配置入口）
  const [aiAuthorized, setAIAuthorized] = useState(false);

  useEffect(() => {
    authApi.babies().then(setBabies).catch(() => setBabies([]));
    // 检查 AI 授权状态（非 403 则有权限，用于决定是否显示"已授权"标识）
    authApi.aiConfig().then(() => setAIAuthorized(true)).catch(() => setAIAuthorized(false));
  }, []);

  const addBaby = async () => {
    if (!babyForm.name.trim()) return;
    const payload: Partial<BabyProfile> = {
      name: babyForm.name.trim(),
      gender: babyForm.gender,
      birthday: babyForm.birthday,
    };
    if (babyForm.birth_weight) payload.birth_weight = Number(babyForm.birth_weight);
    const created = await authApi.createBaby(payload).catch(() => null);
    if (created) {
      setBabies((prev) => [...prev, created]);
      setShowAdd(false);
      setBabyForm({ ...babyForm, name: "" });
    }
  };

  const setPrimary = async (id: number) => {
    await authApi.setPrimaryBaby(id).catch(() => {});
    setBabies((prev) => prev.map((b) => ({ ...b, is_primary: b.id === id })));
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* 用户卡片 */}
      <section className="card bg-gradient-to-r from-brand-500 to-orange-400 text-white">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/25 text-2xl font-bold">
            {(user?.nickname || user?.phone || "萌")?.slice(0, 1)}
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{user?.nickname || "准妈妈"}</h1>
            <p className="mt-0.5 text-sm opacity-90">{user?.phone}</p>
            {stage && <p className="mt-1 text-xs opacity-80">{stage.label}</p>}
          </div>
          <button className="rounded-xl bg-white/20 p-2.5 hover:bg-white/30" onClick={handleLogout} title="退出登录">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
        {user?.due_date && (
          <p className="mt-3 rounded-xl bg-white/15 px-3 py-2 text-sm">
            预产期：{user.due_date}
          </p>
        )}
      </section>

      {/* 宝宝档案 */}
      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">宝宝档案</h2>
          <button className="text-sm text-brand-500 hover:underline" onClick={() => setShowAdd((v) => !v)}>
            <Plus className="mr-0.5 inline h-3.5 w-3.5" />
            添加宝宝
          </button>
        </div>

        {showAdd && (
          <div className="mb-4 space-y-3 rounded-xl bg-cream p-4">
            <div>
              <label className="label">宝宝昵称</label>
              <input className="input" placeholder="如：小土豆" value={babyForm.name} onChange={(e) => setBabyForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">性别</label>
                <select className="input" value={babyForm.gender} onChange={(e) => setBabyForm((f) => ({ ...f, gender: e.target.value }))}>
                  <option value="girl">女宝</option>
                  <option value="boy">男宝</option>
                  <option value="unknown">未透露</option>
                </select>
              </div>
              <div>
                <label className="label">出生体重 (kg)</label>
                <input type="number" step="0.01" className="input" value={babyForm.birth_weight} onChange={(e) => setBabyForm((f) => ({ ...f, birth_weight: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="label">出生日期</label>
              <input type="date" className="input" value={babyForm.birthday} onChange={(e) => setBabyForm((f) => ({ ...f, birthday: e.target.value }))} />
            </div>
            <button className="btn-primary w-full" onClick={addBaby}>
              保存
            </button>
          </div>
        )}

        {babies.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">还没有添加宝宝档案</p>
        ) : (
          <ul className="space-y-2">
            {babies.map((b) => (
              <li key={b.id} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-500">
                  <Baby className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-700">
                    {b.name}
                    {b.is_primary && <span className="ml-1.5 rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-600">默认</span>}
                  </p>
                  <p className="text-xs text-gray-400">
                    {b.birthday}
                    {b.age_months != null && ` · ${b.age_months}个月`}
                  </p>
                </div>
                {!b.is_primary && (
                  <button className="text-xs text-brand-500 hover:underline" onClick={() => setPrimary(b.id)}>
                    设为默认
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 常用入口 */}
      <section className="grid grid-cols-2 gap-3">
        <button className="card flex items-center gap-3 hover:shadow-md transition" onClick={() => navigate("/shopping-list")}>
          <div className="rounded-xl bg-brand-50 p-2.5">
            <Package className="h-5 w-5 text-brand-500" />
          </div>
          <div className="text-left">
            <p className="font-medium text-gray-700">我的待产包</p>
            <p className="text-xs text-gray-400">进度追踪</p>
          </div>
        </button>
        <button className="card flex items-center gap-3 hover:shadow-md transition" onClick={() => navigate("/health")}>
          <div className="rounded-xl bg-brand-50 p-2.5">
            <Heart className="h-5 w-5 text-brand-500" />
          </div>
          <div className="text-left">
            <p className="font-medium text-gray-700">健康中心</p>
            <p className="text-xs text-gray-400">产检/疫苗</p>
          </div>
        </button>
      </section>

      {/* AI 配置入口 - 仅管理员可见 */}
      {user?.is_staff && (
        <button
          className="card flex w-full items-center gap-3 hover:shadow-md transition"
          onClick={() => navigate("/settings/ai")}
        >
          <div className="rounded-xl bg-brand-50 p-2.5">
            <Bot className="h-5 w-5 text-brand-500" />
          </div>
          <div className="text-left">
            <p className="font-medium text-gray-700">AI 助手配置</p>
            <p className="text-xs text-gray-400">配置 API Key、授权管理</p>
          </div>
        </button>
      )}

      {/* 被授权用户提示 */}
      {!user?.is_staff && aiAuthorized && (
        <div className="card flex items-center gap-3 border border-green-100 bg-green-50/50">
          <div className="rounded-xl bg-green-50 p-2.5">
            <Bot className="h-5 w-5 text-green-500" />
          </div>
          <div>
            <p className="font-medium text-gray-700">AI 助手已授权</p>
            <p className="text-xs text-gray-400">管理员已授权您使用 AI 助手，可直接在 AI 助手页面使用</p>
          </div>
        </div>
      )}

      {/* 修改密码 */}
      <section className="card">
        <div className="mb-3 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-brand-500" />
          <h2 className="font-semibold text-gray-800">修改密码</h2>
        </div>
        {!showChangePwd ? (
          <button className="btn-primary w-full" onClick={() => setShowChangePwd(true)}>
            修改我的密码
          </button>
        ) : (
          <div className="space-y-3 rounded-xl bg-cream p-4">
            <div>
              <label className="label">原密码</label>
              <div className="relative">
                <input type={pwdVisible.old ? "text" : "password"} className="input pr-10" value={pwdForm.old_password}
                  onChange={(e) => setPwdForm((f) => ({ ...f, old_password: e.target.value }))} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setPwdVisible((v) => ({ ...v, old: !v.old }))} tabIndex={-1}>
                  {pwdVisible.old ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">新密码（至少6位）</label>
              <div className="relative">
                <input type={pwdVisible.new ? "text" : "password"} className="input pr-10" value={pwdForm.new_password}
                  onChange={(e) => setPwdForm((f) => ({ ...f, new_password: e.target.value }))} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setPwdVisible((v) => ({ ...v, new: !v.new }))} tabIndex={-1}>
                  {pwdVisible.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">确认新密码</label>
              <div className="relative">
                <input type={pwdVisible.confirm ? "text" : "password"} className="input pr-10" value={pwdForm.confirm_password}
                  onChange={(e) => setPwdForm((f) => ({ ...f, confirm_password: e.target.value }))} />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setPwdVisible((v) => ({ ...v, confirm: !v.confirm }))} tabIndex={-1}>
                  {pwdVisible.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className="btn-primary flex-1"
                disabled={pwdSaving}
                onClick={async () => {
                  if (pwdForm.new_password !== pwdForm.confirm_password) {
                    setPwdToast("两次输入的新密码不一致");
                    setTimeout(() => setPwdToast(""), 2500);
                    return;
                  }
                  setPwdSaving(true);
                  try {
                    await authApi.changePassword(pwdForm.old_password, pwdForm.new_password);
                    setPwdToast("密码修改成功");
                    setShowChangePwd(false);
                    setPwdForm({ old_password: "", new_password: "", confirm_password: "" });
                  } catch (err) {
                    setPwdToast(err instanceof Error && err.message.includes("原密码") ? "原密码不正确" : "修改失败");
                  } finally {
                    setPwdSaving(false);
                    setTimeout(() => setPwdToast(""), 2500);
                  }
                }}
              >
                {pwdSaving ? "提交中…" : "确认修改"}
              </button>
              <button
                className="flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-500"
                onClick={() => { setShowChangePwd(false); setPwdForm({ old_password: "", new_password: "", confirm_password: "" }); }}
              >
                取消
              </button>
            </div>
            {pwdToast && (
              <p className="rounded-xl bg-brand-50 p-2 text-center text-sm text-brand-600">{pwdToast}</p>
            )}
          </div>
        )}
      </section>

      {/* 密保设置 */}
      <SecurityQuestionSection />

      {/* 管理员：管理面板 */}
      {user?.is_staff && (
        <section className="card">
          <div className="mb-3 flex items-center gap-2">
            <Settings className="h-5 w-5 text-brand-500" />
            <h2 className="font-semibold text-gray-800">管理面板</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 py-4 hover:border-brand-200 hover:bg-brand-50/50 transition"
              onClick={() => navigate("/admin/users")}
            >
              <Users className="h-5 w-5 text-brand-500" />
              <span className="text-xs font-medium text-gray-600">用户管理</span>
              <span className="text-[10px] text-gray-400">编辑/冻结/重置密码</span>
            </button>
            <button
              className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 py-4 hover:border-brand-200 hover:bg-brand-50/50 transition"
              onClick={() => navigate("/admin/audit-logs")}
            >
              <ClipboardList className="h-5 w-5 text-brand-500" />
              <span className="text-xs font-medium text-gray-600">审计日志</span>
              <span className="text-[10px] text-gray-400">操作记录</span>
            </button>
            <button
              className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 py-4 hover:border-brand-200 hover:bg-brand-50/50 transition"
              onClick={() => navigate("/admin/products")}
            >
              <Package className="h-5 w-5 text-brand-500" />
              <span className="text-xs font-medium text-gray-600">商品管理</span>
              <span className="text-[10px] text-gray-400">发布/编辑/下架</span>
            </button>
            <button
              className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 py-4 hover:border-brand-200 hover:bg-brand-50/50 transition"
              onClick={() => navigate("/admin/registration")}
            >
              <UserCheck className="h-5 w-5 text-brand-500" />
              <span className="text-xs font-medium text-gray-600">注册管理</span>
              <span className="text-[10px] text-gray-400">注册模式/邀请链接</span>
            </button>
          </div>
        </section>
      )}

      {/* 账号注销 */}
      <section className="card border border-red-100">
        <h2 className="font-semibold text-gray-800">账号注销</h2>
        <p className="mt-1 mb-3 text-sm text-gray-400">注销后账号数据将永久删除，不可恢复</p>
        <button
          className="w-full rounded-xl border border-red-200 py-2 text-sm text-red-500 hover:bg-red-50"
          onClick={() => {
            if (user?.is_staff) {
              alert("管理员账号不可自助注销，如需操作请联系其他管理员从用户管理页面删除。");
              return;
            }
            if (!window.confirm("确认注销账号？此操作不可恢复，所有数据将被永久删除。")) return;
            authApi.deleteAccount().then(() => {
              logout();
              navigate("/");
            }).catch((e) => alert(e instanceof Error ? e.message : "注销失败，请稍后重试"));
          }}
        >
          注销我的账号
        </button>
      </section>

      <p className="text-center text-xs text-gray-300">
        萌芽 · 生命最初 3000 天陪伴
      </p>
    </div>
  );
}

// ===== 密保设置组件 =====
const SECURITY_QUESTIONS = [
  { key: "pet", label: "你的宠物叫什么名字？" },
  { key: "city", label: "你出生的城市是哪里？" },
  { key: "teacher", label: "你小学班主任姓什么？" },
  { key: "food", label: "你最爱的食物是什么？" },
  { key: "book", label: "你最喜欢的一本书叫什么？" },
];

function SecurityQuestionSection() {
  const [sq, setSQ] = useState({ security_question: "", has_answer: false });
  const [form, setForm] = useState({ question: "", answer: "" });
  const [showAnswer, setShowAnswer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    authApi.getSecurityQuestion().then((data) => {
      setSQ(data);
      setForm({ question: data.security_question, answer: "" });
    }).catch(() => {});
  }, []);

  const save = async () => {
    if (!form.question || !form.answer.trim()) {
      setToast("请选择密保问题并填写答案");
      setTimeout(() => setToast(""), 2500);
      return;
    }
    setSaving(true);
    try {
      await authApi.setSecurityQuestion(form.question, form.answer.trim());
      setSQ({ security_question: form.question, has_answer: true });
      setToast("密保已保存");
    } catch {
      setToast("保存失败");
    } finally {
      setSaving(false);
      setTimeout(() => setToast(""), 2500);
    }
  };

  return (
    <section className="card">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-brand-500" />
        <h2 className="font-semibold text-gray-800">密保设置</h2>
      </div>
      <p className="mb-3 text-sm text-gray-400">
        设置密保问题后，可通过密保找回密码。{sq.has_answer ? "（已设置密保）" : "（未设置密保）"}
      </p>
      <div className="space-y-3">
        <div>
          <label className="label">密保问题</label>
          <select className="input" value={form.question}
            onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}>
            <option value="">请选择密保问题</option>
            {SECURITY_QUESTIONS.map((q) => (
              <option key={q.key} value={q.key}>{q.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">密保答案</label>
          <div className="relative">
            <input
              type={showAnswer ? "text" : "password"}
              className="input pr-10"
              placeholder={sq.has_answer ? "输入新答案可修改密保" : "输入答案"}
              value={form.answer}
              onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
            />
            <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => setShowAnswer((v) => !v)} tabIndex={-1}>
              {showAnswer ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <button className="btn-primary w-full" disabled={saving} onClick={save}>
          {saving ? "保存中…" : "保存密保"}
        </button>
        {toast && (
          <p className="rounded-xl bg-brand-50 p-2 text-center text-sm text-brand-600">{toast}</p>
        )}
      </div>
    </section>
  );
}
