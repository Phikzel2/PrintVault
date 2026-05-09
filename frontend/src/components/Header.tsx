import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { tagsApi } from "../api/client";
import type { Tag } from "../types";

interface HeaderProps {
  onAddModel?: () => void;
  onImport?: () => void;
}

function parseSearchInput(value: string): { text: string; tags: string[] } {
  const tags: string[] = [];
  const text = value
    .replace(/#(\S+)/g, (_, t) => { tags.push(t.toLowerCase()); return ""; })
    .replace(/\s+/g, " ")
    .trim();
  return { text, tags };
}

function getActiveToken(value: string, cursor: number) {
  const before = value.slice(0, cursor);
  const match = before.match(/#(\S*)$/);
  if (!match) return null;
  const start = cursor - match[0].length;
  const rest = value.slice(cursor).match(/^\S*/)?.[0] ?? "";
  return { partial: match[1] + rest, start, end: cursor + rest.length };
}

export function Header({ onAddModel, onImport }: HeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearchMounted, setMobileSearchMounted] = useState(true);
  const mobileSearchRef = useRef<HTMLDivElement>(null);
  const exitAnimRef = useRef<Animation | null>(null);
  const scrolledRef = useRef(false);

  // Two refs: one per form instance (desktop row 1 / mobile row 2)
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const desktopFormRef = useRef<HTMLFormElement>(null);
  const mobileFormRef = useRef<HTMLFormElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const activeTokenRef = useRef<ReturnType<typeof getActiveToken>>(null);

  const activeInput = () =>
    window.matchMedia("(min-width: 768px)").matches
      ? desktopInputRef.current
      : mobileInputRef.current;

  const [search, setSearch] = useState(() => {
    const text = searchParams.get("search") ?? "";
    const tags = searchParams.getAll("tag");
    return [text, ...tags.map(t => `#${t}`)].filter(Boolean).join(" ");
  });

  useEffect(() => {
    const text = searchParams.get("search") ?? "";
    const tags = searchParams.getAll("tag");
    setSearch([text, ...tags.map(t => `#${t}`)].filter(Boolean).join(" "));
  }, [searchParams]);

  const fetchTags = () => tagsApi.list().then(r => setAllTags(r.data)).catch(() => {});
  useEffect(() => { fetchTags(); }, []);

  useEffect(() => {
    const onScroll = () => {
      const isScrolled = window.scrollY > 10;
      if (isScrolled === scrolledRef.current) return;
      scrolledRef.current = isScrolled;

      if (isScrolled) {
        setDropdownOpen(false);
        const el = mobileSearchRef.current;
        if (el) {
          exitAnimRef.current?.cancel();
          exitAnimRef.current = el.animate(
            [
              { opacity: "1", maxHeight: el.scrollHeight + "px", overflow: "hidden" },
              { opacity: "0", maxHeight: "0px", overflow: "hidden" },
            ],
            { duration: 220, easing: "ease-in", fill: "forwards" }
          );
          exitAnimRef.current.onfinish = () => setMobileSearchMounted(false);
        } else {
          setMobileSearchMounted(false);
        }
      } else {
        exitAnimRef.current?.cancel();
        exitAnimRef.current = null;
        setMobileSearchMounted(true);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Native × clear button fires "search" event, not "change" — handle both inputs
  useEffect(() => {
    const inputs = [desktopInputRef.current, mobileInputRef.current].filter(Boolean);
    const handler = (e: Event) => { if ((e.target as HTMLInputElement).value === "") navigate("/"); };
    inputs.forEach(i => i!.addEventListener("search", handler));
    return () => inputs.forEach(i => i!.removeEventListener("search", handler));
  }, [navigate]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      const inDesktop = desktopFormRef.current?.contains(e.target as Node);
      const inMobile = mobileFormRef.current?.contains(e.target as Node);
      if (!inDesktop && !inMobile) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const refreshSuggestions = (value: string, cursor: number) => {
    const token = getActiveToken(value, cursor);
    activeTokenRef.current = token;
    if (!token || !allTags.length) { setDropdownOpen(false); return; }
    const filtered = allTags
      .filter(t =>
        t.name.toLowerCase().startsWith(token.partial.toLowerCase()) &&
        t.name.toLowerCase() !== token.partial.toLowerCase()
      )
      .slice(0, 6);
    setSuggestions(filtered);
    setDropdownOpen(filtered.length > 0);
    setHighlighted(0);
  };

  const selectSuggestion = (tag: Tag) => {
    const token = activeTokenRef.current;
    if (!token) return;
    const before = search.slice(0, token.start);
    const after = search.slice(token.end);
    const suffix = after.startsWith(" ") || after === "" ? after : " " + after;
    const newValue = (`${before}#${tag.name}${suffix}`).trimEnd() + " ";
    setSearch(newValue);
    setDropdownOpen(false);

    const { text, tags } = parseSearchInput(newValue);
    const next = new URLSearchParams();
    if (text) next.set("search", text);
    tags.forEach(t => next.append("tag", t));
    navigate(next.toString() ? `/?${next.toString()}` : "/");

    const newCursor = before.length + 1 + tag.name.length + 1;
    requestAnimationFrame(() => {
      const input = activeInput();
      input?.focus();
      input?.setSelectionRange(newCursor, newCursor);
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value, selectionStart } = e.target;
    setSearch(value);
    refreshSuggestions(value, selectionStart ?? value.length);
  };

  const handleCursorMove = (e: React.SyntheticEvent<HTMLInputElement>) => {
    const { value, selectionStart } = e.currentTarget;
    refreshSuggestions(value, selectionStart ?? value.length);
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(e.key)) return;
    handleCursorMove(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!dropdownOpen) return;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlighted(i => Math.min(i + 1, suggestions.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlighted(i => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        selectSuggestion(suggestions[highlighted]);
        break;
      case "Tab":
        e.preventDefault();
        selectSuggestion(suggestions[highlighted]);
        break;
      case "Escape":
        setDropdownOpen(false);
        break;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDropdownOpen(false);
    const { text, tags } = parseSearchInput(search);
    const next = new URLSearchParams();
    if (text) next.set("search", text);
    tags.forEach(t => next.append("tag", t));
    const qs = next.toString();
    navigate(qs ? `/?${qs}` : "/");
  };

  const sharedInputProps = {
    type: "search" as const,
    placeholder: "Search titles or #tags…",
    value: search,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    onFocus: fetchTags,
    onClick: handleCursorMove,
    onKeyUp: handleKeyUp,
  };

  const Dropdown = () => (
    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-xl py-1 z-50">
      {suggestions.map((tag, i) => (
        <button
          key={tag.id}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); selectSuggestion(tag); }}
          className={`w-full text-left px-4 py-3 md:px-3 md:py-1.5 text-base md:text-sm flex items-center gap-2 transition-colors ${
            i === highlighted
              ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white"
              : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          }`}
        >
          <span className="text-brand-500 font-medium">#</span>
          {tag.name}
        </button>
      ))}
    </div>
  );

  return (
    <>
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-950/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">

      {/* Row 1 — always visible on all screen sizes */}
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <svg className="w-8 h-8 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <span className="font-bold text-lg text-gray-900 dark:text-white hidden sm:block">PrintVault</span>
        </Link>

        {/* Desktop search — hidden on mobile */}
        <form ref={desktopFormRef} onSubmit={handleSubmit} className="hidden md:block flex-1 max-w-xl relative">
          <input ref={desktopInputRef} {...sharedInputProps} className="input text-sm" />
          {dropdownOpen && <Dropdown />}
        </form>

        {/* Nav — ml-auto pushes it right on mobile (no search bar in row 1) */}
        <nav className="flex items-center gap-2 shrink-0 ml-auto md:ml-0">
          <Link to="/printers" className="btn-ghost text-sm px-3 py-2 rounded-lg">
            Printers
          </Link>
          {onImport && user && (
            <button onClick={onImport} className="btn-secondary text-sm hidden sm:flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Import URL
            </button>
          )}
          {onAddModel && user && (
            <button onClick={onAddModel} className="btn-primary text-sm flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Add Model</span>
            </button>
          )}

          <button
            onClick={toggleTheme}
            className="btn-ghost p-2 rounded-lg"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          {user && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="btn-ghost text-sm px-3 py-2 rounded-lg flex items-center gap-1.5"
              >
                <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-gray-700 dark:text-gray-300 max-w-[100px] truncate">{user.username}</span>
                <svg className="w-3 h-3 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-xl py-1 z-50">
                  <Link
                    to="/settings"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Settings
                  </Link>
                  <button
                    onClick={() => { logout(); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </nav>
      </div>

    </header>

    {/* Row 2 — only on home page; separate sticky element so Web Animations
        cannot affect the sticky <header> above (iOS Safari bug workaround). */}
    {location.pathname === "/" && mobileSearchMounted && (
      <div
        ref={mobileSearchRef}
        className="md:hidden sticky top-16 z-40 bg-white/80 dark:bg-gray-950/80 backdrop-blur border-b border-gray-200 dark:border-gray-800 px-4 py-2"
      >
        <form ref={mobileFormRef} onSubmit={handleSubmit} className="relative">
          <input ref={mobileInputRef} {...sharedInputProps} className="input text-base" />
          {dropdownOpen && <Dropdown />}
        </form>
      </div>
    )}
    </>
  );
}
