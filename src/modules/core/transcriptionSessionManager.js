/* ================================================================
 * transcriptionSessionManager.js
 * ================================================================
 * Centralized session orchestrator for browser-based Deepgram transcription.
 * Manages lifecycle, state, and observer notifications in an extensible,
 * event-driven architecture.
 *
 * Design Principles:
 * - Single source of truth for transcription state
 * - Observer pattern for loose coupling
 * - Extensible plugin architecture
 * - Clean separation of concerns
 * - Secure API key injection at build time
 * ================================================================ */

import createLiveTranscriber from '../activation/transcriptionBootstrap.js';
import { MiniEmitter, safeStorageGet, safeStorageSet, delay } from './coreUtils.js';
import { playNotificationSound } from '../audio/audioNotificationController.js';

// API key injected at build time
const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY;

/* ------------------------------------------------------------------ */
/* 📊 Session State & Event Types                                     */
/* ------------------------------------------------------------------ */

export const SESSION_STATES = Object.freeze({
  IDLE        : 'idle',
  INITIALIZING: 'initializing', 
  ACTIVE      : 'active',
  PAUSED      : 'paused',
  STOPPING    : 'stopping',
  ERROR       : 'error'
});

export const SESSION_EVENTS = Object.freeze({
  STATE_CHANGED      : 'stateChanged',
  SESSION_STARTED    : 'sessionStarted',
  SESSION_ENDED      : 'sessionEnded',
  TRANSCRIPT_INTERIM : 'transcriptInterim',
  TRANSCRIPT_FINAL   : 'transcriptFinal',
  TRANSCRIPT_CLEARED : 'transcriptCleared',
  ERROR_OCCURRED     : 'errorOccurred',
  STATS_UPDATED      : 'statsUpdated',
  PLUGIN_EVENT       : 'pluginEvent'
});

/* ------------------------------------------------------------------ */
/* 🎯 Main Session Manager Class                                      */
/* ------------------------------------------------------------------ */

export default class TranscriptionSessionManager extends MiniEmitter {
  #state = SESSION_STATES.IDLE;
  #transcriber = null;
  #sessionId = null;
  #config = {};
  #stats = {
    startTime: null,
    endTime: null,
    wordCount: 0,
    interimCount: 0,
    errorCount: 0
  };
  
  // Accumulated transcript segments
  #transcript = {
    interim: '',
    final: [],
    full: ''
  };

  // Registered plugins and observers
  #plugins = new Map();
  #observers = new Set();

  constructor(options = {}) {
    super();
    
    this.#config = {
      autoRestart: false,
      maxRetries: 3,
      retryDelay: 2000,
      enableStats: true,
      enableSounds: true,
      persistSession: true,
      ...options
    };

    // Auto-restore previous session if configured
    if (this.#config.persistSession) {
      this.#restoreSession();
    }

    this.#setupCleanupHandlers();
  }

  /* ---------------------------------------------------------------- */
  /* 🔄 Core Session Lifecycle                                        */
  /* ---------------------------------------------------------------- */

  /**
   * Start a new transcription session
   * @param {Object} sessionConfig - Configuration for this session
   * @returns {Promise<string>} Session ID
   */
  async startSession(sessionConfig = {}) {
    if (this.#state !== SESSION_STATES.IDLE) {
      throw new Error(`Cannot start session from state: ${this.#state}`);
    }

    // Validate API key availability
    if (!DEEPGRAM_API_KEY) {
      throw new Error('Deepgram API key not configured. Please check environment setup.');
    }

    this.#setState(SESSION_STATES.INITIALIZING);
    this.#sessionId = this.#generateSessionId();
    
    try {
      // Create transcriber instance with injected API key
      this.#transcriber = createLiveTranscriber({
        deepgramKey: DEEPGRAM_API_KEY,  // Use injected key
        ...sessionConfig,
        onTranscript: (text, meta) => this.#handleInterimTranscript(text, meta),
        onFinalTranscript: (text, meta) => this.#handleFinalTranscript(text, meta),
        onError: (error) => this.#handleTranscriberError(error),
        onSessionStart: () => this.#handleSessionStarted(),
        onSessionEnd: (data) => this.#handleSessionEnded(data),
        enableLogging: this.#config.enableLogging
      });

      // Start the transcription pipeline
      await this.#transcriber.start();
      
      // Initialize session state
      this.#resetStats();
      this.#resetTranscript();
      this.#stats.startTime = Date.now();
      
      this.#setState(SESSION_STATES.ACTIVE);
      
      if (this.#config.enableSounds) {
        playNotificationSound('activated');
      }

      // Persist session state
      if (this.#config.persistSession) {
        await this.#persistSession();
      }

      this.emit(SESSION_EVENTS.SESSION_STARTED, {
        sessionId: this.#sessionId,
        config: sessionConfig
      });

      return this.#sessionId;

    } catch (error) {
      this.#setState(SESSION_STATES.ERROR);
      this.#handleError(error, 'Failed to start session');
      throw error;
    }
  }

  /**
   * Stop the current transcription session
   * @returns {Promise<Object>} Session summary
   */
  async stopSession() {
    if (this.#state === SESSION_STATES.IDLE) {
      return null;
    }

    this.#setState(SESSION_STATES.STOPPING);

    try {
      const sessionSummary = this.#buildSessionSummary();

      if (this.#transcriber) {
        await this.#transcriber.stop();
        this.#transcriber = null;
      }

      this.#stats.endTime = Date.now();
      
      if (this.#config.enableSounds) {
        playSound('deactivated');
      }

      this.#setState(SESSION_STATES.IDLE);
      this.#sessionId = null;

      // Clean up persisted state
      if (this.#config.persistSession) {
        await this.#clearPersistedSession();
      }

      this.emit(SESSION_EVENTS.SESSION_ENDED, sessionSummary);
      
      return sessionSummary;

    } catch (error) {
      this.#handleError(error, 'Failed to stop session cleanly');
      this.#setState(SESSION_STATES.IDLE);
      return null;
    }
  }

  /**
   * Pause transcription (keeps session alive)
   */
  pauseSession() {
    if (this.#state !== SESSION_STATES.ACTIVE) {
      return false;
    }

    if (this.#transcriber) {
      this.#transcriber.pause();
    }

    this.#setState(SESSION_STATES.PAUSED);
    return true;
  }

  /**
   * Resume paused transcription
   */
  resumeSession() {
    if (this.#state !== SESSION_STATES.PAUSED) {
      return false;
    }

    if (this.#transcriber) {
      this.#transcriber.resume();
    }

    this.#setState(SESSION_STATES.ACTIVE);
    return true;
  }

  /* ---------------------------------------------------------------- */
  /* 👥 Observer & Plugin Management                                  */
  /* ---------------------------------------------------------------- */

  /**
   * Register an observer for session events
   * @param {Object} observer - Object with event handler methods
   */
  registerObserver(observer) {
    this.#observers.add(observer);
    
    // Auto-wire standard event handlers
    const eventMap = {
      onStateChanged     : SESSION_EVENTS.STATE_CHANGED,
      onSessionStarted   : SESSION_EVENTS.SESSION_STARTED,
      onSessionEnded     : SESSION_EVENTS.SESSION_ENDED,
      onTranscriptInterim: SESSION_EVENTS.TRANSCRIPT_INTERIM,
      onTranscriptFinal  : SESSION_EVENTS.TRANSCRIPT_FINAL,
      onTranscriptCleared: SESSION_EVENTS.TRANSCRIPT_CLEARED,
      onError           : SESSION_EVENTS.ERROR_OCCURRED,
      onStatsUpdated    : SESSION_EVENTS.STATS_UPDATED
    };

    Object.entries(eventMap).forEach(([method, event]) => {
      if (typeof observer[method] === 'function') {
        this.on(event, observer[method]);
      }
    });

    // Return unsubscribe function
    return () => this.unregisterObserver(observer);
  }

  /**
   * Remove an observer
   */
  unregisterObserver(observer) {
    this.#observers.delete(observer);
  }

  /**
   * Register a plugin for extended functionality
   * @param {string} name - Plugin identifier
   * @param {Object} plugin - Plugin instance with lifecycle methods
   */
  registerPlugin(name, plugin) {
    if (this.#plugins.has(name)) {
      throw new Error(`Plugin '${name}' already registered`);
    }

    this.#plugins.set(name, plugin);

    // Initialize plugin if session is active
    if (this.#state === SESSION_STATES.ACTIVE && plugin.onSessionActive) {
      plugin.onSessionActive(this.getSessionInfo());
    }

    // Setup plugin event forwarding
    if (plugin.on && typeof plugin.on === 'function') {
      plugin.on('*', (event, data) => {
        this.emit(SESSION_EVENTS.PLUGIN_EVENT, { plugin: name, event, data });
      });
    }
  }

  /**
   * Get registered plugin by name
   */
  getPlugin(name) {
    return this.#plugins.get(name);
  }

  /* ---------------------------------------------------------------- */
  /* 📝 Transcript Management                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Get current transcript state
   */
  getTranscript() {
    return {
      ...this.#transcript,
      wordCount: this.#stats.wordCount
    };
  }

  /**
   * Clear accumulated transcript
   */
  clearTranscript() {
    this.#resetTranscript();
    this.emit(SESSION_EVENTS.TRANSCRIPT_CLEARED, {
      sessionId: this.#sessionId,
      timestamp: Date.now()
    });
  }

  /**
   * Export transcript in various formats
   */
  exportTranscript(format = 'text') {
    const transcript = this.#transcript.full;
    const metadata = {
      sessionId: this.#sessionId,
      startTime: this.#stats.startTime,
      endTime: this.#stats.endTime || Date.now(),
      wordCount: this.#stats.wordCount
    };

    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify({
          transcript,
          metadata,
          segments: this.#transcript.final
        }, null, 2);
        
      case 'srt':
        return this.#formatAsSRT();
        
      case 'text':
      default:
        return transcript;
    }
  }

  /* ---------------------------------------------------------------- */
  /* 📊 Session Info & Statistics                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Get current session information
   */
  getSessionInfo() {
    return {
      sessionId: this.#sessionId,
      state: this.#state,
      stats: { ...this.#stats },
      isActive: this.isActive(),
      duration: this.getSessionDuration(),
      transcript: this.getTranscript()
    };
  }

  /**
   * Check if session is currently active
   */
  isActive() {
    return this.#state === SESSION_STATES.ACTIVE;
  }

  /**
   * Get session duration in milliseconds
   */
  getSessionDuration() {
    if (!this.#stats.startTime) return 0;
    const endTime = this.#stats.endTime || Date.now();
    return endTime - this.#stats.startTime;
  }

  /* ---------------------------------------------------------------- */
  /* 🔧 Internal Event Handlers                                       */
  /* ---------------------------------------------------------------- */

  #handleInterimTranscript(text, metadata) {
    this.#transcript.interim = text;
    this.#stats.interimCount++;
    
    this.#updateStats();
    
    this.emit(SESSION_EVENTS.TRANSCRIPT_INTERIM, {
      text,
      metadata,
      sessionId: this.#sessionId,
      timestamp: Date.now()
    });
  }

  #handleFinalTranscript(text, metadata) {
    // Add to final transcript segments
    this.#transcript.final.push({
      text,
      timestamp: Date.now(),
      confidence: metadata.confidence
    });

    // Update full transcript
    this.#transcript.full += (this.#transcript.full ? ' ' : '') + text;
    this.#transcript.interim = ''; // Clear interim

    // Update word count
    this.#stats.wordCount += text.split(/\s+/).filter(w => w.length > 0).length;
    
    this.#updateStats();

    this.emit(SESSION_EVENTS.TRANSCRIPT_FINAL, {
      text,
      metadata,
      sessionId: this.#sessionId,
      fullTranscript: this.#transcript.full,
      timestamp: Date.now()
    });
  }

  #handleTranscriberError(error) {
    this.#stats.errorCount++;
    this.#handleError(error, 'Transcriber error');
  }

  #handleSessionStarted() {
    // Notify plugins
    this.#plugins.forEach(plugin => {
      if (plugin.onSessionActive) {
        plugin.onSessionActive(this.getSessionInfo());
      }
    });
  }

  #handleSessionEnded(data) {
    // Notify plugins
    this.#plugins.forEach(plugin => {
      if (plugin.onSessionEnded) {
        plugin.onSessionEnded(data);
      }
    });
  }

  #handleError(error, context = 'Unknown error') {
    console.error(`[TranscriptionSessionManager] ${context}:`, error);
    
    if (this.#config.enableSounds) {
      playSound('error');
    }

    this.emit(SESSION_EVENTS.ERROR_OCCURRED, {
      error,
      context,
      sessionId: this.#sessionId,
      timestamp: Date.now(),
      state: this.#state
    });
  }

  /* ---------------------------------------------------------------- */
  /* 🛠️ Internal Utilities                                            */
  /* ---------------------------------------------------------------- */

  #setState(newState) {
    const oldState = this.#state;
    this.#state = newState;
    
    this.emit(SESSION_EVENTS.STATE_CHANGED, {
      from: oldState,
      to: newState,
      sessionId: this.#sessionId,
      timestamp: Date.now()
    });
  }

  #generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  #resetStats() {
    Object.assign(this.#stats, {
      startTime: null,
      endTime: null,
      wordCount: 0,
      interimCount: 0,
      errorCount: 0
    });
  }

  #resetTranscript() {
    this.#transcript = {
      interim: '',
      final: [],
      full: ''
    };
  }

  #updateStats() {
    if (this.#config.enableStats) {
      this.emit(SESSION_EVENTS.STATS_UPDATED, {
        stats: { ...this.#stats },
        sessionId: this.#sessionId,
        timestamp: Date.now()
      });
    }
  }

  #buildSessionSummary() {
    return {
      sessionId: this.#sessionId,
      duration: this.getSessionDuration(),
      stats: { ...this.#stats },
      transcript: this.#transcript.full,
      segments: this.#transcript.final,
      endedAt: Date.now()
    };
  }

  #formatAsSRT() {
    // Simple SRT formatting (could be enhanced)
    return this.#transcript.final
      .map((segment, index) => {
        const start = new Date(segment.timestamp - this.#stats.startTime);
        const end = new Date(segment.timestamp - this.#stats.startTime + 3000); // 3s duration
        
        return [
          index + 1,
          `${this.#formatTime(start)} --> ${this.#formatTime(end)}`,
          segment.text,
          ''
        ].join('\n');
      })
      .join('\n');
  }

  #formatTime(date) {
    const ms = date.getTime();
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = ms % 1000;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
  }

  /* ---------------------------------------------------------------- */
  /* 💾 Session Persistence                                           */
  /* ---------------------------------------------------------------- */

  async #persistSession() {
    if (!this.#config.persistSession) return;
    
    await safeStorageSet('activeSession', {
      sessionId: this.#sessionId,
      state: this.#state,
      startTime: this.#stats.startTime,
      transcript: this.#transcript
    });
  }

  async #restoreSession() {
    const saved = await safeStorageGet('activeSession');
    if (saved && saved.sessionId) {
      // Could implement session restoration logic here
      console.log('[TranscriptionSessionManager] Previous session found:', saved.sessionId);
    }
  }

  async #clearPersistedSession() {
    await safeStorageSet('activeSession', null);
  }

  #setupCleanupHandlers() {
    // Cleanup on page unload
    const cleanup = () => this.stopSession().catch(console.error);
    
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', cleanup);
      window.addEventListener('pagehide', cleanup);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 📚 Usage Examples                                                  */
/* ------------------------------------------------------------------ */

/**
 * BASIC USAGE:
 * 
 * import TranscriptionSessionManager from './transcriptionSessionManager.js';
 * 
 * const manager = new TranscriptionSessionManager({
 *   enableSounds: true,
 *   persistSession: false
 * });
 * 
 * // Register UI observer
 * manager.registerObserver({
 *   onTranscriptInterim: (data) => {
 *     document.getElementById('interim').textContent = data.text;
 *   },
 *   onTranscriptFinal: (data) => {
 *     document.getElementById('final').textContent = data.fullTranscript;
 *   },
 *   onError: (data) => {
 *     console.error('Transcription error:', data.error);
 *   }
 * });
 * 
 * // Start session
 * await manager.startSession({
 *   deepgramKey: 'YOUR_API_KEY',
 *   language: 'en-US'
 * });
 * 
 * // Later: stop session
 * const summary = await manager.stopSession();
 * console.log('Session completed:', summary);
 * 
 * 
 * PLUGIN EXAMPLE:
 * 
 * class AnalyticsPlugin extends MiniEmitter {
 *   onSessionActive(sessionInfo) {
 *     console.log('Analytics: Session started', sessionInfo);
 *   }
 *   
 *   onSessionEnded(summary) {
 *     // Send analytics data
 *     fetch('/api/analytics', {
 *       method: 'POST',
 *       body: JSON.stringify(summary)
 *     });
 *   }
 * }
 * 
 * manager.registerPlugin('analytics', new AnalyticsPlugin());
 */