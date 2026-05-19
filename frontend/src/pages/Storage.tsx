import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { statsApi } from "../api/client";
import type { StorageStats } from "../types";

function fmt(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const TYPE_COLORS: Record<string, string> = {
  STL:   "bg-blue-500",
  "3MF": "bg-indigo-500",
  GCODE: "bg-green-500",
  OBJ:   "bg-purple-500",
  STEP:  "bg-yellow-500",
  AMF:   "bg-orange-500",
  OTHER: "bg-gray-500",
};

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-5 flex flex-col gap-1">
      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-bold text-gray-900 dark:text-white">{value}</span>
      {sub && <span className="text-xs text-gray-500 dark:text-gray-400">{sub}</span>}
    </div>
  );
}

function Bar({ pct, colorClass }: { pct: number; colorClass: string }) {
  return (
    <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
        style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
      />
    </div>
  );
}

export function Storage() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    statsApi.storage()
      .then((r) => setStats(r.data))
      .catch(() => setError("Failed to load storage stats"));
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-4">
        <Link to="/settings" className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Settings
        </Link>
      </div>

      <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Storage</h1>

      {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

      {!stats && !error && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      )}

      {stats && (
        <div className="flex flex-col gap-6">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Total storage" value={fmt(stats.total_bytes)} />
            <StatCard label="Files" value={stats.total_files.toString()} />
            <StatCard label="Models" value={stats.total_models.toString()} />
          </div>

          {/* By file type */}
          {stats.by_file_type.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4">By file type</h2>
              <div className="flex flex-col gap-3">
                {stats.by_file_type.map((row) => {
                  const pct = stats.total_bytes > 0 ? (row.bytes / stats.total_bytes) * 100 : 0;
                  const color = TYPE_COLORS[row.file_type] ?? TYPE_COLORS.OTHER;
                  return (
                    <div key={row.file_type} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
                          <span className="font-mono text-xs font-medium text-gray-700 dark:text-gray-300">{row.file_type}</span>
                          <span className="text-xs text-gray-400">{row.count} file{row.count !== 1 ? "s" : ""}</span>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">{fmt(row.bytes)}</span>
                      </div>
                      <Bar pct={pct} colorClass={color} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Per-user breakdown (admin only) */}
          {stats.by_user && stats.by_user.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4">By user</h2>
              <div className="flex flex-col gap-3">
                {stats.by_user.map((row) => {
                  const pct = stats.total_bytes > 0 ? (row.bytes / stats.total_bytes) * 100 : 0;
                  return (
                    <div key={row.user_id} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-gray-800 dark:text-gray-200">{row.username}</span>
                          <span className="text-xs text-gray-400">{row.file_count} file{row.file_count !== 1 ? "s" : ""}</span>
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">{fmt(row.bytes)}</span>
                      </div>
                      <Bar pct={pct} colorClass="bg-brand-500" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top models */}
          {stats.top_models.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Largest models</h2>
              <div className="flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
                {stats.top_models.map((row, i) => (
                  <div key={row.model_id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                    <span className="text-xs text-gray-400 tabular-nums w-5 shrink-0 text-right">{i + 1}</span>
                    <Link
                      to={`/models/${row.model_id}`}
                      className="flex-1 text-sm text-gray-800 dark:text-gray-200 hover:text-brand-400 truncate"
                    >
                      {row.name}
                    </Link>
                    <span className="text-xs text-gray-400 shrink-0">{row.file_count} file{row.file_count !== 1 ? "s" : ""}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums shrink-0 w-16 text-right">{fmt(row.bytes)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.total_files === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No files uploaded yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
