import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, Pane, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { venueIconSvg } from "./VenueIcon";

const TYPE_STYLE = {
  bar:          { color: "#d04040", label: "Bar" },
  pub:          { color: "#c47d10", label: "Pub" },
  biergarten:   { color: "#a37425", label: "Beer Garden" },
  restaurant:   { color: "#2ea84a", label: "Restaurant" },
  fast_food:    { color: "#e8623a", label: "Fast Food" },
  food_court:   { color: "#c8521a", label: "Food Court" },
  cafe:         { color: "#7e5b3e", label: "Cafe" },
  ice_cream:    { color: "#e8a4c7", label: "Ice Cream" },
  nightclub:    { color: "#5e2a87", label: "Nightclub" },
  stripclub:    { color: "#c92076", label: "Adult Club" },
  music_venue:  { color: "#2a9d8f", label: "Music Venue" },
  cinema:       { color: "#3a4a8a", label: "Cinema" },
  theatre:      { color: "#7e3a8e", label: "Theatre" },
  arts_centre:  { color: "#3a9bd4", label: "Arts Centre" },
  events_venue: { color: "#226d8a", label: "Event Space" },
  sporting_arena: { color: "#b8302e", label: "Sporting Arena" },
  casino:       { color: "#d4a017", label: "Casino" },
  liquor_store: { color: "#9560b8", label: "Liquor Store" },
  wine_shop:    { color: "#7a1e3a", label: "Wine Shop" },
};

function makeIcon(type, isFavorite, isCustom, isOnRoute, isSelected) {
  const style = TYPE_STYLE[type] || TYPE_STYLE.bar;
  const headSize = isSelected ? 38 : isFavorite ? 34 : 28;
  const totalH = isSelected ? 52 : isFavorite ? 48 : 40;
  const classes = ["venue-marker"];
  if (isFavorite) classes.push("is-fav");
  if (isOnRoute) classes.push("is-on-route");
  if (isSelected) classes.push("is-selected");
  const customBadge = isCustom ? `<div class="custom-badge">★</div>` : "";
  return L.divIcon({
    className: classes.join(" "),
    html: `
      <div class="pin-wrap" style="width:${headSize}px;height:${totalH}px">
        <div class="pin-head" style="background:${style.color};width:${headSize}px;height:${headSize}px">
          <span class="pin-icon">${venueIconSvg(type)}</span>
        </div>
        ${customBadge}
      </div>
    `,
    iconSize: [headSize, totalH],
    iconAnchor: [headSize / 2, totalH],
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

function MapHoverHandler({ onMove }) {
  const map = useMap();
  const cbRef = useRef(onMove);
  cbRef.current = onMove;
  const lastFireRef = useRef(0);
  useEffect(() => {
    if (!onMove) return;
    function handler(e) {
      const now = Date.now();
      if (now - lastFireRef.current < 33) return; // ~30fps cap
      lastFireRef.current = now;
      cbRef.current?.({ lat: e.latlng.lat, lon: e.latlng.lng });
    }
    map.on("mousemove", handler);
    map.on("mouseout", () => cbRef.current?.(null));
    return () => {
      map.off("mousemove", handler);
      map.off("mouseout");
    };
  }, [map, onMove]);
  return null;
}

// Project a single lat/lon to container pixel coords every time the map
// pans or zooms, calling back so an SVG overlay can draw the connector line.
function MarkerProjector({ position, onProject }) {
  const map = useMap();
  const cbRef = useRef(onProject);
  cbRef.current = onProject;
  useEffect(() => {
    if (!position) {
      cbRef.current?.(null);
      return;
    }
    function update() {
      const pt = map.latLngToContainerPoint([position.lat, position.lon]);
      cbRef.current?.({ x: pt.x, y: pt.y });
    }
    update();
    map.on("move", update);
    map.on("zoom", update);
    map.on("zoomanim", update);
    return () => {
      map.off("move", update);
      map.off("zoom", update);
      map.off("zoomanim", update);
    };
  }, [map, position?.lat, position?.lon]);
  return null;
}

function ClickPrompt({ location, onAdd, onPlanRoute, onDismiss }) {
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
          <strong>What would you like to do here?</strong>
          <p className="click-prompt-coord">{location.lat.toFixed(5)}, {location.lon.toFixed(5)}</p>
          <button className="btn-primary" onClick={onAdd}>+ Add Venue Here</button>
          <button className="btn-secondary click-prompt-route-btn" onClick={onPlanRoute}>🗺️ Plan Route Here</button>
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
  activeRoute = null,
  savedRoutes = [],
  venueGlowIds = null,
  hoveredRouteId = null,
  selectedVenueId = null,
  selectedVenuePosition = null,
  onMarkerProject = null,
  onMarkerClick = null,
  pickingStart = null,
  clickedLocation = null,
  onMapClick = null,
  onAddAtClick = null,
  onPlanRouteAtClick = null,
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
          const isOnRoute = venueGlowIds?.has?.(v.id);
          const isSelected = selectedVenueId === v.id;
          return (
            // No <Popup> child — selection is shown via the floating
            // detail panel on the right plus a connector line.
            <Marker
              key={v.id}
              position={[v.lat, v.lon]}
              icon={makeIcon(v.type, isFavorite, !!v.custom, isOnRoute, isSelected)}
              zIndexOffset={(isFavorite ? 1000 : 0) + (isOnRoute ? 500 : 0) + (isSelected ? 2000 : 0)}
              eventHandlers={{ click: () => onMarkerClick?.(v) }}
            />
          );
        }),
    [venues, favoriteIds, venueGlowIds, selectedVenueId, onMarkerClick]
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
      {/* Saved routes — distinct color each. When a route card is hovered,
          emphasize that one (thicker, full opacity) and dim the rest. */}
      {savedRoutes.map((r) => {
        const dimmed = hoveredRouteId && hoveredRouteId !== r.id;
        const emphasized = hoveredRouteId === r.id;
        return (
          <Polyline
            key={`saved-${r.id}`}
            positions={r.geometry.coordinates.map(([lon, lat]) => [lat, lon])}
            pathOptions={{
              color: r._color || "#e8a020",
              weight: emphasized ? 6 : 4,
              opacity: dimmed ? 0.25 : 0.95,
              lineCap: "round",
            }}
          />
        );
      })}
      {/* Active route — solid bright amber, with start + end dots */}
      {activeRoute?.route?.geometry && (
        <>
          <Polyline
            positions={activeRoute.route.geometry.coordinates.map(([lon, lat]) => [lat, lon])}
            pathOptions={{ color: "#e8a020", weight: 5, opacity: 0.9, lineCap: "round" }}
          />
          <Marker position={[activeRoute.start.lat, activeRoute.start.lon]} icon={clickPromptIcon()} zIndexOffset={1500}>
            <Popup>Start{activeRoute.start.label ? `: ${activeRoute.start.label}` : ""}</Popup>
          </Marker>
          <Marker position={[activeRoute.destination.lat, activeRoute.destination.lon]} icon={clickPromptIcon()} zIndexOffset={1500}>
            <Popup>Destination</Popup>
          </Marker>
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
      {onMarkerProject && <MarkerProjector position={selectedVenuePosition} onProject={onMarkerProject} />}
      <ClickPrompt
        location={clickedLocation}
        onAdd={() => onAddAtClick?.(clickedLocation)}
        onPlanRoute={() => onPlanRouteAtClick?.(clickedLocation)}
        onDismiss={onDismissClick}
      />
    </MapContainer>
  );
}
