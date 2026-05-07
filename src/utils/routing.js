// Walking-route generation via OSRM's free public foot-routing server.
// CORS-enabled, no key. The demo server has soft rate limits — keep
// concurrency low and stagger calls.
const OSRM_BASE = "https://router.project-osrm.org/route/v1/foot";

export async function fetchWalkingRoute(home, venue) {
  const url =
    `${OSRM_BASE}/${home.lon},${home.lat};${venue.lon},${venue.lat}` +
    `?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) return null;
    return {
      geometry: data.routes[0].geometry,           // GeoJSON LineString
      distanceMeters: data.routes[0].distance,
      durationSeconds: data.routes[0].duration,
    };
  } catch {
    return null;
  }
}
