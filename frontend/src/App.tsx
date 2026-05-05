import { useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Header } from "./components/Header";
import { Home } from "./pages/Home";
import { ModelDetail } from "./pages/ModelDetail";
import { Printers } from "./pages/Printers";
import { Settings } from "./pages/Settings";
import { Login } from "./pages/Login";
import { UploadModal } from "./components/UploadModal";
import { ImportModal } from "./components/ImportModal";

function AppShell() {
  const navigate = useNavigate();
  const [showUpload, setShowUpload] = useState(false);
  const [showImport, setShowImport] = useState(false);

  return (
    <div className="min-h-screen">
      <Header onAddModel={() => setShowUpload(true)} onImport={() => setShowImport(true)} />
      <Routes>
        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/models/:id" element={<ProtectedRoute><ModelDetail /></ProtectedRoute>} />
        <Route path="/printers" element={<ProtectedRoute><Printers /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      </Routes>

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={(id) => {
            setShowUpload(false);
            navigate(`/models/${id}`);
          }}
        />
      )}
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/*" element={<AppShell />} />
      </Routes>
    </AuthProvider>
  );
}
