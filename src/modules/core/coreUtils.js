/* =======================================================================
 * coreUtils.js
 * -----------------------------------------------------------------------
 * Shared constants and helper functions for a browser-based
 * Deepgram live-transcription project.
 *
 * – All identifiers are original and vendor-agnostic.
 * – No proprietary payloads or legacy business logic included.
 * – ES-module ready: `import { ... } from './coreUtils.js'`
 * ===================================================================== */

/* ------------------------------------------------------------------ */
/* 🌐  Deepgram & project-wide constants                               */
/* ------------------------------------------------------------------ */

export const DEEPGRAM_WS_URL     = 'wss://api.deepgram.com/v1/listen';
export const DEFAULT_LANGUAGE    = 'en-US';
export const DEFAULT_MODEL       = 'nova-2';
export const DEFAULT_SAMPLE_RATE = 16_000;          // 16 kHz PCM
export const STORAGE_NAMESPACE   = 'dgLive.';       // Prefix for local/chrome storage keys

/* ------------------------------------------------------------------ */
/* 🧩  Encoding / decoding helpers                                     */
/* ------------------------------------------------------------------ */

/**
 * Encode a string or Uint8Array to Base64.
 * Works in both browser and Node runtimes.
 */
export function encodeBase64(input) {
  if (input instanceof Uint8Array) {
    input = String.fromCharCode(...input);
  }
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(input)));
  }
  // Node fallback
  return Buffer.from(input, 'utf-8').toString('base64');
}

/**
 * Decode a Base64 string back to UTF-8.
 */
export function decodeBase64(b64) {
  if (typeof atob === 'function') {
    return decodeURIComponent(escape(atob(b64)));
  }
  // Node fallback
  return Buffer.from(b64, 'base64').toString('utf-8');
}

/* ------------------------------------------------------------------ */
/* 🗄️  Storage wrappers (localStorage → chrome.storage fallback)       */
/* ------------------------------------------------------------------ */

/**
 * Retrieve a value from storage. Falls back gracefully if storage is blocked.
 * @param {string} key         Storage key (will be namespaced automatically)
 * @param {*}      defaultVal  Returned if the key is missing or unreadable
 */
export async function safeStorageGet(key, defaultVal = null) {
  const fullKey = STORAGE_NAMESPACE + key;

  // Try localStorage (sync)
  try {
    const raw = localStorage.getItem(fullKey);
    if (raw !== null) return JSON.parse(raw);
  } catch {/* ignored */}

  // Try chrome.storage.local (async)
  try {
    if (chrome?.storage?.local) {
      const data = await chrome.storage.local.get([fullKey]);
      if (data && data[fullKey] !== undefined) return data[fullKey];
    }
  } catch {/* ignored */}

  return defaultVal;
}

/**
 * Persist a value to both localStorage and chrome.storage (if available).
 */
export async function safeStorageSet(key, value) {
  const fullKey = STORAGE_NAMESPACE + key;

  // localStorage
  try {
    localStorage.setItem(fullKey, JSON.stringify(value));
  } catch {/* ignored */}

  // chrome.storage.local
  try {
    chrome?.storage?.local?.set({ [fullKey]: value });
  } catch {/* ignored */}
}

/* ------------------------------------------------------------------ */
/* ⏱️  Timing helpers                                                 */
/* ------------------------------------------------------------------ */

/** Simple delay helper (`await delay(500)`) */
export const delay = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * Poll until `predicate()` returns truthy or timeout is reached.
 * @returns {Promise<*>} resolved value of predicate or throws on timeout
 */
export async function waitFor(predicate, {
  interval = 250,
  timeout  = 5_000
} = {}) {
  const start = Date.now();
  /* eslint-disable no-await-in-loop, no-constant-condition */
  while (true) {
    const result = await predicate();
    if (result) return result;
    if (Date.now() - start >= timeout) {
      throw new Error('waitFor: timed out');
    }
    await delay(interval);
  }
  /* eslint-enable no-await-in-loop */
}

/* ------------------------------------------------------------------ */
/* 📣  Minimal event-emitter utility                                   */
/* ------------------------------------------------------------------ */

export class MiniEmitter {
  #events = new Map();

  on(event, handler) {
    const list = this.#events.get(event) ?? [];
    list.push(handler);
    this.#events.set(event, list);
    return () => this.off(event, handler); // unsubscribe helper
  }

  off(event, handler) {
    const list = this.#events.get(event);
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx > -1) list.splice(idx, 1);
  }

  emit(event, payload) {
    this.#events.get(event)?.slice().forEach((fn) => {
      try { fn(payload); } catch (err) { console.error(err); }
    });
  }

  once(event, handler) {
    const off = this.on(event, (data) => {
      off();
      handler(data);
    });
  }
}

/* ------------------------------------------------------------------ */
/* 🧭  Feature-detection helpers                                       */
/* ------------------------------------------------------------------ */

export const isWebAudioSupported        = () => !!(window.AudioContext || window.webkitAudioContext);
export const isAudioWorkletSupported    = () => isWebAudioSupported() &&
                                               'audioWorklet' in (window.AudioContext?.prototype ?? {});
export const isMediaRecorderSupported   = () => 'MediaRecorder' in window;
export const isGetUserMediaAvailable    = () => !!(navigator.mediaDevices?.getUserMedia);
export const isSafari                   = () => /Safari/.test(navigator.userAgent) &&
                                               !/Chrome/.test(navigator.userAgent);

/* ------------------------------------------------------------------ */
/* 🔣  Miscellaneous helpers                                           */
/* ------------------------------------------------------------------ */

/** Escape HTML special characters to prevent rudimentary XSS in logs/UI. */
export function escapeHTML(str) {
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/** Format milliseconds → `mm:ss` (e.g., 65000 → "01:05") */
export function formatTime(ms) {
  const totalSec = Math.floor(ms / 1_000);
  const min      = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const sec      = String(totalSec % 60).padStart(2, '0');
  return `${min}:${sec}`;
}