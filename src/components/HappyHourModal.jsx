import { useState } from "react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_OPTIONS = [
  { value: "known", label: "Has Happy Hour" },
  { value: "none", label: "No Happy Hour" },
  { value: "unknown", label: "Couldn't Find Info" },
];

function googleHHSearchUrl(venue) {
  const q = `${venue.name} happy hour ${venue.address || ""}`.trim();
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

export default function HappyHourModal({ venue, existing, onSave, onClose }) {
  const initialStatus = existing?.status || "known";
  const initialEntries = existing?.entries?.length
    ? existing.entries
    : [{ days: [], start: "16:00", end: "18:00", note: "" }];

  const [status, setStatus] = useState(initialStatus);
  const [entries, setEntries] = useState(initialEntries);

  function toggleDay(idx, day) {
    setEntries((prev) =>
      prev.map((e, i) =>
        i === idx
          ? { ...e, days: e.days.includes(day) ? e.days.filter((d) => d !== day) : [...e.days, day] }
          : e
      )
    );
  }

  function updateField(idx, field, val) {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: val } : e)));
  }

  function addEntry() {
    setEntries((prev) => [...prev, { days: [], start: "16:00", end: "18:00", note: "" }]);
  }

  function removeEntry(idx) {
    setEntries((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSave() {
    const validEntries = status === "known" ? entries.filter((e) => e.days.length > 0) : [];
    onSave({ status, entries: validEntries, source: existing?.source || "manual" });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Happy Hours — {venue.name}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {existing?.source === "osm" && (
          <div className="osm-banner">✓ Auto-imported from OpenStreetMap{existing.raw ? `: ${existing.raw}` : ""}</div>
        )}

        <div className="hh-search-tools">
          <a href={googleHHSearchUrl(venue)} target="_blank" rel="noopener noreferrer" className="hh-search-link">
            🔍 Search Google for happy hour info
          </a>
          {venue.website && (
            <a href={venue.website} target="_blank" rel="noopener noreferrer" className="hh-search-link">
              🌐 Visit venue website
            </a>
          )}
        </div>

        <div className="hh-status">
          {STATUS_OPTIONS.map((opt) => (
            <label key={opt.value} className={`hh-status-option ${status === opt.value ? "active" : ""}`}>
              <input
                type="radio"
                name="hh-status"
                value={opt.value}
                checked={status === opt.value}
                onChange={() => setStatus(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>

        {status === "known" && (
          <>
            {entries.map((entry, idx) => (
              <div className="hh-entry" key={idx}>
                <div className="day-pills">
                  {DAYS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`day-pill ${entry.days.includes(d) ? "active" : ""}`}
                      onClick={() => toggleDay(idx, d)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <div className="hh-times">
                  <input type="time" value={entry.start} onChange={(e) => updateField(idx, "start", e.target.value)} />
                  <span>to</span>
                  <input type="time" value={entry.end} onChange={(e) => updateField(idx, "end", e.target.value)} />
                </div>
                <input
                  type="text"
                  placeholder="Note (e.g. $3 drafts, half-off apps)"
                  value={entry.note}
                  onChange={(e) => updateField(idx, "note", e.target.value)}
                />
                {entries.length > 1 && (
                  <button className="remove-entry" onClick={() => removeEntry(idx)}>Remove</button>
                )}
              </div>
            ))}
            <button className="add-entry" onClick={addEntry}>+ Add Another Time</button>
          </>
        )}

        {status === "none" && (
          <p className="muted">This venue will be marked as having no happy hour.</p>
        )}

        {status === "unknown" && (
          <p className="muted">This venue will be marked as "info not found." Try the search links above to look it up, then update later.</p>
        )}

        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}
