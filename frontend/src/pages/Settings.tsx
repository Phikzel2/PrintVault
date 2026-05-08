import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { usersApi } from "../api/client";
import type { DateFormat, User } from "../types";

const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (e.g. 05/05/2026)" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (e.g. 05/05/2026)" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (e.g. 2026-05-05)" },
];

export function Settings() {
  const { user, updateUser } = useAuth();
  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-4">
        <Link to="/" className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Library
        </Link>
      </div>

      <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Settings</h1>

      <div className="flex flex-col gap-6">
        <PreferencesSection user={user} updateUser={updateUser} />
        <PasswordSection />
        {user.is_admin && <UserManagementSection />}
      </div>
    </div>
  );
}

function PreferencesSection({ user, updateUser }: { user: User; updateUser: (u: User) => void }) {
  const [dateFormat, setDateFormat] = useState<DateFormat>(user.settings.date_format);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await usersApi.updateSettings({ date_format: dateFormat });
      updateUser(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-5">
      <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Preferences</h2>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600 dark:text-gray-400 font-medium">Date format</label>
          <select
            className="input text-sm"
            value={dateFormat}
            onChange={(e) => setDateFormat(e.target.value as DateFormat)}
          >
            {DATE_FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={saving} className="btn-primary text-sm">
            {saving ? "Saving..." : "Save"}
          </button>
          {saved && <span className="text-xs text-green-400">Saved</span>}
        </div>
      </div>
    </div>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (next.length < 6) { setError("New password must be at least 6 characters"); return; }
    if (next !== confirm) { setError("Passwords do not match"); return; }
    setSaving(true);
    try {
      await usersApi.updatePassword(current, next);
      setCurrent(""); setNext(""); setConfirm("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Failed to update password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card p-5">
      <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Change Password</h2>
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600 dark:text-gray-400 font-medium">Current password</label>
          <input className="input text-sm" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600 dark:text-gray-400 font-medium">New password</label>
          <input className="input text-sm" type="password" value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-600 dark:text-gray-400 font-medium">Confirm new password</label>
          <input className="input text-sm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && <p className="text-sm text-green-400">Password updated</p>}
        <button type="submit" disabled={saving} className="btn-primary text-sm self-start">
          {saving ? "Saving..." : "Update password"}
        </button>
      </form>
    </div>
  );
}

function UserManagementSection() {
  const [users, setUsers] = useState<User[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const { user: currentUser } = useAuth();

  const load = async () => {
    const { data } = await usersApi.list();
    setUsers(data);
    setLoaded(true);
  };

  if (!loaded) {
    return (
      <div className="card p-5">
        <h2 className="font-semibold text-gray-900 dark:text-white mb-4">User Management</h2>
        <button onClick={load} className="btn-secondary text-sm">Load users</button>
      </div>
    );
  }

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      await usersApi.create({ username: newUsername, password: newPassword });
      setNewUsername(""); setNewPassword("");
      await load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setCreateError(msg || "Failed to create user");
    } finally {
      setCreating(false);
    }
  };

  const deleteUser = async (id: number) => {
    if (!confirm("Delete this user?")) return;
    await usersApi.delete(id);
    setUsers((prev) => prev?.filter((u) => u.id !== id) ?? null);
  };

  return (
    <div className="card p-5">
      <h2 className="font-semibold text-gray-900 dark:text-white mb-4">User Management</h2>

      <div className="flex flex-col gap-2 mb-6">
        {(users ?? []).map((u) => (
          <div key={u.id} className="flex items-center justify-between py-2 border-b border-gray-200 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-800 dark:text-gray-200">{u.username}</span>
              {u.is_admin && <span className="text-xs px-2 py-0.5 bg-brand-900/50 text-brand-400 rounded-full">admin</span>}
            </div>
            {u.id !== currentUser?.id && (
              <button onClick={() => deleteUser(u.id)} className="btn-ghost text-xs text-red-400 hover:text-red-300 px-2 py-1">
                Delete
              </button>
            )}
          </div>
        ))}
      </div>

      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Add user</h3>
      <form onSubmit={createUser} className="flex flex-col gap-3">
        <div className="flex gap-3">
          <input
            className="input text-sm flex-1"
            placeholder="Username"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            required
          />
          <input
            className="input text-sm flex-1"
            type="password"
            placeholder="Password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
        </div>
        {createError && <p className="text-sm text-red-400">{createError}</p>}
        <button type="submit" disabled={creating} className="btn-primary text-sm self-start">
          {creating ? "Creating..." : "Create user"}
        </button>
      </form>
    </div>
  );
}
