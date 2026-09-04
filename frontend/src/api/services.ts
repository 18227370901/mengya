import api from "./client";
import type { ApiResponse, HealthRecord, ShoppingList } from "@/types";

export const shoppingApi = {
  list: () => api.get<ApiResponse<ShoppingList[]>>("/shopping-lists/").then((r) => r.data.data),

  detail: (id: number) => api.get<ApiResponse<ShoppingList>>(`/shopping-lists/${id}/`).then((r) => r.data.data),

  generate: (data: { season: string; delivery_method: string; name?: string }) =>
    api.post<ApiResponse<ShoppingList>>("/shopping-lists/generate/", data).then((r) => r.data.data),

  create: (data: Partial<ShoppingList>) => api.post<ApiResponse<ShoppingList>>("/shopping-lists/", data).then((r) => r.data.data),

  toggleCheck: (listId: number, itemId: number) =>
    api.post<ApiResponse<null>>(`/shopping-lists/${listId}/toggle_check/`, { item_id: itemId }).then((r) => r.data.data),

  remove: (id: number) => api.delete<ApiResponse<null>>(`/shopping-lists/${id}/`).then((r) => r.data.data),
};

export const healthApi = {
  list: (params?: { record_type?: string }) =>
    api.get<ApiResponse<HealthRecord[]>>("/health/records/", { params }).then((r) => r.data.data),

  create: (data: Partial<HealthRecord>) =>
    api.post<ApiResponse<HealthRecord>>("/health/records/", data).then((r) => r.data.data),

  update: (id: number, data: Partial<HealthRecord>) =>
    api.patch<ApiResponse<HealthRecord>>(`/health/records/${id}/`, data).then((r) => r.data.data),

  remove: (id: number) => api.delete<ApiResponse<null>>(`/health/records/${id}/`).then((r) => r.data.data),
};

export const aiApi = {
  chat: (query: string) => api.post<ApiResponse<{ query: string; response: string; used_openai: boolean; used_config_name?: string; latency_ms: number; suggestions: string[]; error_hint?: string }>>("/ai/chat/", { query }).then((r) => r.data.data),

  history: () => api.get<ApiResponse<Array<{ id: number; query: string; response: string; created_at: string }>>>("/ai/history/").then((r) => r.data.data),

  suggestions: () => api.get<ApiResponse<string[]>>("/ai/suggestions/").then((r) => r.data.data),
};