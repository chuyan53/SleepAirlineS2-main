/** 機場廣播：Attention 嗶嗶嗶 → 登登提示音 → OpenAI TTS（失敗則瀏覽器 TTS） */
let audioCtx = null;
let currentAudio = null;

function getAudioCtx() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function tone(freq, startSec, durSec, volume = 0.12) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + startSec;
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + durSec);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + durSec);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopPlayback() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (window.speechSynthesis) speechSynthesis.cancel();
}

async function playAttentionBeeps() {
  tone(520, 0, 0.08, 0.09);
  await delay(200);
  tone(520, 0, 0.08, 0.09);
  await delay(200);
  tone(520, 0, 0.08, 0.09);
  await delay(280);
}

async function playPaChime() {
  tone(880, 0, 0.2, 0.13);
  tone(660, 0.24, 0.32, 0.13);
  await delay(620);
}

function pickZhVoice() {
  const voices = speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === 'zh-TW')
    || voices.find((v) => v.lang.startsWith('zh-TW'))
    || voices.find((v) => v.lang.startsWith('zh'))
    || null
  );
}

function speakText(text) {
  return new Promise((resolve) => {
    if (!text?.trim() || !window.speechSynthesis) {
      resolve(false);
      return;
    }
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-TW';
    utter.rate = 0.9;
    utter.pitch = 0.95;
    const voice = pickZhVoice();
    if (voice) utter.voice = voice;
    utter.onend = () => resolve(true);
    utter.onerror = () => resolve(false);
    speechSynthesis.speak(utter);
  });
}

async function speakWithOpenAI(text, style) {
  try {
    const res = await fetch('/api/broadcast/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, style: style || 'formal_captain' }),
    });
    if (!res.ok) return false;

    const blob = await res.blob();
    if (!blob.size || !blob.type.startsWith('audio/')) return false;

    const url = URL.createObjectURL(blob);
    return await new Promise((resolve) => {
      const audio = new Audio(url);
      currentAudio = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        if (currentAudio === audio) currentAudio = null;
        resolve(true);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        if (currentAudio === audio) currentAudio = null;
        resolve(false);
      };
      audio.play().catch(() => {
        URL.revokeObjectURL(url);
        if (currentAudio === audio) currentAudio = null;
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

async function playCaptainBroadcast(text, style) {
  if (!text?.trim()) return false;
  stopPlayback();
  try {
    await playAttentionBeeps();
    await playPaChime();
    const usedOpenAI = await speakWithOpenAI(text, style);
    if (usedOpenAI) return true;
    return await speakText(text);
  } catch {
    return false;
  }
}

if (window.speechSynthesis) {
  speechSynthesis.getVoices();
  speechSynthesis.addEventListener('voiceschanged', () => speechSynthesis.getVoices());
}

window.BroadcastAudio = { playCaptainBroadcast, speakText, stopPlayback };
