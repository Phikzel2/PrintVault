import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { modelsApi, filesApi, printersApi } from "../api/client";
import { ModelViewer } from "../components/ModelViewer";
import { AddFilesModal } from "../components/AddFilesModal";
import { FilesSection } from "../components/FilesSection";
import type { PrintModel, Printer } from "../types";


export function ModelDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const modelId = Number(id);

  const [model, setModel] = useState<PrintModel | null>(null);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ name: "", description: "", source_url: "", license: "", tags: "" });
  const [showAddFiles, setShowAddFiles] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
    loadModel();
  };

  const deleteFile = async (fileId: number) => {
    await filesApi.delete(fileId);
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
      <div className="mb-4">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-300 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Library
        </Link>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* 3D Viewer */}
        <div className="lg:flex-1 card overflow-hidden" style={{ minHeight: "420px" }}>
          <ModelViewer files={model.files} />
        </div>

        {/* Metadata panel */}
        <div className="lg:w-80 flex flex-col gap-4 shrink-0">
          {/* Header */}
          <div className="card p-4">
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
                  <h1 className="text-lg font-semibold text-white leading-snug">{model.name}</h1>
                  <button onClick={() => setEditing(true)} className="btn-ghost p-1.5 rounded shrink-0" title="Edit">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                </div>
                {model.description && <p className="text-sm text-gray-400 mt-2">{model.description}</p>}
                {model.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {model.tags.map((t) => (
                      <Link key={t.id} to={`/?tag=${t.name}`} className="text-xs px-2 py-0.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-full transition-colors">
                        {t.name}
                      </Link>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex flex-col gap-1 text-xs text-gray-600">
                  {model.source_url && (
                    <a href={model.source_url} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline truncate">
                      {model.source_url}
                    </a>
                  )}
                  {model.license && <span>License: {model.license}</span>}
                  <span>Added {new Date(model.created_at).toLocaleDateString()}</span>
                </div>
              </>
            )}
          </div>

          <FilesSection
            files={model.files}
            printers={printers}
            onDelete={deleteFile}
            onPrinterChange={changePrinter}
            onSourceChange={changeSource}
            onAddFiles={() => setShowAddFiles(true)}
          />

          {/* Danger zone */}
          <div className="card p-4 border-red-900/50">
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
    </div>
  );
}
