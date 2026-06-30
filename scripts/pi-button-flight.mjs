import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { writeFile, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CONFIG = {
  baseUrl: process.env.PI_BASE_URL || 'http://127.0.0.1:3000',
  passengerId: process.env.PI_PASSENGER_ID || 'pi_001',
  passengerName: process.env.PI_PASSENGER_NAME || 'Raspberry Pi Passenger',
  groupId: process.env.PI_GROUP_ID || 'group_01',
  gpioPin: Number(process.env.PI_GPIO_PIN || 17),
  routeDirection: process.env.PI_ROUTE_DIRECTION || 'auto',
  broadcastStyle: process.env.PI_BROADCAST_STYLE || 'formal_captain',
  playerCommand: process.env.PI_AUDIO_PLAYER || 'mpg123',
  debounceMs: Number(process.env.PI_BUTTON_DEBOUNCE_MS || 1200),
};

let busy = false;
let lastPressAt = 0;
let pollingTimer = null;

function requireConfig() {
  if (!CONFIG.baseUrl) throw new Error('PI_BASE_URL is required.');
  if (!CONFIG.passengerId) throw new Error('PI_PASSENGER_ID is required.');
  if (!CONFIG.passengerName) throw new Error('PI_PASSENGER_NAME is required.');
  if (!CONFIG.groupId) throw new Error('PI_GROUP_ID is required.');
  if (!Number.isFinite(CONFIG.gpioPin)) throw new Error('PI_GPIO_PIN must be a number.');
}

async function api(method, path, body) {
  const res = await fetch(new URL(path, CONFIG.baseUrl), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(data.message || data.error || `Request failed: ${res.status}`);
  }
  return data;
}

async function ensurePassenger() {
  return api('POST', '/api/passenger', {
    passengerId: CONFIG.passengerId,
    name: CONFIG.passengerName,
    groupId: CONFIG.groupId,
  });
}

async function playSpeech(text) {
  if (!text?.trim()) return;
  const res = await fetch(new URL('/api/broadcast/speech', CONFIG.baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, style: CONFIG.broadcastStyle }),
  });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(`Speech request failed: ${message || res.status}`);
  }

  const audioPath = join(tmpdir(), `sleep-airline-${Date.now()}.mp3`);
  await writeFile(audioPath, Buffer.from(await res.arrayBuffer()));
  const playerArgs = CONFIG.playerCommand === 'pw-play' ? [audioPath] : ['-q', audioPath];
  const played = spawnSync(CONFIG.playerCommand, playerArgs, { stdio: 'inherit' });
  await unlink(audioPath).catch(() => {});
  if (played.status !== 0) {
    throw new Error(`${CONFIG.playerCommand} failed. Check speaker output and player installation.`);
  }
}

async function triggerFlightStep() {
  if (busy) return;
  const now = Date.now();
  if (now - lastPressAt < CONFIG.debounceMs) return;
  lastPressAt = now;
  busy = true;

  try {
    console.log('[Sleep Airline Pi] Button pressed. Checking passenger state...');
    const profile = await ensurePassenger();
    const passenger = profile.passenger;

    if (passenger.status === 'in_flight') {
      console.log('[Sleep Airline Pi] Landing flight...');
      const data = await api('POST', '/api/flight/land', {
        passengerId: CONFIG.passengerId,
        name: CONFIG.passengerName,
        groupId: CONFIG.groupId,
        broadcastStyle: CONFIG.broadcastStyle,
      });
      const text = data.flight?.captainBroadcast || `Flight landed at ${data.flight?.arrivalLocation || 'destination'}.`;
      await playSpeech(text);
      console.log('[Sleep Airline Pi] Landing complete.');
      return;
    }

    console.log('[Sleep Airline Pi] Taking off...');
    const data = await api('POST', '/api/flight/takeoff', {
      passengerId: CONFIG.passengerId,
      name: CONFIG.passengerName,
      groupId: CONFIG.groupId,
      routeDirection: CONFIG.routeDirection,
      broadcastStyle: CONFIG.broadcastStyle,
    });
    const text = data.flight?.takeoffBroadcast || 'Flight takeoff complete.';
    await playSpeech(text);
    console.log('[Sleep Airline Pi] Takeoff complete.');
  } catch (err) {
    console.error('[Sleep Airline Pi] Failed:', err instanceof Error ? err.message : err);
  } finally {
    busy = false;
  }
}

function configurePullUp(pin) {
  const pinText = String(pin);
  const pinctrl = spawnSync('pinctrl', ['set', pinText, 'ip', 'pu'], { stdio: 'ignore' });
  if (pinctrl.status === 0) return true;
  const raspiGpio = spawnSync('raspi-gpio', ['set', pinText, 'ip', 'pu'], { stdio: 'ignore' });
  return raspiGpio.status === 0;
}

function readPinLow(pin) {
  const pinText = String(pin);
  const pinctrl = spawnSync('pinctrl', [pinText], { encoding: 'utf8' });
  const output = `${pinctrl.stdout || ''} ${pinctrl.stderr || ''}`.toLowerCase();
  if (output.includes(' lo') || output.includes('|lo') || output.includes('level=0')) return true;
  if (output.includes(' hi') || output.includes('|hi') || output.includes('level=1')) return false;

  const raspiGpio = spawnSync('raspi-gpio', ['get', pinText], { encoding: 'utf8' });
  const gpioOutput = `${raspiGpio.stdout || ''} ${raspiGpio.stderr || ''}`.toLowerCase();
  if (gpioOutput.includes('level=0')) return true;
  if (gpioOutput.includes('level=1')) return false;
  return false;
}

function startPollingButton() {
  let wasLow = readPinLow(CONFIG.gpioPin);
  pollingTimer = setInterval(() => {
    const isLow = readPinLow(CONFIG.gpioPin);
    if (isLow && !wasLow) triggerFlightStep();
    wasLow = isLow;
  }, 80);
}

async function main() {
  requireConfig();
  configurePullUp(CONFIG.gpioPin);

  console.log(`[Sleep Airline Pi] Base URL: ${CONFIG.baseUrl}`);

  let button = null;
  try {
    const { Gpio } = await import('onoff');
    button = new Gpio(CONFIG.gpioPin, 'in', 'falling', { debounceTimeout: 80 });
    console.log(`[Sleep Airline Pi] Ready with onoff. GPIO ${CONFIG.gpioPin} -> GND button.`);
    button.watch((err, value) => {
      if (err) {
        console.error('[Sleep Airline Pi] GPIO error:', err.message);
        return;
      }
      if (value === 0) triggerFlightStep();
    });
  } catch (err) {
    console.warn('[Sleep Airline Pi] onoff GPIO unavailable; using pinctrl polling fallback.');
    console.warn(`[Sleep Airline Pi] GPIO detail: ${err instanceof Error ? err.message : err}`);
    console.log(`[Sleep Airline Pi] Ready with polling. GPIO ${CONFIG.gpioPin} -> GND button.`);
    startPollingButton();
  }

  process.on('SIGINT', () => {
    if (pollingTimer) clearInterval(pollingTimer);
    if (button) button.unexport();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[Sleep Airline Pi] Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});


