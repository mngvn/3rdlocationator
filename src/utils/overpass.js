const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

function buildQuery(lat, lon, radiusMeters) {
  return `
    [out:json][timeout:25];
    (
      node[amenity=bar](around:${radiusMeters},${lat},${lon});
      node[amenity=pub](around:${radiusMeters},${lat},${lon});
      node[amenity=restaurant](around:${radiusMeters},${lat},${lon});
      node[amenity=cafe](around:${radiusMeters},${lat},${lon});
      node[amenity=nightclub](around:${radiusMeters},${lat},${lon});
      node[shop=alcohol](around:${radiusMeters},${lat},${lon});
    );
    out body;
  `.trim();
}

function buildBboxQuery(south, west, north, east) {
  const bbox = `${south},${west},${north},${east}`;
  return `
    [out:json][timeout:25];
    (
      node[amenity=bar](${bbox});
      node[amenity=pub](${bbox});
      node[amenity=restaurant](${bbox});
      node[amenity=cafe](${bbox});
      node[amenity=nightclub](${bbox});
      node[shop=alcohol](${bbox});
    );
    out body;
  `.trim();
}

function parseVenue(node) {
  const t = node.tags || {};
  const type = t.amenity || (t.shop === "alcohol" ? "liquor_store" : null);
  return {
    id: String(node.id),
    name: t.name || "Unnamed",
    type,
    lat: node.lat,
    lon: node.lon,
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
