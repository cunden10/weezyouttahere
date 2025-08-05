/* ======================================================================= 
 * meetingOverlay.js
 * ----------------------------------------------------------------------- 
 * Content script for meeting platform integration
 * Provides live transcription overlay for Google Meet, Zoom, Teams
 * ======================================================================= */

import { safeStorageGet, safeStorageSet } from '../modules/core/coreUtils.js';

class MeetingOverlay {
  constructor() {
    this.overlay = null;
    this.isVisible = false;
    this.isRecording = false;
    this.transcriptText = '';
    this.platform = this.detectPlatform();
    this.settings = {};
    
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.createOverlay();
    this.setupEventListeners();
    this.observePageChanges();
    
    console.log(`[MeetingOverlay] Initialized for ${this.platform}`);
  }

  detectPlatform() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('meet.google.com')) return 'google-meet';
    if (hostname.includes('zoom.us')) return 'zoom';
    if (hostname.includes('teams.microsoft.com')) return 'teams';
    
    return 'unknown';
  }

  async loadSettings() {
    this.settings = await safeStorageGet('meetingOverlaySettings') || {
      autoShow: true,
      position: 'bottom-right',
      size: 'medium',
      opacity: 0.9,
      showInterim: true
    };
  }

  createOverlay() {
    // Remove existing overlay if present
    if (this.overlay) {
      this.overlay.remove();
    }

    this.overlay = document.createElement('div');
    this.overlay.className = `meeting-overlay meeting-overlay--${this.platform}`;
    this.overlay.innerHTML = `
      <div class="meeting-overlay__header">
        <div class="meeting-overlay__title">
          <span class="meeting-overlay__icon">🎙️</span>
          <span class="meeting-overlay__text">Live Transcription</span>
        </div>
        <div class="meeting-overlay__controls">
          <button class="meeting-overlay__btn meeting-overlay__btn--record" 
                  id="overlay-record-btn" 
                  title="Start/Stop Recording">
            <span class="btn-icon">●</span>
          </button>
          <button class="meeting-overlay__btn meeting-overlay__btn--settings" 
                  id="overlay-settings-btn" 
                  title="Settings">
            <span class="btn-icon">⚙️</span>
          </button>
          <button class="meeting-overlay__btn meeting-overlay__btn--minimize" 
                  id="overlay-minimize-btn" 
                  title="Minimize">
            <span class="btn-icon">−</span>
          </button>
          <button class="meeting-overlay__btn meeting-overlay__btn--close" 
                  id="overlay-close-btn" 
                  title="Close">
            <span class="btn-icon">×</span>
          </button>
        </div>
      </div>
      <div class="meeting-overlay__content">
        <div class="meeting-overlay__status">
          <span class="status-dot" id="overlay-status-dot"></span>
          <span class="status-text" id="overlay-status-text">Ready</span>
        </div>
        <div class="meeting-overlay__transcript" id="overlay-transcript">
          <div class="transcript-placeholder">
            Click the record button to start live transcription
          </div>
        </div>
        <div class="meeting-overlay__interim" id="overlay-interim"></div>
      </div>
      <div class="meeting-overlay__footer">
        <div class="meeting-overlay__stats">
          <span id="overlay-word-count">0 words</span>
          <span id="overlay-duration">00:00</span>
        </div>
        <div class="meeting-overlay__actions">
          <button class="action-btn" id="overlay-copy-btn" title="Copy transcript">
            📋
          </button>
          <button class="action-btn" id="overlay-save-btn" title="Save to CRM">
            💾
          </button>
          <button class="action-btn" id="overlay-export-btn" title="Export">
            📤
          </button>
        </div>
      </div>
    `;

    // Apply position and styling
    this.applyOverlaySettings();
    
    // Insert into page
    document.body.appendChild(this.overlay);
    
    // Show overlay if auto-show is enabled
    if (this.settings.autoShow) {
      this.showOverlay();
    }
  }

  applyOverlaySettings() {
    if (!this.overlay) return;

    // Position
    this.overlay.className = `meeting-overlay meeting-overlay--${this.platform} meeting-overlay--${this.settings.position}`;
    
    // Size
    this.overlay.dataset.size = this.settings.size;
    
    // Opacity
    this.overlay.style.opacity = this.settings.opacity;
  }

  setupEventListeners() {
    if (!this.overlay) return;

    // Control buttons
    const recordBtn = this.overlay.querySelector('#overlay-record-btn');
    const settingsBtn = this.overlay.querySelector('#overlay-settings-btn');
    const minimizeBtn = this.overlay.querySelector('#overlay-minimize-btn');
    const closeBtn = this.overlay.querySelector('#overlay-close-btn');

    // Action buttons
    const copyBtn = this.overlay.querySelector('#overlay-copy-btn');
    const saveBtn = this.overlay.querySelector('#overlay-save-btn');
    const exportBtn = this.overlay.querySelector('#overlay-export-btn');

    recordBtn?.addEventListener('click', () => this.toggleRecording());
    settingsBtn?.addEventListener('click', () => this.openSettings());
    minimizeBtn?.addEventListener('click', () => this.toggleMinimize());
    closeBtn?.addEventListener('click', () => this.hideOverlay());

    copyBtn?.addEventListener('click', () => this.copyTranscript());
    saveBtn?.addEventListener('click', () => this.saveToCRM());
    exportBtn?.addEventListener('click', () => this.exportTranscript());

    // Make overlay draggable
    this.makeOverlayDraggable();

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyboard(e));
  }

  makeOverlayDraggable() {
    const header = this.overlay.querySelector('.meeting-overlay__header');
    let isDragging = false;
    let startX, startY, initialX, initialY;

    header.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = this.overlay.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;
      
      header.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      e.preventDefault();
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      this.overlay.style.left = `${initialX + deltaX}px`;
      this.overlay.style.top = `${initialY + deltaY}px`;
      this.overlay.style.right = 'auto';
      this.overlay.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        header.style.cursor = 'grab';
      }
    });
  }

  async toggleRecording() {
    if (this.isRecording) {
      await this.stopRecording();
    } else {
      await this.startRecording();
    }
  }

  async startRecording() {
    try {
      // Request permissions if needed
      const hasPermission = await this.checkMicrophonePermission();
      if (!hasPermission) {
        this.showError('Microphone permission required');
        return;
      }

      // Send message to background script to start recording
      const response = await chrome.runtime.sendMessage({
        action: 'START_RECORDING',
        source: 'meeting-overlay',
        platform: this.platform,
        url: window.location.href
      });

      if (response.success) {
        this.isRecording = true;
        this.updateRecordingState();
        this.updateStatus('Recording', 'recording');
      } else {
        this.showError(response.error || 'Failed to start recording');
      }
    } catch (error) {
      console.error('[MeetingOverlay] Start recording failed:', error);
      this.showError('Failed to start recording');
    }
  }

  async stopRecording() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'STOP_RECORDING',
        source: 'meeting-overlay'
      });

      if (response.success) {
        this.isRecording = false;
        this.updateRecordingState();
        this.updateStatus('Stopped', 'stopped');
      } else {
        this.showError(response.error || 'Failed to stop recording');
      }
    } catch (error) {
      console.error('[MeetingOverlay] Stop recording failed:', error);
      this.showError('Failed to stop recording');
    }
  }

  updateRecordingState() {
    const recordBtn = this.overlay.querySelector('#overlay-record-btn');
    const statusDot = this.overlay.querySelector('#overlay-status-dot');
    
    if (this.isRecording) {
      recordBtn.classList.add('recording');
      recordBtn.title = 'Stop Recording';
      statusDot.classList.add('recording');
    } else {
      recordBtn.classList.remove('recording');
      recordBtn.title = 'Start Recording';
      statusDot.classList.remove('recording');
    }
  }

  updateStatus(text, type = 'idle') {
    const statusText = this.overlay.querySelector('#overlay-status-text');
    const statusDot = this.overlay.querySelector('#overlay-status-dot');
    
    if (statusText) statusText.textContent = text;
    if (statusDot) {
      statusDot.className = `status-dot status-dot--${type}`;
    }
  }

  updateTranscript(transcript, isInterim = false) {
    const transcriptEl = this.overlay.querySelector('#overlay-transcript');
    const interimEl = this.overlay.querySelector('#overlay-interim');
    
    if (isInterim && this.settings.showInterim) {
      if (interimEl) interimEl.textContent = transcript;
    } else {
      this.transcriptText = transcript;
      if (transcriptEl) {
        transcriptEl.innerHTML = transcript || '<div class="transcript-placeholder">No transcript yet</div>';
        // Auto-scroll to bottom
        transcriptEl.scrollTop = transcriptEl.scrollHeight;
      }
      // Clear interim text
      if (interimEl) interimEl.textContent = '';
    }
  }

  updateStats(wordCount, duration) {
    const wordCountEl = this.overlay.querySelector('#overlay-word-count');
    const durationEl = this.overlay.querySelector('#overlay-duration');
    
    if (wordCountEl) wordCountEl.textContent = `${wordCount} words`;
    if (durationEl) durationEl.textContent = this.formatDuration(duration);
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  async checkMicrophonePermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      return false;
    }
  }

  showError(message) {
    this.updateStatus(`Error: ${message}`, 'error');
    
    // Show error notification
    const errorDiv = document.createElement('div');
    errorDiv.className = 'meeting-overlay__error';
    errorDiv.textContent = message;
    
    this.overlay.appendChild(errorDiv);
    
    setTimeout(() => {
      errorDiv.remove();
    }, 3000);
  }

  async copyTranscript() {
    if (!this.transcriptText) {
      this.showError('No transcript to copy');
      return;
    }

    try {
      await navigator.clipboard.writeText(this.transcriptText);
      this.updateStatus('Copied!', 'success');
      setTimeout(() => this.updateStatus('Ready'), 2000);
    } catch (error) {
      this.showError('Failed to copy transcript');
    }
  }

  async saveToCRM() {
    if (!this.transcriptText) {
      this.showError('No transcript to save');
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'SAVE_TO_CRM',
        transcript: this.transcriptText,
        platform: this.platform,
        url: window.location.href,
        timestamp: Date.now()
      });

      if (response.success) {
        this.updateStatus('Saved!', 'success');
        setTimeout(() => this.updateStatus('Ready'), 2000);
      } else {
        this.showError('Failed to save to CRM');
      }
    } catch (error) {
      this.showError('Failed to save to CRM');
    }
  }

  async exportTranscript() {
    if (!this.transcriptText) {
      this.showError('No transcript to export');
      return;
    }

    // Create download
    const blob = new Blob([this.transcriptText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${this.platform}-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.updateStatus('Exported!', 'success');
    setTimeout(() => this.updateStatus('Ready'), 2000);
  }

  openSettings() {
    // Open extension settings page
    chrome.runtime.sendMessage({
      action: 'OPEN_SETTINGS',
      source: 'meeting-overlay'
    });
  }

  showOverlay() {
    if (this.overlay) {
      this.overlay.classList.add('visible');
      this.isVisible = true;
    }
  }

  hideOverlay() {
    if (this.overlay) {
      this.overlay.classList.remove('visible');
      this.isVisible = false;
    }
  }

  toggleMinimize() {
    if (this.overlay) {
      this.overlay.classList.toggle('minimized');
    }
  }

  observePageChanges() {
    // Watch for page navigation in SPAs
    let lastUrl = window.location.href;
    
    const observer = new MutationObserver(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        // Reinitialize for new page
        setTimeout(() => this.handlePageChange(), 1000);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  handlePageChange() {
    // Check if we're still in a meeting
    const inMeeting = this.detectMeetingContext();
    
    if (inMeeting && this.settings.autoShow) {
      this.showOverlay();
    } else if (!inMeeting) {
      this.hideOverlay();
    }
  }

  detectMeetingContext() {
    switch (this.platform) {
      case 'google-meet':
        return window.location.pathname.startsWith('/') && 
               document.querySelector('[data-meeting-title]') !== null;
      case 'zoom':
        return document.querySelector('.meeting-client-view') !== null ||
               document.querySelector('.webclient') !== null;
      case 'teams':
        return document.querySelector('[data-tid="meeting-canvas"]') !== null;
      default:
        return true;
    }
  }

  handleMessage(message, sender, sendResponse) {
    switch (message.action) {
      case 'UPDATE_TRANSCRIPT':
        this.updateTranscript(message.transcript, message.isInterim);
        break;
        
      case 'UPDATE_STATS':
        this.updateStats(message.wordCount, message.duration);
        break;
        
      case 'RECORDING_STATE_CHANGED':
        this.isRecording = message.isRecording;
        this.updateRecordingState();
        this.updateStatus(message.isRecording ? 'Recording' : 'Ready');
        break;
        
      case 'SHOW_OVERLAY':
        this.showOverlay();
        break;
        
      case 'HIDE_OVERLAY':
        this.hideOverlay();
        break;
        
      default:
        console.log('[MeetingOverlay] Unknown message:', message);
    }
    
    sendResponse({ success: true });
  }

  handleKeyboard(event) {
    // Ctrl+Shift+R: Toggle recording
    if (event.ctrlKey && event.shiftKey && event.key === 'R') {
      event.preventDefault();
      this.toggleRecording();
    }
    
    // Ctrl+Shift+H: Toggle overlay visibility
    if (event.ctrlKey && event.shiftKey && event.key === 'H') {
      event.preventDefault();
      if (this.isVisible) {
        this.hideOverlay();
      } else {
        this.showOverlay();
      }
    }
  }

  destroy() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }
}

// Initialize overlay when page is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new MeetingOverlay();
  });
} else {
  new MeetingOverlay();
}