import { useState } from "react";
import { filesApi } from "../api/client";
import type { ModelFile, Printer } from "../types";

const TYPE_COLORS: Record<string, string> = {
  STL:   "bg-blue-900/50 text-blue-300 border-blue-800",
  "3MF": "bg-purple-900/50 text-purple-300 border-purple-800",
  GCODE: "bg-green-900/50 text-green-300 border-green-800",
  OBJ:   "bg-yellow-900/50 text-yellow-300 border-yellow-800",
  STEP:  "bg-orange-900/50 text-orange-300 border-orange-800",
};

function formatBytes(b: number | null) {
  if (!b) return "";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function TypeBadge({ type }: { type: string }) {
  const color = TYPE_COLORS[type] ?? "bg-gray-800 text-gray-300 border-gray-700";
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
      title="Download"
      onClick={(e) => e.stopPropagation()}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    </a>
  );
}

function DeleteBtn({ onDelete }: { onDelete: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onDelete(); }}
      className="btn-ghost p-1.5 rounded shrink-0 text-red-500 hover:text-red-400"
      title="Delete"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    </button>
  );
}

// ── GCODE row ────────────────────────────────────────────────────────────────

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
  return (
    <div
      draggable={true}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(file.id));
        e.dataTransfer.effectAllowed = "move";
        // Defer state update so the drag ghost captures the pre-fade DOM
        setTimeout(() => onDragStart(file.id), 0);
      }}
      onDragEnd={onDragEnd}
      className={`flex flex-col gap-1 py-2 px-2 rounded-lg transition-opacity ${
        isDragging ? "opacity-40" : "hover:bg-gray-800/60 cursor-grab active:cursor-grabbing"
      }`}
    >
      <div className="flex items-center gap-2 select-none">
        {/* drag handle */}
        <svg className="w-3.5 h-3.5 text-gray-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a2 2 0 11-4 0 2 2 0 014 0zm0 6a2 2 0 11-4 0 2 2 0 014 0zm0 6a2 2 0 11-4 0 2 2 0 014 0zM17 2a2 2 0 11-4 0 2 2 0 014 0zm0 6a2 2 0 11-4 0 2 2 0 014 0zm0 6a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <TypeBadge type={file.file_type} />
        <span className="text-sm text-gray-300 flex-1 truncate" title={file.original_filename}>
          {file.original_filename}
        </span>
        <span className="text-xs text-gray-600 shrink-0">{formatBytes(file.file_size)}</span>
        <DownloadBtn file={file} />
        <DeleteBtn onDelete={() => onDelete(file.id)} />
      </div>
      {printers.length > 0 && (
        <div className="pl-6">
          <select
            value={file.printer_id ?? ""}
            onChange={(e) => onPrinterChange(file.id, e.target.value ? Number(e.target.value) : null)}
            className="text-xs bg-gray-900 border border-gray-700 rounded px-2 py-1 text-gray-400 w-full"
          >
            <option value="">No printer</option>
            {printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

// ── Source file group ─────────────────────────────────────────────────────────

function SourceGroup({
  sourceFile, gcodes, printers, isDropTarget, isCollapsed,
  activeDrag, draggingId, onToggle,
  onDragEnter, onDragOver, onDragLeave, onDrop,
  onDragStart, onDragEnd, onPrinterChange, onDelete,
}: {
  sourceFile: ModelFile;
  gcodes: ModelFile[];
  printers: Printer[];
  isDropTarget: boolean;
  isCollapsed: boolean;
  activeDrag: boolean;
  draggingId: number | null;
  onToggle: () => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  onPrinterChange: (fileId: number, printerId: number | null) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`rounded-xl border transition-colors ${
        isDropTarget
          ? "border-brand-500 bg-brand-600/10"
          : activeDrag
          ? "border-gray-700 border-dashed"
          : "border-transparent"
      }`}
    >
      {/* Source file header */}
      <div className="flex items-center gap-2 px-2 py-2 select-none">
        <button
          onClick={onToggle}
          className="btn-ghost p-1 rounded shrink-0 text-gray-500"
        >
          <svg
            className={`w-3 h-3 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
            fill="currentColor" viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
        <TypeBadge type={sourceFile.file_type} />
        <span className="text-sm text-gray-200 flex-1 truncate font-medium" title={sourceFile.original_filename}>
          {sourceFile.original_filename}
        </span>
        <span className="text-xs text-gray-600 shrink-0">{formatBytes(sourceFile.file_size)}</span>
        {gcodes.length > 0 && (
          <span className="text-xs text-gray-600 shrink-0">{gcodes.length} gcode</span>
        )}
        <DownloadBtn file={sourceFile} />
        <DeleteBtn onDelete={() => onDelete(sourceFile.id)} />
      </div>

      {/* Drop hint */}
      {activeDrag && !isCollapsed && (
        <div className={`mx-3 mb-2 rounded-lg border border-dashed py-1.5 text-center text-xs transition-colors ${
          isDropTarget ? "border-brand-500 text-brand-400" : "border-gray-700 text-gray-600"
        }`}>
          {isDropTarget ? "Release to link here" : "Drop GCODE to link"}
        </div>
      )}
      {activeDrag && isCollapsed && isDropTarget && (
        <div className="mx-3 mb-2 rounded-lg border border-dashed border-brand-500 py-1.5 text-center text-xs text-brand-400">
          Release to link here
        </div>
      )}

      {/* Linked GCODEs */}
      {!isCollapsed && gcodes.length > 0 && (
        <div className="ml-4 pl-3 border-l border-gray-800 mb-2">
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
  files: ModelFile[];
  printers: Printer[];
  onDelete: (id: number) => void;
  onPrinterChange: (fileId: number, printerId: number | null) => void;
  onSourceChange: (fileId: number, sourceFileId: number | null) => void;
  onAddFiles: () => void;
}

export function FilesSection({ files, printers, onDelete, onPrinterChange, onSourceChange, onAddFiles }: FilesSectionProps) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | "unlinked" | null>(null);

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
    setCollapsed((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  // Read ID from dataTransfer so there's no stale-closure dependency on draggingId state
  const dropProps = (target: number | "unlinked") => ({
    onDragEnter: (e: React.DragEvent) => { e.preventDefault(); setDropTarget(target); },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = Number(e.dataTransfer.getData("text/plain"));
      if (id) onSourceChange(id, target === "unlinked" ? null : target as number);
      setDraggingId(null);
      setDropTarget(null);
    },
  });

  const activeDrag = draggingId != null;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-300">Files</h2>
        <button onClick={onAddFiles} className="btn-ghost text-xs px-2 py-1 rounded">
          + Add files
        </button>
      </div>

      {files.length === 0 && (
        <p className="text-sm text-gray-600 text-center py-4">No files yet</p>
      )}

      <div className="flex flex-col gap-1">
        {sourceFiles.map((sf) => (
          <SourceGroup
            key={sf.id}
            sourceFile={sf}
            gcodes={gcodesBySource[sf.id] ?? []}
            printers={printers}
            isDropTarget={dropTarget === sf.id}
            isCollapsed={collapsed.has(sf.id)}
            activeDrag={activeDrag}
            draggingId={draggingId}
            onToggle={() => toggle(sf.id)}
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
                ? "border-gray-500 bg-gray-800/40"
                : activeDrag
                ? "border-gray-700 border-dashed"
                : "border-transparent"
            }`}
          >
            {(activeDrag || unlinkedGcodes.length > 0) && (
              <p className={`text-xs px-2 pt-2 pb-1 ${dropTarget === "unlinked" ? "text-gray-300" : "text-gray-600"}`}>
                {activeDrag && dropTarget === "unlinked" ? "Release to unlink" : "Unlinked GCODE"}
              </p>
            )}
            {activeDrag && (
              <div className={`mx-2 mb-2 rounded-lg border border-dashed py-1.5 text-center text-xs transition-colors ${
                dropTarget === "unlinked" ? "border-gray-500 text-gray-400" : "border-gray-700 text-gray-600"
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
      </div>
    </div>
  );
}
