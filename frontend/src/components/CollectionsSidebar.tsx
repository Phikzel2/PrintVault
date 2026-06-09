import { useEffect, useState, useCallback } from "react";
import { collectionsApi } from "../api/client";
import { useToast } from "../context/ToastContext";
import type { Collection } from "../types";
import { CollectionFormModal } from "./CollectionFormModal";

interface Props {
  activeCollection: string;
  onSelect: (id: string) => void;
}

export function CollectionsSidebar({ activeCollection, onSelect }: Props) {
  const { showToast } = useToast();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Collection | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const load = useCallback(() => {
    collectionsApi.list().then((r) => setCollections(r.data)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (c: Collection) => {
    try {
      await collectionsApi.delete(c.id);
      setConfirmDelete(null);
      if (activeCollection === String(c.id)) onSelect("");
      load();
      showToast(`Deleted "${c.name}"`);
    } catch (e: any) {
      showToast(e.response?.data?.detail ?? "Delete failed", "error");
    }
  };

  const itemClass = (active: boolean) =>
    `flex-1 min-w-0 flex items-center text-left text-sm px-2 py-1.5 rounded-lg transition-colors ${
      active
        ? "bg-brand-600/20 text-brand-400"
        : "text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800"
    }`;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wider">Collections</h3>
        <button
          onClick={() => setShowCreate(true)}
          className="text-gray-400 hover:text-brand-400 transition-colors"
          data-tooltip="New collection"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <div className="flex flex-col gap-1 max-h-64 overflow-y-auto overflow-x-hidden">
        {collections.length === 0 ? (
          <p className="text-xs text-gray-400 dark:text-gray-600 px-2 py-1">None yet</p>
        ) : (
          <>
            <button onClick={() => onSelect("")} className={itemClass(!activeCollection)}>
              All models
            </button>
            {collections.map((c) => (
              <div key={c.id} className="group flex items-center gap-1 min-w-0">
                {confirmDelete === c.id ? (
                  <div className="flex-1 flex items-center gap-1 px-2 py-1">
                    <span className="text-xs text-red-400 flex-1 truncate">Delete "{c.name}"?</span>
                    <button onClick={() => remove(c)} className="text-xs text-red-500 hover:text-red-400">Yes</button>
                    <button onClick={() => setConfirmDelete(null)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">No</button>
                  </div>
                ) : (
                  <>
                    <button onClick={() => onSelect(String(c.id))} className={itemClass(activeCollection === String(c.id))}>
                      <span className="truncate">{c.name}</span>
                    </button>
                    <span className="text-xs text-gray-500 dark:text-gray-600 shrink-0 tabular-nums pr-1 group-hover:hidden">{c.model_count}</span>
                    <div className="hidden group-hover:flex items-center shrink-0">
                      <button onClick={() => setEditing(c)} className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" data-tooltip="Rename">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button onClick={() => setConfirmDelete(c.id)} className="p-1 text-gray-400 hover:text-red-400" data-tooltip="Delete">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {showCreate && (
        <CollectionFormModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />
      )}
      {editing && (
        <CollectionFormModal initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}
