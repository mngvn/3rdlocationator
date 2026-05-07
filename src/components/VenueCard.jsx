import { haversineDistance, walkingMinutes } from "../utils/distance";

const TYPE_EMOJI = {
  bar: "🍺",
  pub: "🍻",
  restaurant: "🍽️",
  cafe: "☕",
  nightclub: "🎵",
  liquor_store: "🥃",
};

function googleReviewsUrl(venue) {
  const q = `${venue.name} ${venue.address || ""}`.trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function getTodayHappyHour(hh) {
  if (!hh || hh.status !== "known") return null;
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = days[new Date().getDay()];
  return hh.entries?.find((e) => e.days.includes(today)) || null;
}

function StarRating({ value, onChange }) {
  return (
    <div className="star-rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`star ${n <= value ? "filled" : ""}`}
          onClick={(e) => { e.stopPropagation(); onChange(n === value ? 0 : n); }}
          title={`${n} star${n > 1 ? "s" : ""}`}
        >★</button>
      ))}
    </div>
  );
}

export default function VenueCard({
  venue,
  isFavorite,
  happyHour,
  rating,
  notes,
  homeLocation,
  onToggleFavorite,
  onEditHappyHour,
  onEditNotes,
  onSetRating,
  onCardClick,
  onDelete,
}) {
  const distance = homeLocation
    ? haversineDistance(homeLocation.lat, homeLocation.lon, venue.lat, venue.lon)
    : null;
  const todayHH = getTodayHappyHour(happyHour);
  const fromOsm = happyHour?.source === "osm";
  const distanceText = distance !== null
    ? `${distance < 0.1 ? "<0.1" : distance.toFixed(1)} mi · ${walkingMinutes(distance)}m walk`
    : null;

  return (
    <div className={`venue-card ${isFavorite ? "is-favorite" : ""}`}>
      <div className="card-top">
        <div className="card-title" onClick={() => onCardClick?.(venue)}>
          <h3 className="venue-name">
            <span className="type-emoji">{TYPE_EMOJI[venue.type] || "📍"}</span>
            {venue.name}
            {venue.custom && <span className="custom-tag" title="Custom venue">★</span>}
          </h3>
          <div className="card-meta">
            {venue.address && <span>{venue.address}</span>}
            {distanceText && <span className="meta-distance">{distanceText}</span>}
          </div>
        </div>
        <button
          className={`fav-btn ${isFavorite ? "active" : ""}`}
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(venue); }}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >{isFavorite ? "♥" : "♡"}</button>
      </div>

      <div className="venue-hh">
        {todayHH ? (
          <span className="hh-badge active">
            HH {todayHH.start}–{todayHH.end}
            {todayHH.note ? ` · ${todayHH.note}` : ""}
            {fromOsm && <span className="hh-source"> · OSM</span>}
          </span>
        ) : happyHour?.status === "none" ? (
          <span className="hh-badge none">No happy hour</span>
        ) : happyHour?.status === "known" ? (
          <span className="hh-badge none">No HH today</span>
        ) : happyHour?.status === "unknown" ? (
          <span className="hh-badge unknown">HH info not found</span>
        ) : (
          <span className="hh-badge none">No HH info</span>
        )}
        <button className="hh-edit" onClick={() => onEditHappyHour(venue)}>
          {happyHour ? "Edit" : "Set"}
        </button>
      </div>

      {isFavorite && (
        <>
          <div className="venue-rating-row">
            <StarRating value={rating || 0} onChange={(n) => onSetRating(venue.id, n)} />
          </div>
          {notes ? (
            <div className="venue-notes" onClick={() => onEditNotes(venue)}>
              <p>{notes}</p>
            </div>
          ) : (
            <button className="notes-add-btn" onClick={() => onEditNotes(venue)}>+ Add notes</button>
          )}
        </>
      )}

      <div className="venue-actions">
        <a
          className="link-btn"
          href={googleReviewsUrl(venue)}
          target="_blank"
          rel="noopener noreferrer"
          title="Reviews on Google Maps"
          onClick={(e) => e.stopPropagation()}
        >🔍 Reviews</a>
        {venue.website && (
          <a
            className="link-btn"
            href={venue.website}
            target="_blank"
            rel="noopener noreferrer"
            title="Venue website"
            onClick={(e) => e.stopPropagation()}
          >🌐 Site</a>
        )}
        {onDelete && (
          <button
            className="link-btn delete-btn"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete this venue"
          >🗑️ Delete</button>
        )}
      </div>
    </div>
  );
}
