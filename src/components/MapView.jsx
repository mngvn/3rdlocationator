import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, Pane } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const TYPE_STYLE = {
  bar:          { color: "#d04040", emoji: "🍺", label: "Bar" },
  pub:          { color: "#c47d10", emoji: "🍻", label: "Pub" },
  biergarten:   { color: "#a37425", emoji: "🍻", label: "Beer Garden" },
  restaurant:   { color: "#2ea84a", emoji: "🍽️", label: "Restaurant" },
  fast_food:    { color: "#e8623a", emoji: "🍔", label: "Fast Food" },
  food_court:   { color: "#c8521a", emoji: "🍱", label: "Food Court" },
  cafe:         { color: "#7e5b3e", emoji: "☕", label: "Cafe" },
  ice_cream:    { color: "#e8a4c7", emoji: "🍦", label: "Ice Cream" },
  nightclub:    { color: "#5e2a87", emoji: "🎵", label: "Nightclub" },
  stripclub:    { color: "#c92076", emoji: "💃", label: "Adult Club" },
  music_venue:  { color: "#2a9d8f", emoji: "🎤", label: "Music Venue" },
  cinema:       { color: "#3a4a8a", emoji: "🎬", label: "Cinema" },
  theatre:      { color: "#7e3a8e", emoji: "🎭", label: "Theatre" },
  arts_centre:  { color: "#3a9bd4", emoji: "🎨", label: "Arts Centre" },
  events_venue: { color: "#226d8a", emoji: "🎪", label: "Event Space" },
  casino:       { color: "#d4a017", emoji: "🎰", label: "Casino" },
  liquor_store: { color: "#9560b8", emoji: "🥃", label: "Liquor Store" },
  wine_shop:    { color: "#7a1e3a", emoji: "🍷", label: "Wine Shop" },
};

function makeIcon(type, isFavorite, isCustom) {
  const style = TYPE_STYLE[type] || TYPE_STYLE.bar;
  const headSize = isFavorite ? 34 : 28;
  const totalH = isFavorite ? 48 : 40;
  const favClass = isFavorite ? "is-fav" : "";
  const customBadge = isCustom ? `<div class="custom-badge">★</div>` : "";
  return L.divIcon({
    className: `venue-marker ${favClass}`,
    html: `
      <div class="pin-wrap" style="width:${headSize}px;height:${totalH}px">
        <div class="pin-head" style="background:${style.color};width:${headSize}px;height:${headSize}px">
          <span class="pin-emoji">${style.emoji}</span>
        </div>
        ${customBadge}
      </div>
    `,
    iconSize: [headSize, totalH],
    iconAnchor: [headSize / 2, totalH], // anchor at the tip of the pin
    popupAnchor: [0, -totalH + 8],
  });
}

function homeIcon() {
  return L.divIcon({
    className: "home-marker",
    html: `<div class="home-pin">🏠</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function clickPromptIcon() {
  return L.divIcon({
    className: "click-marker",
    html: `<div class="click-pin"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function eventIcon() {
  return L.divIcon({
    className: "event-marker",
    html: `<div class="event-pin">🎟️</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function MapMoveHandler({ onMapMove }) {
  const map = useMap();
  const cbRef = useRef(onMapMove);
  cbRef.current = onMapMove;

  useEffect(() => {
    const timer = { id: null };
    function handleMoveEnd() {
      clearTimeout(timer.id);
      timer.id = setTimeout(() => {
        const center = map.getCenter();
        const bounds = map.getBounds();
        cbRef.current({
          lat: center.lat,
          lon: center.lng,
          zoom: map.getZoom(),
          bounds: {
            south: bounds.getSouth(),
            west: bounds.getWest(),
            north: bounds.getNorth(),
            east: bounds.getEast(),
          },
        });
      }, 800);
    }
    map.on("moveend", handleMoveEnd);
    return () => { map.off("moveend", handleMoveEnd); clearTimeout(timer.id); };
  }, [map]);

  return null;
}

function ZoomLock({ lockedZoom }) {
  const map = useMap();
  useEffect(() => {
    if (lockedZoom != null) {
      // Snap the view first, THEN clamp the bounds, so we don't briefly
      // sit at a zoom outside the new [min, max] range.
      map.setView(map.getCenter(), lockedZoom, { animate: false });
      map.setMinZoom(lockedZoom);
      map.setMaxZoom(lockedZoom);
      console.log("[Radar] Zoom locked to", lockedZoom, "actual:", map.getZoom());
    } else {
      map.setMinZoom(0);
      map.setMaxZoom(19);
    }
  }, [lockedZoom, map]);
  return null;
}

// Only render radar tiles once the map is actually at a supported zoom.
// Prevents brief "Zoom level not supported" placeholders that RainViewer
// returns for tiles requested above their native max while ZoomLock is still
// snapping the view down.
function RadarLayer({ url }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useEffect(() => {
    function onZoomEnd() {
      const z = map.getZoom();
      setZoom(z);
      console.log("[Radar] Map zoom is now", z);
    }
    map.on("zoomend", onZoomEnd);
    return () => { map.off("zoomend", onZoomEnd); };
  }, [map]);
  if (!url || zoom > 8) {
    if (url) console.log("[Radar] Holding off — zoom", zoom, "not yet ≤ 8");
    return null;
  }
  console.log("[Radar] Mounting tile layer at zoom", zoom);
  return (
    <TileLayer
      key={url}
      url={url}
      opacity={0.9}
      tileSize={256}
      maxNativeZoom={8}
      maxZoom={20}
      attribution='Radar &copy; <a href="https://www.rainviewer.com/">RainViewer</a>'
      eventHandlers={{
        tileerror: (e) => console.warn("[Radar] tile error", e?.tile?.src),
        tileload: (e) => { /* successful load */ },
      }}
    />
  );
}

function MapClickHandler({ onClick }) {
  const map = useMap();
  const cbRef = useRef(onClick);
  cbRef.current = onClick;
  useEffect(() => {
    function handler(e) {
      cbRef.current?.({ lat: e.latlng.lat, lon: e.latlng.lng });
    }
    map.on("click", handler);
    return () => { map.off("click", handler); };
  }, [map]);
  return null;
}

function ClickPrompt({ location, onAdd, onDismiss }) {
  const markerRef = useRef(null);
  useEffect(() => {
    if (markerRef.current) markerRef.current.openPopup();
  }, [location?.lat, location?.lon]);
  if (!location) return null;
  return (
    <Marker
      ref={markerRef}
      position={[location.lat, location.lon]}
      icon={clickPromptIcon()}
      zIndexOffset={2000}
      eventHandlers={{ popupclose: () => onDismiss?.() }}
    >
      <Popup closeButton={false} autoPan={true}>
        <div className="map-popup click-prompt">
          <strong>Add a venue here?</strong>
          <p className="click-prompt-coord">{location.lat.toFixed(5)}, {location.lon.toFixed(5)}</p>
          <button className="btn-primary" onClick={onAdd}>+ Add Venue Here</button>
        </div>
      </Popup>
    </Marker>
  );
}

function FlyToLocation({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, zoom ?? map.getZoom(), { duration: 0.8 });
  }, [center?.[0], center?.[1], zoom]);
  return null;
}

export default function MapView({
  venues,
  favoriteIds,
  homeLocation,
  mapCenter,
  mapZoom,
  walkingRadius,
  onMapMove,
  eventCenters = [],
  radarUrl = null,
  lockedZoom = null,
  clickedLocation = null,
  onMapClick = null,
  onAddAtClick = null,
  onDismissClick = null,
}) {
  const defaultCenter = mapCenter || (homeLocation ? [homeLocation.lat, homeLocation.lon] : [39.5, -98.35]);
  const defaultZoom = mapZoom || (homeLocation ? 14 : 4);

  const venueMarkers = useMemo(
    () =>
      // Render favorites last so their markers appear above non-favorited ones
      venues
        .slice()
        .sort((a, b) => Number(favoriteIds.has(a.id)) - Number(favoriteIds.has(b.id)))
        .map((v) => {
          const isFavorite = favoriteIds.has(v.id);
          return (
            <Marker
              key={v.id}
              position={[v.lat, v.lon]}
              icon={makeIcon(v.type, isFavorite, !!v.custom)}
              zIndexOffset={isFavorite ? 1000 : 0}
            >
              <Popup>
                <div className="map-popup">
                  <span className="popup-type">{TYPE_STYLE[v.type]?.label || v.type}</span>
                  <strong>{v.name}</strong>
                  {v.address && <p>{v.address}</p>}
                  {v.cuisine && <p className="popup-cuisine">{v.cuisine.replace(/_/g, " ")}</p>}
                  {isFavorite && <p className="popup-fav">♥ Favorited</p>}
                </div>
              </Popup>
            </Marker>
          );
        }),
    [venues, favoriteIds]
  );

  return (
    <MapContainer center={defaultCenter} zoom={defaultZoom} className="map-container" zoomControl={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Pane name="radar" style={{ zIndex: 400 }}>
        <RadarLayer url={radarUrl} />
      </Pane>
      {homeLocation && (
        <>
          <Marker position={[homeLocation.lat, homeLocation.lon]} icon={homeIcon()}>
            <Popup>Home: {homeLocation.label}</Popup>
          </Marker>
          {walkingRadius && (
            <Circle
              center={[homeLocation.lat, homeLocation.lon]}
              radius={walkingRadius * 1609.34}
              pathOptions={{ color: "#e8a020", weight: 1.5, fillOpacity: 0.06, dashArray: "4 4" }}
            />
          )}
        </>
      )}
      {venueMarkers}
      {eventCenters.map((ec) => (
        <Marker key={`ec-${ec.id}`} position={[ec.lat, ec.lon]} icon={eventIcon()} zIndexOffset={500}>
          <Popup>
            <div className="map-popup event-popup">
              <span className="popup-type">🎟️ {ec.type}</span>
              <strong>{ec.name}</strong>
              <p>{ec.city}</p>
              <a className="link-btn event-tickets" href={ec.scheduleUrl} target="_blank" rel="noopener noreferrer">
                📅 View Schedule
              </a>
            </div>
          </Popup>
        </Marker>
      ))}
      <FlyToLocation center={mapCenter} zoom={mapZoom} />
      <ZoomLock lockedZoom={lockedZoom} />
      {onMapMove && <MapMoveHandler onMapMove={onMapMove} />}
      {onMapClick && <MapClickHandler onClick={onMapClick} />}
      <ClickPrompt
        location={clickedLocation}
        onAdd={() => onAddAtClick?.(clickedLocation)}
        onDismiss={onDismissClick}
      />
    </MapContainer>
  );
}
