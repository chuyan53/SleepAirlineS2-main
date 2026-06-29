/**
 * Phase 1 瀏覽器本機模式：無 npm / 無 Notion 時，資料存 localStorage。
 * 降落邏輯與 server.ts 一致：飛行時長 → 距離 → 從 cities_data.json 選目的地。
 */
(function () {
  const STORAGE_KEY = 'sleepAirline_workshopLocal_v1';
  const DEFAULT_LOCATION = 'Taipei, Taiwan';
  const DEFAULT_LAT = 25.033;
  const DEFAULT_LNG = 121.5654;
  const REFERENCE_MINUTES = 480;
  const KM_PER_MINUTE = 12;
  const EARTH_RADIUS_KM = 6371;

  let active = false;
  let citiesCache = null;
  let citiesLoadPromise = null;

  function loadStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { passengers: {}, flights: [] };
      const data = JSON.parse(raw);
      return {
        passengers: data.passengers || {},
        flights: Array.isArray(data.flights) ? data.flights : [],
      };
    } catch {
      return { passengers: {}, flights: [] };
    }
  }

  function saveStore(store) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }

  function toRad(deg) {
    return (deg * Math.PI) / 180;
  }

  function haversineDistance(lat1, lon1, lat2, lon2) {
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function calculateBearing(lat1, lon1, lat2, lon2) {
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x =
      Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }

  function isInDirection(bearing, direction) {
    const b = ((bearing % 360) + 360) % 360;
    switch (direction) {
      case 'northbound': return b >= 315 || b < 45;
      case 'northeast': return b >= 22.5 && b < 67.5;
      case 'eastbound': return b >= 45 && b < 135;
      case 'southeast': return b >= 112.5 && b < 157.5;
      case 'southbound': return b >= 135 && b < 225;
      case 'southwest': return b >= 202.5 && b < 247.5;
      case 'westbound': return b >= 225 && b < 315;
      case 'northwest': return b >= 292.5 && b < 337.5;
      default: return true;
    }
  }

  function parseCities(raw) {
    return raw
      .filter((e) => e.latitude != null && e.longitude != null && e.city)
      .map((entry) => {
        const country =
          entry.country && entry.country.length > 2
            ? entry.country
            : entry.country_zh || entry.country;
        const displayName =
          entry.city_zh && entry.country_zh
            ? `${entry.city_zh}, ${entry.country_zh}`
            : `${entry.city}, ${entry.country}`;
        return {
          displayName,
          city: entry.city,
          country,
          latitude: entry.latitude,
          longitude: entry.longitude,
          availableForLanding: true,
        };
      });
  }

  async function loadCities() {
    if (citiesCache) return citiesCache;
    if (citiesLoadPromise) return citiesLoadPromise;
    citiesLoadPromise = (async () => {
      const urls = ['./cities_data.json', '/cities_data.json'];
      for (const url of urls) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          citiesCache = parseCities(await res.json());
          return citiesCache;
        } catch { /* try next */ }
      }
      throw new Error(
        '找不到 cities_data.json。請在專案根目錄執行 npm install（或 npm run dev）後再試。'
      );
    })();
    return citiesLoadPromise;
  }

  function findArrivalDestination(depLat, depLng, distanceKm, routeDirection, destinations, departureLocation) {
    const available = destinations.filter(
      (d) => d.availableForLanding && d.displayName !== departureLocation
    );
    const candidates = available.map((dest) => {
      const actualDistance = haversineDistance(depLat, depLng, dest.latitude, dest.longitude);
      const bearing = calculateBearing(depLat, depLng, dest.latitude, dest.longitude);
      return {
        ...dest,
        distanceKm: actualDistance,
        distanceDelta: Math.abs(actualDistance - distanceKm),
        inDirection: isInDirection(bearing, routeDirection),
      };
    });
    const directional = candidates.filter((c) => c.inDirection);
    if (directional.length > 0) {
      directional.sort((a, b) => a.distanceDelta - b.distanceDelta);
      return directional[0];
    }
    candidates.sort((a, b) => a.distanceDelta - b.distanceDelta);
    if (!candidates[0]) {
      throw new Error('沒有可用的降落城市，請確認 cities_data.json 已同步到 public/。');
    }
    return candidates[0];
  }

  function flightProgress(takeoffTime) {
    const elapsed = (Date.now() - new Date(takeoffTime).getTime()) / 60000;
    return Math.min(100, Math.max(0, (elapsed / REFERENCE_MINUTES) * 100));
  }

  function narrativeRegion(progress) {
    if (progress < 20) return 'departure_clouds';
    if (progress < 40) return 'pacific_drift';
    if (progress < 60) return 'deep_night_current';
    if (progress < 80) return 'dawn_corridor';
    return 'arrival_harbor';
  }

  function fallbackBroadcast(phase, name, departure, arrival, durationMinutes) {
    if (phase === 'takeoff') {
      return `各位乘客，甦醒航班即將自 ${departure} 起飛。${name}，請準備進入夜航。`;
    }
    const h = durationMinutes ? Math.floor(durationMinutes / 60) : 0;
    const m = durationMinutes ? durationMinutes % 60 : 0;
    const dur = h > 0 ? `${h} 小時 ${m} 分鐘` : m > 0 ? `${m} 分鐘` : '一段';
    return `各位乘客，甦醒航班已抵達 ${arrival}。${name} 自 ${departure} 出發，飛行 ${dur}。`;
  }

  function buildBoardFlights(flights, groupId) {
    const group = flights.filter((f) => f.groupId === groupId);
    const inFlight = group.filter((f) => f.status === 'in_flight');
    const flyingIds = new Set(inFlight.map((f) => f.passengerId));
    const latestLanded = new Map();
    for (const f of group) {
      if (f.status !== 'landed' || flyingIds.has(f.passengerId)) continue;
      const prev = latestLanded.get(f.passengerId);
      if (!prev || new Date(f.landingTime || f.takeoffTime) > new Date(prev.landingTime || prev.takeoffTime)) {
        latestLanded.set(f.passengerId, f);
      }
    }
    return [...inFlight, ...latestLanded.values()];
  }

  function enrichFlight(f) {
    if (f.status !== 'in_flight') {
      return {
        ...f,
        flightProgress: f.status === 'landed' ? 100 : 0,
        narrativeRegion: f.status === 'landed' ? 'arrival_harbor' : 'departure_clouds',
      };
    }
    const progress = flightProgress(f.takeoffTime);
    return { ...f, flightProgress: progress, narrativeRegion: narrativeRegion(progress) };
  }

  function handlePassenger(body) {
    const store = loadStore();
    const { passengerId, name, groupId } = body;
    let created = false;
    let p = store.passengers[passengerId];
    if (!p) {
      created = true;
      p = {
        passengerId,
        name,
        groupId,
        status: 'not_started',
        currentLocation: DEFAULT_LOCATION,
        currentLatitude: DEFAULT_LAT,
        currentLongitude: DEFAULT_LNG,
      };
    } else {
      p.name = name;
      p.groupId = groupId;
    }

    const activeF = store.flights.find((f) => f.passengerId === passengerId && f.status === 'in_flight');
    if (activeF) {
      p.status = 'in_flight';
      p.currentLocation = activeF.departureLocation;
      p.currentLatitude = activeF.departureLatitude;
      p.currentLongitude = activeF.departureLongitude;
    } else {
      const lastLanded = store.flights
        .filter((f) => f.passengerId === passengerId && f.status === 'landed')
        .sort((a, b) => new Date(b.landingTime || 0) - new Date(a.landingTime || 0))[0];
      if (lastLanded) {
        p.status = 'landed';
        p.currentLocation = lastLanded.arrivalLocation || DEFAULT_LOCATION;
        p.currentLatitude = lastLanded.arrivalLatitude ?? DEFAULT_LAT;
        p.currentLongitude = lastLanded.arrivalLongitude ?? DEFAULT_LNG;
      } else if (!created) {
        p.status = p.status || 'not_started';
      }
    }

    store.passengers[passengerId] = p;
    saveStore(store);

    const lastLandedFlight = p.status !== 'in_flight'
      ? store.flights
          .filter((f) => f.passengerId === passengerId && f.status === 'landed')
          .sort((a, b) => new Date(b.landingTime || 0) - new Date(a.landingTime || 0))[0] || null
      : null;

    return {
      passenger: { ...p },
      created,
      lastLandedFlight: lastLandedFlight ? enrichFlight(lastLandedFlight) : null,
      landingScenery: null,
    };
  }

  function handleTakeoff(body) {
    const store = loadStore();
    const p = store.passengers[body.passengerId];
    if (!p) throw new Error('請先登入。');
    if (store.flights.some((f) => f.passengerId === body.passengerId && f.status === 'in_flight')) {
      throw new Error('你已有一趟尚未降落的航班，請先降落。');
    }

    const takeoffTime = new Date().toISOString();
    const flightId = `FL-LOCAL-${Date.now().toString(36).toUpperCase()}`;
    const routeDirection = body.routeDirection || 'auto';
    const takeoffBroadcast = fallbackBroadcast('takeoff', p.name, p.currentLocation, null, null);

    const flight = {
      notionId: `local_${flightId}`,
      flightId,
      passengerId: p.passengerId,
      passengerName: p.name,
      groupId: p.groupId,
      status: 'in_flight',
      departureLocation: p.currentLocation,
      departureLatitude: p.currentLatitude ?? DEFAULT_LAT,
      departureLongitude: p.currentLongitude ?? DEFAULT_LNG,
      arrivalLocation: null,
      arrivalLatitude: null,
      arrivalLongitude: null,
      takeoffTime,
      landingTime: null,
      flightDurationMinutes: null,
      estimatedFlightDistanceKm: null,
      routeDirection,
      takeoffBroadcastStyle: 'formal_captain',
      takeoffBroadcast,
      captainBroadcast: null,
      socialCueType: 'solo',
      socialCueText: '今晚您獨自飛行。',
      relatedPassenger: null,
    };

    store.flights.push(flight);
    p.status = 'in_flight';
    saveStore(store);
    return { flight: enrichFlight(flight) };
  }

  async function handleLand(body) {
    const cities = await loadCities();
    const store = loadStore();
    const p = store.passengers[body.passengerId];
    const idx = store.flights.findIndex((f) => f.passengerId === body.passengerId && f.status === 'in_flight');
    if (idx < 0) throw new Error('找不到進行中的航班。');

    const active = store.flights[idx];
    const landingTime = new Date().toISOString();
    const durationMinutes = Math.max(1, Math.round(
      (new Date(landingTime).getTime() - new Date(active.takeoffTime).getTime()) / 60000
    ));
    const distanceKm = durationMinutes * KM_PER_MINUTE;
    const arrival = findArrivalDestination(
      active.departureLatitude,
      active.departureLongitude,
      distanceKm,
      active.routeDirection,
      cities,
      active.departureLocation
    );
    const captainBroadcast = fallbackBroadcast(
      'landing',
      active.passengerName,
      active.departureLocation,
      arrival.displayName,
      durationMinutes
    );

    const landed = {
      ...active,
      status: 'landed',
      landingTime,
      flightDurationMinutes: durationMinutes,
      estimatedFlightDistanceKm: Math.round(distanceKm),
      arrivalLocation: arrival.displayName,
      arrivalLatitude: arrival.latitude,
      arrivalLongitude: arrival.longitude,
      captainBroadcast,
      socialCueType: 'solo',
      socialCueText: '您已平安降落。',
    };

    store.flights[idx] = landed;
    p.status = 'landed';
    p.currentLocation = arrival.displayName;
    p.currentLatitude = arrival.latitude;
    p.currentLongitude = arrival.longitude;
    saveStore(store);
    return { flight: enrichFlight(landed), landingScenery: null };
  }

  function handleBoard(groupId) {
    const store = loadStore();
    return { flights: buildBoardFlights(store.flights.map(enrichFlight), groupId) };
  }

  function handleProgress(passengerId) {
    const store = loadStore();
    const f = store.flights.find((x) => x.passengerId === passengerId && x.status === 'in_flight');
    return { activeFlight: f ? enrichFlight(f) : null };
  }

  async function probe() {
    if (window.location.protocol === 'file:') {
      active = true;
      return;
    }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2000);
      const res = await fetch('/api/config', { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        active = false;
        return;
      }
    } catch { /* fall through */ }
    active = true;
  }

  async function handle(method, url, body) {
    const u = new URL(url, window.location.origin || 'http://localhost');
    const path = u.pathname;

    if (method === 'POST' && path === '/api/passenger') return handlePassenger(body);
    if (method === 'POST' && path === '/api/flight/takeoff') return handleTakeoff(body);
    if (method === 'POST' && path === '/api/flight/land') return handleLand(body);
    if (method === 'GET' && path === '/api/board') return handleBoard(u.searchParams.get('groupId') || '');
    if (method === 'GET' && path === '/api/flight/progress') {
      return handleProgress(u.searchParams.get('passengerId') || '');
    }
    if (method === 'GET' && path === '/api/config') {
      return { dataMode: 'preview', notionConfigured: false, notionReady: false, hint: '' };
    }
    throw new Error(`本機模式不支援：${method} ${path}`);
  }

  window.WorkshopLocal = {
    probe,
    isActive: () => active,
    enable: () => { active = true; },
    handle,
  };
})();
