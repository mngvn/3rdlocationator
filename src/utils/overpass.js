const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

// All node types we pull from OSM, keyed by the type string we use internally.
// Each value is the OSM filter clause (without coordinates, which get appended).
const NODE_FILTERS = [
  "[amenity=bar]",
  "[amenity=pub]",
  "[amenity=restaurant]",
  "[amenity=fast_food]",
  "[amenity=cafe]",
  "[amenity=ice_cream]",
  "[amenity=biergarten]",
  "[amenity=food_court]",
  "[amenity=nightclub]",
  "[amenity=stripclub]",
  "[amenity=music_venue]",
  "[amenity=cinema]",
  "[amenity=theatre]",
  "[amenity=arts_centre]",
  "[amenity=events_venue]",
  "[amenity=casino]",
  "[shop=alcohol]",
  "[shop=wine]",
];

// `nwr` = node + way + relation, so we don't miss venues mapped as building
// polygons (e.g. the Gay 90's in Minneapolis is a way, not a node).
// `out center` returns a representative lat/lon for ways/relations.
function buildQuery(lat, lon, radiusMeters) {
  const clauses = NODE_FILTERS
    .map((f) => `      nwr${f}(around:${radiusMeters},${lat},${lon});`)
    .join("\n");
  return `[out:json][timeout:25];\n(\n${clauses}\n);\nout tags center;`;
}

function buildBboxQuery(south, west, north, east) {
  const bbox = `${south},${west},${north},${east}`;
  const clauses = NODE_FILTERS
    .map((f) => `      nwr${f}(${bbox});`)
    .join("\n");
  return `[out:json][timeout:25];\n(\n${clauses}\n);\nout tags center;`;
}

const SHOP_TYPE_MAP = {
  alcohol: "liquor_store",
  wine: "wine_shop",
};

function parseVenue(el) {
  const t = el.tags || {};
  const type = t.amenity || (t.shop && SHOP_TYPE_MAP[t.shop]) || null;
  // Nodes have lat/lon directly; ways/relations have a `center` from `out center`.
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;
  // Keep node IDs as plain numbers (backwards-compat with existing favorites);
  // prefix way/relation IDs so the namespaces don't collide.
  const id = el.type === "node" ? String(el.id) : `${el.type}/${el.id}`;
  return {
    id,
    name: t.name || "Unnamed",
    type,
    lat,
    lon,
    address: [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ") || null,
    phone: t.phone || t["contact:phone"] || null,
    website: t.website || t["contact:website"] || null,
    cuisine: t.cuisine || null,
    openingHours: t.opening_hours || null,
    osmHappyHours: t.happy_hours || t["opening_hours:happy_hours"] || null,
  };
}

async function tryEndpoint(url, query) {
  const res = await fetch(url, {
    method: "POST",
    body: `data=${encodeURIComponent(query)}`,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function searchVenuesBbox(south, west, north, east) {
  const query = buildBboxQuery(south, west, north, east);
  let lastError = null;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const data = await tryEndpoint(url, query);
      return data.elements
        .filter((el) => el.tags?.name)
        .map(parseVenue)
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("All Overpass endpoints failed");
}

export async function searchVenuesNear(lat, lon, radiusMeters = 5000) {
  const query = buildQuery(lat, lon, radiusMeters);
  let lastError = null;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const data = await tryEndpoint(url, query);
      return data.elements
        .filter((el) => el.tags?.name)
        .map(parseVenue)
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("All Overpass endpoints failed");
}

export async function geocodeAddress(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Geocoding failed");
  const data = await res.json();
  if (!data.length) throw new Error("Address not found");
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    label: data[0].display_name,
  };
}
