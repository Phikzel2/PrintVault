import { useState, useCallback } from "react";
import { modelsApi, filesApi } from "../api/client";
import { parseUploadError } from "../api/errors";

const THUMBNAIL_TYPES = new Set(["STL", "3MF", "OBJ"]);
import type { ModelFile, Printer } from "../types";

function getFileTypeLabel(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    stl: "STL", "3mf": "3MF", gcode: "GCODE", gc: "GCODE", gco: "GCODE",
    obj: "OBJ", step: "STEP", stp: "STEP", amf: "AMF",
  };
  return map[ext] ?? "OTHER";
}

function isFileDrag(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).some(
    (t) => t === "Files" || t === "application/x-moz-file",
  );
}

const TYPE_COLORS: Record<string, string> = {
  STL:   "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:border-blue-800",
  "3MF": "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/50 dark:text-purple-300 dark:border-purple-800",
  GCODE: "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/50 dark:text-green-300 dark:border-green-800",
  OBJ:   "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/50 dark:text-yellow-300 dark:border-yellow-800",
  STEP:  "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/50 dark:text-orange-300 dark:border-orange-800",
};

function formatBytes(b: number | null) {
  if (!b) return "";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function TypeBadge({ type }: { type: string }) {
  const color = TYPE_COLORS[type] ?? "bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";
  return (
    <span className={`text-xs px-2 py-0.5 rounded border font-mono shrink-0 ${color}`}>
      {type}
    </span>
  );
}

function DownloadBtn({ file }: { file: ModelFile }) {
  return (
    <a
      draggable={false}
      href={filesApi.downloadUrl(file.id)}
      download={file.original_filename}
      className="btn-ghost p-1.5 rounded shrink-0"
      data-tooltip="Download"
      onClick={(e) => e.stopPropagation()}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    </a>
  );
}

function ThumbnailBtn({ onClick, busy }: { onClick: () => void; busy: boolean }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={busy}
      className="btn-ghost p-1.5 rounded shrink-0 text-gray-500 hover:text-brand-400 disabled:opacity-40"
      data-tooltip="Use as thumbnail"
    >
      {busy ? (
        <span className="w-4 h-4 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin block" />
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )}
    </button>
  );
}

function DeleteBtn({ onDelete }: { onDelete: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onDelete(); }}
      className="btn-ghost p-1.5 rounded shrink-0 text-red-500 hover:text-red-400"
      data-tooltip="Delete"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    </button>
  );
}

// ── GCODE row ────────────────────────────────────────────────────────────────

type SendState = "idle" | "sending" | "ok" | "error";

function GcodeRow({
  file, printers, isDragging,
  onDragStart, onDragEnd, onPrinterChange, onDelete,
}: {
  file: ModelFile;
  printers: Printer[];
  isDragging: boolean;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  onPrinterChange: (fileId: number, printerId: number | null) => void;
  onDelete: (id: number) => void;
}) {
  const [showPrinter, setShowPrinter] = useState(false);
  const [sendState, setSendState] = useState<SendState>("idle");
  const [sendError, setSendError] = useState("");

  const assignedPrinter = file.printer_id ? printers.find((p) => p.id === file.printer_id) : null;
  const canSend = !!assignedPrinter?.moonraker_url;

  const handleSend = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSendState("sending");
    setSendError("");
    try {
      await filesApi.sendToPrinter(file.id);
      setSendState("ok");
      setTimeout(() => setSendState("idle"), 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? "Send failed";
      setSendError(msg);
      setSendState("error");
    }
  }, [file.id]);

  return (
    <div
      draggable={true}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(file.id));
        e.dataTransfer.effectAllowed = "move";
        setTimeout(() => onDragStart(file.id), 0);
      }}
      onDragEnd={onDragEnd}
      className={`flex flex-col gap-1 py-1.5 px-2 rounded-lg transition-opacity group ${
        isDragging ? "opacity-40" : "hover:bg-gray-100/60 dark:hover:bg-gray-800/60 cursor-grab active:cursor-grabbing"
      }`}
    >
      <div className="flex items-center gap-2 select-none relative">
        <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a2 2 0 11-4 0 2 2 0 014 0zm0 6a2 2 0 11-4 0 2 2 0 014 0zm0 6a2 2 0 11-4 0 2 2 0 014 0zM17 2a2 2 0 11-4 0 2 2 0 014 0zm0 6a2 2 0 11-4 0 2 2 0 014 0zm0 6a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <TypeBadge type={file.file_type} />
        <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 min-w-0 truncate" title={file.original_filename}>
          {file.original_filename}
        </span>
        {!showPrinter && assignedPrinter && (
          <span className="text-xs text-gray-500 dark:text-gray-500 shrink-0 max-w-[72px] truncate group-hover:hidden" title={assignedPrinter.name}>
            {assignedPrinter.name}
          </span>
        )}
        <span className="text-xs text-gray-500 dark:text-gray-600 shrink-0 group-hover:hidden">{formatBytes(file.file_size)}</span>
        <div className="absolute right-0 inset-y-0 flex items-center gap-0.5 pr-1 pl-4 bg-white dark:bg-gray-900 group-hover:bg-gray-50 dark:group-hover:bg-[#192231] opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-[opacity,background-color] duration-100">
            {canSend && (
              <button
                onClick={handleSend}
                disabled={sendState === "sending"}
                data-tooltip={`Send to ${assignedPrinter!.name}`}
                className={`btn-ghost p-1.5 rounded shrink-0 disabled:opacity-40 ${
                  sendState === "ok" ? "text-green-400" : sendState === "error" ? "text-red-400" : "text-gray-500 hover:text-brand-400"
                }`}
              >
                {sendState === "sending" ? (
                  <span className="w-4 h-4 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin block" />
                ) : sendState === "ok" ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                )}
              </button>
            )}
            <DownloadBtn file={file} />
            <DeleteBtn onDelete={() => onDelete(file.id)} />
            {printers.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowPrinter((v) => !v); }}
                className={`btn-ghost p-1 rounded shrink-0 ${showPrinter ? "text-gray-600 dark:text-gray-400" : "text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400"}`}
                data-tooltip="Printer settings"
              >
                <svg
                  className={`w-3 h-3 transition-transform ${showPrinter ? "" : "-rotate-90"}`}
                  fill="currentColor" viewBox="0 0 20 20"
                >
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
        </div>
      </div>
      {showPrinter && printers.length > 0 && (
        <div className="pl-5 flex items-center gap-1">
          <select
            value={file.printer_id ?? ""}
            onChange={(e) => onPrinterChange(file.id, e.target.value ? Number(e.target.value) : null)}
            className="text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded px-2 py-1 text-gray-700 dark:text-gray-400 flex-1"
          >
            <option value="">No printer</option>
            {printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}
      {sendState === "error" && (
        <p className="pl-5 text-xs text-red-400">{sendError}</p>
      )}
    </div>
  );
}

// ── Source file group ─────────────────────────────────────────────────────────

function SourceGroup({
  sourceFile, gcodes, printers,
  isDropTarget, isCollapsed, activeDrag, draggingId,
  externalDrag, externalIsTarget, thumbBusy,
  onToggle, onDragEnter, onDragOver, onDragLeave, onDrop,
  onDragStart, onDragEnd, onPrinterChange, onDelete, onSetThumbnail,
}: {
  sourceFile: ModelFile;
  gcodes: ModelFile[];
  printers: Printer[];
  isDropTarget: boolean;
  isCollapsed: boolean;
  activeDrag: boolean;
  draggingId: number | null;
  externalDrag: boolean;
  externalIsTarget: boolean;
  thumbBusy: boolean;
  onToggle: () => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  onPrinterChange: (fileId: number, printerId: number | null) => void;
  onDelete: (id: number) => void;
  onSetThumbnail: () => void;
}) {
  const anyDrag = activeDrag || externalDrag;
  const isTarget = isDropTarget || externalIsTarget;

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`rounded-xl border transition-colors ${
        isTarget
          ? "border-brand-500 bg-brand-600/10"
          : anyDrag
          ? "border-gray-300 dark:border-gray-700 border-dashed"
          : "border-transparent"
      }`}
    >
      {/* Source file header */}
      <div className="flex items-center gap-2 px-2 py-2 select-none group relative">
        <button
          onClick={onToggle}
          className="btn-ghost p-1 rounded shrink-0 text-gray-500 flex items-center gap-1"
        >
          <svg
            className={`w-3 h-3 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
            fill="currentColor" viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
          {isCollapsed && gcodes.length > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-600 font-normal tabular-nums">{gcodes.length}</span>
          )}
        </button>
        <TypeBadge type={sourceFile.file_type} />
        <span className="text-sm text-gray-800 dark:text-gray-200 flex-1 min-w-0 truncate font-medium" title={sourceFile.original_filename}>
          {sourceFile.original_filename}
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-600 shrink-0 group-hover:hidden">
          {formatBytes(sourceFile.file_size)}
        </span>
        <div className="absolute right-0 inset-y-0 flex items-center gap-0.5 pr-1 pl-4 bg-white dark:bg-gray-900 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-100">
          {THUMBNAIL_TYPES.has(sourceFile.file_type) && (
            <ThumbnailBtn onClick={onSetThumbnail} busy={thumbBusy} />
          )}
          <DownloadBtn file={sourceFile} />
          <DeleteBtn onDelete={() => onDelete(sourceFile.id)} />
        </div>
      </div>

      {/* Drop hint — shared for internal drag and Finder drop */}
      {anyDrag && !isCollapsed && (
        <div className={`mx-3 mb-2 rounded-lg border border-dashed py-1.5 text-center text-xs transition-colors ${
          isTarget ? "border-brand-500 text-brand-400" : "border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-600"
        }`}>
          {isTarget
            ? "Release to link here"
            : externalDrag
            ? "Drop file to upload & link GCODE"
            : "Drop GCODE to link"}
        </div>
      )}
      {anyDrag && isCollapsed && isTarget && (
        <div className="mx-3 mb-2 rounded-lg border border-dashed border-brand-500 py-1.5 text-center text-xs text-brand-400">
          Release to link here
        </div>
      )}

      {/* Linked GCODEs */}
      {!isCollapsed && gcodes.length > 0 && (
        <div className="ml-4 pl-3 border-l border-gray-200 dark:border-gray-800 mb-2">
          {gcodes.map((g) => (
            <GcodeRow
              key={g.id}
              file={g}
              printers={printers}
              isDragging={draggingId === g.id}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onPrinterChange={onPrinterChange}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface FilesSectionProps {
  modelId: number;
  files: ModelFile[];
  printers: Printer[];
  onDelete: (id: number) => void;
  onPrinterChange: (fileId: number, printerId: number | null) => void;
  onSourceChange: (fileId: number, sourceFileId: number | null) => void;
  onUploadSuccess: () => void;
  onAddFiles: () => void;
}

export function FilesSection({
  modelId, files, printers,
  onDelete, onPrinterChange, onSourceChange, onUploadSuccess, onAddFiles,
}: FilesSectionProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | "unlinked" | null>(null);
  const [externalDrag, setExternalDrag] = useState(false);
  const [externalTarget, setExternalTarget] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [thumbBusyId, setThumbBusyId] = useState<number | null>(null);

  const handleSetThumbnail = async (fileId: number) => {
    setThumbBusyId(fileId);
    try {
      await modelsApi.setThumbnail(modelId, fileId);
      onUploadSuccess();
    } catch {
      // thumbnail errors are non-critical; silently ignore
    } finally {
      setThumbBusyId(null);
    }
  };

  const sourceFiles = files.filter((f) => f.file_type !== "GCODE");
  const gcodes = files.filter((f) => f.file_type === "GCODE");
  const gcodesBySource: Record<number, ModelFile[]> = {};
  const unlinkedGcodes: ModelFile[] = [];
  for (const g of gcodes) {
    if (g.source_file_id != null) {
      gcodesBySource[g.source_file_id] = [...(gcodesBySource[g.source_file_id] ?? []), g];
    } else {
      unlinkedGcodes.push(g);
    }
  }

  const toggle = (id: number) =>
    setExpanded((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const uploadFiles = async (fileList: File[], sourceFileId: number | null) => {
    if (!fileList.length) return;
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of fileList) {
        const { data: uploaded } = await modelsApi.uploadFile(modelId, file);
        if (getFileTypeLabel(file.name) === "GCODE" && sourceFileId != null) {
          await filesApi.assignSource(uploaded.id, sourceFileId);
        }
      }
      onUploadSuccess();
    } catch (err) {
      setUploadError(parseUploadError(err));
    } finally {
      setUploading(false);
    }
  };

  // Unified drop props: handles both internal GCODE drag and OS file drops.
  // stopPropagation prevents the outer card from double-handling the same drop.
  const dropProps = (target: number | "unlinked") => ({
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      if (isFileDrag(e)) {
        setExternalDrag(true);
        setExternalTarget(typeof target === "number" ? target : null);
      } else {
        setDropTarget(target);
      }
    },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setDropTarget(null);
        setExternalTarget(null);
      }
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isFileDrag(e)) {
        const sourceId = typeof target === "number" ? target : null;
        uploadFiles(Array.from(e.dataTransfer.files), sourceId);
      } else {
        const id = Number(e.dataTransfer.getData("text/plain"));
        if (id) onSourceChange(id, target === "unlinked" ? null : target as number);
        setDraggingId(null);
        setDropTarget(null);
      }
      setExternalDrag(false);
      setExternalTarget(null);
    },
  });

  const activeDrag = draggingId != null;
  const anyExternalDrag = externalDrag && !activeDrag;

  return (
    <div
      className={`card p-4 transition-colors ${anyExternalDrag ? "ring-1 ring-brand-500/40" : ""}`}
      // Outer card: catches file drops not handled by a specific zone
      onDragEnter={(e) => {
        if (isFileDrag(e)) { e.preventDefault(); setExternalDrag(true); }
      }}
      onDragOver={(e) => {
        if (anyExternalDrag) e.preventDefault();
      }}
      onDragLeave={(e) => {
        const rel = e.relatedTarget as Node | null;
        if (!rel || !e.currentTarget.contains(rel)) {
          setExternalDrag(false);
          setExternalTarget(null);
        }
      }}
      onDrop={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        uploadFiles(Array.from(e.dataTransfer.files), null);
        setExternalDrag(false);
        setExternalTarget(null);
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Files</h2>
        <div className="flex items-center gap-2">
          {uploading && (
            <span className="w-3.5 h-3.5 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          )}
          <button onClick={onAddFiles} className="btn-ghost text-xs px-2 py-1 rounded">
            + Add files
          </button>
        </div>
      </div>

      {uploadError && (
        <div className="mb-3 px-3 py-2 bg-red-900/30 border border-red-800 rounded-lg text-red-400 text-xs flex items-center gap-2">
          <span className="flex-1">{uploadError}</span>
          <button onClick={() => setUploadError(null)} className="shrink-0 hover:text-red-300">✕</button>
        </div>
      )}

      {files.length === 0 && (
        <div className={`rounded-xl border border-dashed py-6 text-center text-sm transition-colors ${
          anyExternalDrag ? "border-brand-500 text-brand-400" : "border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-600"
        }`}>
          {anyExternalDrag ? "Release to upload" : "No files yet"}
        </div>
      )}

      <div className="flex flex-col gap-1">
        {sourceFiles.map((sf) => (
          <SourceGroup
            key={sf.id}
            sourceFile={sf}
            gcodes={gcodesBySource[sf.id] ?? []}
            printers={printers}
            isDropTarget={dropTarget === sf.id}
            isCollapsed={!expanded.has(sf.id)}
            activeDrag={activeDrag}
            draggingId={draggingId}
            externalDrag={anyExternalDrag}
            externalIsTarget={externalTarget === sf.id}
            thumbBusy={thumbBusyId === sf.id}
            onToggle={() => toggle(sf.id)}
            onSetThumbnail={() => handleSetThumbnail(sf.id)}
            {...dropProps(sf.id)}
            onDragStart={setDraggingId}
            onDragEnd={() => setDraggingId(null)}
            onPrinterChange={onPrinterChange}
            onDelete={onDelete}
          />
        ))}

        {/* Unlinked GCODEs */}
        {(unlinkedGcodes.length > 0 || (activeDrag && sourceFiles.length > 0)) && (
          <div
            {...dropProps("unlinked")}
            className={`rounded-xl border transition-colors mt-1 ${
              dropTarget === "unlinked"
                ? "border-gray-400 dark:border-gray-500 bg-gray-100/40 dark:bg-gray-800/40"
                : activeDrag
                ? "border-gray-300 dark:border-gray-700 border-dashed"
                : "border-transparent"
            }`}
          >
            {(activeDrag || unlinkedGcodes.length > 0) && (
              <p className={`text-xs px-2 pt-2 pb-1 ${dropTarget === "unlinked" ? "text-gray-700 dark:text-gray-300" : "text-gray-500 dark:text-gray-600"}`}>
                {activeDrag && dropTarget === "unlinked" ? "Release to unlink" : "Unlinked GCODE"}
              </p>
            )}
            {activeDrag && (
              <div className={`mx-2 mb-2 rounded-lg border border-dashed py-1.5 text-center text-xs transition-colors ${
                dropTarget === "unlinked" ? "border-gray-400 dark:border-gray-500 text-gray-600 dark:text-gray-400" : "border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-600"
              }`}>
                Drop here to unlink
              </div>
            )}
            {unlinkedGcodes.map((g) => (
              <GcodeRow
                key={g.id}
                file={g}
                printers={printers}
                isDragging={draggingId === g.id}
                onDragStart={setDraggingId}
                onDragEnd={() => setDraggingId(null)}
                onPrinterChange={onPrinterChange}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}

        {/* Standalone GCODEs when no source files exist */}
        {sourceFiles.length === 0 && gcodes.map((g) => (
          <GcodeRow
            key={g.id}
            file={g}
            printers={printers}
            isDragging={draggingId === g.id}
            onDragStart={setDraggingId}
            onDragEnd={() => setDraggingId(null)}
            onPrinterChange={onPrinterChange}
            onDelete={onDelete}
          />
        ))}

        {/* Generic drop hint when Finder drag is active but no SourceGroup is targeted */}
        {anyExternalDrag && sourceFiles.length > 0 && (
          <div className={`mt-1 rounded-xl border border-dashed py-2 text-center text-xs transition-colors ${
            externalTarget === null
              ? "border-brand-500 text-brand-400"
              : "border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-600"
          }`}>
            {externalTarget === null ? "Drop here to upload without linking" : "Drop to upload"}
          </div>
        )}
      </div>
    </div>
  );
}
