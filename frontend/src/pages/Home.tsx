import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { modelsApi, tagsApi } from "../api/client";
import { ModelCard } from "../components/ModelCard";
import { UploadModal } from "../components/UploadModal";
import type { PrintModelSummary, Tag } from "../types";

const FILE_TYPES = ["STL", "3MF", "GCODE", "OBJ", "STEP"];

export function Home() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get("search") ?? "";
  const activeTag = searchParams.get("tag") ?? "";
  const activeType = searchParams.get("type") ?? "";
  const page = Number(searchParams.get("page") ?? "1");

  const [models, setModels] = useState<PrintModelSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<Tag[]>([]);
  const [showUpload, setShowUpload] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, page_size: 24 };
      if (search) params.search = search;
      if (activeTag) params.tag = [activeTag];
      if (activeType) params.file_type = activeType;
      const { data } = await modelsApi.list(params);
      setModels(data.items);
      setTotal(data.total);
      setPages(data.pages);
    } finally {
      setLoading(false);
    }
  }, [search, activeTag, activeType, page]);

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

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
        {/* Sidebar filters */}
        <aside className="w-52 shrink-0 hidden md:block">
          <div className="card p-4 sticky top-24 flex flex-col gap-5">
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">File Type</h3>
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => setParam("type", "")}
                  className={`text-left text-sm px-2 py-1.5 rounded-lg transition-colors ${!activeType ? "bg-brand-600/20 text-brand-400" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"}`}
                >
                  All types
                </button>
                {FILE_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setParam("type", t === activeType ? "" : t)}
                    className={`text-left text-sm px-2 py-1.5 rounded-lg transition-colors ${activeType === t ? "bg-brand-600/20 text-brand-400" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"}`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {tags.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Tags</h3>
                <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                  <button
                    onClick={() => setParam("tag", "")}
                    className={`text-left text-sm px-2 py-1.5 rounded-lg transition-colors ${!activeTag ? "bg-brand-600/20 text-brand-400" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"}`}
                  >
                    All tags
                  </button>
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => setParam("tag", tag.name === activeTag ? "" : tag.name)}
                      className={`text-left text-sm px-2 py-1.5 rounded-lg transition-colors ${activeTag === tag.name ? "bg-brand-600/20 text-brand-400" : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"}`}
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
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              {loading ? "Loading..." : `${total} model${total !== 1 ? "s" : ""}`}
              {search && <span> matching "{search}"</span>}
            </p>
            <button onClick={() => setShowUpload(true)} className="btn-primary text-sm md:hidden">
              + Add
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="card aspect-[3/4] animate-pulse bg-gray-800" />
              ))}
            </div>
          ) : models.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-600">
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
                    p === page ? "bg-brand-600 text-white" : "bg-gray-800 text-gray-400 hover:text-gray-200"
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
          onClose={() => setShowUpload(false)}
          onSuccess={(id) => {
            setShowUpload(false);
            navigate(`/models/${id}`);
          }}
        />
      )}
    </>
  );
}
