// ── WORKSHOP 資料契約 ───────────────────────────────────────────────────────
// 改 UI 前請讀 docs/WORKSHOP_CONTRACT.md
// 必保留：doLogin / doTakeoff / doLand 的 API 路徑與 body 欄位名（passengerId, groupId…）
// 必保留：input-pid, input-name, input-group, btn-takeoff, btn-land 等元素 id
// 可任意改：style.css、文案、排版；改完執行 npm run check:contract
// ────────────────────────────────────────────────────────────────────────────

// ── Display Maps ──────────────────────────────────────────────────────────────

const STATUS_LABEL = {
  not_started: '尚未出發', in_flight: '飛行中', landed: '已降落',
  boarding: '準備登機', cancelled: '已取消',
};

const REGION_LABEL = {
  departure_clouds: '登機雲層', pacific_drift: '太平洋漂流帶',
  deep_night_current: '深夜洋流', dawn_corridor: '黎明航廊', arrival_harbor: '抵達港灣',
};

const DIRECTION_LABEL = {
  auto: '自動', eastbound: '向東', westbound: '向西', northbound: '向北',
  southbound: '向南', northeast: '東北', northwest: '西北',
  southeast: '東南', southwest: '西南', circular: '環形', unknown: '未知',
};

// ── State ─────────────────────────────────────────────────────────────────────

let passenger = null;
let activeFlight = null;
let groupFlights = [];
let lastLandedFlight = null;
let landingScenery = null;
let refreshTimer = null;

// ── DOM Refs ──────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const LOGIN_STORAGE_KEY = 'sleepAirline_lastLogin';

function saveLoginProfile({ passengerId, name, groupId }) {
  try {
    localStorage.setItem(LOGIN_STORAGE_KEY, JSON.stringify({ passengerId, name, groupId }));
  } catch { /* private mode / storage full */ }
}

function loadLoginProfile() {
  try {
    const raw = localStorage.getItem(LOGIN_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.passengerId || !data?.name || !data?.groupId) return null;
    return data;
  } catch {
    return null;
  }
}

function fillLoginForm(profile) {
  if (!profile) return;
  $('input-pid').value = profile.passengerId;
  $('input-name').value = profile.name;
  $('input-group').value = profile.groupId;
}

// ── API Helper ────────────────────────────────────────────────────────────────

async function api(method, url, body) {
  if (window.WorkshopLocal?.isActive()) {
    return WorkshopLocal.handle(method, url, body);
  }
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    if (window.WorkshopLocal) {
      WorkshopLocal.enable();
      return WorkshopLocal.handle(method, url, body);
    }
    throw err;
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      res.ok
        ? '伺服器回應格式錯誤，請稍後再試。'
        : (text.slice(0, 120) || `伺服器錯誤 (${res.status})`)
    );
  }
  if (!res.ok) throw new Error(data.message || data.error || `伺服器錯誤 (${res.status})`);
  return data;
}

// ── Messages ──────────────────────────────────────────────────────────────────

function showMsg(prefix, type, text) {
  const el = $(prefix + '-' + type);
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 8000);
}

function clearMsg(prefix) {
  const err = $(prefix + '-error');
  const suc = $(prefix + '-success');
  if (err) err.classList.remove('show');
  if (suc) suc.classList.remove('show');
}

// ── Badge HTML ────────────────────────────────────────────────────────────────

function badgeHTML(status) {
  const label = STATUS_LABEL[status] || status;
  if (status === 'in_flight') return `<span class="badge badge-flight">● ${label}</span>`;
  if (status === 'landed') return `<span class="badge badge-landed">✓ ${label}</span>`;
  return `<span class="badge badge-idle">○ ${label}</span>`;
}

// ── Duration Format ───────────────────────────────────────────────────────────

function fmtDuration(minutes) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── UI Update ─────────────────────────────────────────────────────────────────

function updateUI() {
  const loggedIn = !!passenger;
  $('login-section').classList.toggle('hidden', loggedIn);
  $('main-section').classList.toggle('hidden', !loggedIn);

  if (!passenger) return;

  const isFlying = passenger.status === 'in_flight';

  // Header
  $('hdr-group').textContent = passenger.groupId;
  $('hdr-badge').innerHTML = badgeHTML(passenger.status);

  // Status card
  $('st-name').textContent = passenger.name;
  $('st-group').textContent = passenger.groupId;
  $('st-location').textContent = '📍 ' + passenger.currentLocation;
  $('st-badge').innerHTML = badgeHTML(passenger.status);

  // Takeoff card: show when NOT in_flight
  $('takeoff-card').classList.toggle('hidden', isFlying);
  if (!isFlying) {
    $('tk-departure').textContent = '✈ ' + passenger.currentLocation;
  }

  // Flight card: show when in_flight
  $('flight-card').classList.toggle('hidden', !isFlying);
  if (isFlying && activeFlight) {
    $('fl-departure').textContent = activeFlight.departureLocation;
    $('fl-takeoff-time').textContent = new Date(activeFlight.takeoffTime).toLocaleTimeString('zh-TW');
    $('fl-direction').textContent = DIRECTION_LABEL[activeFlight.routeDirection] || activeFlight.routeDirection;
    $('fl-region').textContent = REGION_LABEL[activeFlight.narrativeRegion] || activeFlight.narrativeRegion;
    const pct = Math.round(activeFlight.flightProgress || 0);
    $('fl-progress-text').textContent = pct + '%';
    $('fl-progress-bar').style.width = pct + '%';
    const tkBox = $('fl-takeoff-broadcast');
    if (activeFlight.takeoffBroadcast) {
      tkBox.classList.remove('hidden');
      tkBox.textContent = activeFlight.takeoffBroadcast;
    } else {
      tkBox.classList.add('hidden');
      tkBox.textContent = '';
    }
  }

  // Broadcast card
  if (lastLandedFlight && lastLandedFlight.captainBroadcast) {
    $('broadcast-card').classList.remove('hidden');
    $('bc-text').textContent = lastLandedFlight.captainBroadcast;
    if (lastLandedFlight.socialCueText) {
      $('bc-cue').classList.remove('hidden');
      $('bc-cue').textContent = '◎ ' + lastLandedFlight.socialCueText;
    } else {
      $('bc-cue').classList.add('hidden');
    }
    $('bc-route').textContent = (lastLandedFlight.departureLocation || '') + ' → ' + (lastLandedFlight.arrivalLocation || '');
    $('bc-duration').textContent = fmtDuration(lastLandedFlight.flightDurationMinutes);
  } else {
    $('broadcast-card').classList.add('hidden');
  }

  renderSceneryCard();

  // Board
  $('bd-group').textContent = passenger.groupId;
  renderBoard();
}

function renderSceneryCard(loading = false) {
  const hasScenery = landingScenery?.imageUrl;
  const showCard = loading || hasScenery;

  $('scenery-card').classList.toggle('hidden', !showCard);
  $('scenery-loading').classList.toggle('hidden', !loading);
  $('scenery-wrap').classList.toggle('hidden', loading || !hasScenery);

  if (!hasScenery) return;

  $('scenery-img').src = landingScenery.imageUrl;
  $('scenery-img').alt = landingScenery.arrivalLocation || '降落風景';
  $('scenery-caption').textContent = '📍 ' + (landingScenery.arrivalLocation || '') +
    (landingScenery.country ? ' · ' + landingScenery.country : '');
  $('scenery-link').href = landingScenery.imageUrl;
  $('scenery-link').textContent = landingScenery.imageUrl;
}

// ── Board Rendering ───────────────────────────────────────────────────────────

function renderBoard() {
  if (groupFlights.length === 0) {
    $('bd-empty').classList.remove('hidden');
    $('bd-table').classList.add('hidden');
    $('bd-cues').classList.add('hidden');
    $('bd-broadcasts').classList.add('hidden');
    return;
  }

  $('bd-empty').classList.add('hidden');
  $('bd-table').classList.remove('hidden');

  // Table rows
  const tbody = $('bd-tbody');
  tbody.innerHTML = groupFlights.map((f) => {
    const arrivalCell = f.status === 'landed' && f.arrivalLocation
      ? `<span class="text-green">${f.arrivalLocation}</span>`
      : `<div>
           <div class="text-sky">${REGION_LABEL[f.narrativeRegion] || f.narrativeRegion}</div>
           <div style="margin-top:4px">
             <div class="progress-bar" style="height:4px">
               <div class="progress-fill" style="width:${f.flightProgress || 0}%"></div>
             </div>
           </div>
         </div>`;

    const timeCell = f.status === 'landed' && f.landingTime
      ? new Date(f.landingTime).toLocaleString('zh-TW', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' })
      : new Date(f.takeoffTime).toLocaleString('zh-TW', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });

    return `<tr>
      <td class="text-bold">${f.passengerName}</td>
      <td>${badgeHTML(f.status)}</td>
      <td class="text-muted">${f.departureLocation}</td>
      <td>${arrivalCell}</td>
      <td class="text-muted">${fmtDuration(f.flightDurationMinutes)}</td>
      <td class="text-muted">${timeCell}</td>
    </tr>`;
  }).join('');

  // Social cues
  const cues = groupFlights.filter((f) => f.socialCueText);
  if (cues.length > 0) {
    $('bd-cues').classList.remove('hidden');
    $('bd-cues-list').innerHTML = cues.map((f) =>
      `<div class="board-sub-item board-cue-item">
        <span class="text-bold">${f.passengerName}：</span>${f.socialCueText}
      </div>`
    ).join('');
  } else {
    $('bd-cues').classList.add('hidden');
  }

  // Broadcasts
  const broadcasts = groupFlights.filter((f) => f.takeoffBroadcast || f.captainBroadcast);
  if (broadcasts.length > 0) {
    $('bd-broadcasts').classList.remove('hidden');
    $('bd-broadcasts-list').innerHTML = broadcasts.map((f) => {
      const parts = [];
      if (f.takeoffBroadcast) {
        parts.push(`<div class="board-broadcast-meta">${f.passengerName} — 起飛 · ${f.departureLocation}</div>
        <div class="board-broadcast-text">${f.takeoffBroadcast}</div>`);
      }
      if (f.captainBroadcast) {
        parts.push(`<div class="board-broadcast-meta">${f.passengerName} — 降落 · ${f.departureLocation} → ${f.arrivalLocation || '?'}</div>
        <div class="board-broadcast-text">${f.captainBroadcast}</div>`);
      }
      return `<div class="board-sub-item board-broadcast-item">${parts.join('')}</div>`;
    }).join('');
  } else {
    $('bd-broadcasts').classList.add('hidden');
  }
}

// ── API Actions ───────────────────────────────────────────────────────────────

async function doLogin(e) {
  e.preventDefault();
  clearMsg('login');
  const passengerId = $('input-pid').value.trim();
  const name = $('input-name').value.trim();
  const groupId = $('input-group').value.trim();
  if (!passengerId || !name || !groupId) { showMsg('login', 'error', '請填寫所有欄位。'); return; }

  $('btn-login').disabled = true;
  $('btn-login').textContent = '登入中...';
  try {
    const data = await api('POST', '/api/passenger', { passengerId, name, groupId });
    passenger = data.passenger;
    lastLandedFlight = data.lastLandedFlight || null;
    landingScenery = data.landingScenery || null;
    saveLoginProfile({ passengerId, name, groupId });
    showMsg('login', 'success', data.created ? '乘客建立成功！' : '已找到您的乘客資料。');
    await fetchBoard();
    if (passenger.status === 'in_flight') await refreshProgress();
    setTimeout(() => updateUI(), 300);
    startAutoRefresh();
  } catch (err) {
    showMsg('login', 'error', err.message);
  } finally {
    $('btn-login').disabled = false;
    $('btn-login').textContent = '登入 / 建立乘客';
  }
}

async function doTakeoff() {
  clearMsg('main');
  $('btn-takeoff').disabled = true;
  $('btn-takeoff').textContent = '起飛中...';
  try {
    const data = await api('POST', '/api/flight/takeoff', {
      passengerId: passenger.passengerId,
      name: passenger.name,
      groupId: passenger.groupId,
      routeDirection: $('tk-direction').value,
    });
    activeFlight = data.flight;
    passenger.status = 'in_flight';
    lastLandedFlight = null;
    landingScenery = null;
    showMsg('main', 'success', activeFlight.takeoffBroadcast
      ? '✈ 起飛成功！機長廣播已生成。'
      : '✈ 起飛成功！晚安，旅途愉快。');
    updateUI();
    await fetchBoard();
    startAutoRefresh();
    if (activeFlight.takeoffBroadcast && window.BroadcastAudio) {
      BroadcastAudio.playCaptainBroadcast(
        activeFlight.takeoffBroadcast,
        activeFlight.takeoffBroadcastStyle || 'formal_captain'
      );
    }
  } catch (err) {
    showMsg('main', 'error', err.message);
  } finally {
    $('btn-takeoff').disabled = false;
    $('btn-takeoff').textContent = '✈  起飛';
  }
}

async function doLand() {
  clearMsg('main');
  $('btn-land').disabled = true;
  $('btn-land').textContent = '降落中，請稍候...';
  renderSceneryCard(true);
  try {
    const data = await api('POST', '/api/flight/land', {
      passengerId: passenger.passengerId,
      name: passenger.name,
      groupId: passenger.groupId,
    });
    const landed = data.flight;
    lastLandedFlight = landed;
    landingScenery = data.landingScenery || null;
    activeFlight = null;
    passenger.status = 'landed';
    passenger.currentLocation = landed.arrivalLocation || passenger.currentLocation;
    showMsg('main', 'success', '✓ 已降落於 ' + landed.arrivalLocation +
      (landingScenery?.imageUrl ? ' · 風景圖已生成' : ''));
    updateUI();
    await fetchBoard();
    if (landed.captainBroadcast && window.BroadcastAudio) {
      BroadcastAudio.playCaptainBroadcast(
        landed.captainBroadcast,
        landed.takeoffBroadcastStyle || 'formal_captain'
      );
    }
  } catch (err) {
    landingScenery = null;
    renderSceneryCard(false);
    showMsg('main', 'error', err.message);
  } finally {
    $('btn-land').disabled = false;
    $('btn-land').textContent = '⬇  降落';
  }
}

function doLogout() {
  passenger = null;
  activeFlight = null;
  groupFlights = [];
  lastLandedFlight = null;
  landingScenery = null;
  stopAutoRefresh();
  clearMsg('main');
  updateUI();
}

async function fetchBoard() {
  if (!passenger) return;
  try {
    const data = await api('GET', '/api/board?groupId=' + encodeURIComponent(passenger.groupId));
    if (data.flights) groupFlights = data.flights;
    renderBoard();
  } catch { /* silent */ }
}

async function refreshProgress() {
  if (!passenger) return;
  try {
    const data = await api('GET', '/api/flight/progress?passengerId=' + encodeURIComponent(passenger.passengerId));
    if (data.activeFlight) {
      activeFlight = data.activeFlight;
    } else {
      activeFlight = null;
    }
    updateUI();
  } catch { /* silent */ }
}

// ── Auto Refresh ──────────────────────────────────────────────────────────────

function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(() => {
    if (passenger && passenger.status === 'in_flight') {
      refreshProgress();
      fetchBoard();
    }
  }, 60000);
}

function stopAutoRefresh() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
}

// ── Seed Cities ───────────────────────────────────────────────────────────────

async function seedCities() {
  $('btn-seed').disabled = true;
  $('btn-seed').textContent = '匯入中...';
  try {
    const data = await api('POST', '/api/seed');
    $('seed-msg').textContent = data.message;
    $('seed-msg').classList.add('show');
  } catch (err) {
    $('seed-msg').textContent = err.message;
    $('seed-msg').className = 'msg msg-error show mt-12';
  } finally {
    $('btn-seed').disabled = false;
    $('btn-seed').textContent = '匯入城市資料到 Notion';
  }
}

// ── Event Listeners ───────────────────────────────────────────────────────────

$('login-form').addEventListener('submit', doLogin);
$('btn-takeoff').addEventListener('click', doTakeoff);
$('btn-land').addEventListener('click', doLand);
$('btn-logout').addEventListener('click', doLogout);
$('btn-refresh').addEventListener('click', fetchBoard);

// ── Collapsible Sections ──────────────────────────────────────────────────────

function toggleSection(contentId, headerEl) {
  const content = $(contentId);
  const arrow = headerEl.querySelector('.collapse-arrow');
  const isHidden = content.classList.toggle('collapse-content-hidden');
  arrow.classList.toggle('collapsed', isHidden);
}

// ── Init ──────────────────────────────────────────────────────────────────────

(async function initApp() {
  if (window.WorkshopLocal) await WorkshopLocal.probe();
  fillLoginForm(loadLoginProfile());
  updateUI();
})();
