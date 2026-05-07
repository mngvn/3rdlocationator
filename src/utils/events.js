// Free, no-key upcoming-events fetch via Wikidata SPARQL.
//
// Bandsintown's previously-keyless artist endpoint started returning 401
// "not authorized" so we switched to Wikidata's public query service.
// Coverage is patchy — Wikidata indexes notable events (festivals,
// championship games, conferences, major concerts) but won't have every
// random show in town. For a typical city you'll see 0–10 results.
//
// SPARQL endpoint: https://query.wikidata.org/sparql — CORS-enabled, no key.

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";

// Parse "Point(lon lat)" → { lat, lon }
function parsePointWkt(s) {
  const m = /^Point\(\s*([\-\d.]+)\s+([\-\d.]+)\s*\)$/i.exec(s || "");
  if (!m) return null;
  return { lat: parseFloat(m[2]), lon: parseFloat(m[1]) };
}

function buildQuery(lat, lon, radiusKm) {
  return `
SELECT DISTINCT ?event ?eventLabel ?startDate ?endDate ?venueLabel ?coord ?article WHERE {
  ?event wdt:P31/wdt:P279* wd:Q1656682 .
  ?event wdt:P580 ?startDate .
  FILTER(?startDate >= NOW())
  FILTER(?startDate <= "2027-12-31T00:00:00"^^xsd:dateTime)
  SERVICE wikibase:around {
    ?event wdt:P625 ?coord .
    bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${radiusKm}" .
  }
  OPTIONAL { ?event wdt:P582 ?endDate . }
  OPTIONAL { ?event wdt:P276 ?venue . }
  OPTIONAL {
    ?article schema:about ?event ;
             schema:isPartOf <https://en.wikipedia.org/> .
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
ORDER BY ?startDate
LIMIT 30
`.trim();
}

function parseRow(b) {
  const coord = parsePointWkt(b.coord?.value);
  if (!coord) return null;
  return {
    id: b.event?.value || `${b.eventLabel?.value}-${b.startDate?.value}`,
    name: b.eventLabel?.value || "Untitled event",
    artist: b.eventLabel?.value || "Untitled event", // banner uses .artist label
    venue: b.venueLabel?.value || "",
    date: b.startDate?.value || "",
    endDate: b.endDate?.value || null,
    lat: coord.lat,
    lon: coord.lon,
    url: b.article?.value || b.event?.value || null,
  };
}

const cache = new Map(); // key: "lat,lon" → { fetched, events }
const CACHE_TTL_MS = 30 * 60 * 1000;

export async function fetchUpcomingEvents(home, radiusKm = 200, _limit = 25) {
  if (!home) return [];
  const key = `${home.lat.toFixed(3)},${home.lon.toFixed(3)},${radiusKm}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetched < CACHE_TTL_MS) return cached.events;

  const url =
    `${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(buildQuery(home.lat, home.lon, radiusKm))}` +
    `&format=json`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/sparql-results+json" } });
    if (!res.ok) {
      cache.set(key, { fetched: Date.now(), events: [] });
      return [];
    }
    const data = await res.json();
    const rows = data?.results?.bindings || [];
    const events = rows.map(parseRow).filter(Boolean);
    cache.set(key, { fetched: Date.now(), events });
    return events;
  } catch {
    cache.set(key, { fetched: Date.now(), events: [] });
    return [];
  }
}
