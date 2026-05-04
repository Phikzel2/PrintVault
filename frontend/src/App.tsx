import { useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import { Header } from "./components/Header";
import { Home } from "./pages/Home";
import { ModelDetail } from "./pages/ModelDetail";
import { Printers } from "./pages/Printers";
import { UploadModal } from "./components/UploadModal";

export default function App() {
  const navigate = useNavigate();
  const [showUpload, setShowUpload] = useState(false);

  return (
    <div className="min-h-screen">
      <Header onAddModel={() => setShowUpload(true)} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/models/:id" element={<ModelDetail />} />
        <Route path="/printers" element={<Printers />} />
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
    </div>
  );
}
