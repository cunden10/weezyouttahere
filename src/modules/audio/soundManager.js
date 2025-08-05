/* =======================================================================
 * soundManager.js
 * -----------------------------------------------------------------------
 * Audio feedback system for the live transcription feature.
 * Provides sound effects for activation, recording states, confirmations,
 * and error notifications with browser compatibility handling.
 * ===================================================================== */

// Sound file path resolver - handles both extension and web contexts
const getSoundPath = (filename) => {
  // Try Chrome extension context first
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(`assets/sounds/${filename}`);
  }
  
  // Try standard browser runtime if available
  if (typeof browser !== 'undefined' && browser.runtime?.getURL) {
    return browser.runtime.getURL(`assets/sounds/${filename}`);
  }
  
  // Fall back to relative path for web context
  return `./assets/sounds/${filename}`;
};

/* ------------------------------------------------------------------ */
/* 🎵  Sound Bank - Pre-loaded Audio Objects                          */
/* ------------------------------------------------------------------ */

export const soundBank = {
  activated    : new Audio(getSoundPath('transcription-activated.mp3')),
  deactivated  : new Audio(getSoundPath('transcription-deactivated.mp3')),
  recStart     : new Audio(getSoundPath('recording-start.wav')),
  recStop      : new Audio(getSoundPath('recording-stop.wav')),
  confirmBeep  : new Audio(getSoundPath('confirmation-beep.ogg')),
  errorAlert   : new Audio(getSoundPath('alert-error.mp3')),
  ringLoop     : new Audio(getSoundPath('alert-ring.wav'))
};

// Configure sound properties
Object.values(soundBank).forEach(audio => {
  audio.preload = 'auto';
  audio.volume = 0.7;  // Reasonable default volume
});

// Special configuration for looping ring
soundBank.ringLoop.loop = true;

/* ------------------------------------------------------------------ */
/* 🔊  Sound Playback Functions                                       */
/* ------------------------------------------------------------------ */

/**
 * Play a sound by key name
 * @param {string} key - Sound key from soundBank
 * @param {Object} options - Playback options
 */
export const playSound = async (key, options = {}) => {
  const clip = soundBank[key];
  if (!clip) {
    console.warn(`[soundManager] Unknown sound key: ${key}`);
    return false;
  }

  try {
    // Apply options
    if (options.volume !== undefined) {
      clip.volume = Math.max(0, Math.min(1, options.volume));
    }
    if (options.loop !== undefined) {
      clip.loop = options.loop;
    }

    // Reset playback position and play
    clip.currentTime = 0;
    await clip.play();
    return true;
  } catch (error) {
    console.warn(`[soundManager] Failed to play sound '${key}':`, error);
    return false;
  }
};

/**
 * Stop and reset a sound
 * @param {string} key - Sound key from soundBank
 */
export const stopSound = (key) => {
  const clip = soundBank[key];
  if (clip) {
    clip.pause();
    clip.currentTime = 0;
    clip.loop = false;
  }
};

/**
 * Stop all currently playing sounds
 */
export const stopAllSounds = () => {
  Object.keys(soundBank).forEach(stopSound);
};

/**
 * Set global volume for all sounds
 * @param {number} volume - Volume level (0.0 to 1.0)
 */
export const setGlobalVolume = (volume) => {
  const clampedVolume = Math.max(0, Math.min(1, volume));
  Object.values(soundBank).forEach(audio => {
    audio.volume = clampedVolume;
  });
};

/* ------------------------------------------------------------------ */
/* 🎯  Semantic Sound Functions                                       */
/* ------------------------------------------------------------------ */

// Transcription lifecycle sounds
export const playActivationSound = () => playSound('activated');
export const playDeactivationSound = () => playSound('deactivated');

// Recording state sounds
export const playRecordingStart = () => playSound('recStart');
export const playRecordingStop = () => playSound('recStop');

// UI feedback sounds
export const playConfirmation = () => playSound('confirmBeep');
export const playError = () => playSound('errorAlert');

// Call/notification sounds
export const startRinging = () => playSound('ringLoop', { loop: true });
export const stopRinging = () => stopSound('ringLoop');

/* ------------------------------------------------------------------ */
/* 🔧  Utility Functions                                              */
/* ------------------------------------------------------------------ */

/**
 * Test if audio context is available and sounds can be played
 */
export const testAudioSupport = async () => {
  try {
    const testAudio = new Audio();
    testAudio.volume = 0;
    await testAudio.play();
    testAudio.pause();
    return true;
  } catch (error) {
    console.warn('[soundManager] Audio playback not supported:', error);
    return false;
  }
};

/**
 * Preload all sounds for faster playback
 */
export const preloadSounds = async () => {
  const loadPromises = Object.entries(soundBank).map(([key, audio]) => {
    return new Promise((resolve) => {
      const handleLoad = () => {
        audio.removeEventListener('canplaythrough', handleLoad);
        audio.removeEventListener('error', handleError);
        resolve({ key, success: true });
      };
      
      const handleError = (error) => {
        audio.removeEventListener('canplaythrough', handleLoad);
        audio.removeEventListener('error', handleError);
        console.warn(`[soundManager] Failed to preload ${key}:`, error);
        resolve({ key, success: false, error });
      };

      audio.addEventListener('canplaythrough', handleLoad);
      audio.addEventListener('error', handleError);
      
      // Force load
      audio.load();
    });
  });

  const results = await Promise.all(loadPromises);
  const failed = results.filter(r => !r.success);
  
  if (failed.length > 0) {
    console.warn('[soundManager] Some sounds failed to preload:', failed);
  }
  
  return {
    total: results.length,
    loaded: results.length - failed.length,
    failed: failed.length,
    failures: failed
  };
};

/**
 * Check if a specific sound is ready to play
 */
export const isSoundReady = (key) => {
  const clip = soundBank[key];
  return clip && clip.readyState >= 3; // HAVE_FUTURE_DATA or HAVE_ENOUGH_DATA
};

/**
 * Get the duration of a sound (if loaded)
 */
export const getSoundDuration = (key) => {
  const clip = soundBank[key];
  return clip && !isNaN(clip.duration) ? clip.duration : null;
};

/* ------------------------------------------------------------------ */
/* 🎚️  Advanced Controls                                              */
/* ------------------------------------------------------------------ */

/**
 * Fade out a sound over specified duration
 * @param {string} key - Sound key
 * @param {number} duration - Fade duration in milliseconds
 */
export const fadeOut = (key, duration = 1000) => {
  const clip = soundBank[key];
  if (!clip || clip.paused) return;

  const startVolume = clip.volume;
  const startTime = Date.now();
  
  const fade = () => {
    const elapsed = Date.now() - startTime;
    const progress = elapsed / duration;
    
    if (progress >= 1) {
      clip.volume = 0;
      clip.pause();
      clip.currentTime = 0;
      clip.volume = startVolume; // Reset for next use
      return;
    }
    
    clip.volume = startVolume * (1 - progress);
    requestAnimationFrame(fade);
  };
  
  fade();
};

/**
 * Create a sound sequence (play sounds in order with delays)
 * @param {Array} sequence - Array of {sound, delay} objects
 */
export const playSequence = async (sequence) => {
  for (const { sound, delay = 0, options = {} } of sequence) {
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    await playSound(sound, options);
  }
};

/* ------------------------------------------------------------------ */
/* 📱  Export Default Interface                                       */
/* ------------------------------------------------------------------ */

export default {
  // Core functions
  playSound,
  stopSound,
  stopAllSounds,
  setGlobalVolume,
  
  // Semantic functions
  playActivationSound,
  playDeactivationSound,
  playRecordingStart,
  playRecordingStop,
  playConfirmation,
  playError,
  startRinging,
  stopRinging,
  
  // Utility functions
  testAudioSupport,
  preloadSounds,
  isSoundReady,
  getSoundDuration,
  fadeOut,
  playSequence,
  
  // Direct access to sound bank
  soundBank
};

/* ------------------------------------------------------------------ */
/* 📖  Usage Examples                                                 */
/* ------------------------------------------------------------------ */

/*
// Basic usage in featureActivation.js:
import { playActivationSound, playError } from './soundManager.js';

async function onActivationSuccess() {
  playActivationSound();
  showActivationStatus('Transcription enabled!');
}

function onActivationError() {
  playError();
  showActivationStatus('Failed to activate transcription', 'error');
}

// Advanced usage with preloading:
import soundManager from './soundManager.js';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Preloading sounds...');
  const loadResult = await soundManager.preloadSounds();
  console.log(`Loaded ${loadResult.loaded}/${loadResult.total} sounds`);
  
  // Test if audio is supported
  const audioSupported = await soundManager.testAudioSupport();
  if (!audioSupported) {
    console.warn('Audio playback not supported in this environment');
  }
});

// Sequence example:
const activationSequence = [
  { sound: 'confirmBeep', delay: 0 },
  { sound: 'recStart', delay: 300 },
  { sound: 'activated', delay: 100 }
];

soundManager.playSequence(activationSequence);

// Fade out example:
soundManager.startRinging();
setTimeout(() => {
  soundManager.fadeOut('ringLoop', 2000); // 2 second fade
}, 5000);
*/