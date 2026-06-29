// Reference flight duration: 8 hours = 480 minutes
const REFERENCE_MINUTES = 480;

export function calculateFlightProgress(takeoffTime: string): number {
  const now = Date.now();
  const takeoff = new Date(takeoffTime).getTime();
  const elapsedMinutes = (now - takeoff) / 60000;
  const progress = (elapsedMinutes / REFERENCE_MINUTES) * 100;
  return Math.min(100, Math.max(0, progress));
}
