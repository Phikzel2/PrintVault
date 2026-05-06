import { Suspense, useEffect, useState } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, Center, Bounds, useBounds, useProgress, Html } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import * as THREE from "three";
import type { ModelFile } from "../types";
import { filesApi } from "../api/client";

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

        <div className="absolute bottom-3 right-3 text-xs text-gray-600 select-none pointer-events-none">
          Drag to rotate · Scroll to zoom
        </div>
      </div>
    </div>
  );
}
