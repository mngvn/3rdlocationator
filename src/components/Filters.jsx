const TYPE_OPTIONS = [
  { value: "bar",          label: "Bars",          emoji: "🍺" },
  { value: "pub",          label: "Pubs",          emoji: "🍻" },
  { value: "restaurant",   label: "Restaurants",   emoji: "🍽️" },
  { value: "cafe",         label: "Cafes",         emoji: "☕" },
  { value: "nightclub",    label: "Nightclubs",    emoji: "🎵" },
  { value: "music_venue",  label: "Music Venues",  emoji: "🎤" },
  { value: "liquor_store", label: "Liquor Stores", emoji: "🥃" },
];

function toggleType(types, value) {
  return types.includes(value) ? types.filter((t) => t !== value) : [...types, value];
}

export default function Filters({ filters, onChange, hasHomeLocation, mode = "favorites" }) {
  const types = filters.types || [];

  return (
    <div className="filters">
      <input
        type="text"
        placeholder="Filter by name…"
        value={filters.search || ""}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className="filter-search"
      />

      <div className="filter-label">Venue type</div>
      <div className="type-pills">
        {TYPE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`type-pill ${types.includes(o.value) ? "active" : ""}`}
            onClick={() => onChange({ ...filters, types: toggleType(types, o.value) })}
          >
            {o.emoji} {o.label}
          </button>
        ))}
      </div>

      {mode === "favorites" && (
        <label className="filter-check">
          <input
            type="checkbox"
            checked={filters.happyHourOnly}
            onChange={(e) => onChange({ ...filters, happyHourOnly: e.target.checked })}
          />
          Happy hour today only
        </label>
      )}

      {hasHomeLocation && (
        <div className="filter-distance">
          <label className="filter-check">
            <input
              type="checkbox"
              checked={filters.walkingOnly}
              onChange={(e) => onChange({ ...filters, walkingOnly: e.target.checked })}
            />
            Walking distance
          </label>
          <label className="filter-range">
            Max: {filters.maxMiles} mi
            <input
              type="range"
              min="0.25"
              max="5"
              step="0.25"
              value={filters.maxMiles}
              onChange={(e) => onChange({ ...filters, maxMiles: parseFloat(e.target.value) })}
              disabled={!filters.walkingOnly}
            />
          </label>
        </div>
      )}
    </div>
  );
}
