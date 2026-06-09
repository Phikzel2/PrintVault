import { useEffect, useRef, useState } from "react";
import { collectionsApi } from "../api/client";
import { useToast } from "../context/ToastContext";
import type { Collection } from "../types";
import { CollectionFormModal } from "./CollectionFormModal";

interface Props {
  modelIds: number[];
  /** Collections the (single) model is already in. Enables toggle + checkmarks.
   *  Omit for batch (multi-model) use — the menu becomes add-only. */
  memberOf?: number[];
  onChanged?: () => void;
  buttonClassName?: string;
  label?: string;
  dropUp?: boolean;
}

export function AddToCollectionMenu({ modelIds, memberOf, onChanged, buttonClassName, label = "Add to collection", dropUp }: Props) {
  const { showToast } = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [members, setMembers] = useState<Set<number>>(new Set(memberOf ?? []));
  const [busyId, setBusyId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const single = modelIds.length === 1 && memberOf !== undefined;

  useEffect(() => { setMembers(new Set(memberOf ?? [])); }, [memberOf]);

  useEffect(() => {
    if (!open) return;
    collectionsApi.list().then((r) => setCollections(r.data)).catch(() => {});
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const addToAll = async (c: Collection) => {
    await Promise.all(modelIds.map((mid) => collectionsApi.addModel(c.id, mid)));
  };

  const handleRow = async (c: Collection) => {
    setBusyId(c.id);
    try {
      if (single && members.has(c.id)) {
        await collectionsApi.removeModel(c.id, modelIds[0]);
        setMembers((prev) => { const s = new Set(prev); s.delete(c.id); return s; });
        showToast(`Removed from "${c.name}"`);
      } else if (single) {
        await collectionsApi.addModel(c.id, modelIds[0]);
        setMembers((prev) => new Set(prev).add(c.id));
        showToast(`Added to "${c.name}"`);
      } else {
        await addToAll(c);
        showToast(`Added ${modelIds.length} model${modelIds.length !== 1 ? "s" : ""} to "${c.name}"`);
      }
      onChanged?.();
    } catch (e: any) {
      showToast(e.response?.data?.detail ?? "Failed", "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={buttonClassName ?? "btn-secondary text-sm flex items-center gap-1.5"}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 12h14M5 16h7m4 2v-6m-3 3h6" />
        </svg>
        {label}
      </button>

      {open && (
        <div className={`absolute right-0 z-20 w-60 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 max-h-72 overflow-y-auto ${dropUp ? "bottom-full mb-1" : "mt-1"}`}>
          {collections.length === 0 && (
            <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-500">No collections yet.</p>
          )}
          {collections.map((c) => {
            const checked = single && members.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => handleRow(c)}
                disabled={busyId === c.id}
                className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                <span className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${checked ? "bg-brand-600 border-brand-600" : "border-gray-300 dark:border-gray-600"}`}>
                  {checked && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="truncate flex-1 text-gray-800 dark:text-gray-200">{c.name}</span>
                <span className="text-xs text-gray-400 shrink-0">{c.model_count}</span>
              </button>
            );
          })}
          <div className="border-t border-gray-200 dark:border-gray-800 mt-1 pt-1">
            <button
              onClick={() => setShowCreate(true)}
              className="w-full text-left px-3 py-1.5 text-sm text-brand-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New collection
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <CollectionFormModal
          onClose={() => setShowCreate(false)}
          onSaved={async (c) => {
            setShowCreate(false);
            setCollections((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
            await handleRow(c);
          }}
        />
      )}
    </div>
  );
}
