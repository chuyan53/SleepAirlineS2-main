/**
 * 為已降落的航班補生成風景圖並寫入 Landing Scenery 資料庫。
 *
 * Usage: npx tsx scripts/backfill-scenery.ts FL-A-MQV5DGNF FL-MORGAN-MQV56IO3
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { backfillSceneryForFlights } from '../src/lib/notion/scenery-backfill';

async function main() {
  const flightIds = process.argv.slice(2);
  if (flightIds.length === 0) {
    console.error('Usage: npx tsx scripts/backfill-scenery.ts <Flight ID> [...]');
    process.exit(1);
  }
  if (!process.env.NOTION_API_KEY || !process.env.OPENAI_API_KEY) {
    console.error('❌ 請在 .env.local 設定 NOTION_API_KEY 與 OPENAI_API_KEY');
    process.exit(1);
  }

  const results = await backfillSceneryForFlights(flightIds);
  for (const r of results) {
    if (r.error) console.error(`❌ ${r.flightId}: ${r.error}`);
    else if (r.skipped) console.log(`⏭  ${r.flightId} 已有風景圖`);
    else console.log(`✅ ${r.flightId} → ${r.arrivalLocation}\n   ${r.imageUrl?.slice(0, 100)}…`);
  }
}

main();
