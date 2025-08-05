/* =======================================================================
 * transcriptionDashboard.js
 * -----------------------------------------------------------------------
 * Frontend controller for the live transcription dashboard UI.
 * Orchestrates user interactions, transcript updates, and state changes
 * between the UI and the backend transcription session manager.
 *
 * Key Responsibilities:
 * - Handle user control interactions (start/stop/pause recording)
 * - Update transcript display in real-time
 * - Manage status indicators and UI state
 * - Provide user feedback via notifications and audio cues
 * - Handle settings and configuration changes
 * ===================================================================== */

import TranscriptionSessionManager, { SESSION_STATES, SESSION_EVENTS } from './transcriptionSessionManager.js';
import { showToast, showStatusBanner, clearAllNotifications } from './notificationController.js';
import { playNotificationSound } from './audioNotificationController.js';
import { safeStorageGet, safeStorageSet, formatTime } from './coreUtils.js';

/* ------------------------------------------------------------------ */
/* 🎛️ Dashboard Controller Class                                      */
/* ------------------------------------------------------------------ */

class TranscriptionDashboardController {
  constructor() {
    this.sessionManager = null;
    this.elements = {};
    this.currentSession = null;
    this.updateInterval = null;
    this.settings = {
      deepgramKey: '',
      language: 'en-US',
      model: 'nova-2',
      enablePunctuation: true,
      enableInterimResults: true
    };
    
    this.init();
  }

  /**
   * Initialize the dashboard controller
   */
  async init() {
    this.cacheDOMElements();
    this.loadSettings();
    this.setupEventListeners();
    this.setupSessionManager();
    
    // Initial UI state
    this.updateUIState(SESSION_STATES.IDLE);
    this.checkPermissions();
    
    console.log('[Dashboard] Initialized successfully');
  }

  /**
   * Cache frequently accessed DOM elements
   */
  cacheDOMElements() {
    this.elements = {
      // Status indicators
      recordingStatus: document.getElementById('recording-status'),
      micStatus: document.getElementById('mic-status'),
      connectionStatus: document.getElementById('connection-status'),
      
      // Transcript areas
      liveTranscript: document.getElementById('live-transcript'),
      interimTranscript: document.getElementById('interim-transcript'),
      
      // Stats
      wordCount: document.getElementById('word-count'),
      sessionDuration: document.getElementById('session-duration'),
      
      // Primary controls
      startBtn: document.getElementById('start-recording-btn'),
      stopBtn: document.getElementById('stop-recording-btn'),
      pauseBtn: document.getElementById('pause-recording-btn'),
      
      // Secondary controls
      copyBtn: document.getElementById('copy-transcript-btn'),
      clearBtn: document.getElementById('clear-transcript-btn'),
      exportBtn: document.getElementById('export-transcript-btn'),
      settingsBtn: document.getElementById('settings-btn'),
      
      // Settings panel
      settingsPanel: document.getElementById('settings-panel'),
      languageSelect: document.getElementById('language-select'),
      modelSelect: document.getElementById('model-select'),
      punctuationToggle: document.getElementById('punctuation-toggle'),
      interimResultsToggle: document.getElementById('interim-results-toggle'),
      saveSettingsBtn: document.getElementById('save-settings-btn'),
      cancelSettingsBtn: document.getElementById('cancel-settings-btn')
    };
  }

  /**
   * Setup event listeners for all UI interactions
   */
  setupEventListeners() {
    // Primary recording controls
    this.elements.startBtn.addEventListener('click', () => this.handleStartRecording());
    this.elements.stopBtn.addEventListener('click', () => this.handleStopRecording());
    this.elements.pauseBtn.addEventListener('click', () => this.handlePauseRecording());
    
    // Secondary controls
    this.elements.copyBtn.addEventListener('click', () => this.handleCopyTranscript());
    this.elements.clearBtn.addEventListener('click', () => this.handleClearTranscript());
    this.elements.exportBtn.addEventListener('click', () => this.handleExportTranscript());
    this.elements.settingsBtn.addEventListener('click', () => this.toggleSettingsPanel());
    
    // Settings panel
    this.elements.saveSettingsBtn.addEventListener('click', () => this.handleSaveSettings());
    this.elements.cancelSettingsBtn.addEventListener('click', () => this.hideSettingsPanel());
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    
    // Window cleanup
    window.addEventListener('beforeunload', () => this.cleanup());
  }

  /**
   * Setup and configure the transcription session manager
   */
  setupSessionManager() {
    this.sessionManager = new TranscriptionSessionManager({
      enableSounds: true,
      enableStats: true,
      persistSession: true
    });
    
    // Register as observer for session events
    this.sessionManager.registerObserver({
      onStateChanged: (data) => this.handleStateChange(data),
      onTranscriptInterim: (data) => this.handleInterimTranscript(data),
      onTranscriptFinal: (data) => this.handleFinalTranscript(data),
      onError: (data) => this.handleError(data),
      onStatsUpdated: (data) => this.updateStats(data),
      onSessionStarted: (data) => this.handleSessionStarted(data),
      onSessionEnded: (data) => this.handleSessionEnded(data)
    });
  }

  /* ---------------------------------------------------------------- */
  /* 🎬 Recording Control Handlers                                    */
  /* ---------------------------------------------------------------- */

  async handleStartRecording() {
    if (!this.settings.deepgramKey) {
      showToast('Please configure your Deepgram API key in settings', { type: 'error' });
      this.toggleSettingsPanel();
      return;
    }

    try {
      this.elements.startBtn.disabled = true;
      this.elements.startBtn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">Starting...</span>';
      
      this.currentSession = await this.sessionManager.startSession({
        deepgramKey: this.settings.deepgramKey,
        language: this.settings.language,
        model: this.settings.model,
        enablePunctuation: this.settings.enablePunctuation,
        enableInterimResults: this.settings.enableInterimResults
      });
      
      playNotificationSound('start');
      showToast('Recording started', { type: 'success' });
      
    } catch (error) {
      console.error('[Dashboard] Failed to start recording:', error);
      playNotificationSound('error');
      showToast(`Failed to start recording: ${error.message}`, { type: 'error' });
      this.updateUIState(SESSION_STATES.IDLE);
    }
  }

  async handleStopRecording() {
    try {
      this.elements.stopBtn.disabled = true;
      
      const summary = await this.sessionManager.stopSession();
      
      playNotificationSound('stop');
      showToast('Recording stopped', { type: 'info' });
      
      if (summary && summary.stats.wordCount > 0) {
        showToast(`Session complete: ${summary.stats.wordCount} words transcribed`, { type: 'success' });
      }
      
    } catch (error) {
      console.error('[Dashboard] Failed to stop recording:', error);
      showToast(`Error stopping recording: ${error.message}`, { type: 'error' });
    }
  }

  handlePauseRecording() {
    if (this.sessionManager.isActive()) {
      this.sessionManager.pauseSession();
      this.elements.pauseBtn.innerHTML = '<span class="btn-icon">▶️</span><span class="btn-text">Resume</span>';
      showToast('Recording paused', { type: 'info' });
    } else {
      this.sessionManager.resumeSession();
      this.elements.pauseBtn.innerHTML = '<span class="btn-icon">⏸️</span><span class="btn-text">Pause</span>';
      showToast('Recording resumed', { type: 'info' });
    }
  }

  /* ---------------------------------------------------------------- */
  /* 📝 Transcript Management                                         */
  /* ---------------------------------------------------------------- */

  async handleCopyTranscript() {
    const transcript = this.sessionManager.getCurrentTranscript();
    
    if (!transcript.trim()) {
      showToast('No transcript to copy', { type: 'warning' });
      return;
    }

    try {
      await navigator.clipboard.writeText(transcript);
      playNotificationSound('chime');
      showToast('Transcript copied to clipboard', { type: 'success' });
    } catch (error) {
      console.error('[Dashboard] Failed to copy transcript:', error);
      showToast('Failed to copy transcript', { type: 'error' });
    }
  }

  handleClearTranscript() {
    if (!this.sessionManager.getCurrentTranscript().trim()) {
      showToast('No transcript to clear', { type: 'warning' });
      return;
    }

    if (confirm('Are you sure you want to clear the current transcript?')) {
      this.sessionManager.clearTranscript();
      this.elements.liveTranscript.innerHTML = '<div class="transcript-placeholder">Transcript cleared</div>';
      this.elements.interimTranscript.textContent = '';
      showToast('Transcript cleared', { type: 'info' });
    }
  }

  handleExportTranscript() {
    const sessionInfo = this.sessionManager.getSessionInfo();
    const transcript = this.sessionManager.getCurrentTranscript();
    
    if (!transcript.trim()) {
      showToast('No transcript to export', { type: 'warning' });
      return;
    }

    const exportData = this.sessionManager.exportTranscript('json');
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Transcript exported successfully', { type: 'success' });
  }

  /* ---------------------------------------------------------------- */
  /* 🎤 Session Event Handlers                                        */
  /* ---------------------------------------------------------------- */

  handleStateChange(data) {
    console.log('[Dashboard] State changed:', data.from, '→', data.to);
    this.updateUIState(data.to);
  }

  handleInterimTranscript(data) {
    if (this.settings.enableInterimResults) {
      this.elements.interimTranscript.textContent = data.text;
    }
  }

  handleFinalTranscript(data) {
    // Clear interim text
    this.elements.interimTranscript.textContent = '';
    
    // Update main transcript display
    this.updateTranscriptDisplay(data.fullTranscript);
  }

  handleError(data) {
    console.error('[Dashboard] Session error:', data.error);
    playNotificationSound('error');
    showStatusBanner(`Transcription error: ${data.error.message}`, { type: 'error' });
  }

  handleSessionStarted(data) {
    console.log('[Dashboard] Session started:', data.sessionId);
    this.startStatsUpdater();
  }

  handleSessionEnded(data) {
    console.log('[Dashboard] Session ended:', data);
    this.stopStatsUpdater();
  }

  /* ---------------------------------------------------------------- */
  /* 🎨 UI State Management                                           */
  /* ---------------------------------------------------------------- */

  updateUIState(state) {
    // Update recording status indicator
    this.elements.recordingStatus.dataset.status = state;
    
    // Update button states based on session state
    switch (state) {
      case SESSION_STATES.IDLE:
        this.elements.startBtn.disabled = false;
        this.elements.startBtn.innerHTML = '<span class="btn-icon">🎙️</span><span class="btn-text">Start Recording</span>';
        this.elements.stopBtn.disabled = true;
        this.elements.pauseBtn.disabled = true;
        break;
        
      case SESSION_STATES.INITIALIZING:
        this.elements.startBtn.disabled = true;
        this.elements.stopBtn.disabled = true;
        this.elements.pauseBtn.disabled = true;
        break;
        
      case SESSION_STATES.ACTIVE:
        this.elements.startBtn.disabled = true;
        this.elements.stopBtn.disabled = false;
        this.elements.pauseBtn.disabled = false;
        this.elements.pauseBtn.innerHTML = '<span class="btn-icon">⏸️</span><span class="btn-text">Pause</span>';
        break;
        
      case SESSION_STATES.PAUSED:
        this.elements.pauseBtn.innerHTML = '<span class="btn-icon">▶️</span><span class="btn-text">Resume</span>';
        break;
        
      case SESSION_STATES.ERROR:
        this.elements.startBtn.disabled = false;
        this.elements.startBtn.innerHTML = '<span class="btn-icon">🎙️</span><span class="btn-text">Start Recording</span>';
        this.elements.stopBtn.disabled = true;
        this.elements.pauseBtn.disabled = true;
        break;
    }
  }

  updateTranscriptDisplay(fullTranscript) {
    if (fullTranscript.trim()) {
      this.elements.liveTranscript.textContent = fullTranscript;
      this.elements.liveTranscript.scrollTop = this.elements.liveTranscript.scrollHeight;
    } else {
      this.elements.liveTranscript.innerHTML = '<div class="transcript-placeholder">Listening...</div>';
    }
  }

  updateStats(data) {
    if (data.stats.wordCount !== undefined) {
      this.elements.wordCount.textContent = `${data.stats.wordCount} words`;
    }
  }

  /* ---------------------------------------------------------------- */
  /* ⚙️ Settings Management                                           */
  /* ---------------------------------------------------------------- */

  async loadSettings() {
    const saved = await safeStorageGet('dashboardSettings', this.settings);
    Object.assign(this.settings, saved);
    
    // Update UI with loaded settings
    this.elements.languageSelect.value = this.settings.language;
    this.elements.modelSelect.value = this.settings.model;
    this.elements.punctuationToggle.checked = this.settings.enablePunctuation;
    this.elements.interimResultsToggle.checked = this.settings.enableInterimResults;
  }

  async handleSaveSettings() {
    // Read settings from UI
    this.settings.language = this.elements.languageSelect.value;
    this.settings.model = this.elements.modelSelect.value;
    this.settings.enablePunctuation = this.elements.punctuationToggle.checked;
    this.settings.enableInterimResults = this.elements.interimResultsToggle.checked;
    
    // Save to storage
    await safeStorageSet('dashboardSettings', this.settings);
    
    this.hideSettingsPanel();
    showToast('Settings saved successfully', { type: 'success' });
    playNotificationSound('chime');
  }

  toggleSettingsPanel() {
    if (this.elements.settingsPanel.hidden) {
      this.showSettingsPanel();
    } else {
      this.hideSettingsPanel();
    }
  }

  showSettingsPanel() {
    this.elements.settingsPanel.hidden = false;
    this.elements.settingsPanel.scrollIntoView({ behavior: 'smooth' });
  }

  hideSettingsPanel() {
    this.elements.settingsPanel.hidden = true;
  }

  /* ---------------------------------------------------------------- */
  /* 🔐 Permission Checks                                             */
  /* ---------------------------------------------------------------- */

  async checkPermissions() {
    try {
      // Check microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      this.elements.micStatus.dataset.status = 'granted';
    } catch (error) {
      this.elements.micStatus.dataset.status = 'denied';
      showStatusBanner('Microphone permission required for transcription', { type: 'warning' });
    }
  }

  /* ---------------------------------------------------------------- */
  /* ⏱️ Stats & Updates                                               */
  /* ---------------------------------------------------------------- */

  startStatsUpdater() {
    this.updateInterval = setInterval(() => {
      if (this.sessionManager && this.sessionManager.isActive()) {
        const duration = this.sessionManager.getSessionDuration();
        this.elements.sessionDuration.textContent = formatTime(duration);
      }
    }, 1000);
  }

  stopStatsUpdater() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  /* ---------------------------------------------------------------- */
  /* ⌨️ Keyboard Shortcuts                                            */
  /* ---------------------------------------------------------------- */

  handleKeyboardShortcuts(event) {
    // Only handle shortcuts when not in input fields
    if (event.target.matches('input, textarea, select')) return;
    
    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case 'r':
          event.preventDefault();
          if (this.sessionManager.isActive()) {
            this.handleStopRecording();
          } else {
            this.handleStartRecording();
          }
          break;
          
        case 'c':
          event.preventDefault();
          this.handleCopyTranscript();
          break;
          
        case ',':
          event.preventDefault();
          this.toggleSettingsPanel();
          break;
      }
    }
    
    // Space bar to pause/resume
    if (event.code === 'Space' && this.sessionManager.isActive()) {
      event.preventDefault();
      this.handlePauseRecording();
    }
  }

  /* ---------------------------------------------------------------- */
  /* 🧹 Cleanup                                                       */
  /* ---------------------------------------------------------------- */

  async cleanup() {
    this.stopStatsUpdater();
    if (this.sessionManager) {
      await this.sessionManager.cleanup();
    }
    clearAllNotifications();
  }
}

/* ------------------------------------------------------------------ */
/* 🚀 Initialize Dashboard                                            */
/* ------------------------------------------------------------------ */

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new TranscriptionDashboardController());
} else {
  new TranscriptionDashboardController();
}

/* ------------------------------------------------------------------ */
/* 📚 Future Expansion Notes                                          */
/* ------------------------------------------------------------------ */

/**
 * FUTURE ENHANCEMENTS:
 * 
 * 1. Search & Highlights:
 *    - Add search input to filter/highlight transcript content
 *    - Implement keyword highlighting with configurable colors
 *    - Add jump-to-word functionality
 * 
 * 2. Advanced Export:
 *    - Multiple export formats (SRT, VTT, plain text, Word)
 *    - Email/share functionality
 *    - Cloud storage integration
 * 
 * 3. Real-time Analytics:
 *    - Speaking rate (WPM) display
 *    - Confidence score visualization
 *    - Language detection indicators
 * 
 * 4. Collaboration Features:
 *    - Multi-speaker detection and labeling
 *    - Comment/note system on transcript segments
 *    - Real-time sharing with other users
 * 
 * 5. Accessibility:
 *    - High contrast mode toggle
 *    - Font size controls
 *    - Screen reader optimizations
 *    - Voice commands for controls
 */