import type { AxiosError } from "axios";

export function parseUploadError(e: unknown): string {
  const err = e as AxiosError<any>;

  if (!err.response) {
    // Network-level failure — no HTTP response received
    if (err.code === "ERR_NETWORK" || err.message?.toLowerCase().includes("network")) {
      return "Cannot reach the server. Is PrintVault running?";
    }
    return `Network error: ${err.message ?? "unknown"}`;
  }

  const status = err.response.status;
  const data = err.response.data;

  // FastAPI returns { detail: string } or { detail: [{msg, loc}] } for validation errors
  if (data?.detail) {
    if (typeof data.detail === "string") {
      return data.detail;
    }
    if (Array.isArray(data.detail)) {
      return data.detail.map((d: any) => `${d.loc?.slice(-1)?.[0] ?? "field"}: ${d.msg}`).join("; ");
    }
  }

  switch (status) {
    case 400: return "Bad request — check the file and try again.";
    case 413: return "File too large. Reduce the file size or raise MAX_FILE_SIZE_MB in your .env.";
    case 422: return "Validation error — the server rejected the request format.";
    case 500: return "Internal server error. Check the backend logs for details.";
    case 502:
    case 503: return "Backend is not responding. Check that the PrintVault containers are running.";
    default:  return `Upload failed (HTTP ${status}).`;
  }
}
