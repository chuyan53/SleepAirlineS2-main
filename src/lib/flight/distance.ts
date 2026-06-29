// MVP formula: 1 minute of sleep = 12 km of flight distance
const KM_PER_MINUTE = 12;

export function calculateFlightDistance(durationMinutes: number): number {
  return durationMinutes * KM_PER_MINUTE;
}
