import { useState, useEffect } from "react";

function formatEventDate(dt) {
  if (!dt) return "";
  // Bandsintown gives e.g. "2026-05-14T20:00:00"
  const [datePart, timePart] = dt.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const dateObj = new Date(y, m - 1, d);
  let out = dateObj.toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric",
  });
  if (timePart) {
    const [hh, mm] = timePart.split(":").map(Number);
    const t = new Date();
    t.setHours(hh, mm, 0, 0);
    out += ` · ${t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  }
  return out;
}

const ROTATE_MS = 5500;

export default function EventBanner({ events, loading, onClose }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  // Reset to 0 when the event list changes (new home location, etc.)
  useEffect(() => { setIdx(0); }, [events]);

  // Auto-rotate; pauses while user is hovering.
  useEffect(() => {
    if (paused || events.length < 2) return;
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % events.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [paused, events.length]);

  if (!events.length && !loading) return null;

  const e = events[idx];

  return (
    <div
      className="event-banner"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {loading && !events.length ? (
        <div className="event-banner-inner">
          <span className="event-banner-emoji">🎤</span>
          <span>Looking for upcoming events nearby…</span>
        </div>
      ) : (
        <div className="event-banner-inner" key={idx}>
          <span className="event-banner-emoji">🎤</span>
          <span className="event-banner-text">
            <strong>{e.artist}</strong>
            <span className="event-banner-sep">•</span>
            <span className="event-banner-venue">{e.venue}</span>
            <span className="event-banner-sep">•</span>
            <span className="event-banner-date">{formatEventDate(e.date)}</span>
          </span>
          {e.url && (
            <a
              className="event-banner-link"
              href={e.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Tickets →
            </a>
          )}
          <span className="event-banner-position">
            {idx + 1} / {events.length}
          </span>
        </div>
      )}
      {onClose && (
        <button className="event-banner-close" onClick={onClose} title="Hide event banner">
          ✕
        </button>
      )}
    </div>
  );
}
