import { Link } from "react-router-dom";
import type { PrintModelSummary } from "../types";
import { modelsApi } from "../api/client";

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
  const thumbUrl = model.thumbnail_path ? modelsApi.thumbnailUrl(model.id) : null;

  return (
    <Link
      to={`/models/${model.id}`}
      className="card group flex flex-col overflow-hidden hover:border-brand-600 transition-colors"
    >
      <div className="aspect-[4/3] bg-gray-800 relative overflow-hidden">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={model.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-600">
            <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
        )}
        <div className="absolute bottom-2 left-2 flex gap-1 flex-wrap">
          <FileBadge label="STL" count={model.stl_count} color="bg-blue-900/80 text-blue-300" />
          <FileBadge label="3MF" count={model.threemf_count} color="bg-purple-900/80 text-purple-300" />
          <FileBadge label="GCODE" count={model.gcode_count} color="bg-green-900/80 text-green-300" />
        </div>
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1">
        <h3 className="font-semibold text-gray-100 text-sm line-clamp-2 leading-snug group-hover:text-brand-400 transition-colors">
          {model.name}
        </h3>

        {model.tags.length > 0 && (
          <div className="flex gap-1 flex-wrap mt-auto">
            {model.tags.slice(0, 4).map((tag) => (
              <span key={tag.id} className="text-xs px-2 py-0.5 bg-gray-800 text-gray-400 rounded-full">
                {tag.name}
              </span>
            ))}
            {model.tags.length > 4 && (
              <span className="text-xs px-2 py-0.5 text-gray-600">+{model.tags.length - 4}</span>
            )}
          </div>
        )}

        <p className="text-xs text-gray-600 mt-auto">
          {new Date(model.created_at).toLocaleDateString("en-GB")}
        </p>
      </div>
    </Link>
  );
}
