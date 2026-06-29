# 工作坊資料契約 · 什麼能改、什麼不能改

> UI 各組可以完全不同；**餵給主辦 Notion 的資料格式**必須一致。  
> 改完 UI 後在本機執行：`npm run check:contract`

**Phase 1 預覽：** 執行 `npm install` 後可直接開 `public/index.html`（資料在 localStorage；降落讀 `public/cities_data.json` 算距離）。  
**Phase 3：** 部署 Vercel 並填入 Notion env 後，同一套 UI 才會寫入主辦總表。

---

## 一句話

| ✅ 任意改 | 🔒 必須保留 |
|---|---|
| 顏色、字體、排版、文案、動畫 | 下面列出的 **API 路徑與必填 body 欄位** |
| `public/style.css` 整份 | 下面列出的 **HTML 元素 id** |
| **機長廣播風格、語氣、人設**（見下方） | **Group ID** 用 `group_01` … `group_15` |
| 新增 UI 區塊（不刪必填 id） | Phase 3 的 **Notion 三項 env**（主辦提供） |

---

## ✅ 機長廣播：各組自由發揮（不進主庫鎖定欄位）

主辦 **Notion 總表不記錄**「方向來源」「降落廣播風格」；機長人設由各組自己決定。

| 改法 | 檔案 | 說明 |
|---|---|---|
| 改 prompt、語氣、人設 | `src/lib/ai/broadcast.ts` | 最直接，Phase 2 教學重點 |
| 改 TTS 聲線 | `src/lib/ai/speech.ts` | OpenAI 語音或瀏覽器 fallback |
| 加 UI 風格選單（選填） | `public/app.js` | 可在 POST body 加 **`broadcastStyle`**（選填）；後端預設 `formal_captain` |
| 刪掉所有風格 UI | 允許 | 不送 `broadcastStyle` 也能正常起飛／降落 |

`broadcastStyle` 可選值（僅影響 AI 生成，**不是** Notion 必填欄位）：

```
formal_captain · poetic · playful · flight_attendant · radio_host · custom
```

主庫仍會存 **廣播全文**（`Takeoff Broadcast`、`Captain Broadcast`）與選填的 `Takeoff Broadcast Style`；**沒有** `Direction Source`、`Captain Broadcast Style` 欄位。

---

## 🔒 必保留：API 契約（`public/app.js`）

前端**不要改路徑、不要改必填 JSON 欄位名稱**：

### 登入

```
POST /api/passenger
{
  "passengerId": "...",
  "name": "...",
  "groupId": "group_02"
}
```

### 起飛

```
POST /api/flight/takeoff
{
  "passengerId", "name", "groupId",
  "routeDirection"
}
```

選填：`broadcastStyle`（機長 AI 風格，見上表）

### 降落

```
POST /api/flight/land
{
  "passengerId", "name", "groupId"
}
```

選填：`broadcastStyle`

### 看板與進度

```
GET /api/board?groupId=group_02
GET /api/flight/progress?passengerId=...
```

對應函式：`doLogin`、`doTakeoff`、`doLand`、`fetchBoard`、`refreshProgress` — 可以改函式**裡面的 UI 邏輯**，但不要刪掉或改寫上述 API 契約。

---

## 🔒 必保留：HTML 元素 id（`public/index.html`）

`app.js` 用 `getElementById` 綁定這些 id。**可以改 class、文案、外層結構，但 id 要留著：**

| id | 用途 |
|---|---|
| `input-pid` | 乘客 ID |
| `input-name` | 姓名 |
| `input-group` | 小隊（option 的 value 須為 `group_0X`） |
| `login-form` | 登入表單 |
| `btn-login` | 登入按鈕 |
| `tk-direction` | 航線方向 |
| `btn-takeoff` | 起飛 |
| `btn-land` | 降落 |
| `login-section` / `main-section` | 登入／主畫面切換 |

其餘 id（`st-name`、`bd-tbody`、`scenery-img`…）供顯示用；刪掉會破版但不影響 Notion 寫入。**上面表格是最小必留集。**

---

## 🔒 必保留：資料值規則

| 欄位 | 規則 |
|---|---|
| **groupId** | 只能是 `group_01` … `group_15`，**不要用中文「第二組」** |
| **passengerId** | 每人唯一，登入與 API 一致（例 `p_g02_morgan`） |
| **routeDirection** | 用下拉既有值：`auto`、`eastbound`、`westbound`… |

後端會把這些值寫進 Notion；格式錯了主辦彙整會對不起來。

---

## ⛔ 請勿修改（後端／主庫）

這些檔案決定 **Notion 欄位名稱與寫入邏輯**，動了會影響所有人的資料：

- `server.ts`
- `src/lib/notion/**`
- `src/lib/data-mode.ts`
- `src/lib/notion/dashboard-schema.ts`

---

## ✅ 歡迎修改（不影響主庫格式）

- `public/style.css`
- `public/index.html`（保留上表 id）
- `public/app.js`（保留 API 契約；可加選填 `broadcastStyle`）
- `src/lib/ai/broadcast.ts` — 機長廣播 prompt **（推薦改這裡）**
- `src/lib/ai/scenery.ts` — 降落風景 prompt
- `src/lib/ai/speech.ts` — 語音設定
- `src/lib/flight/region.ts` — 空域文案
- `src/lib/flight/social.ts` — 社交提示（仍寫固定 Notion 欄位）

---

## Phase 3：接主辦 Notion（env）

向主辦索取，貼 **Vercel Environment Variables**：

```
NOTION_API_KEY
NOTION_DASHBOARD_DB_ID
NOTION_LANDSCAPE_DB_ID
```

**不要**自填 `NOTION_PARENT_PAGE_ID`。

驗收：

1. `https://你的網址/api/config` → `notionReady: true`
2. 登入 → 起飛 → 降落 → 主辦 **Flight Log 總表有新列**

---

## 自動檢查

```bash
npm run check:contract
```

讀取 `workshop/contract.json`，檢查 `app.js` / `index.html` 是否仍符合契約。

---

## 給 Codex / Cursor 的提示（可貼進對話）

```
請只改 UI（CSS、HTML 結構、文案）與機長體驗（broadcast.ts、speech.ts）。
保留 docs/WORKSHOP_CONTRACT.md 裡的 API 路徑、必填 JSON 欄位、以及 input-pid / input-name / input-group / tk-direction 等 id。
不要修改 src/lib/notion/ 或 server.ts。
broadcastStyle 可選，想改機長人設請優先改 src/lib/ai/broadcast.ts。
改完執行 npm run check:contract。
```
