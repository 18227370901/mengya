import { create } from "zustand";
import api from "@/api/client";
import { authApi } from "@/api/auth";
import type { Stage, User } from "@/types";

interface AuthState {
  user: User | null;
  stage: Stage | null;
  token: string | null;
  loading: boolean;
  setAuth: (user: User, access: string, refresh: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  init: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  stage: null,
  token: localStorage.getItem("mengya_access"),
  loading: true,

  setAuth: async (user, access, refresh) => {
    localStorage.setItem("mengya_access", access);
    localStorage.setItem("mengya_refresh", refresh);
    set({ user, token: access, loading: true });
    // 登录后立即获取 stage 信息
    try {
      const data = await authApi.me();
      set({ user: data.user, stage: data.stage, loading: false });
    } catch {
      // 获取 stage 失败不阻塞，已有 user 信息
      set({ loading: false });
    }
  },

  logout: () => {
    localStorage.removeItem("mengya_access");
    localStorage.removeItem("mengya_refresh");
    set({ user: null, stage: null, token: null });
  },

  fetchMe: async () => {
    try {
      const data = await authApi.me();
      set({ user: data.user, stage: data.stage, loading: false });
    } catch {
      // access token 过期，尝试用 refresh token 刷新
      const refreshToken = localStorage.getItem("mengya_refresh");
      if (refreshToken) {
        try {
          const refreshResp = await api.post("/auth/refresh/", { refresh: refreshToken });
          const newAccess = refreshResp.data?.data?.access;
          if (newAccess) {
            localStorage.setItem("mengya_access", newAccess);
            set({ token: newAccess });
            // 用新 token 重试
            const data = await authApi.me();
            set({ user: data.user, stage: data.stage, loading: false });
            return;
          }
        } catch {
          // refresh 也失败，登出
        }
      }
      get().logout();
      set({ loading: false });
    }
  },

  init: async () => {
    const token = get().token;
    if (!token) {
      set({ loading: false });
      return;
    }
    await get().fetchMe();
  },
}));
