import { useEffect, useState } from "react";

// UI version is baked at build time from package.json (vite.config.ts).
const UI_VERSION = __APP_VERSION__;

export function VersionBadge() {
  const [apiVersion, setApiVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setApiVersion(d?.version ?? null))
      .catch(() => {});
  }, []);

  // Mismatch = UI and API images aren't on the same release (e.g. one container
  // wasn't recreated after a pull). Flag it so it's obvious during upgrades.
  const mismatch = apiVersion !== null && apiVersion !== UI_VERSION;

  const label = mismatch
    ? `ui v${UI_VERSION} · api v${apiVersion}`
    : `v${UI_VERSION}`;

  return (
    <div
      className={`fixed bottom-1 left-2 z-30 text-[10px] font-mono select-none tabular-nums ${
        mismatch
          ? "text-amber-500/80"
          : "text-gray-400/50 dark:text-gray-600/50 pointer-events-none"
      }`}
      title={mismatch ? "UI and API versions differ — a container may not have been recreated after pulling new images" : `PrintVault ${label}`}
    >
      {label}
    </div>
  );
}
