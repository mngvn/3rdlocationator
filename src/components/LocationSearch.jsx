import { useState, useRef, useEffect } from "react";

const RADIUS_OPTIONS = [
  { meters: 1500, label: "1 mi" },
  { meters: 3000, label: "2 mi" },
  { meters: 5000, label: "3 mi" },
  { meters: 8000, label: "5 mi" },
];

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

export default function LocationSearch({ onSearch, loading, currentLabel }) {
  const [input, setInput] = useState("");
  const [radius, setRadius] = useState(5000);
  const [suggestions, setSuggestions] = useState([]);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function fetchSuggestions(q) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
    if (q.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(q)}&limit=6`;
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = await res.json();
        setSuggestions(data);
        setActiveIdx(-1);
      } catch (e) {
        if (e.name !== "AbortError") setSuggestions([]);
      }
    }, 350);
  }

  function handleInput(e) {
    const v = e.target.value;
    setInput(v);
    setOpen(true);
    fetchSuggestions(v);
  }

  function selectSuggestion(s) {
    const label = shortLabel(s);
    setInput(label);
    setSuggestions([]);
    setOpen(false);
    onSearch(s.display_name, radius);
  }

  function handleKeyDown(e) {
    if (!open || !suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    const q = input.trim();
    if (q) {
      setOpen(false);
      onSearch(q, radius);
    }
  }

  return (
    <form className="location-search" onSubmit={handleSubmit} ref={wrapperRef}>
      <div className="search-row">
        <div className="search-input-wrap">
          <input
            type="text"
            placeholder="Enter a city or address"
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onFocus={() => suggestions.length && setOpen(true)}
            disabled={loading}
            autoComplete="off"
          />
          {open && suggestions.length > 0 && (
            <ul className="autocomplete-list">
              {suggestions.map((s, i) => (
                <li
                  key={s.place_id}
                  className={i === activeIdx ? "active" : ""}
                  onMouseDown={(e) => { e.preventDefault(); selectSuggestion(s); }}
                  onMouseEnter={() => setActiveIdx(i)}
                >
                  <strong>{shortLabel(s)}</strong>
                  <span>{regionLabel(s)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} disabled={loading}>
          {RADIUS_OPTIONS.map((o) => (
            <option key={o.meters} value={o.meters}>{o.label}</option>
          ))}
        </select>
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
