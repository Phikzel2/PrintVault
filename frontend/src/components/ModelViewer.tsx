import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, Center, Bounds, useBounds, useProgress, Html } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import * as THREE from "three";
import type { ModelFile } from "../types";
import { filesApi } from "../api/client";
import { useTheme } from "../context/ThemeContext";

const SLICERS = [
  { id: "orca",  name: "Orca Slicer",  scheme: "orcaslicer" },
  { id: "bambu", name: "Bambu Studio", scheme: "bambustudio" },
  { id: "prusa", name: "PrusaSlicer",  scheme: "prusaslicer" },
  { id: "super", name: "SuperSlicer",  scheme: "superslicer" },
  { id: "cura",  name: "Ultimaker Cura", scheme: "cura" },
] as const;

function SlicerIcon({ id }: { id: string }) {
  const cls = "w-4 h-4 shrink-0";
  switch (id) {
    case "orca": return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" className={cls}>
        <rect width="64" height="64" rx="14" fill="#e9e9e9"/>
        <path d="M13.84,50.354a19.7,19.7,0,0,0,13.883,5.79A19.944,19.944,0,0,0,41.858,22.182Z" fill="#292826"/>
        <path d="M41.858,22.181,13.84,50.354l.061.059A220.548,220.548,0,0,0,46.378,29.277a19.964,19.964,0,0,0-4.52-7.1" fill="#009789"/>
        <path d="M36.381,7.856A19.943,19.943,0,0,0,22.327,41.818L50.345,13.646a19.693,19.693,0,0,0-13.964-5.79" fill="#292826"/>
        <path d="M36.381,7.856A19.636,19.636,0,0,0,26.04,10.782a22.742,22.742,0,0,0-5.91-.745,23.084,23.084,0,0,0-9.477,2.124.632.632,0,0,0,.129,1.191,13.52,13.52,0,0,1,8.069,5.137A20.06,20.06,0,0,0,17.41,33.534a19.873,19.873,0,0,1,2-3.488c1.819-2.5,3.743-3.8,6.585-5.723,2.093-1.416,5-3.077,13.359-6.512a28.421,28.421,0,0,0,6.12-2.821c1.4-.831,2.461-1.615,2.8-2.842.024-.086.045-.172.065-.256A19.655,19.655,0,0,0,36.381,7.856" fill="#262523"/>
        <path d="M39.69,14.551c.727,1.285-.728,3.495-3.249,4.937s-5.154,1.569-5.88.284.727-3.495,3.248-4.937,5.154-1.569,5.881-.284" fill="#fff"/>
      </svg>
    );
    case "bambu": return (
      <svg viewBox="0 0 128 128" className={cls}>
        <path d="M99.7586 128H28.2414C12.6464 128 0 115.354 0 99.7586V28.2414C0 12.6464 12.6464 0 28.2414 0H99.7586C115.354 0 128 12.6464 128 28.2414V99.7586C128 115.354 115.354 128 99.7586 128Z" fill="#00AE42"/>
        <path d="M65.7826 54.5925V101.264H92.3441V65.0528L65.7826 54.5925Z" fill="white"/>
        <path d="M65.7826 26.7924V50.1337L92.3441 60.5939V26.7924H65.7826Z" fill="white"/>
        <path d="M35.0999 73.4637V26.7924H61.6615V63.0147L35.0999 73.4637Z" fill="white"/>
        <path d="M35.0999 101.264V77.9339L61.6615 67.4736V101.264H35.0999Z" fill="white"/>
      </svg>
    );
    case "prusa": return (
      <svg viewBox="0 0 800 800" className={cls}>
        <circle cx="400" cy="400" r="400" fill="#fff"/>
        <path d="M599.3,186.8c-93.9-93.9-246.1-93.9-340,0s-93.9,246.1,0,340Z" fill="#363636"/>
        <path d="M202.7,612.5c93.9,93.9,246.1,93.9,340,0s93.9-246.1,0-340" fill="#ed6b21"/>
      </svg>
    );
    case "super": return (
      <svg viewBox="0 0 800 800" className={cls}>
        <circle cx="400" cy="400" r="400" fill="#fff"/>
        <path d="M599.3,186.8c-93.9-93.9-246.1-93.9-340,0s-93.9,246.1,0,340Z" fill="#363636"/>
        <path d="M202.7,612.5c93.9,93.9,246.1,93.9,340,0s93.9-246.1,0-340" fill="#2172eb"/>
      </svg>
    );
    case "cura": return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 132.172 132.172" fillRule="evenodd" clipRule="evenodd" className={cls}>
        <path fill="#00abe5" d="M100.173 98.547c-15.887-.61-35.331 2.289-48.916-3.18-24.306-9.784-27.793-53.224.105-65.687 12.146-5.426 33.643-2.52 48.61-3.137l.19 18.812-34.094-.043c-9.792.314-16.145 7.516-15.87 17.62.273 10.082 6.284 16.693 16.388 17.067 10.922.404 22.796.042 33.81.003zM45.071 0h87.101v87.266c-.17.736-.56 1.396-1.383 2.22l-41.304 41.303c-.823.823-1.483 1.213-2.219 1.383H0V44.906c.17-.736.56-1.396 1.383-2.22L38.593 5.55C42.819 1.325 43.338.237 45.072 0"/>
        <path fill="#fefefe" d="m100.173 98.547.224-18.545c-11.015.04-22.889.4-33.811-.003-10.104-.374-16.116-6.985-16.389-17.067-.274-10.104 6.079-17.306 15.87-17.62l34.096.043-.19-18.812c-14.968.617-36.465-2.29-48.61 3.137-27.9 12.463-24.412 55.903-.106 65.688 13.584 5.468 33.029 2.569 48.916 3.179"/>
      </svg>
    );
    default: return null;
  }
}

type SlicerId = typeof SLICERS[number]["id"];
const PREF_KEY = "preferred-slicer";

function SlicerButton({ fileId }: { fileId: number }) {
  const [preferred, setPreferred] = useState<SlicerId | null>(
    () => localStorage.getItem(PREF_KEY) as SlicerId | null
  );
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const launch = (slicer: typeof SLICERS[number]) => {
    const fileUrl = window.location.origin + filesApi.downloadUrl(fileId);
    const a = document.createElement("a");
    a.href = `${slicer.scheme}://open?file=${encodeURIComponent(fileUrl)}`;
    a.click();
    setPreferred(slicer.id);
    localStorage.setItem(PREF_KEY, slicer.id);
    setOpen(false);
  };

  const active = SLICERS.find((s) => s.id === preferred);

  return (
    <div ref={ref} className="absolute bottom-3 left-3 flex items-center">
      <button
        onClick={() => active ? launch(active) : setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs bg-white/80 dark:bg-gray-900/80 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white px-2.5 py-1.5 rounded-l-lg transition-colors backdrop-blur-sm"
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        {active && <SlicerIcon id={active.id} />}
        {active ? active.name : "Open in slicer"}
      </button>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center px-1.5 py-1.5 text-xs bg-white/80 dark:bg-gray-900/80 hover:bg-gray-100 dark:hover:bg-gray-800 border border-l-0 border-gray-300 dark:border-gray-700 text-gray-500 hover:text-gray-900 dark:hover:text-white rounded-r-lg transition-colors backdrop-blur-sm"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full mb-1.5 left-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 min-w-[150px] z-10">
          {SLICERS.map((s) => (
            <button
              key={s.id}
              onClick={() => launch(s)}
              className={`w-full text-left text-xs px-3 py-1.5 transition-colors flex items-center gap-2 ${
                s.id === preferred
                  ? "text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              <SlicerIcon id={s.id} />
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Loader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="text-gray-600 dark:text-gray-400 text-sm text-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        {Math.round(progress)}%
      </div>
    </Html>
  );
}

// Fits the camera to the bounds after the model finishes loading
function FitOnLoad() {
  const bounds = useBounds();
  useEffect(() => {
    const id = requestAnimationFrame(() => bounds.refresh().fit());
    return () => cancelAnimationFrame(id);
  }, [bounds]);
  return null;
}

function STLModel({ url }: { url: string }) {
  const geometry = useLoader(STLLoader, url);
  geometry.computeVertexNormals();
  return (
    <Center>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color="#6366f1" roughness={0.4} metalness={0.1} />
      </mesh>
      <FitOnLoad />
    </Center>
  );
}

function ThreeMFModel({ url }: { url: string }) {
  const object = useLoader(ThreeMFLoader as any, url) as THREE.Group;

  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.computeVertexNormals();
      mesh.material = new THREE.MeshStandardMaterial({ color: "#6366f1", roughness: 0.4, metalness: 0.1 });
    }
  });

  // 3MF files embed build-plate coordinates so the group origin is way off.
  // Compute the bounding box and negate the center to shift it to the origin.
  const offset = useMemo(() => {
    const box = new THREE.Box3().setFromObject(object);
    const c = box.getCenter(new THREE.Vector3());
    return [-c.x, -c.y, -c.z] as [number, number, number];
  }, [object]);

  return (
    <group position={offset}>
      <primitive object={object} castShadow />
      <FitOnLoad />
    </group>
  );
}

interface ModelViewerProps {
  files: ModelFile[];
}

export function ModelViewer({ files }: ModelViewerProps) {
  const { theme } = useTheme();
  const viewableFiles = files.filter((f) => f.file_type === "STL" || f.file_type === "3MF");
  const [activeFile, setActiveFile] = useState<ModelFile | null>(viewableFiles[0] ?? null);

  if (viewableFiles.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-600 flex-col gap-3">
        <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
        <span className="text-sm">No 3D files to preview</span>
      </div>
    );
  }

  const fileUrl = activeFile
    ? `${filesApi.downloadUrl(activeFile.id)}?s=${activeFile.file_size ?? 0}`
    : null;

  return (
    <div className="w-full h-full flex flex-col">
      {viewableFiles.length > 1 && (
        <div className="flex gap-2 p-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 overflow-x-auto shrink-0">
          {viewableFiles.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFile(f)}
              className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                activeFile?.id === f.id
                  ? "bg-brand-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
            >
              {f.original_filename}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 relative">
        {fileUrl && activeFile && (
          <Canvas
            shadows
            camera={{ position: [0, 0, 5], fov: 50 }}
            gl={{ antialias: true }}
            className="w-full h-full"
          >
            <color attach="background" args={[theme === "light" ? "#f3f4f6" : "#111827"]} />
            <ambientLight intensity={0.4} />
            <directionalLight position={[5, 8, 5]} intensity={1.5} castShadow />
            <directionalLight position={[-5, 2, -5]} intensity={0.3} />

            <Bounds clip margin={1.2}>
              <Suspense fallback={<Loader />}>
                {activeFile.file_type === "STL" ? (
                  <STLModel key={fileUrl} url={fileUrl} />
                ) : (
                  <ThreeMFModel key={fileUrl} url={fileUrl} />
                )}
              </Suspense>
            </Bounds>

            <OrbitControls makeDefault enableDamping dampingFactor={0.05} />
          </Canvas>
        )}

        {activeFile && <SlicerButton fileId={activeFile.id} />}
        <div className="absolute bottom-3 right-3 text-xs text-gray-500 dark:text-gray-600 select-none pointer-events-none">
          Drag to rotate · Scroll to zoom
        </div>
      </div>
    </div>
  );
}
