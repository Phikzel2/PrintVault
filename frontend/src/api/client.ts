import axios from "axios";
import type { PaginatedModels, PrintModel, PrintModelSummary, Printer, Tag } from "../types";

const api = axios.create({
  baseURL: "/api",
  paramsSerializer: { indexes: null }, // serialize arrays as tag=a&tag=b, not tag[]=a
});

export const modelsApi = {
  list: (params?: {
    search?: string;
    tag?: string[];
    file_type?: string;
    page?: number;
    page_size?: number;
  }) => api.get<PaginatedModels>("/models", { params }),

  get: (id: number) => api.get<PrintModel>(`/models/${id}`),

  create: (data: { name: string; description?: string; source_url?: string; license?: string; tags?: string[] }) =>
    api.post<PrintModel>("/models", data),

  update: (id: number, data: Partial<{ name: string; description: string; source_url: string; license: string; tags: string[] }>) =>
    api.put<PrintModel>(`/models/${id}`, data),

  delete: (id: number) => api.delete(`/models/${id}`),

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

export const filesApi = {
  downloadUrl: (id: number) => `/api/files/${id}/download`,
  delete: (id: number) => api.delete(`/files/${id}`),
  assignPrinter: (fileId: number, printerId: number | null) =>
    api.patch(`/files/${fileId}/printer`, null, { params: { printer_id: printerId } }),
  assignSource: (fileId: number, sourceFileId: number | null) =>
    api.patch(`/files/${fileId}/source`, null, { params: { source_file_id: sourceFileId } }),
};
