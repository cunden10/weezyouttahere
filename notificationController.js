/* notificationController.js
 * ---------------------------------------------------------------
 * Lightweight, vendor-agnostic notification / toast manager
 * for browser-based Deepgram transcription extensions or apps.
 *
 * Exports a small API:
 *   showToast(msg, opts)        → transient toast (returns dismiss fn)
 *   showStatusBanner(msg, opts) → persistent banner at top of page
 *   clearAllNotifications()     → removes every active toast / banner
 *
 * Styling:
 *   – All elements receive the base class  .tx-toast  or .tx-banner
 *   – Variant classes are appended:        .is-success / .is-error ...
 *   – Override in CSS to match your brand:
 *        .tx-toast            { /* baseline */ }
 *        .tx-toast.is-error   { /* red bg  */ }
 *        .tx-banner.is-info   { /* blue bg */ }
 *
 * @author   Your-Team
 * @version  1.0.0
 * ------------------------------------------------------------- */

const DEFAULT_TOAST_DURATION = 4_000;        // ms
const toastContainerId       = 'tx-toast-container';
const bannerContainerId      = 'tx-banner-container';

// Maps id → element for quick removal
const activeToasts  = new Map();
const activeBanners = new Map();

/* -------------------------------------------------- */
/*  Public API                                        */
/* -------------------------------------------------- */

/**
 * Show a transient toast in the lower-right corner.
 * @param {string}  message          Text or HTML to display
 * @param {Object}  options
 * @param {'info'|'success'|'warning'|'error'} [options.type='info']
 * @param {number}  [options.duration=4000]    Milliseconds before auto-dismiss (0 = stay)
 * @param {boolean} [options.closable=true]    Whether to render a close button
 * @returns {Function}                         Call to dismiss this toast manually
 */
export function showToast(message, options = {}) {
  const {
    type      = 'info',
    duration  = DEFAULT_TOAST_DURATION,
    closable  = true
  } = options;

  const container = ensureContainer(toastContainerId, 'tx-toast-container');
  const el        = document.createElement('div');
  const id        = `toast_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  el.className = `tx-toast is-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.dataset.toastId = id;
  el.innerHTML = `
    <span class="tx-toast__message">${message}</span>
    ${closable ? '<button class="tx-toast__close" aria-label="Dismiss">&times;</button>' : ''}
  `;

  if (closable) {
    el.querySelector('.tx-toast__close')
      .addEventListener('click', () => dismissToast(id));
  }

  container.appendChild(el);
  activeToasts.set(id, el);

  // Auto-dismiss
  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }

  // Return programmatic dismiss fn
  return () => dismissToast(id);
}

/**
 * Show / replace a persistent top banner (1 active per type).
 * @param {string} message
 * @param {Object} options
 * @param {'info'|'success'|'warning'|'error'} [options.type='info']
 * @param {boolean} [options.closable=true]
 * @returns {Function}                          Dismiss function
 */
export function showStatusBanner(message, options = {}) {
  const {
    type      = 'info',
    closable  = true
  } = options;

  const container = ensureContainer(bannerContainerId, 'tx-banner-container');
  const id        = `banner_${type}`;             // one banner per type

  // Remove existing banner of same type
  dismissBanner(id);

  const el = document.createElement('div');
  el.className = `tx-banner is-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.dataset.bannerId = id;
  el.innerHTML = `
    <span class="tx-banner__message">${message}</span>
    ${closable ? '<button class="tx-banner__close" aria-label="Dismiss">&times;</button>' : ''}
  `;

  if (closable) {
    el.querySelector('.tx-banner__close')
      .addEventListener('click', () => dismissBanner(id));
  }

  container.appendChild(el);
  activeBanners.set(id, el);

  return () => dismissBanner(id);
}

/**
 * Remove **all** active toasts and banners.
 */
export function clearAllNotifications() {
  [...activeToasts.keys()].forEach(dismissToast);
  [...activeBanners.keys()].forEach(dismissBanner);
}

/* -------------------------------------------------- */
/*  Internal Helpers                                  */
/* -------------------------------------------------- */

function ensureContainer(id, className) {
  let node = document.getElementById(id);
  if (!node) {
    node = document.createElement('div');
    node.id = id;
    node.className = className;
    document.body.appendChild(node);
  }
  return node;
}

function dismissToast(id) {
  const el = activeToasts.get(id);
  if (!el) return;
  el.classList.add('is-hiding');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
  activeToasts.delete(id);
}

function dismissBanner(id) {
  const el = activeBanners.get(id);
  if (!el) return;
  el.classList.add('is-hiding');
  el.addEventListener('transitionend', () => el.remove(), { once: true });
  activeBanners.delete(id);
}

/* -------------------------------------------------- */
/*  Demo Usage Snippets                               */
/* -------------------------------------------------- */

// Success toast (auto-dismiss after 3 s)
export function demoSuccess() {
  showToast('Microphone permission granted!', { type: 'success', duration: 3000 });
}

// Error banner (sticky until user closes)
export function demoErrorBanner() {
  showStatusBanner('Connection to Deepgram lost. Reconnecting…', { type: 'error', closable: true });
}