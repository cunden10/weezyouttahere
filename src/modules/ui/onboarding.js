/* =======================================================================
 * onboarding.js
 * -----------------------------------------------------------------------
 * First-run onboarding flow controller for the Live Transcription Extension.
 * Guides users through setup, permissions, and basic configuration.
 *
 * Features:
 * - Multi-step guided setup process
 * - Permission request handling
 * - Basic preference configuration
 * - Completion tracking and navigation
 * ===================================================================== */

import { safeStorageGet, safeStorageSet } from '../core/coreUtils.js';
import { showToast } from './notificationController.js';
import { playNotificationSound } from '../audio/audioNotificationController.js';

/* ------------------------------------------------------------------ */
/* 🎯 Onboarding Controller Class                                     */
/* ------------------------------------------------------------------ */

class OnboardingController {
  constructor() {
    this.currentStep = 1;
    this.totalSteps = 5;
    this.permissions = {
      microphone: false,
      notifications: false,
      storage: true // Always available
    };
    this.preferences = {
      language: 'en-US',
      model: 'nova-2',
      notifications: true,
      sounds: true,
      interim: true
    };
    
    this.init();
  }

  /**
   * Initialize the onboarding flow
   */
  async init() {
    // Check if onboarding was already completed
    const isComplete = await safeStorageGet('onboardingComplete', false);
    if (isComplete) {
      this.redirectToExtension();
      return;
    }

    this.cacheDOMElements();
    this.setupEventListeners();
    this.showStep(1);
    this.updateProgress();
    
    console.log('[Onboarding] Flow initialized');
  }

  /**
   * Cache frequently accessed DOM elements
   */
  cacheDOMElements() {
    // Step elements
    this.stepElements = {
      welcome: document.getElementById('step-welcome'),
      privacy: document.getElementById('step-privacy'),
      permissions: document.getElementById('step-permissions'),
      preferences: document.getElementById('step-preferences'),
      complete: document.getElementById('step-complete')
    };

    // Progress elements
    this.progressFill = document.getElementById('progress-fill');
    this.currentStepSpan = document.getElementById('current-step');
    this.totalStepsSpan = document.getElementById('total-steps');

    // Button elements
    this.buttons = {
      // Step 1
      welcomeContinue: document.getElementById('welcome-continue-btn'),
      skipOnboarding: document.getElementById('skip-onboarding-btn'),
      
      // Step 2
      privacyContinue: document.getElementById('privacy-continue-btn'),
      privacyBack: document.getElementById('privacy-back-btn'),
      
      // Step 3
      permissionButtons: document.querySelectorAll('.permission-button'),
      permissionsContinue: document.getElementById('permissions-continue-btn'),
      permissionsBack: document.getElementById('permissions-back-btn'),
      
      // Step 4
      preferencesContinue: document.getElementById('preferences-continue-btn'),
      preferencesSkip: document.getElementById('preferences-skip-btn'),
      preferencesBack: document.getElementById('preferences-back-btn'),
      
      // Step 5
      completeStart: document.getElementById('complete-start-btn'),
      completeSettings: document.getElementById('complete-settings-btn'),
      completeHelp: document.getElementById('complete-help-btn')
    };

    // Form elements
    this.formElements = {
      language: document.getElementById('onboarding-language'),
      model: document.getElementById('onboarding-model'),
      notifications: document.getElementById('onboarding-notifications'),
      sounds: document.getElementById('onboarding-sounds'),
      interim: document.getElementById('onboarding-interim')
    };

    // Permission elements
    this.permissionElements = {
      microphone: document.getElementById('microphone-permission'),
      notifications: document.getElementById('notifications-permission')
    };
  }

  /**
   * Setup event listeners for all interactions
   */
  setupEventListeners() {
    // Step 1 - Welcome
    this.buttons.welcomeContinue.addEventListener('click', () => this.nextStep());
    this.buttons.skipOnboarding.addEventListener('click', () => this.skipOnboarding());

    // Step 2 - Privacy
    this.buttons.privacyContinue.addEventListener('click', () => this.nextStep());
    this.buttons.privacyBack.addEventListener('click', () => this.previousStep());

    // Step 3 - Permissions
    this.buttons.permissionButtons.forEach(btn => {
      btn.addEventListener('click', (e) => this.handlePermissionRequest(e));
    });
    this.buttons.permissionsContinue.addEventListener('click', () => this.nextStep());
    this.buttons.permissionsBack.addEventListener('click', () => this.previousStep());

    // Step 4 - Preferences
    this.buttons.preferencesContinue.addEventListener('click', () => this.savePreferencesAndContinue());
    this.buttons.preferencesSkip.addEventListener('click', () => this.nextStep());
    this.buttons.preferencesBack.addEventListener('click', () => this.previousStep());

    // Step 5 - Complete
    this.buttons.completeStart.addEventListener('click', () => this.completeOnboarding('dashboard'));
    this.buttons.completeSettings.addEventListener('click', () => this.completeOnboarding('settings'));
    this.buttons.completeHelp.addEventListener('click', () => this.completeOnboarding('help'));

    // Keyboard navigation
    document.addEventListener('keydown', (e) => this.handleKeyboardNavigation(e));
  }

  /* ---------------------------------------------------------------- */
  /* 🚶 Step Navigation                                               */
  /* ---------------------------------------------------------------- */

  /**
   * Show a specific step
   */
  showStep(stepNumber) {
    // Hide all steps
    Object.values(this.stepElements).forEach(el => {
      el.classList.add('hidden');
    });

    // Show current step
    const stepKey = this.getStepKey(stepNumber);
    if (this.stepElements[stepKey]) {
      this.stepElements[stepKey].classList.remove('hidden');
      this.currentStep = stepNumber;
      this.updateProgress();
    }
  }

  /**
   * Go to next step
   */
  nextStep() {
    if (this.currentStep < this.totalSteps) {
      this.showStep(this.currentStep + 1);
      
      // Play progress sound
      if (this.preferences.sounds) {
        playNotificationSound('chime');
      }
    }
  }

  /**
   * Go to previous step
   */
  previousStep() {
    if (this.currentStep > 1) {
      this.showStep(this.currentStep - 1);
    }
  }

  /**
   * Update progress indicator
   */
  updateProgress() {
    const progress = (this.currentStep / this.totalSteps) * 100;
    this.progressFill.style.width = `${progress}%`;
    this.currentStepSpan.textContent = this.currentStep;
    this.totalStepsSpan.textContent = this.totalSteps;
  }

  /**
   * Get step key from number
   */
  getStepKey(stepNumber) {
    const stepMap = {
      1: 'welcome',
      2: 'privacy', 
      3: 'permissions',
      4: 'preferences',
      5: 'complete'
    };
    return stepMap[stepNumber];
  }

  /* ---------------------------------------------------------------- */
  /* 🔐 Permission Handling                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Handle permission request button clicks
   */
  async handlePermissionRequest(event) {
    const button = event.target;
    const permission = button.dataset.permission;
    
    button.disabled = true;
    button.textContent = 'Requesting...';

    try {
      let granted = false;

      switch (permission) {
        case 'microphone':
          granted = await this.requestMicrophonePermission();
          break;
        case 'notifications':
          granted = await this.requestNotificationPermission();
          break;
      }

      this.updatePermissionStatus(permission, granted);
      this.checkPermissionCompletion();

    } catch (error) {
      console.error(`[Onboarding] Permission request failed:`, error);
      showToast(`Failed to request ${permission} permission`, { type: 'error' });
      button.disabled = false;
      button.textContent = 'Try Again';
    }
  }

  /**
   * Request microphone permission
   */
  async requestMicrophonePermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop()); // Stop immediately
      return true;
    } catch (error) {
      console.error('[Onboarding] Microphone permission denied:', error);
      return false;
    }
  }

  /**
   * Request notification permission
   */
  async requestNotificationPermission() {
    try {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
      }
      return false;
    } catch (error) {
      console.error('[Onboarding] Notification permission failed:', error);
      return false;
    }
  }

  /**
   * Update permission status in UI
   */
  updatePermissionStatus(permission, granted) {
    const element = this.permissionElements[permission];
    if (!element) return;

    const statusEl = element.querySelector('.permission-status');
    const buttonEl = element.querySelector('.permission-button');

    this.permissions[permission] = granted;

    if (granted) {
      statusEl.dataset.status = 'granted';
      statusEl.querySelector('.status-text').textContent = '✅ Granted';
      buttonEl.textContent = 'Granted';
      buttonEl.disabled = true;
      element.classList.add('granted');
      
      if (this.preferences.sounds) {
        playNotificationSound('chime');
      }
      showToast(`${permission.charAt(0).toUpperCase() + permission.slice(1)} access granted!`, { type: 'success' });
    } else {
      statusEl.dataset.status = 'denied';
      statusEl.querySelector('.status-text').textContent = '❌ Denied';
      buttonEl.textContent = 'Retry';
      buttonEl.disabled = false;
      element.classList.add('denied');
      
      showToast(`${permission.charAt(0).toUpperCase() + permission.slice(1)} access denied`, { type: 'error' });
    }
  }

  /**
   * Check if required permissions are granted
   */
  checkPermissionCompletion() {
    // Microphone is required, notifications are optional
    const canContinue = this.permissions.microphone;
    this.buttons.permissionsContinue.disabled = !canContinue;
    
    if (canContinue && !this.buttons.permissionsContinue.disabled) {
      showToast('Required permissions granted! You can continue.', { type: 'success' });
    }
  }

  /* ---------------------------------------------------------------- */
  /* ⚙️ Preference Handling                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Save user preferences and continue
   */
  async savePreferencesAndContinue() {
    // Read preferences from form
    this.preferences = {
      language: this.formElements.language.value,
      model: this.formElements.model.value,
      notifications: this.formElements.notifications.checked,
      sounds: this.formElements.sounds.checked,
      interim: this.formElements.interim.checked
    };

    try {
      // Save to storage
      await safeStorageSet('userPreferences', this.preferences);
      
      if (this.preferences.sounds) {
        playNotificationSound('chime');
      }
      showToast('Preferences saved successfully!', { type: 'success' });
      
      this.nextStep();
    } catch (error) {
      console.error('[Onboarding] Failed to save preferences:', error);
      showToast('Failed to save preferences', { type: 'error' });
    }
  }

  /* ---------------------------------------------------------------- */
  /* 🏁 Completion Handling                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Complete onboarding and redirect
   */
  async completeOnboarding(destination = 'dashboard') {
    try {
      // Mark onboarding as complete
      await safeStorageSet('onboardingComplete', true);
      await safeStorageSet('onboardingCompletedAt', Date.now());
      
      // Save final state
      await safeStorageSet('permissionsGranted', this.permissions);
      
      console.log('[Onboarding] Completed successfully');
      
      if (this.preferences.sounds) {
        playNotificationSound('activated');
      }
      showToast('Setup complete! Welcome to Live Transcription.', { type: 'success' });
      
      // Small delay for feedback, then redirect
      setTimeout(() => {
        this.redirectToDestination(destination);
      }, 1500);
      
    } catch (error) {
      console.error('[Onboarding] Failed to complete:', error);
      showToast('Setup completed, but failed to save state', { type: 'warning' });
      this.redirectToDestination(destination);
    }
  }

  /**
   * Skip onboarding entirely
   */
  async skipOnboarding() {
    if (confirm('Are you sure you want to skip setup? You can always configure the extension later.')) {
      await safeStorageSet('onboardingComplete', true);
      await safeStorageSet('onboardingSkipped', true);
      this.redirectToDestination('dashboard');
    }
  }

  /**
   * Redirect to appropriate destination
   */
  redirectToDestination(destination) {
    const urls = {
      dashboard: '/transcriptionDashboard.html',
      settings: '/settings.html',
      help: '/help.html'
    };
    
    const targetUrl = urls[destination] || urls.dashboard;
    
    if (chrome?.tabs) {
      // Extension context
      chrome.tabs.create({ url: chrome.runtime.getURL(targetUrl) });
      window.close();
    } else {
      // Web context
      window.location.href = targetUrl;
    }
  }

  /**
   * Redirect if onboarding already completed
   */
  redirectToExtension() {
    console.log('[Onboarding] Already completed, redirecting...');
    this.redirectToDestination('dashboard');
  }

  /* ---------------------------------------------------------------- */
  /* ⌨️ Keyboard Navigation                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Handle keyboard shortcuts
   */
  handleKeyboardNavigation(event) {
    // Don't interfere with form inputs
    if (event.target.matches('input, select, textarea')) return;

    switch (event.key) {
      case 'ArrowRight':
      case 'Enter':
        if (!event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          const continueBtn = document.querySelector('.onboarding-step:not(.hidden) .primary-button:not(:disabled)');
          if (continueBtn) {
            continueBtn.click();
          }
        }
        break;
        
      case 'ArrowLeft':
        if (!event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          const backBtn = document.querySelector('.onboarding-step:not(.hidden) .secondary-button');
          if (backBtn) {
            backBtn.click();
          }
        }
        break;
        
      case 'Escape':
        if (this.currentStep > 1) {
          this.previousStep();
        }
        break;
    }
  }
}

/* ------------------------------------------------------------------ */
/* 🚀 Initialize Onboarding                                          */
/* ------------------------------------------------------------------ */

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new OnboardingController());
} else {
  new OnboardingController();
}

/* ------------------------------------------------------------------ */
/* 📚 Integration Notes                                               */
/* ------------------------------------------------------------------ */

/**
 * INTEGRATION WITH MAIN EXTENSION:
 * 
 * 1. TRIGGER ONBOARDING:
 *    - Show on first extension install
 *    - Accessible via Help menu or settings
 *    - Check onboardingComplete flag in background script
 * 
 * 2. PERMISSION PERSISTENCE:
 *    - Permissions stored in 'permissionsGranted' key
 *    - Main extension should check these before operations
 *    - Re-prompt if permissions were revoked
 * 
 * 3. PREFERENCE INTEGRATION:
 *    - User preferences saved to 'userPreferences' key
 *    - Settings page should load these as defaults
 *    - Transcription engine should use these settings
 * 
 * 4. COMPLETION TRACKING:
 *    - 'onboardingComplete': boolean - setup finished
 *    - 'onboardingSkipped': boolean - user skipped setup
 *    - 'onboardingCompletedAt': timestamp - completion time
 * 
 * BACKGROUND SCRIPT EXAMPLE:
 * 
 * chrome.runtime.onInstalled.addListener(async (details) => {
 *   if (details.reason === 'install') {
 *     const isComplete = await safeStorageGet('onboardingComplete', false);
 *     if (!isComplete) {
 *       chrome.tabs.create({
 *         url: chrome.runtime.getURL('onboarding.html')
 *       });
 *     }
 *   }
 * });
 */