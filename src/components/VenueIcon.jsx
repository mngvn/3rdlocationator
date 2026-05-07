import { renderToStaticMarkup } from "react-dom/server";
import {
  Beer, Wine, GlassWater, Coffee, IceCream, Utensils, Soup, Hamburger,
  Music, Mic2, Drama, Film, Palette, Tent, Dumbbell, Dices,
  ShoppingBag, MapPin,
} from "lucide-react";

// Per-venue-type Lucide icon component. Choose flat-stroked icons that
// read at small sizes (16px) inside a colored map pin.
export const VENUE_ICON = {
  bar:            Wine,         // cocktail-style glass
  pub:            Beer,
  biergarten:     Beer,
  restaurant:     Utensils,
  fast_food:      Hamburger,
  food_court:     Soup,
  cafe:           Coffee,
  ice_cream:      IceCream,
  nightclub:      Music,
  stripclub:      Music,
  music_venue:    Mic2,
  cinema:         Film,
  theatre:        Drama,
  arts_centre:    Palette,
  events_venue:   Tent,
  sporting_arena: Dumbbell,
  casino:         Dices,
  liquor_store:   ShoppingBag,
  wine_shop:      GlassWater,
};

export function VenueIconReact({ type, size = 18, color = "currentColor", strokeWidth = 2 }) {
  const Comp = VENUE_ICON[type] || MapPin;
  return <Comp size={size} color={color} strokeWidth={strokeWidth} />;
}

// Pre-render each icon to a static SVG string at module load. Used by Leaflet
// divIcon (which takes raw HTML) so we don't pay the renderToString cost on
// every marker. Color is hard-coded white because pins have a colored bg.
const SVG_CACHE = {};
for (const type of Object.keys(VENUE_ICON)) {
  SVG_CACHE[type] = renderToStaticMarkup(
    <VenueIconReact type={type} size={16} color="#ffffff" strokeWidth={2.4} />
  );
}
SVG_CACHE.__default = renderToStaticMarkup(
  <MapPin size={16} color="#ffffff" strokeWidth={2.4} />
);

export function venueIconSvg(type) {
  return SVG_CACHE[type] || SVG_CACHE.__default;
}
