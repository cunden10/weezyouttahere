/* =======================================================================
 * audioNotificationController.js
 * -----------------------------------------------------------------------
 * Centralised utility for loading, caching, and playing short UI sounds
 * (activation tones, error beeps, call rings, etc.) in a browser-based
 * Deepgram transcription extension or web app.
 *
 * Public API
 * ──────────
 *   playNotificationSound(key, opts)     → plays a registered sound
 *   loadAudioAssets(keys?)               → pre-loads one or more sounds
 *   registerCustomSound(key, url, preload?)
 *   setMasterVolume(value)               → 0.0 – 1.0 (default = 1)
 *
 * All identifiers are original and vendor-agnostic.
 * ===================================================================== */

const DEFAULT_SOUND_PATH = '/assets/sounds/';      // Adjust for your bundler
const DEFAULT_VOLUME     = 1;                      // 0 – 1 (permanent master)

/* Built-in sound map – extend via registerCustomSound() at runtime */
const BUILT_IN_SOUNDS = {
  chime       : 'confirmation-beep.ogg',
  activated   : 'transcription-activated.mp3',
  deactivated : 'transcription-deactivated.mp3',
  start       : 'recording-start.wav',
  stop        : 'recording-stop.wav',
  error       : 'alert-error.mp3',
  ring        : 'alert-ring.wav'
};

/* ------------------------------------------------------------------ */
/* 🔒 Internal state                                                  */
/* ------------------------------------------------------------------ */

const soundSources  = new Map(Object.entries(BUILT_IN_SOUNDS)); // <key, filename|URL>
const loadedSounds  = new Map();                                 // <key, HTMLAudioElement>
let   masterVolume  = DEFAULT_VOLUME;

/* ------------------------------------------------------------------ */
/* 🔊  Public functions                                               */
/* ------------------------------------------------------------------ */

/**
 * Play a registered sound key. The first call downloads & caches the file.
 *
 * @param {string}  key                       Identifier (e.g. "chime")
 * @param {Object}  opts
 * @param {number}  [opts.volume=1]           Per-playback relative volume
 * @param {boolean} [opts.loop=false]         Loop audio (e.g. "ring")
 * @returns {Promise<HTMLAudioElement>}       Audio element used for playback
 */
export async function playNotificationSound(key, opts = {}) {
  const { volume = 1, loop = false } = opts;
  const audio = await _ensureSoundLoaded(key);

  if (!audio) throw new Error(`audioNotificationController: Unknown sound "${key}"`);

  // Clone to allow overlapping playbacks
  const instance     = audio.cloneNode();
  instance.volume    = Math.max(0, Math.min(1, masterVolume * volume));
  instance.loop      = loop;

  try {
    await instance.play();
  } catch (err) {
    // Autoplay policies can block audio until user interaction
    console.warn('[audioNotificationController] Playback blocked:', err);
  }
  return instance;
}

/**
 * Pre-load a subset (or all) sounds to reduce first-play latency.
 * @param {string[]} [keys]  Keys to preload (default = all registered)
 */
export async function loadAudioAssets(keys = [...soundSources.keys()]) {
  await Promise.all(keys.map(_ensureSoundLoaded));
}

/**
 * Dynamically register a new sound at runtime.
 * @param {string}   key        Unique identifier
 * @param {string}   url        Absolute or relative URL of audio file
 * @param {boolean}  [preload]  Pre-load immediately (default false)
 */
export async function registerCustomSound(key, url, preload = false) {
  if (soundSources.has(key)) {
    throw new Error(`Sound key "${key}" already exists`);
  }
  soundSources.set(key, url);
  if (preload) await _ensureSoundLoaded(key);
}

/**
 * Adjust global master volume for future playbacks.
 * @param {number} value  Range 0.0 – 1.0
 */
export function setMasterVolume(value) {
  masterVolume = Math.max(0, Math.min(1, value));
}

/* ------------------------------------------------------------------ */
/* 🛠️  Internal helpers                                              */
/* ------------------------------------------------------------------ */

async function _ensureSoundLoaded(key) {
  if (loadedSounds.has(key)) return loadedSounds.get(key);

  if (!soundSources.has(key)) return null;

  const src   = _resolveUrl(soundSources.get(key));
  const audio = new Audio(src);
  audio.preload = 'auto';

  const ready = new Promise((resolve, reject) => {
    audio.addEventListener('canplaythrough', () => resolve(audio), { once: true });
    audio.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
  });

  loadedSounds.set(key, audio);
  return ready;
}

function _resolveUrl(fileOrUrl) {
  // If the path already looks like a full URL, keep it
  if (/^https?:\/\//.test(fileOrUrl)) return fileOrUrl;

  // For extensions, runtime.getURL guarantees correct path inside the bundle
  if (typeof chrome?.runtime?.getURL === 'function') {
    return chrome.runtime.getURL(`assets/sounds/${fileOrUrl}`);
  }
  if (typeof browser?.runtime?.getURL === 'function') {
    return browser.runtime.getURL(`assets/sounds/${fileOrUrl}`);
  }
  // Fallback for regular web builds
  return `${DEFAULT_SOUND_PATH}${fileOrUrl}`;
}

/* ------------------------------------------------------------------ */
/* 📚  Usage Example                                                  */
/* ------------------------------------------------------------------ */
/*
import { playNotificationSound } from './audioNotificationController.js';

async function onPermissionGranted() {
  // …. your logic …
  await playNotificationSound('chime');             // happy path
}

async function onErrorOccured() {
  await playNotificationSound('error', { volume: 0.8 });
}
*/