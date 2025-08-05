/* =======================================================================
 * settings.js
 * -----------------------------------------------------------------------
 * Settings page controller for the Live Transcription Extension.
 * Manages user preferences, validation, and storage operations.
 *
 * DEVELOPER NOTE: API Key Management
 * ----------------------------------
 * The Deepgram API key is NOT user-configurable and is managed by:
 * 1. Build-time injection via environment variables
 * 2. Runtime fetch from secured backend endpoint  
 * 3. Bundled in extension with obfuscation/encryption
 * 
 * Users never see, enter, or modify the API key through this interface.
 * This ensures security and prevents key exposure or misuse.
 * ===================================================================== */

import { safeStorageGet, safeStorageSet } from '../core/coreUtils.js';
import { showToast } from './notificationController.js';
import { playNotificationSound } from '../audio/audioNotificationController.js';

/* ------------------------------------------------------------------ */
/* 🔧 Default Settings Configuration                                  */
/* ------------------------------------------------------------------ */

const DEFAULT_SETTINGS = {
  // Transcription settings
  language: 'en-US',
  model: 'nova-2',
  enablePunctuation: true,
  enableInterimResults: true,
  
  // Notification settings
  toastNotificationsEnabled: true,
  soundFeedbackEnabled: true,
  browserNotificationsEnabled: false,
  
  // Behavior settings
  autoStartEnabled: false,
  autoSaveEnabled: true,
  autoStopDuration: 0, // 0 = never
  
  // Appearance & privacy
  uiTheme: 'auto',
  analyticsEnabled: true,
  errorReportingEnabled: true
};

const STORAGE_KEY = 'extensionSettings';

/* ------------------------------------------------------------------ */
/* 🎛️ Settings Page Controller                                        */
/* ------------------------------------------------------------------ */

class SettingsPageController {
  constructor() {
    this.currentSettings = { ...DEFAULT_SETTINGS };
    this.elements = {};
    this.hasUnsavedChanges = false;
    
    this.init();
  }

  /**
   * Initialize the settings page
   */
  async init() {
    this.cacheDOMElements();
    await this.loadSettings();
    this.populateUI();
    this.setupEventListeners();
    this.setupChangeTracking();
    
    console.log('[Settings] Page initialized');
  }

  /**
   * Cache frequently accessed DOM elements
   */
  cacheDOMElements() {
    this.elements = {
      // Transcription controls
      transcriptLanguage: document.getElementById('transcript-language'),
      transcriptModel: document.getElementById('transcript-model'),
      punctuationEnabled: document.getElementById('punctuation-enabled'),
      interimResultsEnabled: document.getElementById('interim-results-enabled'),
      
      // Notification controls
      toastNotificationsEnabled: document.getElementById('toast-notifications-enabled'),
      soundFeedbackEnabled: document.getElementById('sound-feedback-enabled'),
      browserNotificationsEnabled: document.getElementById('browser-notifications-enabled'),
      
      // Behavior controls
      autoStartEnabled: document.getElementById('auto-start-enabled'),
      autoSaveEnabled: document.getElementById('auto-save-enabled'),
      autoStopDuration: document.getElementById('auto-stop-duration'),
      
      // Appearance & privacy
      uiTheme: document.getElementById('ui-theme'),
      analyticsEnabled: document.getElementById('analytics-enabled'),
      errorReportingEnabled: document.getElementById('error-reporting-enabled'),
      
      // Action buttons
      saveBtn: document.getElementById('save-settings-btn'),
      resetBtn: document.getElementById('reset-settings-btn'),
      exportBtn: document.getElementById('export-settings-btn'),
      
      // Feedback area
      feedback: document.getElementById('settings-feedback')
    };
  }

  /**
   * Load settings from storage
   */
  async loadSettings() {
    try {
      const stored = await safeStorageGet(STORAGE_KEY, DEFAULT_SETTINGS);
      this.currentSettings = { ...DEFAULT_SETTINGS, ...stored };
      console.log('[Settings] Loaded settings:', this.currentSettings);
    } catch (error) {
      console.error('[Settings] Failed to load settings:', error);
      this.showFeedback('Failed to load settings. Using defaults.', 'error');
    }
  }

  /**
   * Populate UI controls with current settings
   */
  populateUI() {
    // Transcription settings
    this.elements.transcriptLanguage.value = this.currentSettings.language;
    this.elements.transcriptModel.value = this.currentSettings.model;
    this.elements.punctuationEnabled.checked = this.currentSettings.enablePunctuation;
    this.elements.interimResultsEnabled.checked = this.currentSettings.enableInterimResults;
    
    // Notification settings
    this.elements.toastNotificationsEnabled.checked = this.currentSettings.toastNotificationsEnabled;
    this.elements.soundFeedbackEnabled.checked = this.currentSettings.soundFeedbackEnabled;
    this.elements.browserNotificationsEnabled.checked = this.currentSettings.browserNotificationsEnabled;
    
    // Behavior settings
    this.elements.autoStartEnabled.checked = this.currentSettings.autoStartEnabled;
    this.elements.autoSaveEnabled.checked = this.currentSettings.autoSaveEnabled;
    this.elements.autoStopDuration.value = this.currentSettings.autoStopDuration;
    
    // Appearance & privacy
    this.elements.uiTheme.value = this.currentSettings.uiTheme;
    this.elements.analyticsEnabled.checked = this.currentSettings.analyticsEnabled;
    this.elements.errorReportingEnabled.checked = this.currentSettings.errorReportingEnabled;

    // Apply theme immediately
    this.applyTheme(this.currentSettings.uiTheme);
    
    // Reset unsaved changes flag
    this.hasUnsavedChanges = false;
    this.updateSaveButtonState();
  }

  /**
   * Setup event listeners for all controls
   */
  setupEventListeners() {
    // Action buttons
    this.elements.saveBtn.addEventListener('click', () => this.handleSaveSettings());
    this.elements.resetBtn.addEventListener('click', () => this.handleResetSettings());
    this.elements.exportBtn.addEventListener('click', () => this.handleExportSettings());
    
    // Theme changes apply immediately
    this.elements.uiTheme.addEventListener('change', (e) => {
      this.applyTheme(e.target.value);
      this.markAsChanged();
    });
    
    // Browser notification permission
    this.elements.browserNotificationsEnabled.addEventListener('change', (e) => {
      if (e.target.checked) {
        this.requestNotificationPermission();
      }
      this.markAsChanged();
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    
    // Page unload warning
    window.addEventListener('beforeunload', (e) => this.handlePageUnload(e));
  }

  /**
   * Setup change tracking for all form elements
   */
  setupChangeTracking() {
    const formElements = [
      this.elements.transcriptLanguage,
      this.elements.transcriptModel,
      this.elements.punctuationEnabled,
      this.elements.interimResultsEnabled,
      this.elements.toastNotificationsEnabled,
      this.elements.soundFeedbackEnabled,
      this.elements.browserNotificationsEnabled,
      this.elements.autoStartEnabled,
      this.elements.autoSaveEnabled,
      this.elements.autoStopDuration,
      this.elements.analyticsEnabled,
      this.elements.errorReportingEnabled
    ];

    formElements.forEach(element => {
      if (element) {
        element.addEventListener('change', () => this.markAsChanged());
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /* 💾 Settings Management                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Save current settings to storage
   */
  async handleSaveSettings() {
    try {
      this.elements.saveBtn.disabled = true;
      this.elements.saveBtn.textContent = 'Saving...';
      
      // Collect current values from UI
      const newSettings = this.collectSettingsFromUI();
      
      // Validate settings
      const validation = this.validateSettings(newSettings);
      if (!validation.isValid) {
        this.showFeedback(`Invalid settings: ${validation.errors.join(', ')}`, 'error');
        return;
      }
      
      // Save to storage
      await safeStorageSet(STORAGE_KEY, newSettings);
      this.currentSettings = { ...newSettings };
      
      // Update UI state
      this.hasUnsavedChanges = false;
      this.updateSaveButtonState();
      
      // User feedback
      this.showFeedback('Settings saved successfully!', 'success');
      if (this.currentSettings.soundFeedbackEnabled) {
        playNotificationSound('chime');
      }
      
      // Notify extension background script of settings change
      this.notifySettingsChanged();
      
    } catch (error) {
      console.error('[Settings] Failed to save settings:', error);
      this.showFeedback('Failed to save settings. Please try again.', 'error');
      if (this.currentSettings.soundFeedbackEnabled) {
        playNotificationSound('error');
      }
    } finally {
      this.elements.saveBtn.disabled = false;
      this.elements.saveBtn.textContent = 'Save Settings';
    }
  }

  /**
   * Reset settings to defaults
   */
  async handleResetSettings() {
    if (!confirm('Are you sure you want to reset all settings to their default values? This action cannot be undone.')) {
      return;
    }

    try {
      this.currentSettings = { ...DEFAULT_SETTINGS };
      await safeStorageSet(STORAGE_KEY, this.currentSettings);
      
      this.populateUI();
      this.showFeedback('Settings reset to defaults.', 'info');
      
      if (this.currentSettings.soundFeedbackEnabled) {
        playNotificationSound('chime');
      }
      
      this.notifySettingsChanged();
      
    } catch (error) {
      console.error('[Settings] Failed to reset settings:', error);
      this.showFeedback('Failed to reset settings.', 'error');
    }
  }

  /**
   * Export settings as JSON file
   */
  handleExportSettings() {
    try {
      const exportData = {
        extensionSettings: this.currentSettings,
        exportDate: new Date().toISOString(),
        version: '1.0.0'
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
        type: 'application/json' 
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `live-transcription-settings-${new Date().toISOString().slice(0, 10)}.json`;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.showFeedback('Settings exported successfully!', 'success');
      
    } catch (error) {
      console.error('[Settings] Failed to export settings:', error);
      this.showFeedback('Failed to export settings.', 'error');
    }
  }

  /* ---------------------------------------------------------------- */
  /* 🔍 Validation & Collection                                       */
  /* ---------------------------------------------------------------- */

  /**
   * Collect current settings from UI controls
   */
  collectSettingsFromUI() {
    return {
      // Transcription settings
      language: this.elements.transcriptLanguage.value,
      model: this.elements.transcriptModel.value,
      enablePunctuation: this.elements.punctuationEnabled.checked,
      enableInterimResults: this.elements.interimResultsEnabled.checked,
      
      // Notification settings
      toastNotificationsEnabled: this.elements.toastNotificationsEnabled.checked,
      soundFeedbackEnabled: this.elements.soundFeedbackEnabled.checked,
      browserNotificationsEnabled: this.elements.browserNotificationsEnabled.checked,
      
      // Behavior settings
      autoStartEnabled: this.elements.autoStartEnabled.checked,
      autoSaveEnabled: this.elements.autoSaveEnabled.checked,
      autoStopDuration: parseInt(this.elements.autoStopDuration.value, 10),
      
      // Appearance & privacy
      uiTheme: this.elements.uiTheme.value,
      analyticsEnabled: this.elements.analyticsEnabled.checked,
      errorReportingEnabled: this.elements.errorReportingEnabled.checked
    };
  }

  /**
   * Validate settings object
   */
  validateSettings(settings) {
    const errors = [];
    
    // Validate language
    const validLanguages = ['en-US', 'en-GB', 'en-AU', 'es-ES', 'es-MX', 'fr-FR', 'fr-CA', 'de-DE', 'it-IT', 'pt-BR', 'ja-JP', 'ko-KR', 'zh-CN'];
    if (!validLanguages.includes(settings.language)) {
      errors.push('Invalid language selection');
    }
    
    // Validate model
    const validModels = ['nova-2', 'nova', 'enhanced', 'base'];
    if (!validModels.includes(settings.model)) {
      errors.push('Invalid model selection');
    }
    
    // Validate auto-stop duration
    const validDurations = [0, 30, 60, 120, 300];
    if (!validDurations.includes(settings.autoStopDuration)) {
      errors.push('Invalid auto-stop duration');
    }
    
    // Validate theme
    const validThemes = ['auto', 'light', 'dark'];
    if (!validThemes.includes(settings.uiTheme)) {
      errors.push('Invalid theme selection');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /* ---------------------------------------------------------------- */
  /* 🎨 Theme & UI Management                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Apply theme to the page
   */
  applyTheme(theme) {
    const body = document.body;
    
    // Remove existing theme classes
    body.classList.remove('theme-light', 'theme-dark', 'theme-auto');
    
    // Apply new theme
    switch (theme) {
      case 'light':
        body.classList.add('theme-light');
        break;
      case 'dark':
        body.classList.add('theme-dark');
        break;
      case 'auto':
      default:
        body.classList.add('theme-auto');
        break;
    }
  }

  /**
   * Mark settings as changed
   */
  markAsChanged() {
    this.hasUnsavedChanges = true;
    this.updateSaveButtonState();
  }

  /**
   * Update save button state
   */
  updateSaveButtonState() {
    if (this.hasUnsavedChanges) {
      this.elements.saveBtn.disabled = false;
      this.elements.saveBtn.classList.add('has-changes');
    } else {
      this.elements.saveBtn.classList.remove('has-changes');
    }
  }

  /**
   * Show feedback message to user
   */
  showFeedback(message, type = 'info') {
    this.elements.feedback.textContent = message;
    this.elements.feedback.className = `settings-feedback ${type}`;
    
    // Auto-clear after 5 seconds
    setTimeout(() => {
      this.elements.feedback.textContent = '';
      this.elements.feedback.className = 'settings-feedback';
    }, 5000);
  }

  /* ---------------------------------------------------------------- */
  /* 🔔 Permissions & Integration                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Request browser notification permission
   */
  async requestNotificationPermission() {
    if (!('Notification' in window)) {
      this.showFeedback('Browser notifications are not supported.', 'warning');
      this.elements.browserNotificationsEnabled.checked = false;
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        this.showFeedback('Notification permission denied.', 'warning');
        this.elements.browserNotificationsEnabled.checked = false;
      } else {
        this.showFeedback('Notification permission granted!', 'success');
      }
    } catch (error) {
      console.error('[Settings] Notification permission error:', error);
      this.showFeedback('Failed to request notification permission.', 'error');
      this.elements.browserNotificationsEnabled.checked = false;
    }
  }

  /**
   * Notify background script of settings changes
   */
  notifySettingsChanged() {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'SETTINGS_CHANGED',
        settings: this.currentSettings
      }).catch(error => {
        console.warn('[Settings] Failed to notify background script:', error);
      });
    }
  }

  /* ---------------------------------------------------------------- */
  /* ⌨️ Keyboard & Event Handling                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Handle keyboard shortcuts
   */
  handleKeyboardShortcuts(event) {
    if (event.ctrlKey || event.metaKey) {
      switch (event.key) {
        case 's':
          event.preventDefault();
          if (this.hasUnsavedChanges) {
            this.handleSaveSettings();
          }
          break;
          
        case 'r':
          event.preventDefault();
          this.handleResetSettings();
          break;
          
        case 'e':
          event.preventDefault();
          this.handleExportSettings();
          break;
      }
    }
  }

  /**
   * Handle page unload with unsaved changes
   */
  handlePageUnload(event) {
    if (this.hasUnsavedChanges) {
      event.preventDefault();
      event.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      return event.returnValue;
    }
  }
}

/* ------------------------------------------------------------------ */
/* 🚀 Initialize Settings Page                                        */
/* ------------------------------------------------------------------ */

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new SettingsPageController());
} else {
  new SettingsPageController();
}

/* ------------------------------------------------------------------ */
/* 📚 Export for Testing                                              */
/* ------------------------------------------------------------------ */

// Export for unit testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SettingsPageController, DEFAULT_SETTINGS };
}