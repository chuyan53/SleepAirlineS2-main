import type { Client } from '@notionhq/client';
import { normalizeNotionId } from './dashboard-schema';

async function readDatabaseTitle(client: Client, databaseId: string): Promise<string> {
  const db = await client.databases.retrieve({ database_id: databaseId });
  const title = (db as { title?: { plain_text: string }[] }).title;
  return title?.[0]?.plain_text ?? '';
}

/** 驗證 env 中的 DB ID 是否可存取；失敗時改從父頁面依標題尋找。 */
export async function resolveDbIdWithFallback(params: {
  client: Client;
  envDbId?: string;
  expectedTitle: string;
  findOnParentPage: (client: Client, parentPageId: string) => Promise<string | null>;
  parentPageId: string;
}): Promise<string> {
  const { client, envDbId, expectedTitle, findOnParentPage, parentPageId } = params;

  if (envDbId) {
    const configuredId = normalizeNotionId(envDbId);
    try {
      await readDatabaseTitle(client, configuredId);
      return configuredId;
    } catch (err) {
      console.warn(
        `[Notion] NOTION DB ID ${configuredId} 無法存取（${err instanceof Error ? err.message : err}），` +
          `改從父頁面尋找「${expectedTitle}」…`
      );
    }
  }

  const found = await findOnParentPage(client, parentPageId);
  if (found) return found;

  if (envDbId) {
    throw new Error(
      `找不到「${expectedTitle}」。` +
      '請在 Notion 打開該資料庫 → ⋯ → Connections → 加入你的 Integration；' +
      '或修正 Vercel 的 NOTION_DASHBOARD_DB_ID / NOTION_LANDSCAPE_DB_ID。'
    );
  }

  throw new Error(`找不到「${expectedTitle}」，請確認 Integration 已 Connect 到主辦父頁面。`);
}

export function formatNotionError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  if (/could not find database/i.test(msg)) {
    return (
      '找不到 Notion 資料庫，或 Integration 尚未加入該表。' +
      '請到 Notion 打開 Sleep Airline Flight Log → ⋯ → Connections → 加入 Integration；' +
      '並確認 Vercel 的 NOTION_DASHBOARD_DB_ID 是否正確。'
    );
  }

  if (/Sleep Airline Flight Log|Sleep Airline Landing Scenery|NOTION_DASHBOARD|NOTION_LANDSCAPE|Integration/i.test(msg)) {
    return msg;
  }

  if (/unauthorized|forbidden|invalid api token|API token is invalid/i.test(msg)) {
    return 'Notion API Key 無效，或 Integration 沒有權限。請確認 Vercel 的 NOTION_API_KEY。';
  }

  return msg;
}
