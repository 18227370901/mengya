import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, Link2, UserCheck } from "lucide-react";
import { authApi } from "@/api/auth";
import type { InviteLinkData } from "@/api/auth";

export default function RegistrationManagePage() {
  const navigate = useNavigate();
  const [regMode, setRegMode] = useState("open");
  const [invites, setInvites] = useState<InviteLinkData[]>([]);
  const [inviteForm, setInviteForm] = useState({ max_uses: 1, expire_hours: "", note: "" });
  const [newInviteUrl, setNewInviteUrl] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  useEffect(() => {
    authApi.registrationManage().then((data) => {
      setRegMode(data.registration_mode);
      setInvites(data.invites);
    }).catch(() => {});
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* 顶部栏 */}
      <div className="flex items-center gap-3">
        <button className="rounded-xl bg-white p-2 shadow-sm hover:shadow-md" onClick={() => navigate("/profile")}>
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </button>
        <div className="flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-brand-500" />
          <h1 className="text-lg font-bold text-gray-800">注册管理</h1>
        </div>
      </div>

      <section className="card">
        {/* 注册模式切换 */}
        <div className="mb-4 flex items-center gap-3">
          <span className="text-sm text-gray-500">注册模式：</span>
          <button
            className={`rounded-full px-3 py-1 text-xs transition ${
              regMode === "open" ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-500"
            }`}
            disabled={regLoading}
            onClick={async () => {
              setRegLoading(true);
              try {
                await authApi.registrationManageAction({ action: "set_mode", mode: "open" });
                setRegMode("open");
              } catch { /* ignore */ } finally { setRegLoading(false); }
            }}
          >
            开放注册
          </button>
          <button
            className={`rounded-full px-3 py-1 text-xs transition ${
              regMode === "invitation_only" ? "bg-amber-100 text-amber-600" : "bg-gray-100 text-gray-500"
            }`}
            disabled={regLoading}
            onClick={async () => {
              setRegLoading(true);
              try {
                await authApi.registrationManageAction({ action: "set_mode", mode: "invitation_only" });
                setRegMode("invitation_only");
              } catch { /* ignore */ } finally { setRegLoading(false); }
            }}
          >
            仅限邀请注册
          </button>
        </div>

        {/* 生成邀请链接 */}
        {regMode === "invitation_only" && (
          <div className="mb-4 rounded-xl bg-cream p-4">
            <div className="mb-2 text-sm font-medium text-gray-600">生成邀请链接</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">最大使用次数</label>
                <input type="number" min={1} className="input" value={inviteForm.max_uses}
                  onChange={(e) => setInviteForm((f) => ({ ...f, max_uses: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="label">有效期（小时，留空=永久）</label>
                <input type="number" className="input" placeholder="如 72" value={inviteForm.expire_hours}
                  onChange={(e) => setInviteForm((f) => ({ ...f, expire_hours: e.target.value }))} />
              </div>
            </div>
            <div className="mt-2">
              <label className="label">备注（可选）</label>
              <input className="input" placeholder="如：发给张三" value={inviteForm.note}
                onChange={(e) => setInviteForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
            <button
              className="btn-primary mt-3 w-full"
              disabled={regLoading}
              onClick={async () => {
                setRegLoading(true);
                try {
                  const res = await authApi.registrationManageAction({
                    action: "create_invite",
                    max_uses: inviteForm.max_uses,
                    expire_hours: inviteForm.expire_hours ? Number(inviteForm.expire_hours) : undefined,
                    note: inviteForm.note,
                  });
                  const data = res.data as { register_url: string };
                  const fullUrl = window.location.origin + data.register_url;
                  setNewInviteUrl(fullUrl);
                  const manageData = await authApi.registrationManage();
                  setInvites(manageData.invites);
                  setInviteForm({ max_uses: 1, expire_hours: "", note: "" });
                } catch { /* ignore */ } finally { setRegLoading(false); }
              }}
            >
              生成邀请链接
            </button>
            {newInviteUrl && (
              <div className="mt-3 rounded-lg bg-white p-3">
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-brand-500 flex-shrink-0" />
                  <span className="flex-1 truncate text-xs text-gray-600">{newInviteUrl}</span>
                  <button
                    className="rounded-lg bg-brand-50 p-1.5 text-brand-500 hover:bg-brand-100"
                    onClick={() => { navigator.clipboard?.writeText(newInviteUrl); }}
                    title="复制链接"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-400">已复制到剪贴板，可分享给用户</p>
              </div>
            )}
          </div>
        )}

        {/* 邀请链接列表 */}
        {regMode === "invitation_only" && invites.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-600">邀请链接列表</div>
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs text-gray-500">{inv.token.slice(0, 16)}...</span>
                    {inv.is_valid ? (
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-500">有效</span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">已失效</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-400">
                    已用 {inv.used_count}/{inv.max_uses}
                    {inv.expires_at && ` · 过期：${inv.expires_at.slice(0, 16).replace("T", " ")}`}
                    {inv.note && ` · ${inv.note}`}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-brand-50 hover:text-brand-500"
                    title="复制注册链接"
                    onClick={() => {
                      const url = window.location.origin + "/register?invite=" + inv.token;
                      navigator.clipboard?.writeText(url);
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  {inv.is_active && (
                    <button
                      className="rounded-lg px-2 py-1 text-xs text-amber-500 hover:bg-amber-50"
                      disabled={regLoading}
                      onClick={async () => {
                        setRegLoading(true);
                        try {
                          await authApi.registrationManageAction({ action: "deactivate_invite", invite_id: inv.id });
                          const data = await authApi.registrationManage();
                          setInvites(data.invites);
                        } catch { /* ignore */ } finally { setRegLoading(false); }
                      }}
                    >
                      停用
                    </button>
                  )}
                  <button
                    className="rounded-lg px-2 py-1 text-xs text-red-400 hover:bg-red-50"
                    disabled={regLoading}
                    onClick={async () => {
                      if (!window.confirm("确认删除此邀请链接？")) return;
                      setRegLoading(true);
                      try {
                        await authApi.registrationManageAction({ action: "delete_invite", invite_id: inv.id });
                        const data = await authApi.registrationManage();
                        setInvites(data.invites);
                      } catch { /* ignore */ } finally { setRegLoading(false); }
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
