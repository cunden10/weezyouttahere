/* =======================================================================
 * audioNotificationController.js
 * -----------------------------------------------------------------------
 * Central helper for loading, caching, and playing short UI sounds
 * (toasts, activation cues, error beeps, etc.) in a Deepgram-powered
 * browser extension or web-app.
 *
 * Public API
 * ----------
 *   playNotificationSound(key, opts?)     → plays a registered sound
 *   loadAudioAssets(keys?)                → pre-loads one or more sounds
 *   registerCustomSound(key, src, preload = false)
 *   setMasterVolume(value)                → 0.0 – 1.0 (default 1)
 *
 * All identifiers are original and vendor-agnostic.
 * ===================================================================== */

const ASSET_PATH = '/assets/sounds/';  // Adjust if your build system rewrites paths

/* Built-in sound map — extend via registerCustomSound() */
const SOUND_FILES = new Map(Object.entries({
  chime         : 'confirmation-beep.ogg',
  activated     : 'transcription-activated.mp3',
  deactivated   : 'transcription-deactivated.mp3',
  start         : 'recording-start.wav',
  stop          : 'recording-stop.wav',
  error         : 'alert-error.mp3',
  ring          : 'alert-ring.wav'
}));

/* Caches <key, HTMLAudioElement> */
const loadedSounds = new Map();

/* Master volume (0–1) applied to all new Audio instances */
let masterVolume = 1;

/* ------------------------------------------------------------------ */
/* 🔊 Core Functions                                                  */
/* ------------------------------------------------------------------ */

/**
 * Play a registered notification sound.
 * Auto-loads the asset the first time it is requested.
 *
 * @param {string}  key                  Map key (e.g. "chime")
 * @param {Object}  [opts]
 * @param {boolean} [opts.loop=false]    Loop audio (useful for 'ring')
 * @param {number}  [opts.volume=1]      Per-playback relative volume (0–1)
 * @returns {Promise<HTMLAudioElement>}  Resolves with the Audio node
 */
export async function playNotificationSound(key, opts = {}) {
  const { loop = false, volume = 1 } = opts;

  const audio = await ensureSoundLoaded(key);
  if (!audio) throw new Error(`Unknown sound key: ${key}`);

  /* Clone to allow overlapping playback */
  const instance = audio.cloneNode();
  instance.volume = Math.max(0, Math.min(1, masterVolume * volume));
  instance.loop   = loop;

  try {
    await instance.play();
  } catch (err) {
    // Autoplay policies may block audio before user interaction
    console.warn('[AudioController] Playback failed:', err);
  }
  return instance;
}

/**
 * Pre-load one or more sounds into the cache.
 * Useful to avoid latency before first playback.
 *
 * @param {string[]} [keys]  Keys to preload (default = all)
 */
export async function loadAudioAssets(keys = [...SOUND_FILES.keys()]) {
  await Promise.all(keys.map(ensureSoundLoaded));
}

/**
 * Register a new custom sound at runtime.
 *
 * @param {string}   key        Unique identifier (e.g. "myAlert")
 * @param {string}   src        Relative or absolute URL
 * @param {boolean}  preload    Whether to load immediately
 */
export async function registerCustomSound(key, src, preload = false) {
  if (SOUND_FILES.has(key)) {
    throw new Error(`Sound key "${key}" already exists`);
  }
  SOUND_FILES.set(key, src);
  if (preload) await ensureSoundLoaded(key);
}

/**
 * Globally adjust volume for *future* playbacks.
 * @param {number} value  0.0 – 1.0
 */
export function setMasterVolume(value) {
  masterVolume = Math.max(0, Math.min(1, value));
}

/* ------------------------------------------------------------------ */
/* 🛠️  Internal Helpers                                              */
/* ------------------------------------------------------------------ */

async function ensureSoundLoaded(key) {
  if (loadedSounds.has(key)) return loadedSounds.get(key);

  if (!SOUND_FILES.has(key)) return null;

  const src      = resolveAssetUrl(SOUND_FILES.get(key));
  const audio    = new Audio(src);
  audio.preload  = 'auto';

  const ready = new Promise((res, rej) => {
    audio.addEventListener('canplaythrough', () => res(audio), { once: true });
    audio.addEventListener('error', () => rej(new Error(`Failed to load: ${src}`)), { once: true });
  });

  loadedSounds.set(key, audio);
  return ready;
}

function resolveAssetUrl(file) {
  // Works in both extension & regular web contexts
  if (typeof chrome?.runtime?.getURL === 'function') {
    return chrome.runtime.getURL(`assets/sounds/${file}`);
  }
  if (typeof browser?.runtime?.getURL === 'function') {
    return browser.runtime.getURL(`assets/sounds/${file}`);
  }
  // Fallback for non-extension builds
  return `${ASSET_PATH}${file}`;
}

/* ------------------------------------------------------------------ */
/* 📚  Demo Usage                                                     */
/* ------------------------------------------------------------------ */

/*
import { playNotificationSound, loadAudioAssets } from './audioNotificationController.js';

await loadAudioAssets();                     // preload all (optional)
playNotificationSound('activated');          // subtle sweep tone
playNotificationSound('error', { volume: 0.8 });

document.querySelector('#grant-btn')
  .addEventListener('click', async () => {
    const granted = await navigator.mediaDevices.getUserMedia({ audio: true })
                       .then(() => true).catch(() => false);

    playNotificationSound(granted ? 'chime' : 'error');
  });
*/