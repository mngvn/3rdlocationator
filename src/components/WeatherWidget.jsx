import { WEATHER_CODES } from "../utils/weather";

function shortLocation(label) {
  if (!label) return "";
  const parts = label.split(",").map((s) => s.trim());
  if (parts.length >= 2) return `${parts[0]}, ${parts[1]}`;
  return parts[0];
}

export default function WeatherWidget({ weather, label, loading, error }) {
  if (loading) {
    return <div className="weather-widget"><span className="weather-loading">Loading weather…</span></div>;
  }
  if (error) {
    return <div className="weather-widget"><span className="weather-error">⚠️ {error}</span></div>;
  }
  if (!weather?.current) return null;

  const c = weather.current;
  const code = WEATHER_CODES[c.weather_code] || { emoji: "🌡️", label: "—" };
  const hi = Math.round(weather.daily?.temperature_2m_max?.[0] ?? c.temperature_2m);
  const lo = Math.round(weather.daily?.temperature_2m_min?.[0] ?? c.temperature_2m);
  const precip = weather.daily?.precipitation_probability_max?.[0];

  return (
    <div className="weather-widget">
      <div className="weather-header">
        <span className="weather-emoji">{code.emoji}</span>
        <div className="weather-temp-block">
          <span className="weather-temp">{Math.round(c.temperature_2m)}°</span>
          <span className="weather-cond">{code.label}</span>
        </div>
      </div>
      {label && <div className="weather-loc">📍 {shortLocation(label)}</div>}
      <div className="weather-details">
        <span title="Today's high / low">↑{hi}° ↓{lo}°</span>
        <span title="Wind">💨 {Math.round(c.wind_speed_10m)}mph</span>
        {precip > 0 && <span title="Precipitation chance">💧 {precip}%</span>}
      </div>
    </div>
  );
}
