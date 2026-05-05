const TYPE_OPTIONS = [
  { value: "", label: "All Types" },
  { value: "bar", label: "Bars" },
  { value: "pub", label: "Pubs" },
  { value: "restaurant", label: "Restaurants" },
  { value: "cafe", label: "Cafes" },
  { value: "nightclub", label: "Nightclubs" },
];

export default function Filters({ filters, onChange, hasHomeLocation, mode = "favorites" }) {
  return (
    <div className="filters">
      <input
        type="text"
        placeholder="Filter by name..."
        value={filters.search || ""}
        onChange={(e) => onChange({ ...filters, search: e.target.value })}
        className="filter-search"
      />
      <select value={filters.type} onChange={(e) => onChange({ ...filters, type: e.target.value })}>
        {TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {mode === "favorites" && (
        <label className="filter-check">
          <input
            type="checkbox"
            checked={filters.happyHourOnly}
            onChange={(e) => onChange({ ...filters, happyHourOnly: e.target.checked })}
          />
          HH today
        </label>
      )}

      {hasHomeLocation && (
        <>
          <label className="filter-check">
            <input
              type="checkbox"
              checked={filters.walkingOnly}
              onChange={(e) => onChange({ ...filters, walkingOnly: e.target.checked })}
            />
            Walking
          </label>
          <label className="filter-range">
            Max distance: {filters.maxMiles} mi
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
        </>
      )}
    </div>
  );
}
