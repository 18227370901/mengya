import api from "./client";
import type { ApiResponse, BrandProfile, Product, TimelineItem } from "@/types";

export const timelineApi = {
  list: (params?: { stage?: string; category?: string; essential?: boolean; page?: number; page_size?: number }) =>
    api.get<ApiResponse<TimelineItem[]>>("/timeline/", { params }).then((r) => r.data.data),

  detail: (id: number) => api.get<ApiResponse<TimelineItem>>(`/timeline/${id}/`).then((r) => r.data.data),

  // 导入导出（仅管理员）
  exportCsv: () => api.get<Blob>("/timeline/export_csv/", { responseType: "blob" }).then((r) => r.data),
  importTemplate: () => api.get<Blob>("/timeline/import_template/", { responseType: "blob" }).then((r) => r.data),
  importCsv: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<ApiResponse<{ created: number; errors: string[] }>>("/timeline/import_csv/", fd).then((r) => r.data);
  },
};

export const productApi = {
  list: (params?: Record<string, string | number | undefined> & { page?: number; page_size?: number }) =>
    api.get<ApiResponse<Product[]>>("/products/", { params }).then((r) => r.data.data),

  detail: (id: number) => api.get<ApiResponse<Product>>(`/products/${id}/`).then((r) => r.data.data),

  create: (data: Partial<Product>) =>
    api.post<ApiResponse<Product>>("/products/", data).then((r) => r.data.data),

  update: (id: number, data: Partial<Product>) =>
    api.patch<ApiResponse<Product>>(`/products/${id}/`, data).then((r) => r.data.data),

  remove: (id: number) =>
    api.delete<ApiResponse<null>>(`/products/${id}/`).then((r) => r.data.data),

  // 导入导出（仅管理员）
  exportCsv: () => api.get<Blob>("/products/export_csv/", { responseType: "blob" }).then((r) => r.data),
  importTemplate: () => api.get<Blob>("/products/import_template/", { responseType: "blob" }).then((r) => r.data),
  importCsv: (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post<ApiResponse<{ created: number; errors: string[] }>>("/products/import_csv/", fd).then((r) => r.data);
  },
};

export const brandApi = {
  list: () => api.get<ApiResponse<BrandProfile[]>>("/brands/").then((r) => r.data.data),
  detail: (id: number) => api.get<ApiResponse<BrandProfile>>(`/brands/${id}/`).then((r) => r.data.data),
};
