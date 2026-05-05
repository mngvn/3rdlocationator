const DAY_TOKENS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function normalizeTime(t) {
  const [h, m = "00"] = t.split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

function parseDays(s) {
  const result = new Set();
  const parts = s.split(",").map((p) => p.trim());
  for (const part of parts) {
    if (part.includes("-")) {
      const [start, end] = part.split("-").map((p) => p.trim());
      const si = DAY_TOKENS.indexOf(start);
      const ei = DAY_TOKENS.indexOf(end);
      if (si >= 0 && ei >= 0 && si <= ei) {
        for (let i = si; i <= ei; i++) result.add(DAY_LABELS[i]);
      }
    } else {
      const i = DAY_TOKENS.indexOf(part);
      if (i >= 0) result.add(DAY_LABELS[i]);
    }
  }
  return Array.from(result);
}

// Parses OSM opening_hours-style strings like "Mo-Fr 16:00-19:00; Sa 14:00-17:00"
export function parseOsmHappyHours(text) {
  if (!text || typeof text !== "string") return [];
  const segments = text.split(";").map((s) => s.trim()).filter(Boolean);
  const entries = [];
  for (const seg of segments) {
    const m = seg.match(/^([A-Za-z,\-\s]+?)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    if (!m) continue;
    const days = parseDays(m[1].trim());
    if (days.length) {
      entries.push({ days, start: normalizeTime(m[2]), end: normalizeTime(m[3]), note: "" });
    }
  }
  return entries;
}
