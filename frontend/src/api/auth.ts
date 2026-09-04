import api from "./client";
import type { ApiResponse, BabyProfile, Stage, User } from "@/types";

export interface AuthResult {
  user: User;
  access: string;
  refresh: string;
}

export interface InviteLinkData {
  id: number;
  token: string;
  max_uses: number;
  used_count: number;
  remaining_uses: number;
  is_valid: boolean;
  is_active: boolean;
  expires_at: string | null;
  note: string;
  created_by: string;
  created_at: string;
}

export interface RegistrationManageData {
  registration_mode: string;
  invites: InviteLinkData[];
}

export interface AIConfigItem {
  name: string;
  api_key: string;
  base_url: string;
  model: string;
  enabled: boolean;
}

export interface AIConfigData {
  ai_configs: AIConfigItem[];
  ai_api_key: string;
  ai_base_url: string;
  ai_model: string;
  has_global_key: boolean;
  can_manage: boolean;
}

export const authApi = {
  register: (data: { phone: string; password: string; nickname?: string; invite_token?: string }) =>
    api.post<ApiResponse<AuthResult>>("/auth/register/", data).then((r) => r.data.data),

  registrationMode: () =>
    api.get<ApiResponse<{ mode: string }>>("/auth/registration-mode/").then((r) => r.data.data),

  verifyInvite: (token: string) =>
    api.post<ApiResponse<{ valid: boolean; reason?: string; remaining_uses?: number; max_uses?: number; used_count?: number }>>("/auth/invite/verify/", { token }).then((r) => r.data.data),

  registrationManage: () =>
    api.get<ApiResponse<RegistrationManageData>>("/admin/registration/").then((r) => r.data.data),

  registrationManageAction: (data: { action: string; mode?: string; max_uses?: number; expire_hours?: number; note?: string; invite_id?: number }) =>
    api.post<ApiResponse<unknown>>("/admin/registration/", data).then((r) => r.data),

  login: (data: { phone: string; password: string; captcha?: string }) =>
    api.post<ApiResponse<AuthResult>>("/auth/login/", data).then((r) => r.data.data),

  captchaStatus: (account: string) =>
    api.get<ApiResponse<{ need_captcha: boolean; fail_count: number; threshold?: number }>>("/auth/captcha/status/", { params: { phone: account } }).then((r) => r.data.data),

  captchaNew: () =>
    api.get<ApiResponse<{ type: string; image?: string; code?: string }>>("/auth/captcha/new/").then((r) => r.data.data),

  smsSend: (phone: string) => api.post<ApiResponse<{ debug_code: string }>>("/auth/sms/send/", { phone }).then((r) => r.data.data),

  me: () => api.get<ApiResponse<{ user: User; stage: Stage }>>("/users/me/").then((r) => r.data.data),

  updateMe: (data: Partial<User>) => api.put<ApiResponse<User>>("/users/me/", data).then((r) => r.data.data),

  babies: () => api.get<ApiResponse<BabyProfile[]>>("/babies/").then((r) => r.data.data),

  createBaby: (data: Partial<BabyProfile>) => api.post<ApiResponse<BabyProfile>>("/babies/", data).then((r) => r.data.data),

  setPrimaryBaby: (id: number) => api.post<ApiResponse<null>>(`/babies/${id}/set_primary/`).then((r) => r.data.data),

  aiConfig: () => api.get<ApiResponse<AIConfigData>>("/users/ai-config/").then((r) => r.data.data),

  updateAIConfig: (data: { ai_configs?: AIConfigItem[]; ai_api_key?: string; ai_base_url?: string; ai_model?: string }) =>
    api.put<ApiResponse<AIConfigData>>("/users/ai-config/", data).then((r) => r.data.data),

  aiAuthList: () => api.get<ApiResponse<Array<{ id: number; phone: string; nickname: string; is_staff: boolean; ai_authorized: boolean }>>>("/users/ai-auth/").then((r) => r.data.data),

  aiAuthToggle: (userId: number, authorized: boolean) =>
    api.post<ApiResponse<null>>("/users/ai-auth/", { user_id: userId, ai_authorized: authorized }).then((r) => r.data.data),

  changePassword: (oldPassword: string, newPassword: string) =>
    api.post<ApiResponse<null>>("/users/change-password/", { old_password: oldPassword, new_password: newPassword }).then((r) => r.data),

  userManageList: () =>
    api.get<ApiResponse<UserManageData>>("/admin/users/").then((r) => r.data.data),

  userManageUpdate: (userId: number, data: { nickname?: string; role?: string; is_staff?: boolean; is_active?: boolean }) =>
    api.put<ApiResponse<unknown>>("/admin/users/", { user_id: userId, ...data }).then((r) => r.data),

  updateSecurityConfig: (data: { login_captcha_threshold?: number; login_freeze_threshold?: number; login_lock_minutes?: number }) =>
    api.put<ApiResponse<{ login_captcha_threshold: number; login_freeze_threshold: number; login_lock_minutes: number }>>("/admin/users/", data).then((r) => r.data),

  userManageResetPassword: (userId: number, newPassword: string) =>
    api.post<ApiResponse<null>>("/admin/users/", { user_id: userId, new_password: newPassword }).then((r) => r.data),

  userManageDelete: (userId: number) =>
    api.delete<ApiResponse<null>>("/admin/users/", { params: { user_id: userId } }).then((r) => r.data),

  userManageSecurity: (userId: number, data: { security_question?: string; security_answer?: string }) =>
    api.patch<ApiResponse<{ security_question: string; has_answer: boolean }>>("/admin/users/", { user_id: userId, ...data }).then((r) => r.data),

  getSecurityQuestion: () =>
    api.get<ApiResponse<{ security_question: string; has_answer: boolean }>>("/users/security-question/").then((r) => r.data.data),

  setSecurityQuestion: (question: string, answer: string) =>
    api.put<ApiResponse<null>>("/users/security-question/", { security_question: question, security_answer: answer }).then((r) => r.data),

  forgotPasswordGet: (phone: string) =>
    api.get<ApiResponse<{ security_question: string }>>("/users/forgot-password/", { params: { phone } }).then((r) => r.data.data),

  forgotPasswordVerify: (phone: string, answer: string, captcha?: string) =>
    api.post<ApiResponse<null>>("/users/forgot-password/", { phone, security_answer: answer, captcha }).then((r) => r.data),

  forgotPasswordReset: (phone: string, answer: string, newPassword: string, captcha?: string) =>
    api.put<ApiResponse<null>>("/users/forgot-password/", { phone, security_answer: answer, new_password: newPassword, captcha }).then((r) => r.data),

  deleteAccount: () =>
    api.delete<ApiResponse<null>>("/users/delete/").then((r) => r.data),
};

export interface AuditLogItem {
  id: number;
  username: string;
  action: string;
  action_label: string;
  target_type: string;
  target_id: string;
  target_name: string;
  detail: string;
  ip: string;
  created_at: string;
}

export interface AuditLogData {
  logs: AuditLogItem[];
  stats: Record<string, number>;
  action_labels: Array<[string, string]>;
  audit_retention_days: number;
}

export const auditApi = {
  list: () =>
    api.get<ApiResponse<AuditLogData>>("/admin/audit-logs/").then((r) => r.data.data),
  deleteIds: (ids: number[]) =>
    api.delete<ApiResponse<{ deleted: number }>>("/admin/audit-logs/", { params: { ids: ids.join(",") } }).then((r) => r.data),
  deleteAll: () =>
    api.delete<ApiResponse<null>>("/admin/audit-logs/", { params: { all: 1 } }).then((r) => r.data),
  setRetention: (days: number) =>
    api.put<ApiResponse<{ audit_retention_days: number }>>("/admin/audit-logs/", { audit_retention_days: days }).then((r) => r.data),
};

export interface UserManageItem {
  id: number;
  phone: string;
  username: string;
  nickname: string;
  role: string;
  is_staff: boolean;
  is_active: boolean;
  ai_authorized: boolean;
  security_question: string;
  security_answer: string;
  login_fail_count?: number;
  security_fail_count?: number;
  created_at: string;
}

export interface UserManageData {
  users: UserManageItem[];
  security_config: {
    login_captcha_threshold: number;
    login_freeze_threshold: number;
    login_lock_minutes: number;
  };
}