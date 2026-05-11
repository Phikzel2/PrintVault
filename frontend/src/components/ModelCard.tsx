import { useState } from "react";
import { Link } from "react-router-dom";
import type { PrintModelSummary } from "../types";
import { modelsApi } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { formatDate } from "../utils/format";

interface ModelCardProps {
  model: PrintModelSummary;
}

function FileBadge({ label, count, color }: { label: string; count: number; color: string }) {
  if (count === 0) return null;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
      {count} {label}
    </span>
  );
}

export function ModelCard({ model }: ModelCardProps) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [imgLoaded, setImgLoaded] = useState(false);
  const thumbUrl = model.thumbnail_path ? `${model.thumbnail_path}&theme=${theme}` : null;
  const showPublicBadge = model.is_public;

  return (
    <Link
      to={`/models/${model.id}`}
      className="card group flex flex-col overflow-hidden hover:border-brand-600 transition-colors"
    >
      <div className="aspect-[4/3] bg-gray-200 dark:bg-gray-800 relative overflow-hidden">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={model.name}
            onLoad={() => setImgLoaded(true)}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            className={`w-full h-full object-cover group-hover:scale-105 transition-[transform,opacity] duration-300 ${imgLoaded ? "opacity-100" : "opacity-0"}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-600">
            <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
        )}
        <div className="absolute bottom-2 left-2 flex gap-1 flex-wrap">
          <FileBadge label="STL" count={model.stl_count} color="bg-blue-100 text-blue-700 dark:bg-blue-900/80 dark:text-blue-300" />
          <FileBadge label="3MF" count={model.threemf_count} color="bg-purple-100 text-purple-700 dark:bg-purple-900/80 dark:text-purple-300" />
          <FileBadge label="GCODE" count={model.gcode_count} color="bg-green-100 text-green-700 dark:bg-green-900/80 dark:text-green-300" />
        </div>
        {showPublicBadge && (
          <div className="absolute top-2 right-2">
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-white/80 text-gray-600 dark:bg-gray-900/80 dark:text-gray-400 rounded-full">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
              </svg>
              Public
            </span>
          </div>
        )}
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm line-clamp-2 leading-snug group-hover:text-brand-400 transition-colors">
          {model.name}
        </h3>

        {model.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-auto">
            {model.tags.slice(0, 4).map((tag) => (
              <span key={tag.id} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 rounded-full">
                {tag.name}
              </span>
            ))}
            {model.tags.length > 4 && (
              <span className="text-xs px-2 py-0.5 text-gray-400 dark:text-gray-600">+{model.tags.length - 4}</span>
            )}
          </div>
        )}

        <p className="text-xs text-gray-500 dark:text-gray-600 mt-auto">
          {formatDate(model.created_at, user?.settings.date_format)}
        </p>
      </div>
    </Link>
  );
}
