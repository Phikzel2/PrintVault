import { useEffect, useState } from "react";
import { printersApi } from "../api/client";
import { useToast } from "../context/ToastContext";
import type { Printer } from "../types";

function errorMessage(err: unknown, fallback: string): string {
  const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return typeof detail === "string" && detail ? detail : fallback;
}

const EMPTY_FORM = {
  name: "", brand: "", model_name: "",
  build_volume_x: "", build_volume_y: "", build_volume_z: "",
  notes: "", moonraker_url: "",
};

function PrinterForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<Printer>;
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    brand: initial?.brand ?? "",
    model_name: initial?.model_name ?? "",
    build_volume_x: initial?.build_volume_x?.toString() ?? "",
    build_volume_y: initial?.build_volume_y?.toString() ?? "",
    build_volume_z: initial?.build_volume_z?.toString() ?? "",
    notes: initial?.notes ?? "",
    moonraker_url: initial?.moonraker_url ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Name is required");
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: form.name.trim(),
        brand: form.brand.trim() || null,
        model_name: form.model_name.trim() || null,
        build_volume_x: form.build_volume_x ? Number(form.build_volume_x) : null,
        build_volume_y: form.build_volume_y ? Number(form.build_volume_y) : null,
        build_volume_z: form.build_volume_z ? Number(form.build_volume_z) : null,
        notes: form.notes.trim() || null,
        moonraker_url: form.moonraker_url.trim() || null,
      });
    } catch (err) {
      setError(errorMessage(err, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Name *</label>
          <input className="input" placeholder="e.g. Bambu Lab X1C" {...field("name")} />
        </div>
        <div>
          <label className="label">Brand</label>
          <input className="input" placeholder="Bambu Lab" {...field("brand")} />
        </div>
        <div>
          <label className="label">Model</label>
          <input className="input" placeholder="X1 Carbon" {...field("model_name")} />
        </div>
        <div>
          <label className="label">Build X (mm)</label>
          <input className="input" type="number" placeholder="256" {...field("build_volume_x")} />
        </div>
        <div>
          <label className="label">Build Y (mm)</label>
          <input className="input" type="number" placeholder="256" {...field("build_volume_y")} />
        </div>
        <div>
          <label className="label">Build Z (mm)</label>
          <input className="input" type="number" placeholder="256" {...field("build_volume_z")} />
        </div>
        <div className="col-span-2">
          <label className="label">Moonraker URL</label>
          <input className="input" placeholder="http://192.168.1.100:7125" {...field("moonraker_url")} />
          <p className="text-xs text-gray-500 dark:text-gray-600 mt-1">Required to push GCODE files directly to the printer (Klipper/Moonraker)</p>
        </div>
        <div className="col-span-2">
          <label className="label">Notes</label>
          <textarea className="input resize-none" rows={2} placeholder="Optional notes..." {...field("notes")} />
        </div>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

export function Printers() {
  const { showToast } = useToast();
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const load = () => {
    printersApi.list().then((r) => { setPrinters(r.data); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (data: any) => {
    try {
      await printersApi.create(data);
      setAdding(false);
      load();
    } catch (err) {
      // PrinterForm catches and shows its own inline error, so re-throw to let it do that.
      throw err;
    }
  };

  const handleEdit = async (data: any) => {
    if (editId == null) return;
    try {
      await printersApi.update(editId, data);
      setEditId(null);
      load();
    } catch (err) {
      throw err;
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await printersApi.delete(id);
      setDeleteId(null);
      load();
    } catch (err) {
      showToast(errorMessage(err, "Failed to delete printer"), "error");
      setDeleteId(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Printers</h1>
        {!adding && (
          <button className="btn-primary" onClick={() => setAdding(true)}>
            + Add Printer
          </button>
        )}
      </div>

      {adding && (
        <div className="card p-5 mb-4">
          <h2 className="font-semibold mb-4">New Printer</h2>
          <PrinterForm onSave={handleAdd} onCancel={() => setAdding(false)} />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12 text-gray-500">Loading...</div>
      ) : printers.length === 0 ? (
        <div className="card p-10 text-center text-gray-500 dark:text-gray-600">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-400 dark:text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
          </svg>
          <p>No printers yet. Add one to link GCODE files.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {printers.map((p) => (
            <div key={p.id} className="card p-5">
              {editId === p.id ? (
                <PrinterForm initial={p} onSave={handleEdit} onCancel={() => setEditId(null)} />
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{p.name}</h3>
                    {(p.brand || p.model_name) && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                        {[p.brand, p.model_name].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {(p.build_volume_x || p.build_volume_y || p.build_volume_z) && (
                      <p className="text-xs text-gray-500 dark:text-gray-600 mt-1">
                        Build: {p.build_volume_x ?? "?"} × {p.build_volume_y ?? "?"} × {p.build_volume_z ?? "?"} mm
                      </p>
                    )}
                    {p.moonraker_url && (
                      <p className="text-xs text-gray-500 dark:text-gray-600 mt-1 flex items-center gap-1">
                        <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                        {p.moonraker_url}
                      </p>
                    )}
                    {p.notes && <p className="text-sm text-gray-500 mt-1">{p.notes}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setEditId(p.id)} className="btn-secondary text-sm px-3 py-1.5">Edit</button>
                    {deleteId === p.id ? (
                      <div className="flex gap-2 items-center">
                        <button onClick={() => handleDelete(p.id)} className="btn-danger text-sm px-3 py-1.5">Confirm</button>
                        <button onClick={() => setDeleteId(null)} className="btn-ghost text-sm px-2 py-1.5">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteId(p.id)} className="btn-ghost text-red-500 hover:text-red-400 text-sm px-3 py-1.5">Delete</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
