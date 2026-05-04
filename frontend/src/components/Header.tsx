import { Link, useNavigate } from "react-router-dom";
import { useState } from "react";

interface HeaderProps {
  onAddModel?: () => void;
}

export function Header({ onAddModel }: HeaderProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/?search=${encodeURIComponent(search)}`);
  };

  return (
    <header className="sticky top-0 z-50 bg-gray-950/80 backdrop-blur border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <svg className="w-8 h-8 text-brand-500" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="font-bold text-lg text-white hidden sm:block">PrintVault</span>
        </Link>

        <form onSubmit={handleSearch} className="flex-1 max-w-xl">
          <input
            type="search"
            placeholder="Search models..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input text-sm"
          />
        </form>

        <nav className="flex items-center gap-2 shrink-0">
          <Link to="/printers" className="btn-ghost text-sm px-3 py-2 rounded-lg">
            Printers
          </Link>
          {onAddModel && (
            <button onClick={onAddModel} className="btn-primary text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Model
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
