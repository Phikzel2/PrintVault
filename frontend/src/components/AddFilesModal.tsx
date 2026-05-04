import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { modelsApi, printersApi } from "../api/client";
import { parseUploadError } from "../api/errors";
import type { Printer } from "../types";

interface AddFilesModalProps {
  modelId: number;
  onClose: () => void;
  onSuccess: () => void;
}

const ACCEPTED_TYPES = {
  "application/octet-stream": [".stl", ".3mf", ".gcode", ".gc", ".gco", ".obj", ".step", ".stp", ".amf"],
};

function getFileTypeLabel(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    stl: "STL", "3mf": "3MF", gcode: "GCODE", gc: "GCODE", gco: "GCODE",
    obj: "OBJ", step: "STEP", stp: "STEP", amf: "AMF",
  };
  return map[ext] ?? "OTHER";
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface PendingFile { file: File; printerId: number | null }

export function AddFilesModal({ modelId, onClose, onSuccess }: AddFilesModalProps) {
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    printersApi.list().then((r) => setPrinters(r.data)).catch(() => {});
  }, []);

  const onDrop = useCallback((accepted: File[]) => {
    setPending((prev) => [...prev, ...accepted.map((f) => ({ file: f, printerId: null }))]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: ACCEPTED_TYPES, multiple: true });

  const upload = async () => {
    if (pending.length === 0) return onSuccess();
    setUploading(true);
    setError(null);
    try {
      for (const { file, printerId } of pending) {
        await modelsApi.uploadFile(modelId, file, printerId ?? undefined);
      }
      onSuccess();
    } catch (e) {
      setError(parseUploadError(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="card w-full max-w-lg flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-800">
          <h2 className="font-semibold">Add Files</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isDragActive ? "border-brand-500 bg-brand-600/10" : "border-gray-700 hover:border-gray-600"}`}
          >
            <input {...getInputProps()} />
            <p className="text-gray-400 text-sm">Drop files here or click to browse</p>
            <p className="text-gray-600 text-xs mt-1">STL, 3MF, GCODE, OBJ, STEP, AMF</p>
          </div>

          {pending.map(({ file, printerId }, idx) => {
            const type = getFileTypeLabel(file.name);
            return (
              <div key={idx} className="flex items-center gap-3 bg-gray-800 rounded-lg px-3 py-2">
                <span className="text-xs font-mono bg-gray-700 px-2 py-0.5 rounded text-gray-300 shrink-0">{type}</span>
                <span className="text-sm text-gray-300 flex-1 truncate">{file.name}</span>
                <span className="text-xs text-gray-600 shrink-0">{formatBytes(file.size)}</span>
                {type === "GCODE" && printers.length > 0 && (
                  <select
                    value={printerId ?? ""}
                    onChange={(e) => setPending((prev) => prev.map((f, i) => i === idx ? { ...f, printerId: e.target.value ? Number(e.target.value) : null } : f))}
                    className="text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-300 shrink-0"
                  >
                    <option value="">No printer</option>
                    {printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                )}
                <button onClick={() => setPending((prev) => prev.filter((_, i) => i !== idx))} className="btn-ghost p-1 rounded shrink-0">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-gray-800">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={upload} disabled={uploading || pending.length === 0}>
            {uploading ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Uploading...</>
            ) : `Upload ${pending.length} file${pending.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
