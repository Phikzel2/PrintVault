import axios from "axios";
import type { GcodeMetadata, ImportFile, ImportPreview, PaginatedModels, PrintModel, PrintModelSummary, Printer, Tag, Token, User, UserSettings } from "../types";

const api = axios.create({
  baseURL: "/api",
  paramsSerializer: { indexes: null },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname !== "/login") {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (username: string, password: string) => {
    const form = new URLSearchParams();
    form.append("username", username);
    form.append("password", password);
    return api.post<Token>("/auth/login", form, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  },
  me: () => api.get<User>("/auth/me"),
};

export const usersApi = {
  list: () => api.get<User[]>("/users"),
  create: (data: { username: string; password: string }) => api.post<User>("/users", data),
  delete: (id: number) => api.delete(`/users/${id}`),
  updateSettings: (settings: UserSettings) => api.put<User>("/users/me/settings", settings),
  updatePassword: (current_password: string, new_password: string) =>
    api.put("/users/me/password", { current_password, new_password }),
};

export const modelsApi = {
  list: (params?: {
    search?: string;
    tag?: string[];
    file_type?: string;
    visibility?: string;
    sort?: string;
    page?: number;
    page_size?: number;
  }) => api.get<PaginatedModels>("/models", { params }),

  get: (id: number) => api.get<PrintModel>(`/models/${id}`),

  create: (data: { name: string; description?: string; source_url?: string; license?: string; tags?: string[] }) =>
    api.post<PrintModel>("/models", data),

  update: (id: number, data: Partial<{ name: string; description: string; source_url: string; license: string; tags: string[] }>) =>
    api.put<PrintModel>(`/models/${id}`, data),

  delete: (id: number) => api.delete(`/models/${id}`),

  setVisibility: (id: number, is_public: boolean) =>
    api.post(`/models/${id}/visibility`, null, { params: { is_public } }),

  uploadFile: (modelId: number, file: File, printerId?: number, sourceFileId?: number) => {
    const form = new FormData();
    form.append("file", file);
    if (printerId != null) form.append("printer_id", String(printerId));
    if (sourceFileId != null) form.append("source_file_id", String(sourceFileId));
    return api.post(`/models/${modelId}/files`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  thumbnailUrl: (id: number) => `/api/models/${id}/thumbnail`,
  setThumbnail: (modelId: number, fileId: number) =>
    api.post(`/models/${modelId}/thumbnail`, null, { params: { file_id: fileId } }),
  uploadThumbnailImage: (modelId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return api.post<{ thumbnail_path: string }>(`/models/${modelId}/thumbnail/upload`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

export const printersApi = {
  list: () => api.get<Printer[]>("/printers"),
  create: (data: Omit<Printer, "id" | "created_at">) => api.post<Printer>("/printers", data),
  update: (id: number, data: Omit<Printer, "id" | "created_at">) => api.put<Printer>(`/printers/${id}`, data),
  delete: (id: number) => api.delete(`/printers/${id}`),
};

export const tagsApi = {
  list: () => api.get<Tag[]>("/tags"),
};

export const importApi = {
  preview: (url: string) =>
    api.post<ImportPreview>("/import/preview", { url }),
  confirm: (data: {
    name: string;
    description?: string | null;
    source_url: string;
    license?: string | null;
    tags: string[];
    files: ImportFile[];
    thumbnail_url?: string | null;
  }) => api.post<PrintModel>("/import/confirm", data),
};

export const filesApi = {
  downloadUrl: (id: number) => `/api/files/${id}/download`,
  delete: (id: number) => api.delete(`/files/${id}`),
  assignPrinter: (fileId: number, printerId: number | null) =>
    api.patch(`/files/${fileId}/printer`, null, { params: { printer_id: printerId } }),
  assignSource: (fileId: number, sourceFileId: number | null) =>
    api.patch(`/files/${fileId}/source`, null, { params: { source_file_id: sourceFileId } }),
  sendToPrinter: (fileId: number) => api.post(`/files/${fileId}/send`),
  getMetadata: (id: number) => api.get<GcodeMetadata>(`/files/${id}/metadata`),
};
