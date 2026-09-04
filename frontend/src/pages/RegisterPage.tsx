import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Sprout } from "lucide-react";
import { authApi } from "@/api/auth";

export default function RegisterPage() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [regMode, setRegMode] = useState<string>("");
  const [regModeLoading, setRegModeLoading] = useState(true);
  const [inviteValid, setInviteValid] = useState<boolean | null>(null);
  const [inviteInfo, setInviteInfo] = useState<{ remaining_uses?: number; max_uses?: number } | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get("invite") || "";

  useEffect(() => {
    authApi.registrationMode().then((data) => {
      setRegMode(data.mode);
      setRegModeLoading(false);
      // 邀请模式下，如果有 token，验证它
      if (data.mode === "invitation_only" && inviteToken) {
        authApi.verifyInvite(inviteToken).then((res) => {
          setInviteValid(res.valid);
          setInviteInfo(res.valid ? { remaining_uses: res.remaining_uses, max_uses: res.max_uses } : null);
        }).catch(() => setInviteValid(false));
      }
    }).catch(() => {
      setRegMode("error");
      setRegModeLoading(false);
    });
  }, [inviteToken]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    if (password.length < 6) {
      setError("密码至少需要 6 位");
      return;
    }

    setLoading(true);
    try {
      await authApi.register({ phone, password, nickname, invite_token: inviteToken || undefined });
      setSuccess(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // 邀请模式下无有效邀请链接：不显示表单（仅显示提示）
  const invitationBlocked = regMode === "invitation_only" && !inviteToken;

  // 仅在确定邀请无效时才阻止注册（null = 正在验证中，不阻止）
  const blocked = regMode === "invitation_only" && inviteToken && inviteValid === false;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-cream px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center">
          <Sprout className="h-12 w-12 text-brand-500" />
          <h1 className="mt-2 text-2xl font-bold text-gray-800">注册萌芽账号</h1>
          <p className="mt-1 text-sm text-gray-400">开启全周期陪伴</p>
        </div>

        {/* 加载中不渲染表单，避免"开放注册"表单闪现 */}
        {regModeLoading && (
          <div className="mb-4 rounded-xl bg-blue-50 p-3 text-center text-sm text-blue-500">
            正在获取注册模式…
          </div>
        )}
        {!regModeLoading && regMode === "error" && (
          <div className="mb-4 rounded-xl bg-red-50 p-3 text-center text-sm text-red-600">
            无法获取注册模式，请检查网络后刷新页面重试
          </div>
        )}
        {!regModeLoading && regMode === "invitation_only" && !inviteToken && (
          <div className="mb-4 rounded-xl bg-amber-50 p-3 text-center text-sm text-amber-600">
            当前为邀请注册模式，请通过管理员分享的邀请链接注册
          </div>
        )}
        {!regModeLoading && regMode === "invitation_only" && inviteToken && inviteValid === false && (
          <div className="mb-4 rounded-xl bg-red-50 p-3 text-center text-sm text-red-600">
            邀请链接已失效或已用完，请联系管理员获取新的邀请链接
          </div>
        )}
        {!regModeLoading && regMode === "invitation_only" && inviteToken && inviteValid === true && inviteInfo && (
          <div className="mb-4 rounded-xl bg-green-50 p-3 text-center text-sm text-green-600">
            邀请链接有效，剩余可用次数：{inviteInfo.remaining_uses} / {inviteInfo.max_uses}
          </div>
        )}
        {!regModeLoading && regMode === "invitation_only" && inviteToken && inviteValid === null && (
          <div className="mb-4 rounded-xl bg-blue-50 p-3 text-center text-sm text-blue-500">
            正在验证邀请链接…
          </div>
        )}

        {!regModeLoading && (blocked ? (
          <div className="py-6 text-center text-sm text-gray-500">
            无法注册，请联系管理员获取邀请链接。
          </div>
        ) : invitationBlocked ? (
          <div className="rounded-2xl bg-amber-50 px-6 py-10 text-center">
            <p className="text-lg font-semibold text-amber-600">当前仅支持邀请注册</p>
            <p className="mt-2 text-sm text-amber-500">请通过管理员分享的邀请链接访问本页面完成注册</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">手机号</label>
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={11} required />
            </div>
            <div>
              <label className="label">昵称</label>
              <input className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="例如：乐乐妈妈" />
            </div>
            <div>
              <label className="label">密码（至少6位）</label>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="label">确认密码</label>
              <div className="relative">
                <input
                  className="input pr-10"
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={6}
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowConfirm((v) => !v)}
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
            {success && (
              <p className="rounded-xl bg-green-50 p-3 text-center text-sm text-green-600">
                注册成功！正在跳转到登录页…
              </p>
            )}
            <button className="btn-primary w-full" disabled={loading || success}>
              {loading ? "注册中…" : "注册"}
            </button>
          </form>
        ))}
        <p className="mt-4 text-center text-sm text-gray-500">
          已有账号？<Link to="/login" className="text-brand-500 hover:underline">去登录</Link>
        </p>
      </div>
    </div>
  );
}
