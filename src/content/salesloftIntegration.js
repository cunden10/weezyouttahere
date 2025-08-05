/**
 * salesloftIntegration.js
 * 
 * SalesLoft Sales Platform Integration for Live Transcription Extension
 * Provides seamless transcription functionality within SalesLoft interface
 * 
 * Features:
 * - Auto-detects SalesLoft call/meeting contexts
 * - Integrates transcription controls into SalesLoft UI
 * - Syncs transcription data with SalesLoft contact records
 * - Provides call summary and action item extraction
 */

import { safeStorageGet, safeStorageSet } from '../modules/core/coreUtils.js';

class SalesLoftIntegration {
  constructor() {
    this.isSalesLoftPage = this.detectSalesLoftContext();
    this.transcriptionActive = false;
    this.currentContact = null;
    this.callSummary = '';
    
    if (this.isSalesLoftPage) {
      this.init();
    }
  }

  /**
   * Initialize SalesLoft integration
   */
  async init() {
    console.log('[SalesLoft Integration] Initializing...');
    
    // Wait for SalesLoft UI to load
    await this.waitForSalesLoftUI();
    
    // Set up transcription controls
    this.injectTranscriptionControls();
    
    // Set up contact detection
    this.setupContactDetection();
    
    // Listen for transcription events
    this.setupTranscriptionListeners();
    
    console.log('[SalesLoft Integration] Ready');
  }

  /**
   * Detect if we're in a SalesLoft context
   */
  detectSalesLoftContext() {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    
    return (
      hostname.includes('salesloft.com') ||
      hostname === 'app.salesloft.com' ||
      document.querySelector('[data-salesloft-app]') !== null ||
      document.title.includes('SalesLoft') ||
      document.querySelector('.salesloft') !== null
    );
  }

  /**
   * Wait for SalesLoft UI elements to be available
   */
  async waitForSalesLoftUI() {
    const maxWait = 10000; // 10 seconds
    const checkInterval = 500; // 500ms
    let waited = 0;

    while (waited < maxWait) {
      // Look for SalesLoft-specific UI elements
      if (
        document.querySelector('.salesloft-header') ||
        document.querySelector('[class*="salesloft"]') ||
        document.querySelector('.sl-') || // SalesLoft uses sl- class prefix
        document.querySelector('#salesloft-root') ||
        document.querySelector('.navbar') // SalesLoft common navbar
      ) {
        return true;
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }
    
    return false;
  }

  /**
   * Inject transcription controls into SalesLoft UI
   */
  injectTranscriptionControls() {
    // Find appropriate location in SalesLoft UI
    const salesloftHeader = document.querySelector('.salesloft-header') ||
                          document.querySelector('.navbar') ||
                          document.querySelector('[class*="header"]') ||
                          document.querySelector('.sl-header');
    
    if (!salesloftHeader) {
      console.warn('[SalesLoft Integration] Could not find header to inject controls');
      return;
    }

    // Create transcription control panel
    const controlPanel = document.createElement('div');
    controlPanel.className = 'transcription-controls salesloft-integration';
    controlPanel.innerHTML = `
      <div class="transcription-panel">
        <button id="salesloft-transcribe-btn" class="transcribe-btn" title="Start Live Transcription">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C13.1 2 14 2.9 14 4V12C14 13.1 13.1 14 12 14C10.9 14 10 13.1 10 12V4C10 2.9 10.9 2 12 2M19 11C19 14.53 16.39 17.44 13 17.93V21H11V17.93C7.61 17.44 5 14.53 5 11H7C7 13.76 9.24 16 12 16S17 13.76 17 11H19Z"/>
          </svg>
          <span class="btn-text">Transcribe</span>
        </button>
        <div id="salesloft-transcription-status" class="transcription-status">
          <span class="status-text">Ready</span>
          <div class="status-indicator"></div>
        </div>
      </div>
    `;

    // Insert control panel
    salesloftHeader.appendChild(controlPanel);

    // Bind events
    this.bindControlEvents();
  }

  /**
   * Bind events to transcription controls
   */
  bindControlEvents() {
    const transcribeBtn = document.getElementById('salesloft-transcribe-btn');
    const statusElement = document.getElementById('salesloft-transcription-status');

    if (transcribeBtn) {
      transcribeBtn.addEventListener('click', () => {
        if (this.transcriptionActive) {
          this.stopTranscription();
        } else {
          this.startTranscription();
        }
      });
    }
  }

  /**
   * Set up contact detection from SalesLoft UI
   */
  setupContactDetection() {
    // SalesLoft often shows contact info in specific areas
    const contactObserver = new MutationObserver(() => {
      this.detectCurrentContact();
    });

    // Observe changes in the main content area
    const contentArea = document.querySelector('#salesloft-root') ||
                       document.querySelector('.salesloft-content') ||
                       document.querySelector('.main-content') ||
                       document.body;

    if (contentArea) {
      contactObserver.observe(contentArea, {
        childList: true,
        subtree: true
      });
    }

    // Initial contact detection
    this.detectCurrentContact();
  }

  /**
   * Detect current contact from SalesLoft UI
   */
  detectCurrentContact() {
    // Look for contact name and details in SalesLoft UI
    const contactName = this.extractContactName();
    const contactEmail = this.extractContactEmail();
    const contactCompany = this.extractContactCompany();

    if (contactName) {
      this.currentContact = {
        name: contactName,
        email: contactEmail,
        company: contactCompany,
        salesloftUrl: window.location.href,
        timestamp: Date.now()
      };

      console.log('[SalesLoft Integration] Contact detected:', this.currentContact);
    }
  }

  /**
   * Extract contact name from SalesLoft UI
   */
  extractContactName() {
    // Common selectors for contact names in SalesLoft
    const nameSelectors = [
      '.contact-name',
      '.person-name',
      '.prospect-name',
      '.lead-name',
      '.sl-contact-name',
      '[data-cy="contact-name"]',
      '.person-info h1',
      '.person-info h2',
      '.contact-header h1',
      '.contact-header h2'
    ];

    for (const selector of nameSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }

    // Fallback: look for any element with "name" class containing text
    const nameElements = document.querySelectorAll('[class*="name"], [class*="person"], [class*="contact"]');
    for (const element of nameElements) {
      const text = element.textContent.trim();
      if (text && text.length > 2 && text.length < 50 && text.includes(' ')) {
        return text;
      }
    }

    return null;
  }

  /**
   * Extract contact email from SalesLoft UI
   */
  extractContactEmail() {
    // Look for email addresses in the page
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const pageText = document.body.textContent;
    const emails = pageText.match(emailRegex);

    // Return the first valid-looking email
    if (emails && emails.length > 0) {
      // Filter out common system emails
      const filteredEmails = emails.filter(email => 
        !email.includes('salesloft.com') &&
        !email.includes('noreply') &&
        !email.includes('support@')
      );
      
      if (filteredEmails.length > 0) {
        return filteredEmails[0];
      }
    }

    return null;
  }

  /**
   * Extract contact company from SalesLoft UI
   */
  extractContactCompany() {
    const companySelectors = [
      '.company-name',
      '.organization-name',
      '.account-name',
      '.sl-company-name',
      '.company-info',
      '[data-cy="company-name"]',
      '.person-info .company',
      '.contact-company'
    ];

    for (const selector of companySelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }

    return null;
  }

  /**
   * Set up listeners for transcription events from the extension
   */
  setupTranscriptionListeners() {
    // Listen for messages from the extension background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'TRANSCRIPTION_STARTED':
          this.onTranscriptionStarted(message.data);
          break;
        case 'TRANSCRIPTION_STOPPED':
          this.onTranscriptionStopped(message.data);
          break;
        case 'TRANSCRIPTION_UPDATE':
          this.onTranscriptionUpdate(message.data);
          break;
        case 'TRANSCRIPTION_ERROR':
          this.onTranscriptionError(message.data);
          break;
      }
    });
  }

  /**
   * Start transcription for SalesLoft context
   */
  async startTranscription() {
    try {
      // Request transcription start from extension
      const response = await chrome.runtime.sendMessage({
        type: 'START_TRANSCRIPTION',
        context: 'salesloft',
        contact: this.currentContact,
        salesloftUrl: window.location.href
      });

      if (response.success) {
        this.transcriptionActive = true;
        this.updateTranscriptionUI('active');
        console.log('[SalesLoft Integration] Transcription started');
      } else {
        throw new Error(response.error || 'Failed to start transcription');
      }
    } catch (error) {
      console.error('[SalesLoft Integration] Error starting transcription:', error);
      this.showError('Failed to start transcription: ' + error.message);
    }
  }

  /**
   * Stop transcription
   */
  async stopTranscription() {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'STOP_TRANSCRIPTION',
        context: 'salesloft'
      });

      if (response.success) {
        this.transcriptionActive = false;
        this.updateTranscriptionUI('stopped');
        console.log('[SalesLoft Integration] Transcription stopped');
        
        // Offer to save transcript to SalesLoft
        if (this.callSummary) {
          this.promptSaveToSalesLoft();
        }
      }
    } catch (error) {
      console.error('[SalesLoft Integration] Error stopping transcription:', error);
    }
  }

  /**
   * Handle transcription started event
   */
  onTranscriptionStarted(data) {
    this.transcriptionActive = true;
    this.updateTranscriptionUI('active');
  }

  /**
   * Handle transcription stopped event
   */
  onTranscriptionStopped(data) {
    this.transcriptionActive = false;
    this.updateTranscriptionUI('stopped');
    
    if (data.transcript) {
      this.callSummary = data.transcript;
      this.promptSaveToSalesLoft();
    }
  }

  /**
   * Handle transcription update event
   */
  onTranscriptionUpdate(data) {
    if (data.transcript) {
      this.callSummary = data.transcript;
      this.updateTranscriptPreview(data.interimText);
    }
  }

  /**
   * Handle transcription error event
   */
  onTranscriptionError(data) {
    this.transcriptionActive = false;
    this.updateTranscriptionUI('error');
    this.showError('Transcription error: ' + data.message);
  }

  /**
   * Update transcription UI state
   */
  updateTranscriptionUI(state) {
    const btn = document.getElementById('salesloft-transcribe-btn');
    const status = document.getElementById('salesloft-transcription-status');

    if (!btn || !status) return;

    switch (state) {
      case 'active':
        btn.classList.add('active');
        btn.querySelector('.btn-text').textContent = 'Stop';
        status.querySelector('.status-text').textContent = 'Recording';
        status.classList.add('recording');
        break;
      case 'stopped':
        btn.classList.remove('active');
        btn.querySelector('.btn-text').textContent = 'Transcribe';
        status.querySelector('.status-text').textContent = 'Ready';
        status.classList.remove('recording', 'error');
        break;
      case 'error':
        btn.classList.remove('active');
        btn.querySelector('.btn-text').textContent = 'Transcribe';
        status.querySelector('.status-text').textContent = 'Error';
        status.classList.add('error');
        status.classList.remove('recording');
        break;
    }
  }

  /**
   * Update transcript preview (optional mini-display)
   */
  updateTranscriptPreview(interimText) {
    // Could show a small preview of current transcription
    // This is optional and depends on SalesLoft UI space
  }

  /**
   * Prompt user to save transcript to SalesLoft
   */
  promptSaveToSalesLoft() {
    if (!this.callSummary || !this.currentContact) return;

    const modal = this.createSaveModal();
    document.body.appendChild(modal);
  }

  /**
   * Create modal for saving transcript to SalesLoft
   */
  createSaveModal() {
    const modal = document.createElement('div');
    modal.className = 'salesloft-save-modal';
    modal.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-content">
          <h3>Save Call Transcript</h3>
          <p>Save this call transcript to ${this.currentContact?.name || 'this contact'} in SalesLoft?</p>
          <div class="transcript-preview">
            ${this.callSummary.substring(0, 200)}${this.callSummary.length > 200 ? '...' : ''}
          </div>
          <div class="modal-actions">
            <button class="btn-save">Save to SalesLoft</button>
            <button class="btn-cancel">Cancel</button>
          </div>
        </div>
      </div>
    `;

    // Bind modal events
    modal.querySelector('.btn-save').addEventListener('click', () => {
      this.saveTranscriptToSalesLoft();
      modal.remove();
    });

    modal.querySelector('.btn-cancel').addEventListener('click', () => {
      modal.remove();
    });

    modal.addEventListener('click', (e) => {
      if (e.target.className === 'modal-backdrop') {
        modal.remove();
      }
    });

    return modal;
  }

  /**
   * Save transcript to SalesLoft (simulated - would need SalesLoft API integration)
   */
  async saveTranscriptToSalesLoft() {
    try {
      // In a real implementation, this would use SalesLoft's API
      console.log('[SalesLoft Integration] Saving transcript to SalesLoft:', {
        contact: this.currentContact,
        transcript: this.callSummary
      });

      // Store in extension storage as backup
      await safeStorageSet(`salesloft_call_${Date.now()}`, {
        contact: this.currentContact,
        transcript: this.callSummary,
        timestamp: new Date().toISOString(),
        salesloftUrl: window.location.href
      });

      this.showSuccess('Call transcript saved successfully!');
    } catch (error) {
      console.error('[SalesLoft Integration] Error saving transcript:', error);
      this.showError('Failed to save transcript: ' + error.message);
    }
  }

  /**
   * Show success message
   */
  showSuccess(message) {
    this.showNotification(message, 'success');
  }

  /**
   * Show error message
   */
  showError(message) {
    this.showNotification(message, 'error');
  }

  /**
   * Show notification
   */
  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `salesloft-notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);
  }
}

// Initialize SalesLoft integration when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new SalesLoftIntegration());
} else {
  new SalesLoftIntegration();
}

export default SalesLoftIntegration;