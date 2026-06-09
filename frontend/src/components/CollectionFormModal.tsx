import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { collectionsApi } from "../api/client";
import { useEscapeKey } from "../hooks/useEscapeKey";
import type { Collection } from "../types";

interface Props {
  initial?: Collection;          // present = edit mode
  onClose: () => void;
  onSaved: (c: Collection) => void;
}

export function CollectionFormModal({ initial, onClose, onSaved }: Props) {
  const nameRef = useRef<HTMLInputElement>(null);
  useEscapeKey(onClose);
  useEffect(() => { nameRef.current?.focus(); }, []);

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = { name: name.trim(), description: description.trim() || null };
      const { data } = initial
        ? await collectionsApi.update(initial.id, payload)
        : await collectionsApi.create(payload);
      onSaved(data);
    } catch (e: any) {
      setError(e.response?.data?.detail ?? "Save failed");
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            {initial ? "Edit collection" : "New collection"}
          </h2>
          <button onClick={onClose} className="btn-ghost p-1.5 rounded-lg">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className="label">Name</label>
            <input
              ref={nameRef}
              className="input text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              placeholder="e.g. Halloween 2026"
            />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className="input text-sm resize-none"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-800 flex gap-2 justify-end">
          <button className="btn-secondary text-sm" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary text-sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : initial ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
