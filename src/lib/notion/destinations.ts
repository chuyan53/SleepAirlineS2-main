import { CITIES } from '../../data/cities';

/** 城市資料來自本地 cities_data.json，不需 Notion。 */
export async function getAvailableDestinations() {
  return CITIES.filter((c) => c.availableForLanding);
}

export async function seedDestinations(): Promise<{ seeded: number; skipped: number }> {
  return {
    seeded: 0,
    skipped: CITIES.length,
  };
}
