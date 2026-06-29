import { normalizeNotionId, DEFAULT_PARENT_PAGE_ID, GROUP_OPTIONS } from './dashboard-schema';

export { normalizeNotionId, DEFAULT_PARENT_PAGE_ID, GROUP_OPTIONS };

export const LANDSCAPE_DB_TITLE = 'Sleep Airline Landing Scenery';

export function getLandscapeProperties() {
  return {
    'Entry ID': { title: {} },
    'Flight ID': { rich_text: {} },
    'Passenger ID': { rich_text: {} },
    'Name': { rich_text: {} },
    'Group ID': { select: { options: GROUP_OPTIONS } },
    'Arrival Location': { rich_text: {} },
    'Country': { rich_text: {} },
    'Image': { files: {} },
    'Image URL': { url: {} },
    'Image Prompt': { rich_text: {} },
    'Landing Time': { date: {} },
    'Created At': { date: {} },
  };
}
