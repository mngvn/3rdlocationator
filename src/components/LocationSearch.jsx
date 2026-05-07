import { useState, useRef, useEffect, useMemo } from "react";
import { useLocalStorage } from "../hooks/useLocalStorage";

const RECENT_LIMIT = 6;
const DEBOUNCE_MS = 200;
const RESULT_LIMIT = 8;

function shortLabel(s) {
  const a = s.address || {};
  const place = a.city || a.town || a.village || a.hamlet || a.suburb || s.name;
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  if (street && place) return `${street}, ${place}`;
  return place || s.display_name?.split(",")[0] || s.name;
}

function regionLabel(s) {
  const a = s.address || {};
  return [a.state, a.country].filter(Boolean).join(", ");
}

// Bold the portion of `text` that matches `q` (case-insensitive prefix or substring).
function HighlightedLabel({ text, q }) {
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export default function LocationSearch({ onSearch, loading, currentLabel }) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [open, setOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [recentSearches, setRecentSearches] = useLocalStorage("bh_recent_searches", []);
  const inputRef = useRef(null);
  const typedRef = useRef(""); // last text the user actually typed (no autocomplete tail)
  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const wrapperRef = useRef(null);

  // True when the dropdown is showing recents (input empty) vs. live results
  const showingRecent = input.trim().length < 2 && suggestions.length === 0 && recentSearches.length > 0 && open;
  const displayed = useMemo(
    () => (showingRecent ? recentSearches : suggestions),
    [showingRecent, recentSearches, suggestions]
  );

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Inline-complete with the top suggestion when fresh results arrive
  useEffect(() => {
    if (!suggestions.length || !open || !inputRef.current) return;
    const typed = typedRef.current;
    if (!typed.trim() || typed.length < 2) return;
    const topLabel = shortLabel(suggestions[0]);
    if (
      topLabel.toLowerCase().startsWith(typed.toLowerCase()) &&
      topLabel.length > typed.length
    ) {
      const completed = typed + topLabel.slice(typed.length);
      setInput(completed);
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(typed.length, completed.length);
        }
      });
    }
  }, [suggestions, open]);

  function fetchSuggestions(q) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
    if (q.trim().length < 2) {
      setSuggestions([]);
      setFetching(false);
      return;
    }
    setFetching(true);
    debounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const url =
          `https://nominatim.openstreetmap.org/search?format=json` +
          `&addressdetails=1&dedupe=1&accept-language=en` +
          `&limit=${RESULT_LIMIT}&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) { setFetching(false); return; }
        const data = await res.json();
        // Sort by Nominatim's importance score so well-known places come first
        data.sort((a, b) => (b.importance || 0) - (a.importance || 0));
        setSuggestions(data);
        setActiveIdx(-1);
      } catch (e) {
        if (e.name !== "AbortError") setSuggestions([]);
      } finally {
        setFetching(false);
      }
    }, DEBOUNCE_MS);
  }

  function handleInput(e) {
    const v = e.target.value;
    const inputType = e.nativeEvent?.inputType || "";
    const isDelete = inputType.startsWith("delete");
    typedRef.current = v;
    setInput(v);
    if (isDelete) {
      setSuggestions([]);
      setOpen(true); // keep open so recents can show if input gets cleared
    } else {
      setOpen(true);
      fetchSuggestions(v);
    }
  }

  function selectSuggestion(s) {
    const label = shortLabel(s);
    typedRef.current = label;
    setInput(label);
    setSuggestions([]);
    setOpen(false);
    // Push to recents (dedupe by place_id, keep newest first)
    setRecentSearches((prev) => {
      const filtered = (prev || []).filter((r) => r.place_id !== s.place_id);
      return [s, ...filtered].slice(0, RECENT_LIMIT);
    });
    onSearch(s.display_name);
  }

  function clearRecents(e) {
    e.stopPropagation();
    setRecentSearches([]);
  }

  function handleKeyDown(e) {
    // Tab/→ at end of input accepts the inline completion
    if ((e.key === "Tab" || e.key === "ArrowRight") && inputRef.current) {
      const el = inputRef.current;
      const atEnd = el.selectionEnd === input.length;
      const hasCompletion = el.selectionStart < el.selectionEnd;
      if (hasCompletion && atEnd) {
        e.preventDefault();
        typedRef.current = input;
        el.setSelectionRange(input.length, input.length);
        return;
      }
    }
    if (!open || !displayed.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, displayed.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      selectSuggestion(displayed[activeIdx]);
    } else if (e.key === "Escape") {
      setInput(typedRef.current);
      setSuggestions([]);
      setOpen(false);
    }
  }

  function handleFocus() {
    setOpen(true);
  }

  function handleSubmit(e) {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    typedRef.current = q;
    setOpen(false);
    onSearch(q);
  }

  return (
    <form className="location-search" onSubmit={handleSubmit} ref={wrapperRef}>
      <div className="search-row">
        <div className="search-input-wrap">
          <input
            ref={inputRef}
            type="text"
            placeholder="Enter a city or address"
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            disabled={loading}
            autoComplete="off"
            spellCheck={false}
          />
          {fetching && <span className="search-spinner" aria-hidden="true" />}
          {open && displayed.length > 0 && (
            <ul className="autocomplete-list">
              {showingRecent && (
                <li className="autocomplete-header">
                  <span>Recent</span>
                  <button type="button" className="autocomplete-clear" onClick={clearRecents}>
                    Clear
                  </button>
                </li>
              )}
              {displayed.map((s, i) => (
                <li
                  key={s.place_id}
                  className={i === activeIdx ? "active" : ""}
                  onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                  onMouseEnter={() => setActiveIdx(i)}
                >
                  <strong>
                    {showingRecent
                      ? <>↻ {shortLabel(s)}</>
                      : <HighlightedLabel text={shortLabel(s)} q={typedRef.current} />}
                  </strong>
                  <span>{regionLabel(s)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="submit" disabled={loading || !input.trim()} className="btn-primary">
          {loading ? "..." : "Go"}
        </button>
      </div>
      {currentLabel && (
        <p className="current-label" title={currentLabel}>📍 {currentLabel}</p>
      )}
    </form>
  );
}
