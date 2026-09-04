import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 30000,
});

// 请求拦截：附加 JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("mengya_access");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截：统一解包 + 401 处理
api.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body && typeof body.code === "number" && body.code !== 0) {
      const err = new Error(body.message || "请求失败") as Error & { code?: number; data?: unknown };
      err.code = body.code;
      err.data = body.data;
      return Promise.reject(err);
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("mengya_access");
      localStorage.removeItem("mengya_refresh");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    const msg = error.response?.data?.message || error.message || "网络错误";
    const err = new Error(msg) as Error & { code?: number; data?: unknown };
    // 统一把 code 转成 number，避免字符串/数字类型不一致导致 === 判断失败
    const rawCode = error.response?.data?.code;
    const numCode = rawCode === undefined || rawCode === null ? undefined : Number(rawCode);
    err.code = Number.isNaN(numCode) ? undefined : numCode;
    err.data = error.response?.data?.data;
    return Promise.reject(err);
  }
);

export default api;