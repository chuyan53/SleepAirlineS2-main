import type { Destination } from '../types';
import rawCities from './cities_data.json';

interface RawCity {
  city: string;
  city_zh?: string;
  country: string;
  country_zh?: string;
  country_iso_code: string;
  timezone: string;
  latitude: number;
  longitude: number;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'city';
}

function toDisplayName(entry: RawCity): string {
  if (entry.city_zh && entry.country_zh) {
    return `${entry.city_zh}, ${entry.country_zh}`;
  }
  return `${entry.city}, ${entry.country}`;
}

function normalizeEntry(entry: RawCity): (RawCity & { country_iso_code: string }) | null {
  if (entry.latitude == null || entry.longitude == null || !entry.city) return null;

  const iso =
    entry.country_iso_code?.toLowerCase() ??
    (entry.country?.length === 2 ? entry.country.toLowerCase() : null);
  if (!iso) return null;

  const country =
    entry.country && entry.country.length > 2 ? entry.country : entry.country_zh ?? entry.country;

  return { ...entry, country, country_iso_code: iso };
}

export const CITIES: Destination[] = (rawCities as RawCity[])
  .map(normalizeEntry)
  .filter((entry): entry is RawCity & { country_iso_code: string } => entry !== null)
  .map((entry) => ({
  destinationId: `${entry.country_iso_code.toUpperCase()}_${slug(entry.city)}`,
  city: entry.city,
  country: entry.country,
  displayName: toDisplayName(entry),
  latitude: entry.latitude,
  longitude: entry.longitude,
  airportCode: null,
  region: entry.country,
  availableForLanding: true,
  }));
