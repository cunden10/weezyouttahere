/* featureActivation.js
 *
 * Manages the permission + activation flow for the real-time
 * Deepgram transcription feature in a browser extension or web page.
 *
 * All logic, naming, and UI strings are original and vendor-agnostic.
 *
 * Example:
 *   document.querySelector('.activate-feature-btn').onclick = () => {
 *     enableTranscriptionFeature({
 *       deepgramKey : 'YOUR_DEEPGRAM_API_KEY',
 *       onSuccess   : () => showActivationStatus('Transcription enabled!'),
 *       onError     : (msg) => showActivationStatus(msg, 'error')
 *     });
 *   };
 */

import createLiveTranscriber from './transcriptionBootstrap.js';

/* -------------------------------------------------- */
/* 🔧 Configuration & module-level state              */
/* -------------------------------------------------- */

const STORAGE_KEY = 'rtTranscribe.isEnabled';
const PARAM_MODE  = 'mode';
const MODE_LITE   = 'lite';

let transcriber   = null;   // Active transcriber instance
let isStarting    = false;  // Prevent double-click race conditions

/* -------------------------------------------------- */
/* 🏷️  Query-string helpers                           */
/* -------------------------------------------------- */

const qs      = new URLSearchParams(location.search);
const isLite  = qs.get(PARAM_MODE) === MODE_LITE;

/* -------------------------------------------------- */
/* 🎙️  Permission handling                            */
/* -------------------------------------------------- */

export async function requestMicrophoneAccess() {
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach(t => t.stop()); // Stop immediately—just a permission check
    return true;
  } catch (err) {
    console.error('[featureActivation] Microphone permission denied', err);
    return false;
  }
}

/* -------------------------------------------------- */
/* 🚀  Main activation function                       */
/* -------------------------------------------------- */

export async function enableTranscriptionFeature({
  deepgramKey,
  onTranscript = () => {},
  onSuccess    = () => {},
  onError      = () => {}
} = {}) {
  if (isStarting) return;
  isStarting = true;

  try {
    if (!deepgramKey) throw new Error('Missing Deepgram API key.');

    // Skip if already enabled via storage
    if (isFeatureActive()) {
      onSuccess();
      return;
    }

    const allowed = await requestMicrophoneAccess();
    if (!allowed) throw new Error('Microphone access was denied.');

    // Create + start the pipeline
    transcriber = createLiveTranscriber({
      deepgramKey,
      language             : 'en-US',
      enableInterimResults : !isLite,
      onTranscript
    });

    await transcriber.start();
    persistFeatureState(true);
    onSuccess();
  } catch (err) {
    console.error('[featureActivation] Activation failed:', err);
    onError(err.message);
  } finally {
    isStarting = false;
  }
}

export async function disableTranscriptionFeature() {
  try {
    await transcriber?.stop();
  } finally {
    transcriber = null;
    persistFeatureState(false);
  }
}

/* -------------------------------------------------- */
/* 📦  Persistence helpers                            */
/* -------------------------------------------------- */

function persistFeatureState(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled }));
  } catch {/* storage may be blocked in some contexts */}
}

function isFeatureActive() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return Boolean(data.enabled);
  } catch {
    return false;
  }
}

/* -------------------------------------------------- */
/* 💬  Simple DOM status helper                       */
/* -------------------------------------------------- */

export function showActivationStatus(message, type = 'info') {
  const el = getStatusNode();
  el.textContent = message;
  el.dataset.state = type;   // e.g. [data-state="error"] { color:red; } in CSS
}

function getStatusNode() {
  let el = document.querySelector('[data-role="activation-status"]');
  if (!el) {
    el = document.createElement('div');
    el.dataset.role = 'activation-status';
    el.style.marginTop = '1rem';
    el.style.fontSize = '0.875rem';
    document.body.appendChild(el);
  }
  return el;
}

/* -------------------------------------------------- */
/* 🌐  Auto-wire default button (optional)            */
/* -------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.querySelector('.activate-feature-btn');
  if (!btn) return;

  const defaultLabel = btn.textContent;

  const setBtnState = (enabled) => {
    btn.textContent = enabled ? 'Transcription Enabled' : defaultLabel;
    btn.disabled    = enabled;
  };

  setBtnState(isFeatureActive());

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Enabling…';
    showActivationStatus('');

    await enableTranscriptionFeature({
      deepgramKey : btn.dataset.deepgramKey,
      onTranscript: (text) => console.debug('[live]', text),
      onSuccess   : () => {
        setBtnState(true);
        showActivationStatus('Transcription enabled!');
      },
      onError     : (msg) => {
        setBtnState(false);
        showActivationStatus(msg, 'error');
      }
    });
  });
});