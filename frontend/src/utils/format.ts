import type { DateFormat } from "../types";

export function formatDate(dateStr: string, format: DateFormat = "DD/MM/YYYY"): string {
  const d = new Date(dateStr);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear());
  if (format === "MM/DD/YYYY") return `${month}/${day}/${year}`;
  if (format === "YYYY-MM-DD") return `${year}-${month}-${day}`;
  return `${day}/${month}/${year}`;
}

const EXT_TYPE_MAP: Record<string, string> = {
  stl: "STL", "3mf": "3MF",
  gcode: "GCODE", gc: "GCODE", gco: "GCODE",
  obj: "OBJ", step: "STEP", stp: "STEP", amf: "AMF",
};

export function getFileTypeLabel(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TYPE_MAP[ext] ?? "OTHER";
}

export function formatBytes(b: number | null): string {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
