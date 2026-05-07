import { VenueIconReact } from "./VenueIcon";

// `value` matches the type used everywhere else (overpass parseVenue, map
// markers, venue cards). Icons come from the same VENUE_ICON map so the
// filter pills, the venue-card titles, and the map pins all stay in sync.
const TYPE_OPTIONS = [
  { value: "bar",            label: "Bars" },
  { value: "pub",            label: "Pubs" },
  { value: "biergarten",     label: "Beer Gardens" },
  { value: "restaurant",     label: "Restaurants" },
  { value: "fast_food",      label: "Fast Food" },
  { value: "food_court",     label: "Food Courts" },
  { value: "cafe",           label: "Cafes" },
  { value: "ice_cream",      label: "Ice Cream" },
  { value: "nightclub",      label: "Nightclubs" },
  { value: "stripclub",      label: "Adult Clubs" },
  { value: "music_venue",    label: "Music Venues" },
  { value: "cinema",         label: "Cinemas" },
  { value: "theatre",        label: "Theatres" },
  { value: "arts_centre",    label: "Arts Centres" },
  { value: "events_venue",   label: "Event Spaces" },
  { value: "sporting_arena", label: "Sporting Arenas" },
  { value: "casino",         label: "Casinos" },
  { value: "liquor_store",   label: "Liquor Stores" },
  { value: "wine_shop",      label: "Wine Shops" },
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
            <VenueIconReact type={o.value} size={14} strokeWidth={2.2} />
            {o.label}
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
            🚶 Walk somewhere
          </label>
          <label className="filter-range">
            Max: {filters.maxMiles.toFixed(2)} mi · ~{Math.round(filters.maxMiles * 20)} min
            <input
              type="range"
              min="0.05"
              max="1"
              step="0.05"
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
