#!/usr/bin/env node
/**
 * 檢查學員改 UI 後，是否仍保留寫入 Notion 所需的 API 與表單契約。
 * 用法：npm run check:contract
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contract = JSON.parse(
  readFileSync(join(root, 'workshop/contract.json'), 'utf8')
);

const appJs = readFileSync(join(root, 'public/app.js'), 'utf8');
const indexHtml = readFileSync(join(root, 'public/index.html'), 'utf8');

const errors = [];
const warnings = [];

function pass(msg) {
  console.log(`  ✓ ${msg}`);
}

for (const fn of contract.requiredFunctions) {
  if (!appJs.includes(`function ${fn}`) && !appJs.includes(`async function ${fn}`)) {
    errors.push(`app.js 缺少函式：${fn}`);
  } else {
    pass(`函式 ${fn}`);
  }
}

for (const call of contract.apiCalls) {
  if (!appJs.includes(call.path)) {
    errors.push(`app.js 缺少 API 路徑：${call.path}（${call.description}）`);
    continue;
  }
  pass(`API ${call.method} ${call.path}`);

  if (call.requiredBodyFields) {
    for (const field of call.requiredBodyFields) {
      if (!appJs.includes(field)) {
        warnings.push(
          `app.js 可能未送出欄位「${field}」（${call.id} → ${call.path}）`
        );
      }
    }
  }
}

for (const id of contract.requiredDomIds) {
  if (!indexHtml.includes(`id="${id}"`) && !indexHtml.includes(`id='${id}'`)) {
    errors.push(`index.html 缺少元素 id="${id}"（app.js 會找不到）`);
  } else {
    pass(`DOM #${id}`);
  }
}

const groupSelect = indexHtml.match(/<select[^>]*id="input-group"[^>]*>([\s\S]*?)<\/select>/);
if (groupSelect) {
  const options = [...groupSelect[1].matchAll(/value="([^"]+)"/g)].map((m) => m[1]).filter(Boolean);
  const bad = options.filter((v) => v && !/^group_\d{2}$/.test(v));
  if (bad.length > 0) {
    warnings.push(`input-group 有非標準 value：${bad.join(', ')}（應為 group_01 … group_15）`);
  } else if (options.length > 0) {
    pass(`小隊選項格式（${options.length} 個 group_0X）`);
  }
}

console.log('');
console.log('── 資料規則（請人工確認登入流程）──');
for (const rule of contract.dataRules) {
  console.log(`  · ${rule.field}: ${rule.description}`);
}

console.log('');
if (warnings.length) {
  console.log('⚠ 警告：');
  warnings.forEach((w) => console.log(`  - ${w}`));
  console.log('');
}

if (errors.length) {
  console.log('✗ 契約檢查未通過：');
  errors.forEach((e) => console.log(`  - ${e}`));
  console.log('');
  console.log('詳見 docs/WORKSHOP_CONTRACT.md');
  process.exit(1);
}

console.log('✓ 工作坊資料契約檢查通過');
console.log('  完整說明：docs/WORKSHOP_CONTRACT.md');
process.exit(warnings.length ? 0 : 0);
