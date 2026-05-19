import { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider, useToast } from "./context/ToastContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Header } from "./components/Header";
import { Home } from "./pages/Home";
import { ModelDetail } from "./pages/ModelDetail";
import { Printers } from "./pages/Printers";
import { Settings } from "./pages/Settings";
import { Storage } from "./pages/Storage";
import { Login } from "./pages/Login";
import { UploadModal } from "./components/UploadModal";
import { ImportModal } from "./components/ImportModal";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

function AppShell() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [showUpload, setShowUpload] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Press "n" anywhere to open the Add Model modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (showUpload || showImport) return;
      if (["INPUT", "TEXTAREA", "SELECT"].includes((e.target as HTMLElement).tagName)) return;
      if (e.key === "n" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShowUpload(true);
      }
      if (e.key === "i" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setShowImport(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showUpload, showImport]);

  return (
    <div className="min-h-screen">
      <ScrollToTop />
      <Header onAddModel={() => setShowUpload(true)} onImport={() => setShowImport(true)} />
      <Routes>
        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/models/:id" element={<ProtectedRoute><ModelDetail /></ProtectedRoute>} />
        <Route path="/printers" element={<ProtectedRoute><Printers /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/storage" element={<ProtectedRoute><Storage /></ProtectedRoute>} />
      </Routes>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={(id) => {
            setShowUpload(false);
            showToast("Model added");
            navigate(`/models/${id}`);
          }}
        />
      )}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={(id) => {
            setShowImport(false);
            showToast("Model imported");
            navigate(`/models/${id}`);
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/*" element={<AppShell />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
