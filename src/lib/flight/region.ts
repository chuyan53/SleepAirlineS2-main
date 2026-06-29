import type { NarrativeRegion } from '../../types';

export const REGION_ORDER: NarrativeRegion[] = [
  'departure_clouds',
  'pacific_drift',
  'deep_night_current',
  'dawn_corridor',
  'arrival_harbor',
];

export const REGION_DISPLAY: Record<NarrativeRegion, string> = {
  departure_clouds: '登機雲層',
  pacific_drift: '太平洋漂流帶',
  deep_night_current: '深夜洋流',
  dawn_corridor: '黎明航廊',
  arrival_harbor: '抵達港灣',
};

export function getNarrativeRegion(progress: number): NarrativeRegion {
  if (progress < 20) return 'departure_clouds';
  if (progress < 40) return 'pacific_drift';
  if (progress < 60) return 'deep_night_current';
  if (progress < 80) return 'dawn_corridor';
  return 'arrival_harbor';
}

export function areAdjacentRegions(a: NarrativeRegion, b: NarrativeRegion): boolean {
  const indexA = REGION_ORDER.indexOf(a);
  const indexB = REGION_ORDER.indexOf(b);
  return Math.abs(indexA - indexB) === 1;
}
