import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { modelsApi, filesApi, printersApi } from "../api/client";
import { ModelViewer } from "../components/ModelViewer";
import { AddFilesModal } from "../components/AddFilesModal";
import { FilesSection } from "../components/FilesSection";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import { formatDate } from "../utils/format";
import type { PrintModel, Printer } from "../types";


export function ModelDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { theme } = useTheme();
  const modelId = Number(id);

  const [model, setModel] = useState<PrintModel | null>(null);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ name: "", description: "", source_url: "", license: "", tags: "" });
  const [showAddFiles, setShowAddFiles] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const [lightbox, setLightbox] = useState(false);

  const { showToast } = useToast();
  const canEdit = user && model ? (model.owner_id === user.id || user.is_admin) : false;

  const loadModel = async () => {
    try {
      const { data } = await modelsApi.get(modelId);
      setModel(data);
      setEditData({
        name: data.name,
        description: data.description ?? "",
        source_url: data.source_url ?? "",
        license: data.license ?? "",
        tags: data.tags.map((t) => t.name).join(", "),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModel();
    printersApi.list().then((r) => setPrinters(r.data)).catch(() => {});
  }, [modelId]);

  const saveEdit = async () => {
    if (!model) return;
    await modelsApi.update(modelId, {
      name: editData.name,
      description: editData.description || undefined,
      source_url: editData.source_url || undefined,
      license: editData.license || undefined,
      tags: editData.tags.split(",").map((t) => t.trim()).filter(Boolean),
    });
    setEditing(false);
    showToast("Changes saved");
    loadModel();
  };

  const deleteFile = async (fileId: number) => {
    await filesApi.delete(fileId);
    showToast("File deleted");
    loadModel();
  };

  const changePrinter = async (fileId: number, printerId: number | null) => {
    await filesApi.assignPrinter(fileId, printerId);
    loadModel();
  };

  const changeSource = async (fileId: number, sourceFileId: number | null) => {
    await filesApi.assignSource(fileId, sourceFileId);
    loadModel();
  };

  const deleteModel = async () => {
    await modelsApi.delete(modelId);
    navigate("/");
  };

  const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setThumbnailUploading(true);
    try {
      await modelsApi.uploadThumbnailImage(modelId, file);
      showToast("Thumbnail updated");
      loadModel();
    } catch {
      // ignore
    } finally {
      setThumbnailUploading(false);
      e.target.value = "";
    }
  };

  const toggleVisibility = async () => {
    if (!model) return;
    setVisibilityBusy(true);
    try {
      await modelsApi.setVisibility(modelId, !model.is_public);
      showToast(model.is_public ? "Made private" : "Made public");
      setModel({ ...model, is_public: !model.is_public });
    } finally {
      setVisibilityBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!model) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <p>Model not found</p>
        <Link to="/" className="btn-primary mt-4">Back to library</Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex flex-col lg:flex-row gap-6 lg:items-start">
        {/* Left: breadcrumb + viewer as one sticky column */}
        <div className="lg:flex-1 min-w-0 flex flex-col gap-4 lg:sticky lg:top-[5.5rem] lg:h-[calc(100vh-7rem)]">
          <Link to="/" className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Library
          </Link>
          <div className="card overflow-hidden h-[300px] lg:h-auto lg:flex-1 lg:min-h-[320px]">
            <ModelViewer files={model.files} />
          </div>
        </div>

        {/* Metadata panel — page scrolls naturally */}
        <div className="lg:w-[420px] lg:min-w-[420px] lg:max-w-[420px] flex flex-col gap-4 shrink-0 overflow-hidden">
          {/* Header */}
          <div className="card p-4 overflow-hidden">
            {editing ? (
              <div className="flex flex-col gap-3">
                <input className="input text-lg font-semibold" value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} />
                <textarea className="input resize-none text-sm" rows={3} placeholder="Description" value={editData.description} onChange={(e) => setEditData({ ...editData, description: e.target.value })} />
                <input className="input text-sm" placeholder="Source URL" value={editData.source_url} onChange={(e) => setEditData({ ...editData, source_url: e.target.value })} />
                <input className="input text-sm" placeholder="License" value={editData.license} onChange={(e) => setEditData({ ...editData, license: e.target.value })} />
                <input className="input text-sm" placeholder="Tags (comma-separated)" value={editData.tags} onChange={(e) => setEditData({ ...editData, tags: e.target.value })} />
                <div className="flex gap-2">
                  <button className="btn-primary flex-1" onClick={saveEdit}>Save</button>
                  <button className="btn-secondary flex-1" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <h1 className="text-lg font-semibold text-gray-900 dark:text-white leading-snug">{model.name}</h1>
                  {canEdit && (
                    <button onClick={() => setEditing(true)} className="btn-ghost p-1.5 rounded shrink-0" title="Edit">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  )}
                </div>
                {model.thumbnail_path && (
                  <div className="mt-3 -mx-4 overflow-hidden rounded-none">
                    <img
                      src={`${modelsApi.thumbnailUrl(modelId)}?v=${encodeURIComponent(model.thumbnail_path)}&theme=${theme}`}
                      alt={model.name}
                      onClick={() => setLightbox(true)}
                      className="w-full object-contain max-h-40 cursor-zoom-in"
                    />
                  </div>
                )}
                {model.description && (
                  <div className="prose prose-sm dark:prose-invert prose-gray max-w-none mt-2 [&_a]:text-brand-400 [&_a]:no-underline hover:[&_a]:underline [&_img]:max-w-full [&_img]:rounded-lg [&_img]:h-auto overflow-hidden">
                    <ReactMarkdown>{model.description}</ReactMarkdown>
                  </div>
                )}
                {model.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {model.tags.map((t) => (
                      <Link key={t.id} to={`/?tag=${encodeURIComponent(t.name)}`} className="text-xs px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400 rounded-full transition-colors">
                        {t.name}
                      </Link>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex flex-col gap-1 text-xs text-gray-500 dark:text-gray-600">
                  {model.source_url && (
                    <a href={model.source_url} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline truncate">
                      {model.source_url}
                    </a>
                  )}
                  {model.license && <span>License: {model.license}</span>}
                  <span>Added {formatDate(model.created_at, user?.settings.date_format)}</span>
                </div>
              </>
            )}
          </div>

          <FilesSection
            modelId={modelId}
            files={model.files}
            printers={printers}
            onDelete={deleteFile}
            onPrinterChange={changePrinter}
            onSourceChange={changeSource}
            onUploadSuccess={loadModel}
            onAddFiles={() => setShowAddFiles(true)}
          />

          {/* Visibility */}
          {canEdit && (
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {model.is_public ? "Public" : "Private"}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-600 mt-0.5">
                    {model.is_public ? "Visible to all users" : "Only visible to you"}
                  </p>
                </div>
                <button
                  onClick={toggleVisibility}
                  disabled={visibilityBusy}
                  className={`btn-secondary text-sm flex items-center gap-1.5 ${visibilityBusy ? "opacity-50" : ""}`}
                >
                  {model.is_public ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      Make private
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
                      </svg>
                      Make public
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Thumbnail */}
          {canEdit && (
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Thumbnail</p>
                  <p className="text-xs text-gray-500 dark:text-gray-600 mt-0.5">Upload a photo to use as cover image</p>
                </div>
                <label
                  htmlFor="thumb-upload"
                  className={`btn-secondary text-sm flex items-center gap-1.5 cursor-pointer ${thumbnailUploading ? "opacity-50 pointer-events-none" : ""}`}
                >
                  {thumbnailUploading ? (
                    <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                  Upload photo
                </label>
                <input
                  type="file"
                  id="thumb-upload"
                  accept="image/*"
                  className="hidden"
                  onChange={handleThumbnailUpload}
                />
              </div>
            </div>
          )}

          {/* Danger zone */}
          {canEdit && (
            <div className="card p-4 border-red-200 dark:border-red-900/50">
              {confirmDelete ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-red-400">Delete this model and all its files?</p>
                  <div className="flex gap-2">
                    <button className="btn-danger flex-1 text-sm" onClick={deleteModel}>Delete</button>
                    <button className="btn-secondary flex-1 text-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="btn-danger w-full text-sm">
                  Delete Model
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {showAddFiles && (
        <AddFilesModal
          modelId={modelId}
          existingFiles={model.files}
          onClose={() => setShowAddFiles(false)}
          onSuccess={() => {
            setShowAddFiles(false);
            loadModel();
          }}
        />
      )}

      {lightbox && model.thumbnail_path && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-zoom-out"
          onClick={() => setLightbox(false)}
        >
          <img
            src={`${modelsApi.thumbnailUrl(modelId)}?v=${encodeURIComponent(model.thumbnail_path)}&theme=${theme}`}
            alt={model.name}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
