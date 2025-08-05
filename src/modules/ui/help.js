/* =======================================================================
 * help.js
 * -----------------------------------------------------------------------
 * Controller for the extension help page. Manages tabbed navigation,
 * feedback submission, support actions, and dynamic content updates.
 * 
 * Key Responsibilities:
 * - Handle section navigation and active states
 * - Process feedback form submissions
 * - Manage support actions (export logs, reset extension)
 * - Display extension information and status
 * - Provide keyboard navigation support
 * ======================================================================= */

import { safeStorageGet, safeStorageSet } from '../core/coreUtils.js';
import { showToast } from './notificationController.js';
import { playNotificationSound } from '../audio/audioNotificationController.js';

class HelpPageController {
  constructor() {
    this.elements = {};
    this.currentSection = 'getting-started';
    this.init();
  }

  /**
   * Initialize the help page controller
   */
  async init() {
    this.cacheDOMElements();
    this.setupEventListeners();
    await this.loadExtensionInfo();
    await this.checkAPIStatus();
    
    console.log('[Help] Controller initialized successfully');
  }

  /**
   * Cache frequently accessed DOM elements
   */
  cacheDOMElements() {
    this.elements = {
      // Navigation
      navButtons: document.querySelectorAll('.nav-btn'),
      sections: document.querySelectorAll('.help-section'),
      
      // Support actions
      exportLogsBtn: document.getElementById('export-logs-btn'),
      resetExtensionBtn: document.getElementById('reset-extension-btn'),
      
      // Feedback form
      feedbackForm: document.getElementById('feedback-form'),
      feedbackText: document.getElementById('feedback-text'),
      includeLogsCheckbox: document.getElementById('include-logs'),
      
      // Extension info
      extensionVersion: document.getElementById('extension-version'),
      lastUpdated: document.getElementById('last-updated'),
      apiStatus: document.getElementById('api-status'),
      
      // Footer links
      privacyPolicyLink: document.getElementById('privacy-policy-link'),
      termsLink: document.getElementById('terms-link')
    };
  }

  /**
   * Setup event listeners for all interactions
   */
  setupEventListeners() {
    // Navigation buttons
    this.elements.navButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const section = e.target.dataset.section;
        this.showSection(section);
      });
    });

    // Support actions
    this.elements.exportLogsBtn?.addEventListener('click', () => this.exportDebugLogs());
    this.elements.resetExtensionBtn?.addEventListener('click', () => this.resetExtension());
    
    // Feedback form
    this.elements.feedbackForm?.addEventListener('submit', (e) => this.handleFeedbackSubmission(e));
    
    // Footer links
    this.elements.privacyPolicyLink?.addEventListener('click', (e) => {
      e.preventDefault();
      this.openPrivacyPolicy();
    });
    
    this.elements.termsLink?.addEventListener('click', (e) => {
      e.preventDefault();
      this.openTermsOfService();
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => this.handleKeyboardNavigation(e));
  }

  /**
   * Show a specific help section
   * @param {string} sectionId - ID of the section to show
   */
  showSection(sectionId) {
    if (sectionId === this.currentSection) return;

    // Update navigation buttons
    this.elements.navButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.section === sectionId);
    });

    // Update sections
    this.elements.sections.forEach(section => {
      section.classList.toggle('active', section.id === sectionId);
    });

    this.currentSection = sectionId;
    
    // Save user's last viewed section
    safeStorageSet('helpLastSection', sectionId);
    
    // Play navigation sound
    playNotificationSound('chime', { volume: 0.3 });
  }

  /**
   * Export debug logs for support
   */
  async exportDebugLogs() {
    try {
      showToast('Generating debug logs...', { type: 'info' });
      
      const debugInfo = await this.collectDebugInformation();
      const logData = JSON.stringify(debugInfo, null, 2);
      
      // Create downloadable file
      const blob = new Blob([logData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `live-transcription-debug-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      
      showToast('Debug logs exported successfully', { type: 'success' });
      playNotificationSound('chime');
      
    } catch (error) {
      console.error('[Help] Failed to export debug logs:', error);
      showToast('Failed to export debug logs', { type: 'error' });
      playNotificationSound('error');
    }
  }

  /**
   * Reset extension to default state
   */
  async resetExtension() {
    const confirmed = confirm(
      'This will reset all extension settings and data. This action cannot be undone. Continue?'
    );
    
    if (!confirmed) return;

    try {
      showToast('Resetting extension...', { type: 'info' });
      
      // Clear all storage
      if (chrome.storage) {
        await chrome.storage.local.clear();
        await chrome.storage.sync.clear();
      } else {
        // Fallback for web context
        localStorage.clear();
        sessionStorage.clear();
      }
      
      // Reload the extension
      if (chrome.runtime?.reload) {
        chrome.runtime.reload();
      } else {
        window.location.reload();
      }
      
      showToast('Extension reset successfully', { type: 'success' });
      
    } catch (error) {
      console.error('[Help] Failed to reset extension:', error);
      showToast('Failed to reset extension', { type: 'error' });
      playNotificationSound('error');
    }
  }

  /**
   * Handle feedback form submission
   * @param {Event} event - Form submission event
   */
  async handleFeedbackSubmission(event) {
    event.preventDefault();
    
    const feedbackText = this.elements.feedbackText.value.trim();
    const includeLogs = this.elements.includeLogsCheckbox.checked;
    
    if (!feedbackText) {
      showToast('Please enter your feedback before submitting', { type: 'warning' });
      return;
    }

    try {
      showToast('Submitting feedback...', { type: 'info' });
      
      const feedbackData = {
        feedback: feedbackText,
        timestamp: new Date().toISOString(),
        extensionVersion: chrome.runtime?.getManifest()?.version || '1.0.0',
        userAgent: navigator.userAgent,
        url: window.location.href
      };
      
      if (includeLogs) {
        feedbackData.debugInfo = await this.collectDebugInformation();
      }
      
      // In a real implementation, this would send to your feedback endpoint
      console.log('[Help] Feedback submitted:', feedbackData);
      
      // For now, we'll store it locally and show success
      const existingFeedback = await safeStorageGet('userFeedback', []);
      existingFeedback.push(feedbackData);
      await safeStorageSet('userFeedback', existingFeedback);
      
      // Reset form
      this.elements.feedbackForm.reset();
      
      showToast('Thank you for your feedback!', { type: 'success' });
      playNotificationSound('chime');
      
    } catch (error) {
      console.error('[Help] Failed to submit feedback:', error);
      showToast('Failed to submit feedback. Please try again.', { type: 'error' });
      playNotificationSound('error');
    }
  }

  /**
   * Load and display extension information
   */
  async loadExtensionInfo() {
    try {
      // Extension version
      const manifest = chrome.runtime?.getManifest();
      if (manifest && this.elements.extensionVersion) {
        this.elements.extensionVersion.textContent = manifest.version;
      }
      
      // Last updated (installation date or manifest date)
      if (this.elements.lastUpdated) {
        const installDate = await safeStorageGet('installDate');
        if (installDate) {
          const date = new Date(installDate);
          this.elements.lastUpdated.textContent = date.toLocaleDateString();
        } else {
          // Set install date for future reference
          const now = Date.now();
          await safeStorageSet('installDate', now);
          this.elements.lastUpdated.textContent = new Date(now).toLocaleDateString();
        }
      }
      
    } catch (error) {
      console.error('[Help] Failed to load extension info:', error);
    }
  }

  /**
   * Check API connectivity status
   */
  async checkAPIStatus() {
    if (!this.elements.apiStatus) return;
    
    try {
      this.elements.apiStatus.textContent = 'Checking...';
      
      // Test connection to Deepgram API
      const response = await fetch('https://api.deepgram.com', {
        method: 'HEAD',
        mode: 'no-cors'
      });
      
      // Note: no-cors mode doesn't give us access to response status,
      // but if the fetch succeeds without throwing, the API is reachable
      this.elements.apiStatus.textContent = 'Connected';
      this.elements.apiStatus.style.color = 'var(--color-success)';
      
    } catch (error) {
      this.elements.apiStatus.textContent = 'Disconnected';
      this.elements.apiStatus.style.color = 'var(--color-error)';
    }
  }

  /**
   * Collect comprehensive debug information
   */
  async collectDebugInformation() {
    const debugInfo = {
      timestamp: new Date().toISOString(),
      browser: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        cookieEnabled: navigator.cookieEnabled,
        onLine: navigator.onLine
      },
      extension: {
        version: chrome.runtime?.getManifest()?.version || 'Unknown',
        manifest: chrome.runtime?.getManifest() || null
      },
      permissions: {},
      storage: {},
      errors: []
    };

    try {
      // Check permissions
      if (chrome.permissions) {
        debugInfo.permissions = {
          microphone: await navigator.permissions.query({ name: 'microphone' }),
          notifications: await navigator.permissions.query({ name: 'notifications' })
        };
      }
    } catch (error) {
      debugInfo.errors.push(`Permissions check failed: ${error.message}`);
    }

    try {
      // Get relevant storage data (excluding sensitive information)
      const storageKeys = [
        'extensionSettings',
        'helpLastSection',
        'installDate',
        'onboardingCompleted'
      ];
      
      for (const key of storageKeys) {
        debugInfo.storage[key] = await safeStorageGet(key);
      }
    } catch (error) {
      debugInfo.errors.push(`Storage check failed: ${error.message}`);
    }

    return debugInfo;
  }

  /**
   * Open privacy policy
   */
  openPrivacyPolicy() {
    // In a real implementation, this would open the actual privacy policy
    showToast('Privacy policy would open here', { type: 'info' });
  }

  /**
   * Open terms of service
   */
  openTermsOfService() {
    // In a real implementation, this would open the actual terms
    showToast('Terms of service would open here', { type: 'info' });
  }

  /**
   * Handle keyboard navigation
   * @param {KeyboardEvent} event - Keyboard event
   */
  handleKeyboardNavigation(event) {
    // Escape key to go back to dashboard
    if (event.key === 'Escape') {
      if (chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: 'src/pages/dashboard.html' });
      } else {
        window.location.href = '../pages/dashboard.html';
      }
      return;
    }

    // Number keys to navigate sections (1-5)
    if (event.key >= '1' && event.key <= '5') {
      const sections = ['getting-started', 'features', 'troubleshooting', 'privacy', 'support'];
      const sectionIndex = parseInt(event.key) - 1;
      if (sections[sectionIndex]) {
        this.showSection(sections[sectionIndex]);
      }
      return;
    }

    // Ctrl+R to refresh API status
    if (event.ctrlKey && event.key === 'r') {
      event.preventDefault();
      this.checkAPIStatus();
      showToast('API status refreshed', { type: 'info' });
    }
  }

  /**
   * Restore user's last viewed section
   */
  async restoreLastSection() {
    const lastSection = await safeStorageGet('helpLastSection', 'getting-started');
    if (lastSection && lastSection !== 'getting-started') {
      this.showSection(lastSection);
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    const controller = new HelpPageController();
    await controller.restoreLastSection();
  });
} else {
  const controller = new HelpPageController();
  controller.restoreLastSection();
}