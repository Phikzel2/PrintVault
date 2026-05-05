import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { modelsApi, printersApi, filesApi } from "../api/client";
import { parseUploadError } from "../api/errors";
import type { Printer } from "../types";

interface UploadModalProps {
  initialFiles?: File[];
  onClose: () => void;
  onSuccess: (modelId: number) => void;
}

type Step = "files" | "meta";

const ACCEPTED_TYPES = {
  "model/stl": [".stl"],
  "application/octet-stream": [".stl", ".3mf", ".gcode", ".gc", ".gco", ".obj", ".step", ".stp", ".amf"],
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getFileTypeLabel(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    stl: "STL", "3mf": "3MF", gcode: "GCODE", gc: "GCODE", gco: "GCODE",
    obj: "OBJ", step: "STEP", stp: "STEP", amf: "AMF",
  };
  return map[ext] ?? "OTHER";
}

function fileToModelName(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

interface PendingFile {
  file: File;
  printerId: number | null;
  sourcePendingIdx: number | null;
}

export function UploadModal({ initialFiles, onClose, onSuccess }: UploadModalProps) {
  const [step, setStep] = useState<Step>("files");
  const [name, setName] = useState(() =>
    initialFiles?.length ? fileToModelName(initialFiles[0].name) : "",
  );
  const [description, setDescription] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [license, setLicense] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>(() =>
    (initialFiles ?? []).map((f) => ({ file: f, printerId: null, sourcePendingIdx: null })),
  );
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    printersApi.list().then((r) => setPrinters(r.data)).catch(() => {});
  }, []);

  const onDrop = useCallback((accepted: File[]) => {
    setPendingFiles((prev) => [
      ...prev,
      ...accepted.map((f) => ({ file: f, printerId: null, sourcePendingIdx: null })),
    ]);
    // Auto-fill name from the first dropped file if the field is still empty
    if (accepted.length > 0) {
      setName((prev) => prev || fileToModelName(accepted[0].name));
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    multiple: true,
  });

  const removeFile = (idx: number) =>
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx));

  const setFilePrinter = (idx: number, printerId: number | null) =>
    setPendingFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, printerId } : f)));

  const setFileSource = (idx: number, sourcePendingIdx: number | null) =>
    setPendingFiles((prev) => prev.map((f, i) => (i === idx ? { ...f, sourcePendingIdx } : f)));

  const handleSubmit = async () => {
    if (!name.trim()) return setError("Name is required");
    setUploading(true);
    setError(null);
    try {
      const tags = tagInput.split(",").map((t) => t.trim()).filter(Boolean);

      const { data: model } = await modelsApi.create({
        name: name.trim(),
        description: description.trim() || undefined,
        source_url: sourceUrl.trim() || undefined,
        license: license.trim() || undefined,
        tags,
      });

      const uploadedIds: number[] = [];
      for (const { file, printerId } of pendingFiles) {
        const { data: uploaded } = await modelsApi.uploadFile(model.id, file, printerId ?? undefined);
        uploadedIds.push(uploaded.id);
      }

      for (let i = 0; i < pendingFiles.length; i++) {
        const { sourcePendingIdx } = pendingFiles[i];
        if (sourcePendingIdx != null && uploadedIds[sourcePendingIdx] != null) {
          await filesApi.assignSource(uploadedIds[i], uploadedIds[sourcePendingIdx]);
        }
      }

      onSuccess(model.id);
    } catch (e) {
      setError(parseUploadError(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-lg font-semibold">Add New Model</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex border-b border-gray-800">
          {(["files", "meta"] as Step[]).map((s, i) => (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
                step === s
                  ? "border-brand-500 text-brand-400"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {i + 1}. {s === "files" ? "Files" : "Details"}
              {s === "files" && pendingFiles.length > 0 && (
                <span className="ml-1.5 text-xs bg-brand-600/30 text-brand-400 px-1.5 py-0.5 rounded-full">
                  {pendingFiles.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-6 flex flex-col gap-4 flex-1">
          {step === "files" ? (
            <>
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? "border-brand-500 bg-brand-600/10"
                    : "border-gray-700 hover:border-gray-600"
                }`}
              >
                <input {...getInputProps()} />
                <svg className="w-10 h-10 text-gray-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-gray-400 text-sm">Drop files here or click to browse</p>
                <p className="text-gray-600 text-xs mt-1">STL, 3MF, GCODE, OBJ, STEP, AMF</p>
              </div>

              {pendingFiles.length > 0 && (
                <div className="flex flex-col gap-2">
                  {pendingFiles.map(({ file, printerId, sourcePendingIdx }, idx) => {
                    const type = getFileTypeLabel(file.name);
                    const sourceOptions = pendingFiles
                      .map((pf, i) => ({ i, type: getFileTypeLabel(pf.file.name), name: pf.file.name }))
                      .filter(({ i, type: t }) => i !== idx && ["STL", "3MF", "OBJ"].includes(t));
                    return (
                      <div key={idx} className="flex flex-col bg-gray-800 rounded-lg px-3 py-2 gap-1.5">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono bg-gray-700 px-2 py-0.5 rounded text-gray-300 shrink-0">
                            {type}
                          </span>
                          <span className="text-sm text-gray-300 flex-1 truncate">{file.name}</span>
                          <span className="text-xs text-gray-600 shrink-0">{formatBytes(file.size)}</span>
                          <button onClick={() => removeFile(idx)} className="btn-ghost p-1 rounded shrink-0">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        {type === "GCODE" && (
                          <div className="flex gap-2 pl-1">
                            {sourceOptions.length > 0 && (
                              <select
                                value={sourcePendingIdx ?? ""}
                                onChange={(e) => setFileSource(idx, e.target.value !== "" ? Number(e.target.value) : null)}
                                className="text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-300 flex-1"
                              >
                                <option value="">Sliced from… (optional)</option>
                                {sourceOptions.map(({ i, name }) => (
                                  <option key={i} value={i}>{name}</option>
                                ))}
                              </select>
                            )}
                            {printers.length > 0 && (
                              <select
                                value={printerId ?? ""}
                                onChange={(e) => setFilePrinter(idx, e.target.value ? Number(e.target.value) : null)}
                                className="text-xs bg-gray-700 border border-gray-600 rounded px-2 py-1 text-gray-300 flex-1"
                              >
                                <option value="">No printer</option>
                                {printers.map((p) => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                className="btn-primary self-end"
                onClick={() => { setError(null); setStep("meta"); }}
              >
                Next: Add Details
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="label">Name *</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Benchy 3D Boat"
                  autoFocus
                />
              </div>
              <div>
                <label className="label">Description</label>
                <textarea
                  className="input resize-none"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Source URL</label>
                  <input
                    className="input"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://printables.com/..."
                  />
                </div>
                <div>
                  <label className="label">License</label>
                  <input
                    className="input"
                    value={license}
                    onChange={(e) => setLicense(e.target.value)}
                    placeholder="CC BY 4.0"
                  />
                </div>
              </div>
              <div>
                <label className="label">Tags (comma-separated)</label>
                <input
                  className="input"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="functional, household, tool..."
                />
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="mx-6 mb-4 px-4 py-3 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {step === "meta" && (
          <div className="flex justify-between items-center p-6 border-t border-gray-800 gap-3">
            <button className="btn-secondary" onClick={() => setStep("files")}>
              Back
            </button>
            <button
              className="btn-primary"
              onClick={handleSubmit}
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Uploading...
                </>
              ) : (
                "Save Model"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
