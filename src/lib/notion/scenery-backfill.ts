import { getFlightByFlightId } from './flight-lookup';
import { getLandscapeByFlightId, saveLandingScenery } from './landscape-images';
import { generateLandingScenery } from '../ai/scenery';

function parseCityCountry(arrivalLocation: string): { city: string; country: string } {
  const parts = arrivalLocation.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { city: parts[0], country: parts[parts.length - 1] };
  }
  return { city: arrivalLocation, country: arrivalLocation };
}

export async function backfillSceneryForFlight(
  flightId: string,
  options?: { force?: boolean }
): Promise<{
  flightId: string;
  skipped?: boolean;
  error?: string;
  imageUrl?: string;
  arrivalLocation?: string;
}> {
  const existing = await getLandscapeByFlightId(flightId);
  if (!options?.force && existing?.imageUrl) {
    return { flightId, skipped: true, imageUrl: existing.imageUrl, arrivalLocation: existing.arrivalLocation };
  }

  const flight = await getFlightByFlightId(flightId);
  if (!flight) return { flightId, error: '找不到航班' };
  if (!flight.arrivalLocation) return { flightId, error: '沒有抵達地點' };

  const { city, country } = parseCityCountry(flight.arrivalLocation);
  const sceneryGen = await generateLandingScenery(city, country, flight.arrivalLocation, flight.flightId);
  if (!sceneryGen) return { flightId, error: '生圖失敗（OPENAI_API_KEY）' };

  const saved = await saveLandingScenery({
    flightId: flight.flightId,
    passengerId: flight.passengerId,
    passengerName: flight.passengerName,
    groupId: flight.groupId,
    arrivalLocation: flight.arrivalLocation,
    country,
    imageBuffer: sceneryGen.imageBuffer,
    filename: sceneryGen.filename,
    contentType: sceneryGen.contentType,
    imagePrompt: sceneryGen.imagePrompt,
    landingTime: flight.landingTime ?? new Date().toISOString(),
  });

  if (!saved?.imageUrl) return { flightId, error: '存入 Notion 失敗' };
  return { flightId, imageUrl: saved.imageUrl, arrivalLocation: saved.arrivalLocation };
}

export async function backfillSceneryForFlights(flightIds: string[], options?: { force?: boolean }) {
  const results = [];
  for (const flightId of flightIds) {
    try {
      results.push(await backfillSceneryForFlight(flightId, options));
    } catch (err) {
      results.push({ flightId, error: err instanceof Error ? err.message : '未知錯誤' });
    }
  }
  return results;
}
