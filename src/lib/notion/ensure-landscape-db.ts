import type { Client } from '@notionhq/client';
import {
  DEFAULT_PARENT_PAGE_ID,
  LANDSCAPE_DB_TITLE,
  getLandscapeProperties,
  normalizeNotionId,
} from './landscape-schema';
import { getNotionClient } from './client';
import { resolveDbIdWithFallback } from './db-access';

let cachedDbId: string | null = null;
let resolving: Promise<string> | null = null;

function getParentPageId(): string {
  const raw = process.env.NOTION_PARENT_PAGE_ID ?? DEFAULT_PARENT_PAGE_ID;
  return normalizeNotionId(raw);
}

function isOwnWorkspace(): boolean {
  return getParentPageId() !== normalizeNotionId(DEFAULT_PARENT_PAGE_ID);
}

function canWriteSchema(): boolean {
  return process.env.NOTION_ALLOW_SCHEMA_WRITE === 'true' || isOwnWorkspace();
}

async function readDatabaseTitle(client: Client, databaseId: string): Promise<string> {
  const db = await client.databases.retrieve({ database_id: databaseId });
  const title = (db as { title?: { plain_text: string }[] }).title;
  return title?.[0]?.plain_text ?? '';
}

async function findLandscapeOnPage(client: Client, parentPageId: string): Promise<string | null> {
  let cursor: string | undefined;

  do {
    const response = await client.blocks.children.list({
      block_id: parentPageId,
      start_cursor: cursor,
      page_size: 100,
    });

    for (const block of response.results) {
      const typed = block as { type?: string; id?: string };
      if (typed.type !== 'child_database' || !typed.id) continue;
      const title = await readDatabaseTitle(client, typed.id);
      if (title === LANDSCAPE_DB_TITLE) return typed.id;
    }

    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  return null;
}

async function createLandscapeDb(client: Client, parentPageId: string): Promise<string> {
  const db = await client.databases.create({
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: LANDSCAPE_DB_TITLE } }],
    properties: getLandscapeProperties(),
  });
  return db.id;
}

async function findOrCreateLandscapeDb(): Promise<string> {
  const client = getNotionClient();
  const parentPageId = getParentPageId();

  try {
    return await resolveDbIdWithFallback({
      client,
      envDbId: process.env.NOTION_LANDSCAPE_DB_ID,
      expectedTitle: LANDSCAPE_DB_TITLE,
      findOnParentPage: findLandscapeOnPage,
      parentPageId,
    });
  } catch (fallbackErr) {
    if (!canWriteSchema()) throw fallbackErr;

    try {
      return await createLandscapeDb(client, parentPageId);
    } catch {
      const retry = await findLandscapeOnPage(client, parentPageId);
      if (retry) return retry;
      throw new Error('無法在 Notion 父頁面建立 Landing Scenery 資料庫，請確認 Integration 已 Connect。');
    }
  }
}

export async function resolveLandscapeDbId(): Promise<string> {
  if (cachedDbId) return cachedDbId;

  if (!resolving) {
    resolving = findOrCreateLandscapeDb()
      .then((id) => {
        cachedDbId = id;
        return id;
      })
      .finally(() => {
        resolving = null;
      });
  }

  return resolving;
}
