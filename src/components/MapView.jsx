import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, Pane } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const TYPE_STYLE = {
  bar:          { color: "#6a6a8c", emoji: "🍺", label: "Bar" },
  pub:          { color: "#6a6a8c", emoji: "🍻", label: "Pub" },
  restaurant:   { color: "#6a6a8c", emoji: "🍽️", label: "Restaurant" },
  cafe:         { color: "#6a6a8c", emoji: "☕", label: "Cafe" },
  nightclub:    { color: "#6a6a8c", emoji: "🎵", label: "Nightclub" },
  liquor_store: { color: "#7a4a9a", emoji: "🥃", label: "Liquor Store" },
};

const FAVORITE_COLOR = "#e8a020";

function makeIcon(type, isFavorite, isCustom) {
  const style = TYPE_STYLE[type] || TYPE_STYLE.bar;
  const bg = isFavorite ? FAVORITE_COLOR : style.color;
  const size = isFavorite ? 36 : 28;
  const ring = isFavorite ? `box-shadow: 0 0 0 3px rgba(232,160,32,0.4), 0 2px 6px rgba(0,0,0,0.5);` : `box-shadow: 0 2px 4px rgba(0,0,0,0.5);`;
  const customBadge = isCustom ? `<div class="custom-badge">★</div>` : "";
  return L.divIcon({
    className: `venue-marker ${isFavorite ? "is-fav" : ""}`,
    html: `<div class="marker-pin" style="background:${bg};width:${size}px;height:${size}px;${ring}">${style.emoji}${customBadge}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
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
      map.setMinZoom(lockedZoom);
      map.setMaxZoom(lockedZoom);
      if (map.getZoom() !== lockedZoom) map.setZoom(lockedZoom);
    } else {
      map.setMinZoom(0);
      map.setMaxZoom(19);
    }
  }, [lockedZoom, map]);
  return null;
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
        {radarUrl && (
          <TileLayer
            key={radarUrl}
            url={radarUrl}
            opacity={0.9}
            maxNativeZoom={10}
            maxZoom={20}
            attribution='Radar &copy; <a href="https://www.rainviewer.com/">RainViewer</a>'
          />
        )}
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
    </MapContainer>
  );
}
