/* ======================================================================= 
 * Popup Controller
 * ----------------------------------------------------------------------- 
 * JavaScript controller for the browser extension popup interface.
 * Handles quick actions, status display, and recent sessions.
 * ===================================================================== */

import { safeStorageGet, safeStorageSet } from '../core/coreUtils.js';
import { playNotificationSound } from '../audio/audioNotificationController.js';

class PopupController {
  constructor() {
    this.elements = {};
    this.currentStatus = 'idle';
    this.recentSessions = [];
    
    this.init();
  }

  /**
   * Initialize the popup controller
   */
  async init() {
    this.cacheDOMElements();
    this.setupEventListeners();
    await this.loadRecentSessions();
    await this.updateStatus();
    await this.loadQuickSettings();
    
    console.log('[Popup] Initialized successfully');
  }

  /**
   * Cache frequently accessed DOM elements
   */
  cacheDOMElements() {
    this.elements = {
      // Status elements
      statusDot: document.querySelector('.status-dot'),
      statusText: document.querySelector('.popup-status span'),
      
      // Action buttons
      startRecordingBtn: document.getElementById('start-recording'),
      stopRecordingBtn: document.getElementById('stop-recording'),
      openDashboardBtn: document.getElementById('open-dashboard'),
      openSettingsBtn: document.getElementById('open-settings'),
      
      // Sessions
      sessionsList: document.querySelector('.sessions-list'),
      noSessionsMsg: document.querySelector('.no-sessions'),
      
      // Quick settings
      languageSelect: document.getElementById('quick-language'),
      autoStartToggle: document.getElementById('quick-auto-start'),
      
      // Footer links
      settingsLink: document.querySelector('.footer-link[href*="settings"]'),
      helpLink: document.querySelector('.footer-link[href*="help"]')
    };
  }

  /**
   * Setup event listeners for all interactive elements
   */
  setupEventListeners() {
    // Action buttons
    if (this.elements.startRecordingBtn) {
      this.elements.startRecordingBtn.addEventListener('click', () => this.handleStartRecording());
    }
    
    if (this.elements.stopRecordingBtn) {
      this.elements.stopRecordingBtn.addEventListener('click', () => this.handleStopRecording());
    }
    
    if (this.elements.openDashboardBtn) {
      this.elements.openDashboardBtn.addEventListener('click', () => this.handleOpenDashboard());
    }
    
    if (this.elements.openSettingsBtn) {
      this.elements.openSettingsBtn.addEventListener('click', () => this.handleOpenSettings());
    }

    // Quick settings
    if (this.elements.languageSelect) {
      this.elements.languageSelect.addEventListener('change', (e) => this.handleLanguageChange(e));
    }
    
    if (this.elements.autoStartToggle) {
      this.elements.autoStartToggle.addEventListener('change', (e) => this.handleAutoStartToggle(e));
    }

    // Footer links
    if (this.elements.settingsLink) {
      this.elements.settingsLink.addEventListener('click', (e) => this.handleOpenSettings(e));
    }
    
    if (this.elements.helpLink) {
      this.elements.helpLink.addEventListener('click', (e) => this.handleOpenHelp(e));
    }

    // Listen for extension messages
    if (chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
      });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
  }

  /**
   * Handle recording start action
   */
  async handleStartRecording() {
    try {
      this.setButtonLoading(this.elements.startRecordingBtn, true);
      
      // Send message to background script to start recording
      const response = await chrome.runtime.sendMessage({
        type: 'START_RECORDING',
        timestamp: Date.now()
      });

      if (response.success) {
        await playNotificationSound('start');
        this.updateStatus('recording');
        this.showFeedback('Recording started', 'success');
      } else {
        throw new Error(response.error || 'Failed to start recording');
      }
    } catch (error) {
      console.error('[Popup] Failed to start recording:', error);
      await playNotificationSound('error');
      this.showFeedback('Failed to start recording', 'error');
    } finally {
      this.setButtonLoading(this.elements.startRecordingBtn, false);
    }
  }

  /**
   * Handle recording stop action
   */
  async handleStopRecording() {
    try {
      this.setButtonLoading(this.elements.stopRecordingBtn, true);
      
      // Send message to background script to stop recording
      const response = await chrome.runtime.sendMessage({
        type: 'STOP_RECORDING',
        timestamp: Date.now()
      });

      if (response.success) {
        await playNotificationSound('stop');
        this.updateStatus('idle');
        this.showFeedback('Recording stopped', 'success');
        await this.loadRecentSessions(); // Refresh sessions
      } else {
        throw new Error(response.error || 'Failed to stop recording');
      }
    } catch (error) {
      console.error('[Popup] Failed to stop recording:', error);
      await playNotificationSound('error');
      this.showFeedback('Failed to stop recording', 'error');
    } finally {
      this.setButtonLoading(this.elements.stopRecordingBtn, false);
    }
  }

  /**
   * Handle opening the dashboard
   */
  async handleOpenDashboard(event) {
    if (event) event.preventDefault();
    
    try {
      await chrome.tabs.create({
        url: chrome.runtime.getURL('src/pages/dashboard.html')
      });
      window.close();
    } catch (error) {
      console.error('[Popup] Failed to open dashboard:', error);
      this.showFeedback('Failed to open dashboard', 'error');
    }
  }

  /**
   * Handle opening settings
   */
  async handleOpenSettings(event) {
    if (event) event.preventDefault();
    
    try {
      await chrome.tabs.create({
        url: chrome.runtime.getURL('src/pages/settings.html')
      });
      window.close();
    } catch (error) {
      console.error('[Popup] Failed to open settings:', error);
      this.showFeedback('Failed to open settings', 'error');
    }
  }

  /**
   * Handle opening help
   */
  async handleOpenHelp(event) {
    if (event) event.preventDefault();
    
    try {
      await chrome.tabs.create({
        url: chrome.runtime.getURL('src/pages/help.html')
      });
      window.close();
    } catch (error) {
      console.error('[Popup] Failed to open help:', error);
      this.showFeedback('Failed to open help', 'error');
    }
  }

  /**
   * Handle language change
   */
  async handleLanguageChange(event) {
    const language = event.target.value;
    
    try {
      await safeStorageSet('quickSettings', {
        ...await safeStorageGet('quickSettings', {}),
        language
      });
      
      // Notify background script of language change
      chrome.runtime.sendMessage({
        type: 'SETTING_CHANGED',
        key: 'language',
        value: language
      });
      
      this.showFeedback('Language updated', 'success');
    } catch (error) {
      console.error('[Popup] Failed to update language:', error);
      this.showFeedback('Failed to update language', 'error');
    }
  }

  /**
   * Handle auto-start toggle
   */
  async handleAutoStartToggle(event) {
    const autoStart = event.target.checked;
    
    try {
      await safeStorageSet('quickSettings', {
        ...await safeStorageGet('quickSettings', {}),
        autoStart
      });
      
      // Notify background script of auto-start change
      chrome.runtime.sendMessage({
        type: 'SETTING_CHANGED',
        key: 'autoStart',
        value: autoStart
      });
      
      this.showFeedback(`Auto-start ${autoStart ? 'enabled' : 'disabled'}`, 'success');
    } catch (error) {
      console.error('[Popup] Failed to update auto-start:', error);
      this.showFeedback('Failed to update auto-start', 'error');
    }
  }

  /**
   * Load recent transcription sessions
   */
  async loadRecentSessions() {
    try {
      const sessions = await safeStorageGet('recentSessions', []);
      this.recentSessions = sessions.slice(0, 3); // Show only last 3 sessions
      
      this.renderSessions();
    } catch (error) {
      console.error('[Popup] Failed to load recent sessions:', error);
    }
  }

  /**
   * Render the recent sessions list
   */
  renderSessions() {
    if (!this.elements.sessionsList) return;
    
    if (this.recentSessions.length === 0) {
      this.elements.sessionsList.style.display = 'none';
      if (this.elements.noSessionsMsg) {
        this.elements.noSessionsMsg.style.display = 'block';
      }
      return;
    }
    
    this.elements.sessionsList.style.display = 'flex';
    if (this.elements.noSessionsMsg) {
      this.elements.noSessionsMsg.style.display = 'none';
    }
    
    this.elements.sessionsList.innerHTML = this.recentSessions.map(session => `
      <div class="session-item" data-session-id="${session.id}">
        <div class="session-meta">
          <span class="session-date">${this.formatDate(session.startTime)}</span>
          <span class="session-duration">${this.formatDuration(session.duration)}</span>
        </div>
        <div class="session-preview">${this.truncateText(session.transcript, 100)}</div>
      </div>
    `).join('');
    
    // Add click handlers to session items
    this.elements.sessionsList.querySelectorAll('.session-item').forEach(item => {
      item.addEventListener('click', () => {
        const sessionId = item.dataset.sessionId;
        this.handleSessionClick(sessionId);
      });
    });
  }

  /**
   * Handle session item click
   */
  async handleSessionClick(sessionId) {
    try {
      // Open dashboard with specific session
      await chrome.tabs.create({
        url: chrome.runtime.getURL(`src/pages/dashboard.html?session=${sessionId}`)
      });
      window.close();
    } catch (error) {
      console.error('[Popup] Failed to open session:', error);
      this.showFeedback('Failed to open session', 'error');
    }
  }

  /**
   * Update the status display
   */
  async updateStatus(newStatus = null) {
    if (newStatus) {
      this.currentStatus = newStatus;
    } else {
      // Get status from background script
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_STATUS'
        });
        this.currentStatus = response.status || 'idle';
      } catch (error) {
        console.error('[Popup] Failed to get status:', error);
        this.currentStatus = 'error';
      }
    }
    
    // Update status indicator
    if (this.elements.statusDot) {
      this.elements.statusDot.className = `status-dot ${this.currentStatus}`;
    }
    
    if (this.elements.statusText) {
      this.elements.statusText.textContent = this.getStatusText(this.currentStatus);
    }
    
    // Update button states
    this.updateButtonStates();
  }

  /**
   * Update button enabled/disabled states based on current status
   */
  updateButtonStates() {
    const isRecording = this.currentStatus === 'recording';
    
    if (this.elements.startRecordingBtn) {
      this.elements.startRecordingBtn.disabled = isRecording;
    }
    
    if (this.elements.stopRecordingBtn) {
      this.elements.stopRecordingBtn.disabled = !isRecording;
    }
  }

  /**
   * Load quick settings
   */
  async loadQuickSettings() {
    try {
      const quickSettings = await safeStorageGet('quickSettings', {});
      
      if (this.elements.languageSelect && quickSettings.language) {
        this.elements.languageSelect.value = quickSettings.language;
      }
      
      if (this.elements.autoStartToggle && quickSettings.autoStart !== undefined) {
        this.elements.autoStartToggle.checked = quickSettings.autoStart;
      }
    } catch (error) {
      console.error('[Popup] Failed to load quick settings:', error);
    }
  }

  /**
   * Handle messages from other parts of the extension
   */
  handleMessage(message, sender, sendResponse) {
    switch (message.type) {
      case 'STATUS_CHANGED':
        this.updateStatus(message.status);
        break;
        
      case 'SESSION_COMPLETED':
        this.loadRecentSessions();
        break;
        
      default:
        // Unknown message type
        break;
    }
  }

  /**
   * Handle keyboard shortcuts
   */
  handleKeyboardShortcuts(event) {
    // Space bar to toggle recording
    if (event.code === 'Space' && !event.target.matches('input, select, textarea')) {
      event.preventDefault();
      if (this.currentStatus === 'recording') {
        this.handleStopRecording();
      } else {
        this.handleStartRecording();
      }
    }
    
    // Escape to close popup
    if (event.code === 'Escape') {
      window.close();
    }
    
    // Enter on focused elements
    if (event.code === 'Enter' && event.target.matches('.session-item')) {
      event.target.click();
    }
  }

  /**
   * Show user feedback
   */
  showFeedback(message, type = 'info') {
    // Create temporary feedback element
    const feedback = document.createElement('div');
    feedback.className = `popup-feedback ${type}`;
    feedback.textContent = message;
    feedback.style.cssText = `
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      background: ${type === 'error' ? '#dc2626' : type === 'success' ? '#059669' : '#2563eb'};
      color: white;
      padding: 0.5rem 1rem;
      border-radius: 0.25rem;
      font-size: 0.75rem;
      z-index: 10000;
      animation: slideInDown 200ms ease-out;
    `;
    
    document.body.appendChild(feedback);
    
    // Remove after 2 seconds
    setTimeout(() => {
      feedback.style.animation = 'slideOutUp 200ms ease-in';
      setTimeout(() => feedback.remove(), 200);
    }, 2000);
  }

  /**
   * Set button loading state
   */
  setButtonLoading(button, loading) {
    if (!button) return;
    
    button.disabled = loading;
    button.classList.toggle('loading', loading);
  }

  /**
   * Get human-readable status text
   */
  getStatusText(status) {
    switch (status) {
      case 'recording': return 'Recording active';
      case 'idle': return 'Ready to record';
      case 'error': return 'Connection error';
      case 'paused': return 'Recording paused';
      default: return 'Unknown status';
    }
  }

  /**
   * Format date for display
   */
  formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  /**
   * Format duration for display
   */
  formatDuration(durationMs) {
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
    }
  }

  /**
   * Truncate text to specified length
   */
  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + '...';
  }
}

// Initialize popup when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new PopupController());
} else {
  new PopupController();
}