import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, KeyRound, RefreshCw, Sprout, Lock } from "lucide-react";
import { authApi } from "@/api/auth";
import { useAuthStore } from "@/store/authStore";

export default function LoginPage() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  // 验证码（风控）
  const [needCaptcha, setNeedCaptcha] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [captchaImg, setCaptchaImg] = useState("");
  const [captchaText, setCaptchaText] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);

  // 忘记密码
  const [showForgot, setShowForgot] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1=输入手机号, 2=回答密保, 3=重置密码
  const [forgotPhone, setForgotPhone] = useState("");
  const [forgotQuestion, setForgotQuestion] = useState("");
  const [forgotAnswer, setForgotAnswer] = useState("");
  const [forgotNewPwd, setForgotNewPwd] = useState("");
  const [forgotConfirmPwd, setForgotConfirmPwd] = useState("");
  const [forgotShowPwd, setForgotShowPwd] = useState(false);
  const [forgotShowConfirm, setForgotShowConfirm] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  // 找回密码验证码（风控）
  const [forgotNeedCaptcha, setForgotNeedCaptcha] = useState(false);
  const [forgotCaptcha, setForgotCaptcha] = useState("");
  const [forgotCaptchaImg, setForgotCaptchaImg] = useState("");
  const [forgotCaptchaText, setForgotCaptchaText] = useState("");

  // 限流 / 锁定倒计时
  const [waitSeconds, setWaitSeconds] = useState(0); // 限流等待秒数
  const [lockSeconds, setLockSeconds] = useState(0); // 账号锁定秒数

  // 倒计时
  useEffect(() => {
    if (waitSeconds <= 0 && lockSeconds <= 0) return;
    const timer = setInterval(() => {
      setWaitSeconds((s) => Math.max(0, s - 1));
      setLockSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [waitSeconds > 0 || lockSeconds > 0]);

  // 加载验证码
  const loadCaptcha = async (isForgot = false) => {
    setCaptchaLoading(true);
    try {
      const data = await authApi.captchaNew();
      if (isForgot) {
        setForgotCaptchaImg(data.image || "");
        setForgotCaptchaText(data.code || "");
      } else {
        setCaptchaImg(data.image || "");
        setCaptchaText(data.code || "");
      }
    } catch {
      /* 验证码加载失败时静默 */
    } finally {
      setCaptchaLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (waitSeconds > 0) {
      setError(`请求过于频繁，请 ${waitSeconds} 秒后再试`);
      return;
    }
    if (lockSeconds > 0) {
      const mins = Math.ceil(lockSeconds / 60);
      setError(`账号已锁定，请 ${lockSeconds} 秒（约 ${mins} 分钟）后再试`);
      return;
    }
    setLoading(true);
    try {
      const data = await authApi.login({ phone, password, captcha: needCaptcha ? captcha : undefined });
      setAuth(data.user, data.access, data.refresh);
      navigate("/");
    } catch (err) {
      const e2 = err as Error & { code?: number; data?: { need_captcha?: boolean; fail_count?: number; threshold?: number; wait_seconds?: number; locked?: boolean } };
      if (e2.code === 1010 || e2.code === 1011 || e2.data?.need_captcha) {
        setNeedCaptcha(true);
        loadCaptcha(false);
        setError(e2.message || "请输入验证码后继续");
      } else if (e2.code === 1012 || e2.data?.locked) {
        // 账号锁定
        const secs = e2.data?.wait_seconds || 0;
        setLockSeconds(secs);
        const mins = Math.ceil(secs / 60);
        setError(`账号已锁定，请 ${secs} 秒（约 ${mins} 分钟）后再试`);
      } else if (e2.code === 4000 && e2.data?.wait_seconds) {
        // 限流
        setWaitSeconds(e2.data.wait_seconds);
        setError(`请求过于频繁，请 ${e2.data.wait_seconds} 秒后再试`);
      } else {
        setError(e2.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchQuestion = async () => {
    if (!forgotPhone.trim()) {
      setForgotError("请输入注册手机号或用户名");
      return;
    }
    setForgotLoading(true);
    setForgotError("");
    try {
      const data = await authApi.forgotPasswordGet(forgotPhone.trim());
      setForgotQuestion(data.security_question);
      setForgotStep(2);
    } catch (err) {
      setForgotError((err as Error).message);
    } finally {
      setForgotLoading(false);
    }
  };

  const verifyAnswer = async () => {
    if (!forgotAnswer.trim()) {
      setForgotError("请输入密保答案");
      return;
    }
    setForgotLoading(true);
    setForgotError("");
    try {
      // 先调用后端验证答案，正确才进入下一步（风控时携带验证码）
      await authApi.forgotPasswordVerify(forgotPhone.trim(), forgotAnswer.trim(), forgotNeedCaptcha ? forgotCaptcha : undefined);
      setForgotStep(3);
    } catch (err) {
      const e2 = err as Error & { code?: number; data?: { need_captcha?: boolean; fail_count?: number } };
      if (e2.code === 1010 || e2.code === 1011 || e2.data?.need_captcha) {
        setForgotNeedCaptcha(true);
        loadCaptcha(true);
        setForgotError(e2.message || "请输入验证码后继续");
      } else {
        setForgotError(e2.message);
      }
    } finally {
      setForgotLoading(false);
    }
  };

  const resetPassword = async () => {
    if (forgotNewPwd.length < 6) { setForgotError("密码至少6位"); return; }
    if (forgotNewPwd !== forgotConfirmPwd) { setForgotError("两次输入的密码不一致"); return; }
    setForgotLoading(true);
    setForgotError("");
    try {
      await authApi.forgotPasswordReset(forgotPhone.trim(), forgotAnswer, forgotNewPwd, forgotNeedCaptcha ? forgotCaptcha : undefined);
      setForgotStep(0);
      setForgotError("");
      setShowForgot(false);
      setError("密码已重置成功，请使用新密码登录");
      setForgotPhone(""); setForgotAnswer(""); setForgotNewPwd(""); setForgotConfirmPwd("");
      setForgotNeedCaptcha(false); setForgotCaptcha("");
      setForgotStep(1);
    } catch (err) {
      const e2 = err as Error & { code?: number; data?: { need_captcha?: boolean } };
      if (e2.code === 1010 || e2.code === 1011 || e2.data?.need_captcha) {
        setForgotNeedCaptcha(true);
        loadCaptcha(true);
        setForgotError(e2.message || "请输入验证码后继续");
      } else {
        setForgotError(e2.message);
      }
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-cream px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center">
          <Sprout className="h-12 w-12 text-brand-500" />
          <h1 className="mt-2 text-2xl font-bold text-gray-800">欢迎回到萌芽</h1>
          <p className="mt-1 text-sm text-gray-400">从第一次胎动到第一次背书包</p>
        </div>

        {!showForgot ? (
          <>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="label">手机号 / 用户名</label>
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="手机号或用户名" maxLength={11} required />
              </div>
              <div>
                <label className="label">密码</label>
                <div className="relative">
                  <input
                    className="input pr-10"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="输入密码"
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
              {needCaptcha && (
                <div>
                  <label className="label">验证码</label>
                  <div className="flex items-center gap-2">
                    <input
                      className="input flex-1"
                      value={captcha}
                      onChange={(e) => setCaptcha(e.target.value)}
                      placeholder="输入验证码"
                      autoComplete="off"
                    />
                    {captchaImg ? (
                      <img
                        src={captchaImg}
                        alt="验证码"
                        className="h-11 w-[120px] cursor-pointer rounded-lg border border-gray-200"
                        onClick={() => loadCaptcha(false)}
                        title="点击刷新"
                      />
                    ) : captchaText ? (
                      <button
                        type="button"
                        className="flex h-11 w-[120px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 font-bold tracking-widest text-gray-600"
                        onClick={() => loadCaptcha(false)}
                      >
                        {captchaText}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="flex h-11 w-[120px] items-center justify-center gap-1 rounded-lg border border-gray-200 text-gray-400"
                        onClick={() => loadCaptcha(false)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> 刷新
                      </button>
                    )}
                  </div>
                  {captchaLoading && <p className="mt-1 text-xs text-gray-400">验证码加载中…</p>}
                </div>
              )}
              {error && <p className="text-sm text-red-500">{error}</p>}
              {(waitSeconds > 0 || lockSeconds > 0) && (
                <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-600">
                  <Lock className="h-4 w-4 flex-shrink-0" />
                  <span>
                    {lockSeconds > 0
                      ? `账号锁定中，请 ${lockSeconds} 秒后再试`
                      : `请求过于频繁，请 ${waitSeconds} 秒后再试`}
                  </span>
                </div>
              )}
              <button className="btn-primary w-full" disabled={loading || waitSeconds > 0 || lockSeconds > 0}>
                {loading ? "登录中…" : waitSeconds > 0 ? `请等待 ${waitSeconds}s` : lockSeconds > 0 ? `锁定中 ${lockSeconds}s` : "登录"}
              </button>
            </form>
            <div className="mt-3 text-center">
              <button
                className="text-sm text-brand-500 hover:underline"
                onClick={() => { setShowForgot(true); setError(""); }}
              >
                忘记密码？
              </button>
            </div>
            <p className="mt-3 text-center text-sm text-gray-500">
              还没有账号？<Link to="/register" className="text-brand-500 hover:underline">立即注册</Link>
            </p>
          </>
        ) : (
          /* 忘记密码流程 */
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-brand-500" />
              <h2 className="text-lg font-bold text-gray-800">找回密码</h2>
            </div>

            {forgotStep === 1 && (
              <>
                <div>
                  <label className="label">注册手机号 / 用户名</label>
                  <input className="input" value={forgotPhone} onChange={(e) => setForgotPhone(e.target.value)} placeholder="输入注册时的手机号或用户名" />
                </div>
                {forgotError && <p className="text-sm text-red-500">{forgotError}</p>}
                <button className="btn-primary w-full" disabled={forgotLoading} onClick={fetchQuestion}>
                  {forgotLoading ? "查询中…" : "下一步"}
                </button>
              </>
            )}

            {forgotStep === 2 && (
              <>
                <div className="rounded-xl bg-cream p-3 text-sm text-gray-600">
                  密保问题：{forgotQuestion}
                </div>
                <div>
                  <label className="label">密保答案</label>
                  <input className="input" value={forgotAnswer} onChange={(e) => setForgotAnswer(e.target.value)} placeholder="输入密保答案" />
                </div>
                {forgotNeedCaptcha && (
                  <div>
                    <label className="label">验证码</label>
                    <div className="flex items-center gap-2">
                      <input
                        className="input flex-1"
                        value={forgotCaptcha}
                        onChange={(e) => setForgotCaptcha(e.target.value)}
                        placeholder="输入验证码"
                        autoComplete="off"
                      />
                      {forgotCaptchaImg ? (
                        <img
                          src={forgotCaptchaImg}
                          alt="验证码"
                          className="h-11 w-[120px] cursor-pointer rounded-lg border border-gray-200"
                          onClick={() => loadCaptcha(true)}
                          title="点击刷新"
                        />
                      ) : forgotCaptchaText ? (
                        <button
                          type="button"
                          className="flex h-11 w-[120px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 font-bold tracking-widest text-gray-600"
                          onClick={() => loadCaptcha(true)}
                        >
                          {forgotCaptchaText}
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
                {forgotError && <p className="text-sm text-red-500">{forgotError}</p>}
                <div className="flex gap-2">
                  <button className="btn-primary flex-1" disabled={forgotLoading} onClick={verifyAnswer}>
                    {forgotLoading ? "验证中…" : "下一步"}
                  </button>
                  <button className="flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-500"
                    onClick={() => { setForgotStep(1); setForgotError(""); }}>返回</button>
                </div>
              </>
            )}

            {forgotStep === 3 && (
              <>
                <div>
                  <label className="label">新密码（至少6位）</label>
                  <div className="relative">
                    <input
                      className="input pr-10"
                      type={forgotShowPwd ? "text" : "password"}
                      value={forgotNewPwd}
                      onChange={(e) => setForgotNewPwd(e.target.value)}
                      placeholder="输入新密码"
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={() => setForgotShowPwd((v) => !v)} tabIndex={-1}>
                      {forgotShowPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label">确认新密码</label>
                  <div className="relative">
                    <input
                      className="input pr-10"
                      type={forgotShowConfirm ? "text" : "password"}
                      value={forgotConfirmPwd}
                      onChange={(e) => setForgotConfirmPwd(e.target.value)}
                      placeholder="再次输入新密码"
                    />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onClick={() => setForgotShowConfirm((v) => !v)} tabIndex={-1}>
                      {forgotShowConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                {forgotError && <p className="text-sm text-red-500">{forgotError}</p>}
                <div className="flex gap-2">
                  <button className="btn-primary flex-1" disabled={forgotLoading} onClick={resetPassword}>
                    {forgotLoading ? "重置中…" : "确认重置"}
                  </button>
                  <button className="flex-1 rounded-xl border border-gray-200 py-2 text-sm text-gray-500"
                    onClick={() => { setForgotStep(2); setForgotError(""); }}>返回</button>
                </div>
              </>
            )}

            <button
              className="w-full text-center text-sm text-gray-400 hover:text-gray-600"
              onClick={() => { setShowForgot(false); setForgotError(""); setForgotStep(1); }}
            >
              返回登录
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
