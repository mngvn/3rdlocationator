import { useState } from "react";
import { geocodeAddress } from "../utils/overpass";

const TYPE_OPTIONS = [
  { value: "bar",          label: "Bar" },
  { value: "pub",          label: "Pub" },
  { value: "restaurant",   label: "Restaurant" },
  { value: "cafe",         label: "Cafe" },
  { value: "nightclub",    label: "Nightclub" },
  { value: "liquor_store", label: "Liquor Store" },
];

export default function CustomVenueModal({ defaultLocation, onSave, onClose }) {
  const [name, setName] = useState("");
  const [type, setType] = useState("bar");
  const [address, setAddress] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    let coords = null;
    if (address.trim()) {
      try {
        const geo = await geocodeAddress(address);
        coords = { lat: geo.lat, lon: geo.lon };
      } catch {
        setError("Couldn't find that address. Try a more specific one, or leave blank to use the current map location.");
        setLoading(false);
        return;
      }
    } else if (defaultLocation) {
      coords = { lat: defaultLocation.lat, lon: defaultLocation.lon };
    } else {
      setError("Enter an address, or search a location first to set a default.");
      setLoading(false);
      return;
    }

    onSave({
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim(),
      type,
      lat: coords.lat,
      lon: coords.lon,
      address: address.trim() || null,
      cuisine: cuisine.trim() || null,
      custom: true,
    });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Custom Venue</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="custom-form">
          <label className="field">
            <span>Name *</span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Joe's Tavern"
              autoFocus
            />
          </label>
          <label className="field">
            <span>Type</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Address {defaultLocation ? "(optional)" : "*"}</span>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={defaultLocation ? "Leave blank to use current map area" : "123 Main St, City"}
              required={!defaultLocation}
            />
          </label>
          <label className="field">
            <span>Cuisine / Notes</span>
            <input
              type="text"
              value={cuisine}
              onChange={(e) => setCuisine(e.target.value)}
              placeholder="e.g. dive bar, mexican, rooftop"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading || !name.trim()}>
              {loading ? "Saving..." : "Add to Portfolio"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
