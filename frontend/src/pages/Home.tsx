import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { modelsApi, tagsApi } from "../api/client";
import { ModelCard } from "../components/ModelCard";
import { UploadModal } from "../components/UploadModal";
import type { PrintModelSummary, Tag } from "../types";

const FILE_TYPES = ["STL", "3MF", "GCODE", "OBJ", "STEP"];

function isFileDrag(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).some(
    (t) => t === "Files" || t === "application/x-moz-file",
  );
}

export function Home() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get("search") ?? "";
  const activeTags = searchParams.getAll("tag");
  const activeTagsKey = activeTags.join(",");
  const activeType = searchParams.get("type") ?? "";
  const activeVisibility = searchParams.get("visibility") ?? "";
  const activeSort = searchParams.get("sort") ?? "newest";
  const page = Number(searchParams.get("page") ?? "1");

  const [models, setModels] = useState<PrintModelSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<Tag[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [externalDrag, setExternalDrag] = useState(false);
  const [dropFiles, setDropFiles] = useState<File[] | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, page_size: 24 };
      if (search) params.search = search;
      if (activeTags.length) params.tag = activeTags;
      if (activeType) params.file_type = activeType;
      if (activeVisibility) params.visibility = activeVisibility;
      if (activeSort) params.sort = activeSort;
      const { data } = await modelsApi.list(params);
      setModels(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } finally {
      setLoading(false);
    }
  }, [search, activeTagsKey, activeType, activeVisibility, activeSort, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    tagsApi.list().then((r) => setTags(r.data)).catch(() => {});
  }, []);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    setSearchParams(next);
  };

  const handlePageDragEnter = (e: React.DragEvent) => {
    if (isFileDrag(e)) { e.preventDefault(); setExternalDrag(true); }
  };
  const handlePageDragOver = (e: React.DragEvent) => {
    if (externalDrag) e.preventDefault();
  };
  const handlePageDragLeave = (e: React.DragEvent) => {
    const rel = e.relatedTarget as Node | null;
    if (!rel || !e.currentTarget.contains(rel)) setExternalDrag(false);
  };
  const handlePageDrop = (e: React.DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    setExternalDrag(false);
    if (files.length > 0) {
      setDropFiles(files);
      setShowUpload(true);
    }
  };

  return (
    <div
      onDragEnter={handlePageDragEnter}
      onDragOver={handlePageDragOver}
      onDragLeave={handlePageDragLeave}
      onDrop={handlePageDrop}
    >
      {/* Full-page drop overlay */}
      {externalDrag && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-none">
          <div className="border-2 border-dashed border-brand-500 rounded-2xl px-20 py-14 text-center bg-white/90 dark:bg-gray-900/90">
            <svg className="w-14 h-14 text-brand-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-xl font-semibold text-brand-400">Drop to add new model</p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">STL · 3MF · GCODE · OBJ · STEP · AMF</p>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
        {/* Sidebar filters */}
        <aside className="w-52 shrink-0 hidden md:block">
          <div className="card p-4 sticky top-24 flex flex-col gap-5">
            <div>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wider mb-2">File Type</h3>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => setParam("type", "")}
                  className={`text-left text-sm px-2 py-1.5 rounded-lg transition-colors ${!activeType ? "bg-brand-600/20 text-brand-400" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800"}`}
                >
                  All types
                </button>
                {FILE_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setParam("type", t === activeType ? "" : t)}
                    className={`text-left text-sm px-2 py-1.5 rounded-lg transition-colors ${activeType === t ? "bg-brand-600/20 text-brand-400" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wider mb-2">Visibility</h3>
              <div className="flex flex-col gap-1">
                {(["", "public", "private"] as const).map((v) => (
                  <button
                    key={v || "all"}
                    onClick={() => setParam("visibility", v === activeVisibility ? "" : v)}
                    className={`text-left text-sm px-2 py-1.5 rounded-lg transition-colors ${activeVisibility === v ? "bg-brand-600/20 text-brand-400" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800"}`}
                  >
                    {v === "" ? "All" : v === "public" ? "Public" : "Private"}
                  </button>
                ))}
              </div>
            </div>

            {tags.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wider mb-2">Tags</h3>
                <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                  <button
                    onClick={() => setParam("tag", "")}
                    className={`text-left text-sm px-2 py-1.5 rounded-lg transition-colors ${!activeTags.length ? "bg-brand-600/20 text-brand-400" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800"}`}
                  >
                    All tags
                  </button>
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => setParam("tag", activeTags.includes(tag.name) ? "" : tag.name)}
                      className={`text-left text-sm px-2 py-1.5 rounded-lg transition-colors ${activeTags.includes(tag.name) ? "bg-brand-600/20 text-brand-400" : "text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800"}`}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-4 gap-3">
            <p className="text-sm text-gray-500 shrink-0">
              {loading ? "Loading..." : `${total} model${total !== 1 ? "s" : ""}`}
              {search && <span> matching "{search}"</span>}
            </p>
            <div className="flex items-center gap-2 ml-auto">
              <select
                value={activeSort}
                onChange={(e) => setParam("sort", e.target.value === "newest" ? "" : e.target.value)}
                className="text-sm bg-transparent border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-lg px-2 py-1 cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 transition-colors focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name_asc">Name A→Z</option>
                <option value="name_desc">Name Z→A</option>
              </select>
              <button onClick={() => setShowUpload(true)} className="btn-primary text-sm md:hidden">
                + Add
              </button>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="card aspect-[3/4] animate-pulse bg-gray-200 dark:bg-gray-800" />
              ))}
            </div>
          ) : models.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400 dark:text-gray-600">
              <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <p className="text-lg font-medium text-gray-500">No models found</p>
              <p className="text-sm mt-1">Try a different search or add your first model</p>
              <button onClick={() => setShowUpload(true)} className="btn-primary mt-6">
                Add First Model
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {models.map((m) => (
                <ModelCard key={m.id} model={m} />
              ))}
            </div>
          )}

          {pages > 1 && (
            <div className="flex justify-center gap-2 mt-8">
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setParam("page", String(p))}
                  className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                    p === page ? "bg-brand-600 text-white" : "bg-gray-200 text-gray-700 hover:text-gray-900 dark:bg-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </main>
      </div>

      {showUpload && (
        <UploadModal
          initialFiles={dropFiles}
          onClose={() => { setShowUpload(false); setDropFiles(undefined); }}
          onSuccess={(id) => {
            setShowUpload(false);
            setDropFiles(undefined);
            navigate(`/models/${id}`);
          }}
        />
      )}
    </div>
  );
}
