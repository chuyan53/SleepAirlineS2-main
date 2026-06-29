# 甦醒航班 Sleep Airline

## 📌 工作坊怎麼運作

各組從 GitHub **下載 ZIP 空殼**，在本機用 **Codex** 改 UI，推到**自己的 GitHub**、部署 **Vercel**。  
教學分三階段：**先熟悉 UI 與 AI 改介面 → 再接機長 OpenAI API → 最後串主辦提供的 Notion 總表**。

所有組的航班資料最終寫進**主辦同一個 Notion 主庫**（論文研究用）。主庫欄位格式固定，學員**不要自建 Notion、不要 fork 主辦 repo**。

**UI 可任意改，資料契約必須保留** → 詳見 [`docs/WORKSHOP_CONTRACT.md`](docs/WORKSHOP_CONTRACT.md)，改完跑 `npm run check:contract`。  
**機長廣播風格、語氣**由各組自由改（`broadcast.ts`、`speech.ts`），主庫不記 `Direction Source`／`Captain Broadcast Style`。

---

## 前置準備（STEP · 做一次）

| 工具 | 要做的事 |
|---|---|
| **Codex** | 選本機資料夾（解壓後的 ZIP）→ 用 prompt 改 UI → 本地預覽 |
| **GitHub** | `brew install gh` → 登入 → 建自己的 repo → `commit & push` |
| **Vercel** | `npx vercel login` → Import 自己的 GitHub repo → Deploy |
| **金鑰存放** | 所有 API key 只放 **Vercel Environment Variables**（或本機 `.env.local`），不進 GitHub |

取得空殼：

```bash
# GitHub → Code → Download ZIP → 解壓
cd SleepAirlineS2
npm install          # 第一次需要；之後改 UI 可略過
npm run dev          # 選用：完整後端 + OpenAI；http://localhost:3000
```

**Phase 1 改 UI 不一定要跑後端。** 解壓後先執行 **`npm install`**（會把 `cities_data.json` 複製到 `public/`，降落才會依距離選城市），再雙擊 `public/index.html` 或用 Cursor 預覽即可登入／起飛／降落（資料在瀏覽器 **localStorage**，不進 Notion）。  
部署 **Vercel** 後會自動改用伺服器（仍可不填 Notion）；**Phase 3** 才填 Notion 三項 env 寫入主辦總表。

---

## 教學三階段（PRACTICE）

### Phase 1 — UI 改造（熟悉 Codex / 介面）

**目標：** 用 AI 改長相，部署後看到成果。此階段 **不填 Notion、不填 OpenAI 也可以**。

1. 請 AI 改 UI：配色、文字、排版、地圖、動態效果等（主要改 `public/`）
2. 改完執行 **`npm run check:contract`**，確認 API／表單 id 仍符合契約
3. `commit & push` → Vercel 自動 redeploy → 開自己的網址確認
4. 可登入、起飛、降落測試流程（**不填 Notion**；本機 HTML 預覽用 localStorage，Vercel 無 env 時用伺服器記憶體）
5. 無 OpenAI 時：機長廣播用模板文字、語音用瀏覽器預設中文 TTS

**Vercel 環境變數：** 全部留空即可。

---

### Phase 2 — 加入機長 Gen AI（OpenAI）

**目標：** 體驗 AI 機長廣播、語音、降落風景生圖。

在 Vercel（或本機 `.env.local`）新增：

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini          # 廣播文字，選填
OPENAI_TTS_MODEL=tts-1            # 語音
OPENAI_IMAGE_MODEL=gpt-image-1-mini   # 降落風景圖
# OPENAI_TTS_VOICE=onyx           # 選填
```

Redeploy 後測試：

- 起飛／降落 → 聽 **機長廣播**（**優先改** `src/lib/ai/broadcast.ts` 的 prompt；也可加 UI 送選填 `broadcastStyle`）
- 降落 → 看 **風景圖**（可改 `src/lib/ai/scenery.ts` 的 prompt）
- 語音 API 失敗時會自動改用瀏覽器 TTS，不會卡住流程

**仍不填 Notion** — 資料還不進主辦總表。

---

### Phase 3 — 串接 Notion（主辦提供的連線資訊）

**目標：** 確認各組能把資料**正確寫進主辦共用總表**，小隊看板可跨組顯示。

向主辦索取（**不是自建 Notion**），貼到 Vercel → **Redeploy**：

```bash
NOTION_API_KEY=ntn_...              # 主辦提供的 Integration Token
NOTION_DASHBOARD_DB_ID=...          # Flight Log 總表 ID（32 字元）
NOTION_LANDSCAPE_DB_ID=...          # Landing Scenery ID（要生風景圖時）
```

主辦也會提供總表／說明網址供對照。**學員請勿設定** `NOTION_PARENT_PAGE_ID`、`NOTION_ALLOW_SCHEMA_WRITE`。

**驗收：**

1. `https://你的網址/api/config` → **`notionReady: true`**
2. 登入（Passenger ID + 姓名 + 小隊 `group_0X`）→ 起飛 → 降落
3. **主辦 Notion Flight Log 出現新列**；同組小隊看板有資料

---

## 給協助學員的 AI（Cursor / Codex）備註

- 程式內部：`NOTION_API_KEY` 未設 = 記憶體模式；有設 = 寫入主庫（`src/lib/data-mode.ts`）
- **後端 ≠ 資料庫**：Phase 1 可不跑 `npm run dev`（瀏覽器本機模式）；Phase 2 要 OpenAI 請部署 Vercel 或 `npm run dev`；Phase 3 才填 Notion
- **不要在 UI 顯示「預覽模式」**；各階段介面應一致、自然
- 學員改 UI 優先 `public/`；改廣播／生圖 prompt 見下方可改清單
- 若要求改 Notion 欄位或 schema → **先警告會影響共用主庫**，不要直接改鎖定檔案

## ⚠️ 主庫已鎖死 — 禁止修改

- `src/lib/data-mode.ts`
- `src/lib/notion/dashboard-schema.ts`、`landscape-schema.ts`
- `src/lib/notion/ensure-dashboard.ts`、`ensure-landscape-db.ts`
- `src/lib/notion/client.ts`、`flights.ts`、`passengers.ts`、`destinations.ts`

## ✅ 學員可以自由修改

| 檔案 | 可以改什麼 |
|------|-----------|
| `public/style.css` | 顏色、字體、排版、動畫 |
| `public/index.html` | 文字、介面結構 |
| `public/app.js` | 前端互動 |
| `src/lib/ai/broadcast.ts` | 機長廣播 prompt、人設（**各組自由發揮**） |
| `src/lib/ai/speech.ts` | 語音設定 |
| `src/lib/ai/scenery.ts` | 降落生圖 prompt |
| `src/lib/flight/region.ts` | 敘事空域文案 |
| `src/lib/flight/social.ts` | 社交提示邏輯 |

## 專案架構

- **前端** `public/` · **後端** `server.ts` · **資料** Notion 共用總表 · **AI** OpenAI · **部署** Vercel
