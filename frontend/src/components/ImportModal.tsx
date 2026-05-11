import { useState, useRef, useEffect } from "react";
import { importApi } from "../api/client";
import { useEscapeKey } from "../hooks/useEscapeKey";
import type { ImportPreview } from "../types";

interface Props {
  onClose: () => void;
  onSuccess: (id: number) => void;
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ImportModal({ onClose, onSuccess }: Props) {
  const urlInputRef = useRef<HTMLInputElement>(null);
  useEscapeKey(onClose);
  useEffect(() => { urlInputRef.current?.focus(); }, []);
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFetch = async () => {
    if (!url.trim()) return;
    setFetching(true);
    setError(null);
    try {
      const { data } = await importApi.preview(url.trim());
      setPreview(data);
      setName(data.name);
      setDescription(data.description ?? "");
      setSelected(new Set(data.files.map((_, i) => i)));
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "Failed to fetch model info");
    } finally {
      setFetching(false);
    }
  };

  const handleImport = async () => {
    if (!preview) return;
    setImporting(true);
    setError(null);
    try {
      const { data } = await importApi.confirm({
        name: name.trim() || preview.name,
        description: description.trim() || null,
        source_url: preview.source_url,
        license: preview.license,
        tags: preview.tags,
        files: preview.files.filter((_, i) => selected.has(i)),
        thumbnail_url: preview.thumbnail_url,
      });
      onSuccess(data.id);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "Import failed");
      setImporting(false);
    }
  };

  const toggleFile = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const allSelected = preview && selected.size === preview.files.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <h2 className="font-semibold text-gray-900 dark:text-white">Import from URL</h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 flex flex-col gap-4 flex-1">
          {/* URL row */}
          <div className="flex gap-2">
            <input
              ref={urlInputRef}
              className="input flex-1 text-sm"
              placeholder="https://www.printables.com/model/... or thingiverse.com/thing:..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !preview) handleFetch(); }}
              disabled={!!preview || fetching}
            />
            {!preview ? (
              <button
                className="btn-primary text-sm shrink-0"
                onClick={handleFetch}
                disabled={fetching || !url.trim()}
              >
                {fetching ? "Fetching…" : "Fetch"}
              </button>
            ) : (
              <button
                className="btn-secondary text-sm shrink-0"
                onClick={() => { setPreview(null); setError(null); }}
                disabled={importing}
              >
                Change
              </button>
            )}
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          {preview && (
            <>
              <p className="text-xs text-gray-500">
                From <span className="text-brand-400 font-medium">{preview.platform}</span>
                {" · "}
                <a href={preview.source_url} target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-700 dark:hover:text-gray-300">
                  view original
                </a>
              </p>

              {preview.thumbnail_url && (
                <div className="w-full h-44 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 shrink-0">
                  <img
                    src={preview.thumbnail_url}
                    alt={preview.name}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.currentTarget.parentElement as HTMLElement).style.display = "none"; }}
                  />
                </div>
              )}

              <div>
                <label className="label">Name</label>
                <input className="input text-sm" value={name} onChange={(e) => setName(e.target.value)} />
              </div>

              <div>
                <label className="label">Description</label>
                <textarea
                  className="input text-sm resize-none"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              {preview.license && (
                <p className="text-xs text-gray-500">
                  License: <span className="text-gray-700 dark:text-gray-300">{preview.license}</span>
                </p>
              )}

              {preview.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {preview.tags.map((t) => (
                    <span key={t} className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-full">{t}</span>
                  ))}
                </div>
              )}

              {/* File selection */}
              {preview.files.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">
                      Files <span className="text-gray-500 dark:text-gray-600 font-normal">({selected.size} selected)</span>
                    </label>
                    <button
                      className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                      onClick={() =>
                        setSelected(allSelected ? new Set() : new Set(preview.files.map((_, i) => i)))
                      }
                    >
                      {allSelected ? "Deselect all" : "Select all"}
                    </button>
                  </div>
                  <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
                    {preview.files.map((f, i) => (
                      <label
                        key={i}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(i)}
                          onChange={() => toggleFile(i)}
                          className="rounded shrink-0"
                        />
                        <span className="text-xs font-mono bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded shrink-0">
                          {f.file_type}
                        </span>
                        <span className="text-sm text-gray-800 dark:text-gray-200 truncate flex-1">{f.name}</span>
                        {f.size != null && (
                          <span className="text-xs text-gray-500 shrink-0">{formatSize(f.size)}</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-yellow-500">No downloadable files found for this model.</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {preview && (
          <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 flex gap-2 justify-end shrink-0">
            <button className="btn-secondary" onClick={onClose} disabled={importing}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleImport}
              disabled={importing || selected.size === 0}
            >
              {importing
                ? "Importing…"
                : `Import ${selected.size} file${selected.size !== 1 ? "s" : ""}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
