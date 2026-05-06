import { useState, useMemo } from "react";
import { useLocalStorage } from "./hooks/useLocalStorage";
import { searchVenuesBbox, geocodeAddress } from "./utils/overpass";
import { EVENT_CENTERS } from "./data/eventCenters";
import { haversineDistance } from "./utils/distance";
import { parseOsmHappyHours } from "./utils/parseHappyHours";
import LocationSearch from "./components/LocationSearch";
import VenueCard from "./components/VenueCard";
import Filters from "./components/Filters";
import HappyHourModal from "./components/HappyHourModal";
import CustomVenueModal from "./components/CustomVenueModal";
import NotesModal from "./components/NotesModal";
import MapView from "./components/MapView";

const DEFAULT_FILTERS = { search: "", types: [], happyHourOnly: false, walkingOnly: false, maxMiles: 1 };
const TABS = ["Search", "Favorites"];

export default function App() {
  const [tab, setTab] = useState("Search");
  const [panelOpen, setPanelOpen] = useState(true);
  // bh_portfolio key kept for backwards compat with existing data; semantically these are favorites now.
  const [favorites, setFavorites] = useLocalStorage("bh_portfolio", []);
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
  const [hhModal, setHhModal] = useState(null);
  const [notesModal, setNotesModal] = useState(null);
  const [customModalOpen, setCustomModalOpen] = useState(false);
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

  const visibleEventCenters = useMemo(() => {
    if (!eventsOn) return [];
    if (!currentBounds) return EVENT_CENTERS;
    const { south, west, north, east } = currentBounds;
    return EVENT_CENTERS.filter(
      (e) => e.lat >= south && e.lat <= north && e.lon >= west && e.lon <= east
    );
  }, [eventsOn, currentBounds]);

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

  const filteredFavorites = applyFilters(favorites);
  const filteredSearch = applyFilters(searchResults);

  // Map shows: search results + favorites merged (favorites always render in case they're outside the search radius)
  const mapVenues = useMemo(() => {
    if (tab === "Search") {
      const merged = new Map();
      filteredSearch.forEach((v) => merged.set(v.id, v));
      // Always include favorites that match filters
      filteredFavorites.forEach((v) => merged.set(v.id, v));
      return Array.from(merged.values());
    }
    return filteredFavorites;
  }, [tab, filteredSearch, filteredFavorites]);

  const walkingRadius = filters.walkingOnly && homeLocation ? filters.maxMiles : null;

  // HH count for transparency about how many were auto-found
  const osmHHCount = useMemo(
    () => Object.values(happyHours).filter((hh) => hh && !Array.isArray(hh) && hh.source === "osm").length,
    [happyHours]
  );

  return (
    <div className="app map-mode">
      {currentZoom < 12 && !searchLoading && (
        <div className="zoom-hint">🔍 Zoom in to load venues</div>
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
      />

      <header className="floating-header">
        <div className="header-row">
          <h1>BarHunter</h1>
          <div className="header-controls">
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
        onClick={() => setCustomModalOpen(true)}
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
            {searchLoading && <p className="muted">Searching nearby venues...</p>}
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
          defaultLocation={homeLocation}
          onSave={(venue) => {
            toggleFavorite(venue);
            setMapTarget({ center: [venue.lat, venue.lon], zoom: 16 });
            setTab("Favorites");
          }}
          onClose={() => setCustomModalOpen(false)}
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
