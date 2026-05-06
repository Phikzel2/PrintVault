import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, Center, Bounds, useBounds, useProgress, Html } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import * as THREE from "three";
import type { ModelFile } from "../types";
import { filesApi } from "../api/client";

const SLICERS = [
  { id: "orca",  name: "Orca Slicer",  scheme: "orcaslicer" },
  { id: "bambu", name: "Bambu Studio", scheme: "bambustudio" },
  { id: "prusa", name: "PrusaSlicer",  scheme: "prusaslicer" },
  { id: "super", name: "SuperSlicer",  scheme: "superslicer" },
] as const;

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
        className="flex items-center gap-1.5 text-xs bg-gray-900/80 hover:bg-gray-800 border border-gray-700 text-gray-300 hover:text-white px-2.5 py-1.5 rounded-l-lg transition-colors backdrop-blur-sm"
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        {active ? active.name : "Open in slicer"}
      </button>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center px-1.5 py-1.5 text-xs bg-gray-900/80 hover:bg-gray-800 border border-l-0 border-gray-700 text-gray-500 hover:text-white rounded-r-lg transition-colors backdrop-blur-sm"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full mb-1.5 left-0 bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[150px] z-10">
          {SLICERS.map((s) => (
            <button
              key={s.id}
              onClick={() => launch(s)}
              className={`w-full text-left text-xs px-3 py-1.5 transition-colors flex items-center gap-2 ${
                s.id === preferred
                  ? "text-brand-400 bg-brand-900/20"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              {s.id === preferred && (
                <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
              {s.id !== preferred && <span className="w-3 shrink-0" />}
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
      <div className="text-gray-400 text-sm text-center">
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
    bounds.refresh().fit();
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
      mesh.material = new THREE.MeshStandardMaterial({ color: "#6366f1", roughness: 0.4, metalness: 0.1 });
    }
  });
  return (
    <Center>
      <primitive object={object} castShadow />
      <FitOnLoad />
    </Center>
  );
}

interface ModelViewerProps {
  files: ModelFile[];
}

export function ModelViewer({ files }: ModelViewerProps) {
  const viewableFiles = files.filter((f) => f.file_type === "STL" || f.file_type === "3MF");
  const [activeFile, setActiveFile] = useState<ModelFile | null>(viewableFiles[0] ?? null);

  if (viewableFiles.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-600 flex-col gap-3">
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
        <div className="flex gap-2 p-2 bg-gray-900 border-b border-gray-800 overflow-x-auto shrink-0">
          {viewableFiles.map((f) => (
            <button
              key={f.id}
              onClick={() => setActiveFile(f)}
              className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                activeFile?.id === f.id
                  ? "bg-brand-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:text-gray-200"
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
            <color attach="background" args={["#111827"]} />
            <ambientLight intensity={0.4} />
            <directionalLight position={[5, 8, 5]} intensity={1.5} castShadow />
            <directionalLight position={[-5, 2, -5]} intensity={0.3} />

            <Bounds fit clip observe margin={1.2}>
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

        <SlicerButton fileId={activeFile.id} />
        <div className="absolute bottom-3 right-3 text-xs text-gray-600 select-none pointer-events-none">
          Drag to rotate · Scroll to zoom
        </div>
      </div>
    </div>
  );
}
