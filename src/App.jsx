import { useState, useMemo, useEffect, useRef } from "react";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { searchVenuesBbox, geocodeAddress } from "./utils/overpass";
import { SPORT_ARENAS } from "./data/eventCenters";
import { haversineDistance } from "./utils/distance";
import { parseOsmHappyHours } from "./utils/parseHappyHours";
import { fetchWeather, fetchRadarFrames, radarTileUrl } from "./utils/weather";
import { fetchWalkingRoute } from "./utils/routing";
import { fetchUpcomingEvents } from "./utils/events";
import LocationSearch from "./components/LocationSearch";
import VenueCard from "./components/VenueCard";
import Filters from "./components/Filters";
import HappyHourModal from "./components/HappyHourModal";
import CustomVenueModal from "./components/CustomVenueModal";
import NotesModal from "./components/NotesModal";
import WeatherWidget from "./components/WeatherWidget";
import EventBanner from "./components/EventBanner";
import MapView from "./components/MapView";

const DEFAULT_FILTERS = { search: "", types: [], happyHourOnly: false, walkingOnly: false, maxMiles: 0.4 };
const TABS = ["Search", "Favorites", "Custom", "Routes"];
const DEFAULT_SEARCH_ZOOM = 14; // city-neighborhood view

export default function App() {
  const [tab, setTab] = useState("Search");
  const [panelOpen, setPanelOpen] = useState(true);
  // bh_portfolio key kept for backwards compat with existing data; semantically these are favorites now.
  const [favorites, setFavorites] = useLocalStorage("bh_portfolio", []);
  const [userVenues, setUserVenues] = useLocalStorage("bh_user_venues", []);
  const [happyHours, setHappyHours] = useLocalStorage("bh_happyhours", {});
  const [ratings, setRatings] = useLocalStorage("bh_ratings", {});
  const [notes, setNotes] = useLocalStorage("bh_notes", {});
  const [homeLocation, setHomeLocation] = useLocalStorage("bh_home", null);

  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const [currentZoom, setCurrentZoom] = useState(4);
  const [currentBounds, setCurrentBounds] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  // Weather
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState(null);

  // Upcoming events near home (rotating banner)
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsBannerOpen, setEventsBannerOpen] = useState(true);

  // Radar
  const [radarOn, setRadarOn] = useLocalStorage("bh_radar_on", false);
  const [radarFrame, setRadarFrame] = useState(null);

  // Routes
  const [savedRoutes, setSavedRoutes] = useLocalStorage("bh_saved_routes", []);
  const [pendingRouteDest, setPendingRouteDest] = useState(null); // shown in start picker
  const [pickingStart, setPickingStart] = useState(null);          // { destination } while user clicks
  const [activeRoute, setActiveRoute] = useState(null);            // { start, destination, route }
  const [routeError, setRouteError] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [hhModal, setHhModal] = useState(null);
  const [notesModal, setNotesModal] = useState(null);
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customModalLocation, setCustomModalLocation] = useState(null);
  const [clickedLocation, setClickedLocation] = useState(null);
  const [selectedVenueId, setSelectedVenueId] = useState(null);
  const [hoveredRouteId, setHoveredRouteId] = useState(null);
  const [mapTarget, setMapTarget] = useState(null);

  // For the connector line: pixel coords of the selected marker on the map,
  // and the bounding rect of the right-side detail panel.
  const [markerScreen, setMarkerScreen] = useState(null);
  const [panelRect, setPanelRect] = useState(null);
  const detailPanelRef = useRef(null);

  // Cache of the last fetched OSM region: we deliberately fetch a wider bbox
  // than the visible area so panning around inside it doesn't trigger
  // re-fetches. Stored in a ref so it survives renders without re-triggering.
  const venuesCacheRef = useRef(null); // { bbox: {south,west,north,east}, venues: Venue[] }
  const [reloadAvailable, setReloadAvailable] = useState(false);
  const lastBoundsRef = useRef(null);

  async function handleSearch(query) {
    setSearchLoading(true);
    setSearchError(null);
    try {
      const geo = await geocodeAddress(query);
      // Drop the venues cache so the next moveend triggers a fresh big load
      venuesCacheRef.current = null;
      setReloadAvailable(false);
      setHomeLocation({ label: geo.label, lat: geo.lat, lon: geo.lon });
      setMapTarget({ center: [geo.lat, geo.lon], zoom: DEFAULT_SEARCH_ZOOM });
      // Venue loading is driven by the map's moveend event after flyTo
    } catch (e) {
      setSearchError(e.message === "Address not found"
        ? "Couldn't find that location. Try a more specific address or city."
        : "Geocoding failed. Try again.");
    } finally {
      setSearchLoading(false);
    }
  }

  async function loadVenuesForBounds(bounds) {
    // Just slightly bigger than the visible area — enough buffer that small
    // pans don't trigger the reload prompt, but light enough to render fast.
    const fetchBbox = expandBbox(bounds, 1.3);
    setSearchLoading(true);
    setSearchError(null);
    try {
      const results = await searchVenuesBbox(fetchBbox.south, fetchBbox.west, fetchBbox.north, fetchBbox.east);
      // Merge in any sporting arenas that fall inside this fetched region so
      // they appear at the same instant as the OSM venues (not before).
      const arenasHere = SPORT_ARENAS.filter(
        (a) => a.lat >= fetchBbox.south && a.lat <= fetchBbox.north
            && a.lon >= fetchBbox.west  && a.lon <= fetchBbox.east
      );
      const seen = new Set(results.map((v) => v.id));
      const merged = results.concat(arenasHere.filter((a) => !seen.has(a.id)));
      venuesCacheRef.current = { bbox: fetchBbox, venues: merged };
      setSearchResults(merged);
      setReloadAvailable(false);
      const newHH = {};
      results.forEach((v) => {
        if (v.osmHappyHours && !happyHours[v.id]) {
          const parsed = parseOsmHappyHours(v.osmHappyHours);
          if (parsed.length) {
            newHH[v.id] = { status: "known", entries: parsed, source: "osm", raw: v.osmHappyHours };
          }
        }
      });
      if (Object.keys(newHH).length) setHappyHours((prev) => ({ ...newHH, ...prev }));
    } catch (e) {
      setSearchError("Couldn't load venues for this area. Try again.");
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleMapMove({ lat, lon, zoom, bounds }) {
    setCurrentZoom(zoom);
    setCurrentBounds(bounds);
    lastBoundsRef.current = bounds;

    if (zoom < 12) {
      setSearchResults([]);
      setReloadAvailable(false);
      return;
    }

    const cached = venuesCacheRef.current;
    // Inside the cached super-region — instant, no fetch, no toast
    if (cached && bboxContains(cached.bbox, bounds)) {
      setSearchResults(cached.venues);
      setReloadAvailable(false);
      return;
    }

    // No cache yet (initial load after a search) → auto-fetch the big area
    if (!cached) {
      await loadVenuesForBounds(bounds);
      return;
    }

    // Cache exists but user has wandered out of it. Don't auto-fetch — show
    // the "Re-Load venues" button so they choose when to spend the request.
    setReloadAvailable(true);
  }

  // Refetch upcoming events whenever the user picks a new home location.
  // Pulled from Bandsintown's keyless public endpoint for popular touring acts.
  useEffect(() => {
    if (!homeLocation) {
      setUpcomingEvents([]);
      return;
    }
    let cancelled = false;
    setEventsLoading(true);
    setEventsBannerOpen(true);
    fetchUpcomingEvents(homeLocation, 200, 25)
      .then((evs) => { if (!cancelled) setUpcomingEvents(evs); })
      .catch(() => { if (!cancelled) setUpcomingEvents([]); })
      .finally(() => { if (!cancelled) setEventsLoading(false); });
    return () => { cancelled = true; };
  }, [homeLocation?.lat, homeLocation?.lon]);

  // Refetch weather whenever the user picks a new home location
  useEffect(() => {
    if (!homeLocation) {
      setWeather(null);
      return;
    }
    let cancelled = false;
    setWeatherLoading(true);
    setWeatherError(null);
    fetchWeather(homeLocation.lat, homeLocation.lon)
      .then((data) => { if (!cancelled) setWeather(data); })
      .catch(() => { if (!cancelled) setWeatherError("Couldn't load weather"); })
      .finally(() => { if (!cancelled) setWeatherLoading(false); });
    return () => { cancelled = true; };
  }, [homeLocation?.lat, homeLocation?.lon]);

  // Load + refresh radar frames when toggled on (every 5 min)
  useEffect(() => {
    if (!radarOn) {
      setRadarFrame(null);
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchRadarFrames();
        if (cancelled) return;
        const past = data?.radar?.past || [];
        const latest = past[past.length - 1];
        if (latest) setRadarFrame({ host: data.host, path: latest.path, time: latest.time });
      } catch {
        // silent — toggle stays on, just no overlay
      }
    }
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [radarOn]);

  const radarTile = radarFrame ? radarTileUrl(radarFrame.host, radarFrame.path) : null;
  const radarAgeMin = radarFrame ? Math.max(0, Math.round((Date.now() / 1000 - radarFrame.time) / 60)) : null;

  // Note: sporting arenas are merged INTO the searchResults bundle inside
  // loadVenuesForBounds() so they appear at the same instant as the OSM
  // venues, instead of popping in instantly from the static list.

  function saveUserVenue(venue) {
    // Persist to user-venues list (independent of favorites)
    setUserVenues((prev) => [...prev.filter((v) => v.id !== venue.id), venue]);
    // Default to favorited
    setFavorites((prev) => prev.find((v) => v.id === venue.id) ? prev : [...prev, venue]);
    setMapTarget({ center: [venue.lat, venue.lon], zoom: 16 });
    // Immediately prompt for happy hours
    setHhModal({ venue });
  }

  function deleteUserVenue(id) {
    if (!window.confirm("Delete this venue? This cannot be undone.")) return;
    setUserVenues((prev) => prev.filter((v) => v.id !== id));
    setFavorites((prev) => prev.filter((v) => v.id !== id));
    setRatings((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setNotes((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setHappyHours((prev) => { const next = { ...prev }; delete next[id]; return next; });
  }

  function toggleFavorite(venue) {
    setFavorites((prev) => {
      const exists = prev.find((v) => v.id === venue.id);
      if (exists) return prev.filter((v) => v.id !== venue.id);
      return [...prev, venue];
    });
  }

  function removeFavorite(id) {
    setFavorites((prev) => prev.filter((v) => v.id !== id));
  }

  function saveHappyHours(venueId, value) {
    setHappyHours((prev) => ({ ...prev, [venueId]: value }));
  }

  function saveNotes(venueId, text) {
    setNotes((prev) => {
      const next = { ...prev };
      if (text?.trim()) next[venueId] = text.trim();
      else delete next[venueId];
      return next;
    });
  }

  function setRating(venueId, value) {
    setRatings((prev) => {
      const next = { ...prev };
      if (value > 0) next[venueId] = value;
      else delete next[venueId];
      return next;
    });
  }

  function getHappyHour(id) {
    const hh = happyHours[id];
    if (!hh) return null;
    if (Array.isArray(hh)) return { status: hh.length ? "known" : "unknown", entries: hh };
    return hh;
  }

  function flyToVenue(v) {
    setMapTarget({ center: [v.lat, v.lon], zoom: 17 });
  }

  function applyFilters(venues) {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const today = days[new Date().getDay()];
    const search = filters.search?.trim().toLowerCase();
    return venues.filter((v) => {
      if (search && !v.name.toLowerCase().includes(search)) return false;
      if (filters.types?.length && !filters.types.includes(v.type)) return false;
      if (filters.happyHourOnly) {
        const hh = getHappyHour(v.id);
        if (hh?.status !== "known" || !hh.entries.some((e) => e.days.includes(today))) return false;
      }
      if (filters.walkingOnly && homeLocation) {
        const d = haversineDistance(homeLocation.lat, homeLocation.lon, v.lat, v.lon);
        if (d > filters.maxMiles) return false;
      }
      return true;
    });
  }

  const favoriteIds = useMemo(() => new Set(favorites.map((v) => v.id)), [favorites]);

  // User venues that fall within the current map view, so they behave like
  // any other location: only visible when you're looking at their area.
  const userVenuesInView = useMemo(() => {
    if (!currentBounds) return [];
    const { south, west, north, east } = currentBounds;
    return userVenues.filter(
      (v) => v.lat >= south && v.lat <= north && v.lon >= west && v.lon <= east
    );
  }, [userVenues, currentBounds]);

  const filteredFavorites = applyFilters(favorites);
  // Merge OSM search results (which already include sporting arenas mixed
  // in at fetch time) with user-added venues in the current viewport.
  const combinedSearch = useMemo(() => {
    const merged = new Map();
    searchResults.forEach((v) => merged.set(v.id, v));
    userVenuesInView.forEach((v) => merged.set(v.id, v));
    return Array.from(merged.values());
  }, [searchResults, userVenuesInView]);
  const filteredSearch = applyFilters(combinedSearch);

  // Track the right-side detail panel's bounding rect so the connector
  // line knows where to terminate. Updates on resize + content changes.
  useEffect(() => {
    if (!detailPanelRef.current) {
      setPanelRect(null);
      return;
    }
    const update = () => {
      if (!detailPanelRef.current) return;
      const r = detailPanelRef.current.getBoundingClientRect();
      setPanelRect({ left: r.left, top: r.top, height: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(detailPanelRef.current);
    window.addEventListener("resize", update);
    return () => { ro.disconnect(); window.removeEventListener("resize", update); };
  }, [selectedVenueId]);

  // The currently selected venue (from a map marker click) — looked up across
  // every source so it works regardless of which tab the user is on.
  const selectedVenue = useMemo(() => {
    if (!selectedVenueId) return null;
    const pools = [combinedSearch, userVenues, favorites];
    for (const pool of pools) {
      const found = pool.find((v) => v.id === selectedVenueId);
      if (found) return found;
    }
    return null;
  }, [selectedVenueId, combinedSearch, userVenues, favorites]);

  // Distinct color palette so each saved route gets its own line color.
  // Active route always stays amber; saved routes cycle through this.
  const ROUTE_COLORS = ["#4a9be8", "#2ea84a", "#e8408b", "#9560b8", "#2a9d8f", "#d04040", "#c47d10", "#3a4a8a"];

  const savedRoutesColored = useMemo(
    () => savedRoutes.map((r, i) => ({ ...r, _color: ROUTE_COLORS[i % ROUTE_COLORS.length] })),
    [savedRoutes]
  );

  // Helper: venues within ~160m of any point on a route polyline.
  function venuesNearGeometry(coords, candidates, maxMiles = 0.1) {
    return candidates.filter((v) => {
      for (let i = 0; i < coords.length; i++) {
        const [lon, lat] = coords[i];
        if (haversineDistance(v.lat, v.lon, lat, lon) < maxMiles) return true;
      }
      return false;
    });
  }

  // Combined pool for route-proximity checks: visible OSM results + all user venues
  const routeCandidates = useMemo(() => {
    const seen = new Set(combinedSearch.map((v) => v.id));
    return [...combinedSearch, ...userVenues.filter((v) => !seen.has(v.id))];
  }, [combinedSearch, userVenues]);

  const venuesAlongRoute = useMemo(() => {
    if (!activeRoute?.route?.geometry) return [];
    return venuesNearGeometry(activeRoute.route.geometry.coordinates, routeCandidates);
  }, [activeRoute, routeCandidates]);

  // For each saved route, the venues that are near it (only computed when
  // the user is actually on the Routes tab so we don't pay for off-screen work).
  const savedRouteVenuesMap = useMemo(() => {
    if (tab !== "Routes" || savedRoutes.length === 0) return new Map();
    const map = new Map();
    for (const r of savedRoutes) {
      map.set(r.id, venuesNearGeometry(r.geometry.coordinates, routeCandidates));
    }
    return map;
  }, [tab, savedRoutes, routeCandidates]);

  const venueGlowIds = useMemo(() => {
    const set = new Set(venuesAlongRoute.map((v) => v.id));
    for (const venues of savedRouteVenuesMap.values()) {
      venues.forEach((v) => set.add(v.id));
    }
    return set;
  }, [venuesAlongRoute, savedRouteVenuesMap]);

  // When the user hovers a route card, narrow the glow to JUST that route's
  // venues. Otherwise glow every route-connected venue.
  const effectiveGlowIds = useMemo(() => {
    if (hoveredRouteId && savedRouteVenuesMap.has(hoveredRouteId)) {
      return new Set(savedRouteVenuesMap.get(hoveredRouteId).map((v) => v.id));
    }
    return venueGlowIds;
  }, [hoveredRouteId, savedRouteVenuesMap, venueGlowIds]);

  async function planRouteWithStart(start, destination) {
    setRouteLoading(true);
    setRouteError(null);
    setActiveRoute(null);
    try {
      const route = await fetchWalkingRoute(start, destination);
      if (!route) {
        setRouteError("Couldn't find a walkable route between those points.");
      } else {
        setActiveRoute({ start, destination, route });
        setMapTarget({
          center: [(start.lat + destination.lat) / 2, (start.lon + destination.lon) / 2],
          zoom: 15,
        });
      }
    } catch {
      setRouteError("Routing service failed. Try again.");
    } finally {
      setRouteLoading(false);
    }
  }

  function saveActiveRoute() {
    if (!activeRoute) return;
    const r = activeRoute;
    const saved = {
      id: `route_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      savedAt: Date.now(),
      origin: r.start,
      destination: r.destination,
      geometry: r.route.geometry,
      distanceMeters: r.route.distanceMeters,
      durationSeconds: r.route.durationSeconds,
    };
    setSavedRoutes((prev) => [saved, ...prev]);
    setActiveRoute(null);
    setTab("Routes");
  }

  function deleteSavedRoute(id) {
    setSavedRoutes((prev) => prev.filter((r) => r.id !== id));
  }

  // Map shows only what's relevant to the current tab — no permanent pins.
  // When the user has zoomed past the default search zoom by a couple steps,
  // unload non-favorite markers that fall outside the visible viewport so
  // the map stays focused (and renders fast).
  const mapVenues = useMemo(() => {
    const cullToView = currentZoom >= 15 && currentBounds;
    const inView = (v) => {
      if (!cullToView) return true;
      const { south, west, north, east } = currentBounds;
      // Tiny pad so markers near the edge don't pop in/out on micro pans
      const latPad = (north - south) * 0.05;
      const lonPad = (east - west) * 0.05;
      return v.lat >= south - latPad && v.lat <= north + latPad
          && v.lon >= west  - lonPad && v.lon <= east  + lonPad;
    };

    if (tab === "Search") {
      const merged = new Map();
      filteredSearch.forEach((v) => {
        if (inView(v) || favoriteIds.has(v.id)) merged.set(v.id, v);
      });
      // Favorites always render even when culled, so they stay locatable
      filteredFavorites.forEach((v) => merged.set(v.id, v));
      return Array.from(merged.values());
    }
    if (tab === "Custom") return userVenues;
    if (tab === "Routes") {
      // Only render venues that are actually connected to a route — the
      // route polylines and their nearby venues are the whole point of
      // this tab. Off-route markers would just be noise.
      const merged = new Map();
      combinedSearch.forEach((v) => {
        if (venueGlowIds.has(v.id)) merged.set(v.id, v);
      });
      userVenues.forEach((v) => {
        if (venueGlowIds.has(v.id)) merged.set(v.id, v);
      });
      return Array.from(merged.values());
    }
    return filteredFavorites;
  }, [tab, filteredSearch, filteredFavorites, userVenues, combinedSearch, currentZoom, currentBounds, favoriteIds, venueGlowIds]);

  const walkingRadius = filters.walkingOnly && homeLocation ? filters.maxMiles : null;

  // HH count for transparency about how many were auto-found
  const osmHHCount = useMemo(
    () => Object.values(happyHours).filter((hh) => hh && !Array.isArray(hh) && hh.source === "osm").length,
    [happyHours]
  );

  return (
    <div className={`app map-mode ${eventsBannerOpen && (upcomingEvents.length || eventsLoading) ? "with-banner" : ""}`}>
      {eventsBannerOpen && (upcomingEvents.length > 0 || eventsLoading) && (
        <EventBanner
          events={upcomingEvents}
          loading={eventsLoading}
          onClose={() => setEventsBannerOpen(false)}
        />
      )}
      {currentZoom < 12 && !searchLoading && !radarOn && (
        <div className="zoom-hint zoom-hint-large">🔍 Zoom in to load venues</div>
      )}
      {radarOn && (
        <div className="zoom-hint radar-hint">🌧️ Zoom locked while radar is on</div>
      )}
      {searchLoading && (
        <div className="map-loading">
          <span className="throbber" />
          Searching nearby venues…
        </div>
      )}
      {!searchLoading && !searchError && currentBounds && currentZoom >= 12 && filteredSearch.length === 0 && !reloadAvailable && (
        <div className="map-loading map-empty">🤷 Nothing found!</div>
      )}
      {reloadAvailable && !searchLoading && currentZoom >= 12 && (
        <button
          className="reload-venues-btn"
          onClick={() => lastBoundsRef.current && loadVenuesForBounds(lastBoundsRef.current)}
        >
          🔄 Re-load venues for this area
        </button>
      )}

      {(weather || weatherLoading) && (
        <WeatherWidget
          weather={weather}
          label={homeLocation?.label}
          loading={weatherLoading}
          error={weatherError}
        />
      )}
      <MapView
        venues={mapVenues}
        favoriteIds={favoriteIds}
        homeLocation={homeLocation}
        mapCenter={mapTarget?.center}
        mapZoom={mapTarget?.zoom}
        walkingRadius={walkingRadius}
        onMapMove={handleMapMove}
        radarUrl={radarTile}
        lockedZoom={radarOn ? 6 : null}
        activeRoute={activeRoute}
        savedRoutes={tab === "Routes" ? savedRoutesColored : []}
        venueGlowIds={effectiveGlowIds}
        hoveredRouteId={hoveredRouteId}
        selectedVenuePosition={selectedVenue ? { lat: selectedVenue.lat, lon: selectedVenue.lon } : null}
        onMarkerProject={setMarkerScreen}
        selectedVenueId={selectedVenueId}
        onMarkerClick={(v) => { setSelectedVenueId(v.id); flyToVenue(v); }}
        clickedLocation={clickedLocation}
        pickingStart={pickingStart}
        onMapClick={(loc) => {
          // If we're in "pick a starting point" mode, this click is the start
          if (pickingStart) {
            const dest = pickingStart.destination;
            setPickingStart(null);
            planRouteWithStart({ lat: loc.lat, lon: loc.lon, label: "Custom start" }, dest);
            return;
          }
          setClickedLocation(loc);
        }}
        onAddAtClick={(loc) => {
          setCustomModalLocation({ lat: loc.lat, lon: loc.lon, label: null });
          setCustomModalOpen(true);
          setClickedLocation(null);
        }}
        onPlanRouteAtClick={(loc) => {
          setPendingRouteDest(loc);
          setClickedLocation(null);
        }}
        onDismissClick={() => setClickedLocation(null)}
      />

      <header className="floating-header">
        <div className="header-row">
          <h1>3rdlocationator</h1>
          <div className="header-controls">
            <button
              className={`radar-toggle ${radarOn ? "active" : ""}`}
              onClick={() => setRadarOn(!radarOn)}
              title={radarOn ? "Hide weather radar" : "Show live precipitation radar"}
            >
              🌧️ Radar{radarOn && radarAgeMin != null ? ` · ${radarAgeMin}m ago` : ""}
            </button>
            <nav className="tabs">
              {TABS.map((t) => (
                <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
                  {t}
                  {t === "Favorites" && favorites.length > 0 && (
                    <span className="tab-badge">{favorites.length}</span>
                  )}
                  {t === "Custom" && userVenues.length > 0 && (
                    <span className="tab-badge">{userVenues.length}</span>
                  )}
                  {t === "Routes" && savedRoutes.length > 0 && (
                    <span className="tab-badge">{savedRoutes.length}</span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </div>
        <LocationSearch
          onSearch={handleSearch}
          loading={searchLoading}
          currentLabel={homeLocation?.label}
        />
      </header>

      <button
        className={`panel-toggle ${panelOpen ? "open" : ""}`}
        onClick={() => setPanelOpen(!panelOpen)}
        title={panelOpen ? "Hide list" : "Show list"}
      >
        {panelOpen ? "◀" : "▶"}
      </button>

      <button
        className="add-venue-fab"
        onClick={() => { setCustomModalLocation(null); setCustomModalOpen(true); }}
        title="Add a custom venue"
      >+ Add Venue</button>

      <aside className={`side-panel ${panelOpen ? "open" : ""}`}>
        {(activeRoute || routeLoading || routeError) && (
          <section className="panel-section active-route-section">
            <div className="active-route-card">
              <div className="active-route-header">
                <strong>🗺️ Active Route</strong>
                <button className="link-btn" onClick={() => { setActiveRoute(null); setRouteError(null); }}>
                  Clear
                </button>
              </div>
              {routeLoading && <p className="muted">Calculating walking route…</p>}
              {routeError && <p className="error">{routeError}</p>}
              {activeRoute && (
                <>
                  <p className="active-route-stats">
                    <span className="meta-distance">
                      {(activeRoute.route.distanceMeters * 0.000621371).toFixed(2)} mi
                    </span>
                    <span> · ~{Math.round(activeRoute.route.durationSeconds / 60)} min walk</span>
                  </p>
                  <p className="active-route-endpoints">
                    <strong>From:</strong> {activeRoute.start.label || `${activeRoute.start.lat.toFixed(4)}, ${activeRoute.start.lon.toFixed(4)}`}
                    <br/>
                    <strong>To:</strong> {activeRoute.destination.lat.toFixed(4)}, {activeRoute.destination.lon.toFixed(4)}
                  </p>
                  {venuesAlongRoute.length > 0 && (
                    <details className="active-route-venues" open>
                      <summary>{venuesAlongRoute.length} venue{venuesAlongRoute.length !== 1 ? "s" : ""} along the way</summary>
                      <ul>
                        {venuesAlongRoute.map((v) => (
                          <li key={v.id} onClick={() => flyToVenue(v)}>
                            <span className="type-emoji">{v.type === "bar" ? "🍺" : v.type === "restaurant" ? "🍽️" : v.type === "cafe" ? "☕" : "📍"}</span>
                            {v.name}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <button className="btn-primary" onClick={saveActiveRoute}>
                    💾 Save to Routes
                  </button>
                </>
              )}
            </div>
          </section>
        )}

        {tab === "Search" && (
          <section className="panel-section">
            {searchResults.length > 0 && (
              <Filters filters={filters} onChange={setFilters} hasHomeLocation={!!homeLocation} mode="search" />
            )}
            {searchError && <p className="error">{searchError}</p>}
            {!searchError && !searchLoading && searchResults.length > 0 && (
              <p className="result-count">
                {filteredSearch.length} venue{filteredSearch.length !== 1 ? "s" : ""}
                {osmHHCount > 0 ? ` · ${osmHHCount} HH found in OSM` : ""}
              </p>
            )}
            {!searchError && !searchLoading && searchResults.length === 0 && currentZoom >= 12 && (
              <p className="muted">Search a city or address above, or pan the map to explore.</p>
            )}
            <div className="venue-list">
              {filteredSearch.map((v) => (
                <VenueCard
                  key={v.id}
                  venue={v}
                  isFavorite={favoriteIds.has(v.id)}
                  happyHour={getHappyHour(v.id)}
                  rating={ratings[v.id] || 0}
                  notes={notes[v.id] || ""}
                  homeLocation={homeLocation}
                  onToggleFavorite={toggleFavorite}
                  onEditHappyHour={(venue) => setHhModal({ venue })}
                  onEditNotes={(venue) => setNotesModal({ venue })}
                  onSetRating={setRating}
                  onCardClick={(vv) => { setSelectedVenueId(vv.id); flyToVenue(vv); }}
                  expanded={selectedVenueId === v.id}
                />
              ))}
            </div>
          </section>
        )}

        {tab === "Favorites" && (
          <section className="panel-section">
            {favorites.length === 0 ? (
              <div className="empty-state">
                <p>No favorites yet.</p>
                <div className="empty-actions">
                  <button className="btn-primary" onClick={() => setTab("Search")}>
                    Find some bars
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Filters filters={filters} onChange={setFilters} hasHomeLocation={!!homeLocation} mode="favorites" />
                <p className="result-count">
                  {filteredFavorites.length} of {favorites.length} favorites
                </p>
                <div className="venue-list">
                  {filteredFavorites
                    .slice()
                    .sort((a, b) => (ratings[b.id] || 0) - (ratings[a.id] || 0) || a.name.localeCompare(b.name))
                    .map((v) => (
                      <VenueCard
                        key={v.id}
                        venue={v}
                        isFavorite={true}
                        happyHour={getHappyHour(v.id)}
                        rating={ratings[v.id] || 0}
                        notes={notes[v.id] || ""}
                        homeLocation={homeLocation}
                        onToggleFavorite={() => removeFavorite(v.id)}
                        onEditHappyHour={(venue) => setHhModal({ venue })}
                        onEditNotes={(venue) => setNotesModal({ venue })}
                        onSetRating={setRating}
                        onCardClick={(vv) => { setSelectedVenueId(vv.id); flyToVenue(vv); }}
                  expanded={selectedVenueId === v.id}
                      />
                    ))}
                </div>
              </>
            )}
          </section>
        )}

        {tab === "Custom" && (
          <section className="panel-section">
            {userVenues.length === 0 ? (
              <div className="empty-state">
                <p>No custom venues yet.</p>
                <p className="muted">
                  Hit <strong>+ Add Venue</strong> or <strong>left-click anywhere on the map</strong> to add one.
                </p>
              </div>
            ) : (
              <>
                <p className="result-count">
                  {userVenues.length} venue{userVenues.length !== 1 ? "s" : ""} you've added
                </p>
                <div className="venue-list">
                  {userVenues
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((v) => (
                      <VenueCard
                        key={v.id}
                        venue={v}
                        isFavorite={favoriteIds.has(v.id)}
                        happyHour={getHappyHour(v.id)}
                        rating={ratings[v.id] || 0}
                        notes={notes[v.id] || ""}
                        homeLocation={homeLocation}
                        onToggleFavorite={toggleFavorite}
                        onEditHappyHour={(venue) => setHhModal({ venue })}
                        onEditNotes={(venue) => setNotesModal({ venue })}
                        onSetRating={setRating}
                        onCardClick={(vv) => { setSelectedVenueId(vv.id); flyToVenue(vv); }}
                  expanded={selectedVenueId === v.id}
                        onDelete={() => deleteUserVenue(v.id)}
                      />
                    ))}
                </div>
              </>
            )}
          </section>
        )}

        {tab === "Routes" && (
          <section className="panel-section">
            {savedRoutes.length === 0 ? (
              <div className="empty-state">
                <p>No saved routes yet.</p>
                <p className="muted">
                  Click <strong>🗺️ Plan Route</strong> in the header, hover the map to preview a walking route from home, then click anywhere to lock it in.
                </p>
              </div>
            ) : (
              <>
                <p className="result-count">
                  {savedRoutes.length} saved route{savedRoutes.length !== 1 ? "s" : ""}
                </p>
                <div className="venue-list">
                  {savedRoutesColored.map((r) => {
                    const miles = (r.distanceMeters * 0.000621371).toFixed(2);
                    const minutes = Math.round(r.durationSeconds / 60);
                    const date = new Date(r.savedAt);
                    const along = savedRouteVenuesMap.get(r.id) || [];
                    return (
                      <div
                        key={r.id}
                        className={`venue-card route-card ${hoveredRouteId === r.id ? "is-route-hovered" : ""}`}
                        style={hoveredRouteId === r.id ? { borderColor: r._color, boxShadow: `0 0 0 2px ${r._color}55, 0 8px 24px rgba(0,0,0,0.45)` } : undefined}
                        onMouseEnter={() => setHoveredRouteId(r.id)}
                        onMouseLeave={() => setHoveredRouteId((prev) => prev === r.id ? null : prev)}
                      >
                        <div className="card-top">
                          <div
                            className="card-title"
                            onClick={() => setMapTarget({
                              center: [(r.origin.lat + r.destination.lat) / 2, (r.origin.lon + r.destination.lon) / 2],
                              zoom: 15,
                            })}
                          >
                            <h3 className="venue-name">
                              <span className="route-swatch" style={{ background: r._color }}></span>
                              Route to {r.destination.lat.toFixed(4)}, {r.destination.lon.toFixed(4)}
                            </h3>
                            <div className="card-meta">
                              <span className="meta-distance">{miles} mi · ~{minutes} min walk</span>
                              <span>Saved {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                            </div>
                          </div>
                          <button
                            className="link-btn delete-btn"
                            onClick={() => deleteSavedRoute(r.id)}
                            title="Delete this route"
                          >🗑️</button>
                        </div>
                        {along.length > 0 && (
                          <details className="active-route-venues" open>
                            <summary>{along.length} venue{along.length !== 1 ? "s" : ""} along the way</summary>
                            <ul>
                              {along.map((v) => (
                                <li key={v.id} onClick={() => flyToVenue(v)}>
                                  <span className="type-emoji">{v.type === "bar" ? "🍺" : v.type === "pub" ? "🍻" : v.type === "restaurant" ? "🍽️" : v.type === "cafe" ? "☕" : v.type === "nightclub" ? "🎵" : "📍"}</span>
                                  {v.name}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        )}
      </aside>

      {selectedVenue && markerScreen && panelRect && (
        <svg className="venue-connector" pointerEvents="none">
          <line
            x1={markerScreen.x}
            y1={markerScreen.y}
            x2={panelRect.left}
            y2={panelRect.top + panelRect.height / 2}
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeDasharray="8 5"
            strokeLinecap="round"
            opacity="0.85"
          />
          <circle
            cx={markerScreen.x}
            cy={markerScreen.y}
            r="5"
            fill="var(--accent)"
            opacity="0.9"
          />
          <circle
            cx={panelRect.left}
            cy={panelRect.top + panelRect.height / 2}
            r="5"
            fill="var(--accent)"
            opacity="0.9"
          />
        </svg>
      )}

      {selectedVenue && (
        <div className="venue-detail-panel" ref={detailPanelRef}>
          <button
            className="venue-detail-close"
            onClick={() => setSelectedVenueId(null)}
            title="Close"
          >✕</button>
          <VenueCard
            venue={selectedVenue}
            isFavorite={favoriteIds.has(selectedVenue.id)}
            happyHour={getHappyHour(selectedVenue.id)}
            rating={ratings[selectedVenue.id] || 0}
            notes={notes[selectedVenue.id] || ""}
            homeLocation={homeLocation}
            onToggleFavorite={toggleFavorite}
            onEditHappyHour={(v) => setHhModal({ venue: v })}
            onEditNotes={(v) => setNotesModal({ venue: v })}
            onSetRating={setRating}
            onCardClick={(v) => flyToVenue(v)}
            expanded={true}
          />
        </div>
      )}

      {hhModal && (
        <HappyHourModal
          venue={hhModal.venue}
          existing={getHappyHour(hhModal.venue.id)}
          onSave={(value) => saveHappyHours(hhModal.venue.id, value)}
          onClose={() => setHhModal(null)}
        />
      )}

      {notesModal && (
        <NotesModal
          venue={notesModal.venue}
          existing={notes[notesModal.venue.id] || ""}
          onSave={(text) => saveNotes(notesModal.venue.id, text)}
          onClose={() => setNotesModal(null)}
        />
      )}

      {pendingRouteDest && (
        <div className="modal-overlay" onClick={() => setPendingRouteDest(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🗺️ Plan Walking Route</h3>
              <button className="modal-close" onClick={() => setPendingRouteDest(null)}>✕</button>
            </div>
            <p className="apikey-info">
              Walking route to{" "}
              <strong>{pendingRouteDest.lat.toFixed(4)}, {pendingRouteDest.lon.toFixed(4)}</strong>.
              Where do you want to start from?
            </p>
            <div className="route-start-options">
              {homeLocation && (
                <button
                  className="route-start-btn route-start-home"
                  onClick={() => {
                    planRouteWithStart(homeLocation, pendingRouteDest);
                    setPendingRouteDest(null);
                  }}
                >
                  <strong>🏠 From your searched location</strong>
                  <span>{homeLocation.label}</span>
                </button>
              )}
              <button
                className="route-start-btn"
                onClick={() => {
                  setPickingStart({ destination: pendingRouteDest });
                  setPendingRouteDest(null);
                }}
              >
                <strong>📍 Pick a starting point on the map</strong>
                <span>Click anywhere to set the start</span>
              </button>
            </div>
            <div className="modal-actions">
              <button onClick={() => setPendingRouteDest(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {pickingStart && (
        <div className="zoom-hint zoom-hint-large pick-start-hint">
          📍 Click anywhere to set your starting point
          <button className="pick-start-cancel" onClick={() => setPickingStart(null)}>Cancel</button>
        </div>
      )}

      {customModalOpen && (
        <CustomVenueModal
          defaultLocation={customModalLocation || homeLocation}
          onSave={(venue) => { saveUserVenue(venue); setTab("Custom"); }}
          onClose={() => { setCustomModalOpen(false); setCustomModalLocation(null); }}
        />
      )}
    </div>
  );
}

function bboxContains(outer, inner) {
  return outer.south <= inner.south
      && outer.north >= inner.north
      && outer.west  <= inner.west
      && outer.east  >= inner.east;
}

function expandBbox(bbox, factor) {
  const latPad = (bbox.north - bbox.south) * (factor - 1) / 2;
  const lonPad = (bbox.east  - bbox.west)  * (factor - 1) / 2;
  return {
    south: bbox.south - latPad,
    north: bbox.north + latPad,
    west:  bbox.west  - lonPad,
    east:  bbox.east  + lonPad,
  };
}

