// Open-Meteo for current/forecast weather (free, no key)
// RainViewer for live radar tiles (free, no key)

export const WEATHER_CODES = {
  0:  { emoji: "☀️",  label: "Clear" },
  1:  { emoji: "🌤️", label: "Mostly clear" },
  2:  { emoji: "⛅",  label: "Partly cloudy" },
  3:  { emoji: "☁️",  label: "Cloudy" },
  45: { emoji: "🌫️", label: "Fog" },
  48: { emoji: "🌫️", label: "Rime fog" },
  51: { emoji: "🌦️", label: "Light drizzle" },
  53: { emoji: "🌦️", label: "Drizzle" },
  55: { emoji: "🌧️", label: "Heavy drizzle" },
  61: { emoji: "🌧️", label: "Light rain" },
  63: { emoji: "🌧️", label: "Rain" },
  65: { emoji: "🌧️", label: "Heavy rain" },
  71: { emoji: "🌨️", label: "Light snow" },
  73: { emoji: "🌨️", label: "Snow" },
  75: { emoji: "❄️",  label: "Heavy snow" },
  77: { emoji: "❄️",  label: "Snow grains" },
  80: { emoji: "🌦️", label: "Showers" },
  81: { emoji: "🌧️", label: "Rain showers" },
  82: { emoji: "⛈️", label: "Heavy showers" },
  85: { emoji: "🌨️", label: "Snow showers" },
  86: { emoji: "❄️",  label: "Heavy snow showers" },
  95: { emoji: "⛈️", label: "Thunderstorm" },
  96: { emoji: "⛈️", label: "Thunder w/ hail" },
  99: { emoji: "⛈️", label: "Heavy thunderstorm" },
};

export async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,is_day",
    daily: "temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    timezone: "auto",
    forecast_days: "3",
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error("Weather fetch failed");
  return res.json();
}

export async function fetchRadarFrames() {
  const res = await fetch("https://api.rainviewer.com/public/weather-maps.json");
  if (!res.ok) throw new Error("Radar fetch failed");
  return res.json();
}

// Build a Leaflet tile URL template for a given RainViewer frame.
// color=4 is "The Weather Channel" palette — green for light, yellow for
// moderate, bright red/magenta for heavy storms. smooth=1, snow=1.
// Note: free RainViewer tiles only exist up to native zoom 10; pair with
// `maxNativeZoom={10}` on the TileLayer so Leaflet upscales for closer zooms.
export const RADAR_MAX_NATIVE_ZOOM = 10;

export function radarTileUrl(host, framePath) {
  return `${host}${framePath}/512/{z}/{x}/{y}/4/1_1.png`;
}
