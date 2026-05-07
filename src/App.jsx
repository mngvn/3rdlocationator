import { useState, useMemo, useEffect } from "react";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { searchVenuesBbox, geocodeAddress } from "./utils/overpass";
import { EVENT_CENTERS } from "./data/eventCenters";
import { haversineDistance } from "./utils/distance";
import { parseOsmHappyHours } from "./utils/parseHappyHours";
import { fetchWeather, fetchRadarFrames, radarTileUrl } from "./utils/weather";
import LocationSearch from "./components/LocationSearch";
import VenueCard from "./components/VenueCard";
import Filters from "./components/Filters";
import HappyHourModal from "./components/HappyHourModal";
import CustomVenueModal from "./components/CustomVenueModal";
import NotesModal from "./components/NotesModal";
import WeatherWidget from "./components/WeatherWidget";
import MapView from "./components/MapView";

const DEFAULT_FILTERS = { search: "", types: [], happyHourOnly: false, walkingOnly: false, maxMiles: 1 };
const TABS = ["Search", "Favorites", "Mine"];

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

  // Events
  const [eventsOn, setEventsOn] = useLocalStorage("bh_events_on", false);

  // Weather
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState(null);

  // Radar
  const [radarOn, setRadarOn] = useLocalStorage("bh_radar_on", false);
  const [radarFrame, setRadarFrame] = useState(null);
  const [hhModal, setHhModal] = useState(null);
  const [notesModal, setNotesModal] = useState(null);
  const [customModalOpen, setCustomModalOpen] = useState(false);
  const [customModalLocation, setCustomModalLocation] = useState(null);
  const [clickedLocation, setClickedLocation] = useState(null);
  const [mapTarget, setMapTarget] = useState(null);

  async function handleSearch(query, radiusMeters) {
    setSearchLoading(true);
    setSearchError(null);
    try {
      const geo = await geocodeAddress(query);
      setHomeLocation({ label: geo.label, lat: geo.lat, lon: geo.lon });
      setMapTarget({ center: [geo.lat, geo.lon], zoom: zoomForRadius(radiusMeters) });
      // Venue loading is driven by the map's moveend event after flyTo
    } catch (e) {
      setSearchError(e.message === "Address not found"
        ? "Couldn't find that location. Try a more specific address or city."
        : "Geocoding failed. Try again.");
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleMapMove({ lat, lon, zoom, bounds }) {
    setCurrentZoom(zoom);
    setCurrentBounds(bounds);

    if (zoom < 12) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    try {
      const results = await searchVenuesBbox(bounds.south, bounds.west, bounds.north, bounds.east);
      setSearchResults(results);

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

  const visibleEventCenters = useMemo(() => {
    if (!eventsOn) return [];
    if (!currentBounds) return EVENT_CENTERS;
    const { south, west, north, east } = currentBounds;
    return EVENT_CENTERS.filter(
      (e) => e.lat >= south && e.lat <= north && e.lon >= west && e.lon <= east
    );
  }, [eventsOn, currentBounds]);

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
  // Merge OSM search results with any user-added venues in the current
  // viewport — they're indistinguishable from "real" results for filtering.
  const combinedSearch = useMemo(() => {
    const merged = new Map();
    searchResults.forEach((v) => merged.set(v.id, v));
    userVenuesInView.forEach((v) => merged.set(v.id, v));
    return Array.from(merged.values());
  }, [searchResults, userVenuesInView]);
  const filteredSearch = applyFilters(combinedSearch);

  // Map shows only what's relevant to the current tab — no permanent pins.
  const mapVenues = useMemo(() => {
    if (tab === "Search") {
      const merged = new Map();
      filteredSearch.forEach((v) => merged.set(v.id, v));
      // Layer favorites in too so they remain visible outside the search radius
      filteredFavorites.forEach((v) => merged.set(v.id, v));
      return Array.from(merged.values());
    }
    if (tab === "Mine") return userVenues;
    return filteredFavorites;
  }, [tab, filteredSearch, filteredFavorites, userVenues]);

  const walkingRadius = filters.walkingOnly && homeLocation ? filters.maxMiles : null;

  // HH count for transparency about how many were auto-found
  const osmHHCount = useMemo(
    () => Object.values(happyHours).filter((hh) => hh && !Array.isArray(hh) && hh.source === "osm").length,
    [happyHours]
  );

  return (
    <div className="app map-mode">
      {currentZoom < 12 && !searchLoading && !radarOn && (
        <div className="zoom-hint zoom-hint-large">🔍 Zoom in to load venues</div>
      )}
      {radarOn && (
        <div className="zoom-hint radar-hint">🌧️ Zoom locked while radar is on</div>
      )}
      {searchLoading && (
        <div className="map-loading">⏳ Searching nearby venues…</div>
      )}
      {!searchLoading && !searchError && currentBounds && currentZoom >= 12 && filteredSearch.length === 0 && (
        <div className="map-loading map-empty">🤷 Nothing found!</div>
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
        eventCenters={visibleEventCenters}
        radarUrl={radarTile}
        lockedZoom={radarOn ? 6 : null}
        clickedLocation={clickedLocation}
        onMapClick={setClickedLocation}
        onAddAtClick={(loc) => {
          setCustomModalLocation({ lat: loc.lat, lon: loc.lon, label: null });
          setCustomModalOpen(true);
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
            <button
              className={`events-toggle ${eventsOn ? "active" : ""}`}
              onClick={() => setEventsOn(!eventsOn)}
              title={eventsOn ? "Hide event venues" : "Show major event venues"}
            >
              🎟️ Events{eventsOn && visibleEventCenters.length > 0 ? ` · ${visibleEventCenters.length}` : ""}
            </button>
            <nav className="tabs">
              {TABS.map((t) => (
                <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
                  {t}
                  {t === "Favorites" && favorites.length > 0 && (
                    <span className="tab-badge">{favorites.length}</span>
                  )}
                  {t === "Mine" && userVenues.length > 0 && (
                    <span className="tab-badge">{userVenues.length}</span>
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
                  onCardClick={flyToVenue}
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
                        onCardClick={flyToVenue}
                      />
                    ))}
                </div>
              </>
            )}
          </section>
        )}

        {tab === "Mine" && (
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
                        onCardClick={flyToVenue}
                        onDelete={() => deleteUserVenue(v.id)}
                      />
                    ))}
                </div>
              </>
            )}
          </section>
        )}
      </aside>

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

      {customModalOpen && (
        <CustomVenueModal
          defaultLocation={customModalLocation || homeLocation}
          onSave={(venue) => { saveUserVenue(venue); setTab("Mine"); }}
          onClose={() => { setCustomModalOpen(false); setCustomModalLocation(null); }}
        />
      )}
    </div>
  );
}

function zoomForRadius(meters) {
  if (meters <= 1500) return 15;
  if (meters <= 3000) return 14;
  if (meters <= 5000) return 13;
  return 12;
}
