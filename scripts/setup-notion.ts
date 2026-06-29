/**
 * Sleep Airline — 建立 Notion Dashboard 總表（本地選用）
 *
 * Usage: npm run setup
 *
 * Vercel 上只需 NOTION_API_KEY + NOTION_PARENT_PAGE_ID，首次請求會自動建表。
 * 此腳本供本地預先建立，或寫入 .env.local 的 NOTION_DASHBOARD_DB_ID。
 */

import * as fs from 'fs';
import * as path from 'path';
import { resolveDashboardDbId } from '../src/lib/notion/ensure-dashboard';
import { DASHBOARD_PROPERTY_ORDER } from '../src/lib/notion/dashboard-schema';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env.local not found. 請先建立並填入 NOTION_API_KEY。');
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    process.env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
}

function writeEnvUpdate(dashboardId: string) {
  const envPath = path.join(process.cwd(), '.env.local');
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
  const key = 'NOTION_DASHBOARD_DB_ID';
  const regex = new RegExp(`^${key}=.*$`, 'm');
  content = regex.test(content) ? content.replace(regex, `${key}=${dashboardId}`) : `${content.trim()}\n${key}=${dashboardId}\n`;
  fs.writeFileSync(envPath, content);
}

async function main() {
  loadEnv();
  if (!process.env.NOTION_API_KEY) {
    console.error('❌ NOTION_API_KEY 未設定');
    process.exit(1);
  }

  console.log('🚀 Sleep Airline — Notion Dashboard Setup');
  try {
    const dashboardId = await resolveDashboardDbId();
    writeEnvUpdate(dashboardId);
    console.log(`\n✅ Dashboard 就緒：${dashboardId}`);
    console.log('\n建議 Notion 欄位順序（在表格 Properties 依序拖曳）：');
    DASHBOARD_PROPERTY_ORDER.forEach((name, i) => console.log(`  ${String(i + 1).padStart(2, '0')}. ${name}`));
    console.log('\nVercel 只需設定：');
    console.log('  NOTION_API_KEY');
    console.log('  NOTION_PARENT_PAGE_ID（選填，預設為 Sleep Airline 頁面）\n');
  } catch (err) {
    console.error('\n❌', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
