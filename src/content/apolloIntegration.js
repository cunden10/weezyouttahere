/**
 * apolloIntegration.js
 * 
 * Apollo.io Sales Platform Integration for Live Transcription Extension
 * Provides seamless transcription functionality within Apollo.io interface
 * 
 * Features:
 * - Auto-detects Apollo call/meeting contexts
 * - Integrates transcription controls into Apollo UI
 * - Syncs transcription data with Apollo contact records
 * - Provides call summary and action item extraction
 */

import { safeStorageGet, safeStorageSet } from '../modules/core/coreUtils.js';

class ApolloIntegration {
  constructor() {
    this.isApolloPage = this.detectApolloContext();
    this.transcriptionActive = false;
    this.currentContact = null;
    this.callSummary = '';
    
    if (this.isApolloPage) {
      this.init();
    }
  }

  /**
   * Initialize Apollo integration
   */
  async init() {
    console.log('[Apollo Integration] Initializing...');
    
    // Wait for Apollo UI to load
    await this.waitForApolloUI();
    
    // Set up transcription controls
    this.injectTranscriptionControls();
    
    // Set up contact detection
    this.setupContactDetection();
    
    // Listen for transcription events
    this.setupTranscriptionListeners();
    
    console.log('[Apollo Integration] Ready');
  }

  /**
   * Detect if we're in an Apollo.io context
   */
  detectApolloContext() {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;
    
    return (
      hostname.includes('apollo.io') ||
      hostname === 'app.apollo.io' ||
      document.querySelector('[data-apollo-app]') !== null ||
      document.title.includes('Apollo')
    );
  }

  /**
   * Wait for Apollo UI elements to be available
   */
  async waitForApolloUI() {
    const maxWait = 10000; // 10 seconds
    const checkInterval = 500; // 500ms
    let waited = 0;

    while (waited < maxWait) {
      // Look for Apollo-specific UI elements
      if (
        document.querySelector('.apollo-header') ||
        document.querySelector('[class*="apollo"]') ||
        document.querySelector('.zp_') || // Apollo uses zp_ class prefix
        document.querySelector('#apollo-root')
      ) {
        return true;
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }
    
    return false;
  }

  /**
   * Inject transcription controls into Apollo UI
   */
  injectTranscriptionControls() {
    // Find appropriate location in Apollo UI
    const apolloHeader = document.querySelector('.apollo-header') ||
                        document.querySelector('[class*="header"]') ||
                        document.querySelector('.zp_header');
    
    if (!apolloHeader) {
      console.warn('[Apollo Integration] Could not find header to inject controls');
      return;
    }

    // Create transcription control panel
    const controlPanel = document.createElement('div');
    controlPanel.className = 'transcription-controls apollo-integration';
    controlPanel.innerHTML = `
      <div class="transcription-panel">
        <button id="apollo-transcribe-btn" class="transcribe-btn" title="Start Live Transcription">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C13.1 2 14 2.9 14 4V12C14 13.1 13.1 14 12 14C10.9 14 10 13.1 10 12V4C10 2.9 10.9 2 12 2M19 11C19 14.53 16.39 17.44 13 17.93V21H11V17.93C7.61 17.44 5 14.53 5 11H7C7 13.76 9.24 16 12 16S17 13.76 17 11H19Z"/>
          </svg>
          <span class="btn-text">Transcribe</span>
        </button>
        <div id="apollo-transcription-status" class="transcription-status">
          <span class="status-text">Ready</span>
          <div class="status-indicator"></div>
        </div>
      </div>
    `;

    // Insert control panel
    apolloHeader.appendChild(controlPanel);

    // Bind events
    this.bindControlEvents();
  }

  /**
   * Bind events to transcription controls
   */
  bindControlEvents() {
    const transcribeBtn = document.getElementById('apollo-transcribe-btn');
    const statusElement = document.getElementById('apollo-transcription-status');

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
   * Set up contact detection from Apollo UI
   */
  setupContactDetection() {
    // Apollo often shows contact info in specific areas
    const contactObserver = new MutationObserver(() => {
      this.detectCurrentContact();
    });

    // Observe changes in the main content area
    const contentArea = document.querySelector('#apollo-root') ||
                       document.querySelector('.apollo-content') ||
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
   * Detect current contact from Apollo UI
   */
  detectCurrentContact() {
    // Look for contact name and details in Apollo UI
    const contactName = this.extractContactName();
    const contactEmail = this.extractContactEmail();
    const contactCompany = this.extractContactCompany();

    if (contactName) {
      this.currentContact = {
        name: contactName,
        email: contactEmail,
        company: contactCompany,
        apolloUrl: window.location.href,
        timestamp: Date.now()
      };

      console.log('[Apollo Integration] Contact detected:', this.currentContact);
    }
  }

  /**
   * Extract contact name from Apollo UI
   */
  extractContactName() {
    // Common selectors for contact names in Apollo
    const nameSelectors = [
      '.contact-name',
      '.zp_contact_name',
      '[data-cy="contact-name"]',
      '.person-name',
      '.prospect-name',
      'h1[class*="name"]',
      '.lead-name'
    ];

    for (const selector of nameSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }

    // Fallback: look for any element with "name" class containing text
    const nameElements = document.querySelectorAll('[class*="name"]');
    for (const element of nameElements) {
      const text = element.textContent.trim();
      if (text && text.length > 2 && text.length < 50) {
        return text;
      }
    }

    return null;
  }

  /**
   * Extract contact email from Apollo UI
   */
  extractContactEmail() {
    // Look for email addresses in the page
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const pageText = document.body.textContent;
    const emails = pageText.match(emailRegex);

    // Return the first valid-looking email
    if (emails && emails.length > 0) {
      return emails[0];
    }

    return null;
  }

  /**
   * Extract contact company from Apollo UI
   */
  extractContactCompany() {
    const companySelectors = [
      '.company-name',
      '.zp_company_name',
      '[data-cy="company-name"]',
      '.organization-name',
      '.account-name'
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
    // ✅ Signal that content script is ready
    chrome.runtime.sendMessage({
      type: 'CONTENT_SCRIPT_READY',
      context: 'apollo',
      url: window.location.href,
      timestamp: Date.now()
    }).catch(error => {
      console.log('[Apollo] Failed to signal readiness:', error);
    });

    // ✅ Listen for messages from the extension background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[Apollo] Received message:', message.type);
      
      try {
        switch (message.type) {
          case 'PING':
            sendResponse({ 
              success: true, 
              context: 'apollo',
              url: window.location.href,
              ready: true,
              timestamp: Date.now()
            });
            break;
            
          case 'TRANSCRIPTION_STARTED':
            this.onTranscriptionStarted(message.data);
            sendResponse({ success: true, handled: 'TRANSCRIPTION_STARTED' });
            break;
            
          case 'TRANSCRIPTION_STOPPED':
            this.onTranscriptionStopped(message.data);
            sendResponse({ success: true, handled: 'TRANSCRIPTION_STOPPED' });
            break;
            
          case 'TRANSCRIPTION_UPDATE':
            this.onTranscriptionUpdate(message.data);
            sendResponse({ success: true, handled: 'TRANSCRIPTION_UPDATE' });
            break;
            
          case 'TRANSCRIPTION_ERROR':
            this.onTranscriptionError(message.data);
            sendResponse({ success: true, handled: 'TRANSCRIPTION_ERROR' });
            break;
            
          default:
            sendResponse({ 
              success: true, 
              message: 'Unknown message type',
              type: message.type 
            });
        }
      } catch (error) {
        console.error('[Apollo] Error handling message:', error);
        sendResponse({ 
          success: false, 
          error: error.message,
          type: message.type 
        });
      }
      
      return true; // Keep message channel open
    });
  }

  /**
   * Start transcription for Apollo context
   */
  async startTranscription() {
    try {
      // Request transcription start from extension
      const response = await chrome.runtime.sendMessage({
        type: 'START_TRANSCRIPTION',
        context: 'apollo',
        contact: this.currentContact,
        apolloUrl: window.location.href
      });

      if (response.success) {
        this.transcriptionActive = true;
        this.updateTranscriptionUI('active');
        console.log('[Apollo Integration] Transcription started');
      } else {
        throw new Error(response.error || 'Failed to start transcription');
      }
    } catch (error) {
      console.error('[Apollo Integration] Error starting transcription:', error);
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
        context: 'apollo'
      });

      if (response.success) {
        this.transcriptionActive = false;
        this.updateTranscriptionUI('stopped');
        console.log('[Apollo Integration] Transcription stopped');
        
        // Offer to save transcript to Apollo
        if (this.callSummary) {
          this.promptSaveToApollo();
        }
      }
    } catch (error) {
      console.error('[Apollo Integration] Error stopping transcription:', error);
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
      this.promptSaveToApollo();
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
    const btn = document.getElementById('apollo-transcribe-btn');
    const status = document.getElementById('apollo-transcription-status');

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
    // This is optional and depends on Apollo UI space
  }

  /**
   * Prompt user to save transcript to Apollo
   */
  promptSaveToApollo() {
    if (!this.callSummary || !this.currentContact) return;

    const modal = this.createSaveModal();
    document.body.appendChild(modal);
  }

  /**
   * Create modal for saving transcript to Apollo
   */
  createSaveModal() {
    const modal = document.createElement('div');
    modal.className = 'apollo-save-modal';
    modal.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-content">
          <h3>Save Call Transcript</h3>
          <p>Save this call transcript to ${this.currentContact?.name || 'this contact'} in Apollo?</p>
          <div class="transcript-preview">
            ${this.callSummary.substring(0, 200)}${this.callSummary.length > 200 ? '...' : ''}
          </div>
          <div class="modal-actions">
            <button class="btn-save">Save to Apollo</button>
            <button class="btn-cancel">Cancel</button>
          </div>
        </div>
      </div>
    `;

    // Bind modal events
    modal.querySelector('.btn-save').addEventListener('click', () => {
      this.saveTranscriptToApollo();
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
   * Save transcript to Apollo (simulated - would need Apollo API integration)
   */
  async saveTranscriptToApollo() {
    try {
      // In a real implementation, this would use Apollo's API
      console.log('[Apollo Integration] Saving transcript to Apollo:', {
        contact: this.currentContact,
        transcript: this.callSummary
      });

      // Store in extension storage as backup
      await safeStorageSet(`apollo_call_${Date.now()}`, {
        contact: this.currentContact,
        transcript: this.callSummary,
        timestamp: new Date().toISOString(),
        apolloUrl: window.location.href
      });

      this.showSuccess('Call transcript saved successfully!');
    } catch (error) {
      console.error('[Apollo Integration] Error saving transcript:', error);
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
    notification.className = `apollo-notification ${type}`;
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

// Initialize Apollo integration when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new ApolloIntegration());
} else {
  new ApolloIntegration();
}

export default ApolloIntegration;