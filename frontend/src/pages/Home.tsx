import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { modelsApi, tagsApi } from "../api/client";
import { ModelCard } from "../components/ModelCard";
import { UploadModal } from "../components/UploadModal";
import { useToast } from "../context/ToastContext";
import type { PrintModelSummary, Tag } from "../types";

const FILE_TYPES = ["STL", "3MF", "GCODE", "OBJ", "STEP"];

function isFileDrag(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).some(
    (t) => t === "Files" || t === "application/x-moz-file",
  );
}


export function Home() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get("search") ?? "";
  const activeTags = searchParams.getAll("tag");
  const activeTagsKey = activeTags.join(",");
  const activeType = searchParams.get("type") ?? "";
  const activeVisibility = searchParams.get("visibility") ?? "";
  const activeSort = searchParams.get("sort") ?? localStorage.getItem("sort") ?? "newest";

  const filtersKey = [search, activeTagsKey, activeType, activeVisibility, activeSort].join("|");

  const [models, setModels] = useState<PrintModelSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [externalDrag, setExternalDrag] = useState(false);
  const [dropFiles, setDropFiles] = useState<File[] | undefined>(undefined);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchTag, setBatchTag] = useState("");
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);

  const currentPageRef = useRef(1);
  const loadIdRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(async (page: number, isFirst: boolean) => {
    const id = ++loadIdRef.current;
    if (isFirst) setLoading(true); else setLoadingMore(true);
    try {
      const params: Record<string, any> = { page, page_size: 24 };
      if (search) params.search = search;
      if (activeTags.length) params.tag = activeTags;
      if (activeType) params.file_type = activeType;
      if (activeVisibility) params.visibility = activeVisibility;
      if (activeSort) params.sort = activeSort;
      const { data } = await modelsApi.list(params);
      if (loadIdRef.current !== id) return;
      setModels(prev => isFirst ? data.items : [...prev, ...data.items]);
      setTotal(data.total);
      setHasMore(page < data.pages);
      currentPageRef.current = page;
    } finally {
      if (loadIdRef.current === id) {
        if (isFirst) setLoading(false); else setLoadingMore(false);
      }
    }
  }, [filtersKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    currentPageRef.current = 1;
    loadPage(1, true);
  }, [loadPage]);

  // Infinite scroll sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loadingMore && !loading) {
          loadPage(currentPageRef.current + 1, false);
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, loadPage]);

  useEffect(() => {
    tagsApi.list().then((r) => setTags(r.data)).catch(() => {});
  }, []);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    setSearchParams(next);
  };

  const toggleSelect = (id: number) =>
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const clearSelection = () => { setSelectedIds(new Set()); setBatchTag(""); setConfirmBatchDelete(false); setSelectionMode(false); };

  const handleBatchVisibility = async (isPublic: boolean) => {
    setBatchBusy(true);
    try {
      await Promise.all([...selectedIds].map(id => modelsApi.setVisibility(id, isPublic)));
      showToast(`Made ${selectedIds.size} model${selectedIds.size !== 1 ? "s" : ""} ${isPublic ? "public" : "private"}`);
      clearSelection();
      loadPage(1, true);
    } finally { setBatchBusy(false); }
  };

  const handleBatchTag = async (e: React.FormEvent) => {
    e.preventDefault();
    const tag = batchTag.trim().toLowerCase();
    if (!tag) return;
    setBatchBusy(true);
    try {
      const selected = models.filter(m => selectedIds.has(m.id));
      await Promise.all(selected.map(m =>
        modelsApi.update(m.id, { tags: [...new Set([...m.tags.map(t => t.name), tag])] })
      ));
      showToast(`Tag "${tag}" added to ${selectedIds.size} model${selectedIds.size !== 1 ? "s" : ""}`);
      clearSelection();
      loadPage(1, true);
    } finally { setBatchBusy(false); }
  };

  const handleBatchDelete = async () => {
    setBatchBusy(true);
    try {
      await Promise.all([...selectedIds].map(id => modelsApi.delete(id)));
      showToast(`Deleted ${selectedIds.size} model${selectedIds.size !== 1 ? "s" : ""}`);
      clearSelection();
      loadPage(1, true);
    } finally { setBatchBusy(false); }
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

  const hasActiveFilters = search || activeTags.length > 0 || activeType || activeVisibility;

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
                onChange={(e) => {
                  const val = e.target.value;
                  localStorage.setItem("sort", val);
                  setParam("sort", val === "newest" ? "" : val);
                }}
                className="text-sm bg-transparent border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 rounded-lg px-2 py-1 cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 transition-colors focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name_asc">Name A→Z</option>
                <option value="name_desc">Name Z→A</option>
              </select>
              <button
                onClick={() => selectionMode ? clearSelection() : setSelectionMode(true)}
                className={`text-sm px-3 py-1 rounded-lg border transition-colors ${
                  selectionMode
                    ? "border-brand-500 text-brand-400 bg-brand-600/10"
                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500"
                }`}
              >
                {selectionMode ? "Done" : "Select"}
              </button>
            </div>
          </div>

          {loading && models.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="card aspect-[3/4] animate-pulse bg-gray-200 dark:bg-gray-800" />
              ))}
            </div>
          ) : !loading && models.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400 dark:text-gray-600">
              <svg className="w-16 h-16 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <p className="text-lg font-medium text-gray-500">No models found</p>
              <p className="text-sm mt-1">Try a different search or add your first model</p>
              {hasActiveFilters ? (
                <button
                  onClick={() => setSearchParams({})}
                  className="btn-secondary mt-4 text-sm"
                >
                  Clear all filters
                </button>
              ) : (
                <button onClick={() => setShowUpload(true)} className="btn-primary mt-6">
                  Add First Model
                </button>
              )}
            </div>
          ) : (
            <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 transition-opacity duration-150 ${loading ? "opacity-50" : "opacity-100"}`}>
              {models.map((m) => (
                <ModelCard
                  key={m.id}
                  model={m}
                  selected={selectedIds.has(m.id)}
                  selectionActive={selectionMode}
                  onSelect={toggleSelect}
                />
              ))}
            </div>
          )}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1 mt-4" />
          {loadingMore && (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </main>
      </div>

      {/* Batch action bar — bottom sheet on mobile, floating pill on desktop */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 md:bottom-6 md:left-1/2 md:right-auto md:-translate-x-1/2 md:w-auto z-50 bg-white dark:bg-gray-900 border-t md:border border-gray-200 dark:border-gray-700 md:rounded-2xl shadow-2xl px-4 md:px-5 pt-3 pb-safe-4 md:py-3">
          {confirmBatchDelete ? (
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Delete {selectedIds.size} model{selectedIds.size !== 1 ? "s" : ""}?
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setConfirmBatchDelete(false)}
                  className="text-sm px-3 py-1.5 btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBatchDelete}
                  disabled={batchBusy}
                  className="text-sm px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 font-medium"
                >
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Row 1: count + select all + close */}
              <div className="flex items-center justify-between mb-2 md:hidden">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {selectedIds.size} selected
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => selectedIds.size === models.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(models.map(m => m.id)))}
                    className="text-sm text-brand-400 hover:text-brand-300 transition-colors"
                  >
                    {selectedIds.size === models.length ? "Deselect all" : "Select all"}
                  </button>
                  <button onClick={clearSelection} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">✕</button>
                </div>
              </div>
              {/* Row 2 (mobile) / single row (desktop): actions */}
              <div className="flex items-center gap-2 md:gap-3">
                {/* Desktop-only: count + select all */}
                <span className="hidden md:block text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">
                  {selectedIds.size} selected
                </span>
                <button
                  onClick={() => selectedIds.size === models.length ? setSelectedIds(new Set()) : setSelectedIds(new Set(models.map(m => m.id)))}
                  className="hidden md:block text-sm text-brand-400 hover:text-brand-300 transition-colors shrink-0"
                >
                  {selectedIds.size === models.length ? "Deselect all" : "Select all"}
                </button>
                <div className="hidden md:block w-px h-5 bg-gray-200 dark:bg-gray-700 shrink-0" />
                <form onSubmit={handleBatchTag} className="flex items-center gap-1 flex-1 md:flex-none">
                  <input
                    type="text"
                    value={batchTag}
                    onChange={e => setBatchTag(e.target.value)}
                    placeholder="Add tag…"
                    className="text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 md:py-1 bg-transparent focus:outline-none focus:ring-1 focus:ring-brand-500 flex-1 md:w-28"
                  />
                  <button
                    type="submit"
                    disabled={batchBusy || !batchTag.trim()}
                    className="btn-secondary text-xs py-1.5 md:py-1 px-2 disabled:opacity-50 shrink-0"
                  >
                    Tag
                  </button>
                </form>
                <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 shrink-0" />
                <button
                  onClick={() => handleBatchVisibility(true)}
                  disabled={batchBusy}
                  className="btn-secondary text-xs py-1.5 md:py-1 px-2 disabled:opacity-50 shrink-0"
                >
                  Public
                </button>
                <button
                  onClick={() => handleBatchVisibility(false)}
                  disabled={batchBusy}
                  className="btn-secondary text-xs py-1.5 md:py-1 px-2 disabled:opacity-50 shrink-0"
                >
                  Private
                </button>
                <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 shrink-0" />
                <button
                  onClick={() => setConfirmBatchDelete(true)}
                  disabled={batchBusy}
                  className="text-xs px-2 py-1.5 md:py-1 text-red-500 hover:text-red-400 transition-colors disabled:opacity-50 shrink-0"
                >
                  Delete
                </button>
                {/* Desktop-only close */}
                <div className="hidden md:block w-px h-5 bg-gray-200 dark:bg-gray-700 shrink-0" />
                <button onClick={clearSelection} className="hidden md:block text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors shrink-0">
                  ✕
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {showUpload && (
        <UploadModal
          initialFiles={dropFiles}
          onClose={() => { setShowUpload(false); setDropFiles(undefined); }}
          onSuccess={(id) => {
            setShowUpload(false);
            setDropFiles(undefined);
            showToast("Model added");
            navigate(`/models/${id}`);
          }}
        />
      )}
    </div>
  );
}
