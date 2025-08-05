/* extensionScriptManager.js
 *
 * Lifecycle manager for content scripts, permissions, and tab coordination
 * in a Deepgram-powered browser transcription extension.
 *
 * Responsibilities:
 * - Register and inject content scripts across supported sites
 * - Handle permission requests for audio, storage, and network access
 * - Coordinate script reloading when configuration changes
 * - Manage script lifecycle and cleanup
 *
 * All naming is original and extension-specific.
 */

import { safeStorageGet, safeStorageSet, delay } from '../modules/core/coreUtils.js';

/* ------------------------------------------------------------------ */
/* 📋 Script Configuration & Registry                                 */
/* ------------------------------------------------------------------ */

/**
 * Content script definitions for the transcription extension
 */
const SCRIPT_REGISTRY = {
  // Core transcription functionality
  mainTranscriber: {
    id: 'main-transcriber',
    matches: ['<all_urls>'],
    js: ['transcriptionContentScript.js'],
    css: ['transcriptionOverlay.css'],
    runAt: 'document_idle',
    allFrames: false,
    persistAcrossSessions: true
  },

  // UI overlay for supported platforms
  uiOverlay: {
    id: 'ui-overlay',
    matches: [
      'https://meet.google.com/*',
      'https://zoom.us/*',
      'https://*.zoom.us/*',
      'https://teams.microsoft.com/*'
    ],
    js: ['uiOverlayScript.js'],
    css: ['uiOverlay.css'],
    runAt: 'document_end',
    allFrames: true,
    persistAcrossSessions: true
  },

  // Audio capture for supported sites
  audioCapture: {
    id: 'audio-capture',
    matches: ['<all_urls>'],
    js: ['audioCaptureScript.js'],
    runAt: 'document_start',
    allFrames: false,
    persistAcrossSessions: false
  },

  // Settings and configuration UI
  settingsPanel: {
    id: 'settings-panel',
    matches: ['chrome-extension://*/settings.html'],
    js: ['settingsPanelScript.js'],
    css: ['settingsPanel.css'],
    runAt: 'document_end',
    allFrames: false,
    persistAcrossSessions: false
  }
};

/**
 * Required permissions for different script categories
 */
const PERMISSION_REQUIREMENTS = {
  audio: {
    permissions: ['activeTab', 'storage'],
    origins: []
  },
  transcription: {
    permissions: ['storage', 'scripting'],
    origins: [
      'wss://api.deepgram.com/*',
      'https://api.deepgram.com/*'
    ]
  },
  ui: {
    permissions: ['activeTab', 'storage', 'scripting'],
    origins: []
  }
};

/* ------------------------------------------------------------------ */
/* 🔧 Core Script Management                                          */
/* ------------------------------------------------------------------ */

/**
 * Extension Script Manager - Main class for managing content scripts
 */
export default class ExtensionScriptManager {
  constructor() {
    this.registeredScripts = new Map();
    this.activeTabScripts = new Map();
    this.permissionCache = new Map();
    
    // Bind event handlers
    this.handleTabUpdated = this.handleTabUpdated.bind(this);
    this.handleTabRemoved = this.handleTabRemoved.bind(this);
    
    this.setupEventListeners();
  }

  /**
   * Register all content scripts defined in the script registry
   * @param {Object} customScripts - Optional additional scripts to register
   */
  async registerContentScripts(customScripts = {}) {
    const allScripts = { ...SCRIPT_REGISTRY, ...customScripts };
    
    console.log('[ScriptManager] Registering content scripts...');
    
    for (const [scriptName, config] of Object.entries(allScripts)) {
      try {
        await this.registerSingleScript(scriptName, config);
        console.log(`[ScriptManager] Registered: ${scriptName}`);
      } catch (error) {
        console.error(`[ScriptManager] Failed to register ${scriptName}:`, error);
      }
    }
    
    // Store registration state
    await safeStorageSet('registeredScripts', Object.keys(allScripts));
    console.log('[ScriptManager] All scripts registered successfully');
  }

  /**
   * Register a single content script
   * @private
   */
  async registerSingleScript(scriptName, config) {
    // Check if we have required permissions
    const hasPermissions = await this.checkScriptPermissions(config);
    if (!hasPermissions) {
      throw new Error(`Missing permissions for script: ${scriptName}`);
    }

    // Register with Chrome's scripting API
    const registration = {
      id: config.id,
      matches: config.matches,
      js: config.js || [],
      css: config.css || [],
      runAt: config.runAt || 'document_idle',
      allFrames: config.allFrames || false,
      persistAcrossSessions: config.persistAcrossSessions || false
    };

    await chrome.scripting.registerContentScripts([registration]);
    this.registeredScripts.set(scriptName, { config, registration });
  }

  /**
   * Unregister content scripts (cleanup)
   * @param {string[]} scriptNames - Specific scripts to unregister, or all if not provided
   */
  async unregisterContentScripts(scriptNames = null) {
    const scriptsToRemove = scriptNames || Array.from(this.registeredScripts.keys());
    
    for (const scriptName of scriptsToRemove) {
      try {
        const scriptData = this.registeredScripts.get(scriptName);
        if (scriptData) {
          await chrome.scripting.unregisterContentScripts({
            ids: [scriptData.registration.id]
          });
          this.registeredScripts.delete(scriptName);
          console.log(`[ScriptManager] Unregistered: ${scriptName}`);
        }
      } catch (error) {
        console.error(`[ScriptManager] Failed to unregister ${scriptName}:`, error);
      }
    }
  }

  /* ---------------------------------------------------------------- */
  /* 🔐 Permission Management                                         */
  /* ---------------------------------------------------------------- */

  /**
   * Request all permissions needed for transcription functionality
   */
  async requestAllPermissions() {
    console.log('[ScriptManager] Requesting permissions...');
    
    const allPermissions = this.consolidatePermissions();
    
    try {
      const granted = await chrome.permissions.request({
        permissions: allPermissions.permissions,
        origins: allPermissions.origins
      });
      
      if (granted) {
        console.log('[ScriptManager] All permissions granted');
        await safeStorageSet('permissionsGranted', true);
        return true;
      } else {
        console.warn('[ScriptManager] Some permissions were denied');
        return false;
      }
    } catch (error) {
      console.error('[ScriptManager] Permission request failed:', error);
      return false;
    }
  }

  /**
   * Request specific permission for audio access
   */
  async requestAudioPermission() {
    const audioPerms = PERMISSION_REQUIREMENTS.audio;
    
    try {
      const granted = await chrome.permissions.request({
        permissions: audioPerms.permissions,
        origins: audioPerms.origins
      });
      
      if (granted) {
        this.permissionCache.set('audio', true);
        console.log('[ScriptManager] Audio permissions granted');
      }
      
      return granted;
    } catch (error) {
      console.error('[ScriptManager] Audio permission request failed:', error);
      return false;
    }
  }

  /**
   * Check if script has required permissions
   * @private
   */
  async checkScriptPermissions(scriptConfig) {
    // Determine which permission category this script needs
    let requiredPerms = { permissions: [], origins: [] };
    
    if (scriptConfig.js?.some(js => js.includes('audio'))) {
      Object.assign(requiredPerms, PERMISSION_REQUIREMENTS.audio);
    }
    if (scriptConfig.js?.some(js => js.includes('transcription'))) {
      const transcriptionPerms = PERMISSION_REQUIREMENTS.transcription;
      requiredPerms.permissions.push(...transcriptionPerms.permissions);
      requiredPerms.origins.push(...transcriptionPerms.origins);
    }
    if (scriptConfig.js?.some(js => js.includes('ui'))) {
      const uiPerms = PERMISSION_REQUIREMENTS.ui;
      requiredPerms.permissions.push(...requiredPerms.permissions);
    }

    // Remove duplicates
    requiredPerms.permissions = [...new Set(requiredPerms.permissions)];
    requiredPerms.origins = [...new Set(requiredPerms.origins)];

    // Check with Chrome
    return await chrome.permissions.contains(requiredPerms);
  }

  /**
   * Consolidate all permission requirements
   * @private
   */
  consolidatePermissions() {
    const consolidated = { permissions: [], origins: [] };
    
    Object.values(PERMISSION_REQUIREMENTS).forEach(perms => {
      consolidated.permissions.push(...perms.permissions);
      consolidated.origins.push(...perms.origins);
    });
    
    // Remove duplicates
    consolidated.permissions = [...new Set(consolidated.permissions)];
    consolidated.origins = [...new Set(consolidated.origins)];
    
    return consolidated;
  }

  /* ---------------------------------------------------------------- */
  /* 🔄 Script Reloading & Updates                                   */
  /* ---------------------------------------------------------------- */

  /**
   * Reload content scripts in all tabs running transcription
   */
  async reloadTranscriptionTabs() {
    console.log('[ScriptManager] Reloading transcription tabs...');
    
    try {
      const tabs = await chrome.tabs.query({});
      const transcriptionTabs = tabs.filter(tab => 
        this.isTranscriptionCompatibleUrl(tab.url)
      );
      
      for (const tab of transcriptionTabs) {
        await this.reloadTabScripts(tab.id);
      }
      
      console.log(`[ScriptManager] Reloaded ${transcriptionTabs.length} tabs`);
    } catch (error) {
      console.error('[ScriptManager] Failed to reload tabs:', error);
    }
  }

  /**
   * Reload scripts in a specific tab
   * @param {number} tabId - Chrome tab ID
   */
  async reloadTabScripts(tabId) {
    try {
      // Remove existing scripts
      await this.removeTabScripts(tabId);
      
      // Wait a moment for cleanup
      await delay(100);
      
      // Re-inject scripts
      await this.injectTabScripts(tabId);
      
      console.log(`[ScriptManager] Reloaded scripts in tab ${tabId}`);
    } catch (error) {
      console.error(`[ScriptManager] Failed to reload tab ${tabId}:`, error);
    }
  }

  /**
   * Inject scripts into a specific tab
   * @private
   */
  async injectTabScripts(tabId) {
    const tab = await chrome.tabs.get(tabId);
    if (!this.isTranscriptionCompatibleUrl(tab.url)) {
      return;
    }

    for (const [scriptName, scriptData] of this.registeredScripts) {
      const { config } = scriptData;
      
      // Check if this script should run on this URL
      if (this.matchesUrlPattern(tab.url, config.matches)) {
        try {
          // Inject CSS first
          if (config.css && config.css.length > 0) {
            await chrome.scripting.insertCSS({
              target: { tabId },
              files: config.css
            });
          }
          
          // Then inject JavaScript
          if (config.js && config.js.length > 0) {
            await chrome.scripting.executeScript({
              target: { tabId, allFrames: config.allFrames },
              files: config.js
            });
          }
          
          // Track active scripts for this tab
          if (!this.activeTabScripts.has(tabId)) {
            this.activeTabScripts.set(tabId, new Set());
          }
          this.activeTabScripts.get(tabId).add(scriptName);
          
        } catch (error) {
          console.error(`[ScriptManager] Failed to inject ${scriptName} into tab ${tabId}:`, error);
        }
      }
    }
  }

  /**
   * Remove scripts from a specific tab
   * @private
   */
  async removeTabScripts(tabId) {
    const activeScripts = this.activeTabScripts.get(tabId);
    if (!activeScripts) return;

    try {
      // Send cleanup message to content scripts
      await chrome.tabs.sendMessage(tabId, {
        type: 'CLEANUP_TRANSCRIPTION_SCRIPTS',
        timestamp: Date.now()
      });
    } catch (error) {
      // Tab might not be responsive, continue with cleanup
      console.warn(`[ScriptManager] Could not send cleanup message to tab ${tabId}`);
    }

    // Clear tracking
    this.activeTabScripts.delete(tabId);
  }

  /* ---------------------------------------------------------------- */
  /* 🌐 URL & Site Compatibility                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Check if URL is compatible with transcription features
   * @param {string} url - URL to check
   */
  isTranscriptionCompatibleUrl(url) {
    if (!url) return false;
    
    // Skip extension pages and special URLs
    if (url.startsWith('chrome://') || 
        url.startsWith('chrome-extension://') ||
        url.startsWith('moz-extension://') ||
        url.startsWith('about:')) {
      return false;
    }
    
    // Must be HTTP(S)
    return url.startsWith('http://') || url.startsWith('https://');
  }

  /**
   * Check if URL matches any of the given patterns
   * @private
   */
  matchesUrlPattern(url, patterns) {
    return patterns.some(pattern => {
      if (pattern === '<all_urls>') {
        return this.isTranscriptionCompatibleUrl(url);
      }
      
      // Convert Chrome match pattern to regex
      const regexPattern = pattern
        .replace(/\*/g, '.*')
        .replace(/\./g, '\\.');
      
      return new RegExp(`^${regexPattern}$`).test(url);
    });
  }

  /* ---------------------------------------------------------------- */
  /* 📡 Event Handling                                               */
  /* ---------------------------------------------------------------- */

  /**
   * Setup Chrome extension event listeners
   * @private
   */
  setupEventListeners() {
    if (chrome.tabs?.onUpdated) {
      chrome.tabs.onUpdated.addListener(this.handleTabUpdated);
    }
    
    if (chrome.tabs?.onRemoved) {
      chrome.tabs.onRemoved.addListener(this.handleTabRemoved);
    }
    
    // Listen for permission changes
    if (chrome.permissions?.onAdded) {
      chrome.permissions.onAdded.addListener((permissions) => {
        console.log('[ScriptManager] New permissions granted:', permissions);
        this.permissionCache.clear(); // Invalidate cache
      });
    }
  }

  /**
   * Handle tab updates (navigation, reload, etc.)
   * @private
   */
  async handleTabUpdated(tabId, changeInfo, tab) {
    // Only act on complete page loads
    if (changeInfo.status !== 'complete') return;
    
    // Check if this tab should have transcription scripts
    if (this.isTranscriptionCompatibleUrl(tab.url)) {
      await this.injectTabScripts(tabId);
    } else {
      // Clean up if URL no longer supports transcription
      await this.removeTabScripts(tabId);
    }
  }

  /**
   * Handle tab removal (cleanup)
   * @private
   */
  handleTabRemoved(tabId) {
    this.activeTabScripts.delete(tabId);
  }

  /* ---------------------------------------------------------------- */
  /* 🧹 Cleanup & Utilities                                          */
  /* ---------------------------------------------------------------- */

  /**
   * Get current script status for debugging
   */
  getScriptStatus() {
    return {
      registeredScripts: Array.from(this.registeredScripts.keys()),
      activeTabScripts: Object.fromEntries(
        Array.from(this.activeTabScripts.entries()).map(([tabId, scripts]) => [
          tabId, Array.from(scripts)
        ])
      ),
      permissionCache: Object.fromEntries(this.permissionCache)
    };
  }

  /**
   * Complete cleanup (for extension uninstall/disable)
   */
  async cleanup() {
    console.log('[ScriptManager] Performing cleanup...');
    
    // Unregister all scripts
    await this.unregisterContentScripts();
    
    // Clear tracking
    this.activeTabScripts.clear();
    this.permissionCache.clear();
    
    console.log('[ScriptManager] Cleanup complete');
  }
}

/* ------------------------------------------------------------------ */
/* 🚀 Standalone Helper Functions                                     */
/* ------------------------------------------------------------------ */

/**
 * Quick registration helper for simple use cases
 */
export async function registerContentScripts(scriptConfigs) {
  const manager = new ExtensionScriptManager();
  await manager.registerContentScripts(scriptConfigs);
  return manager;
}

/**
 * Quick permission request helper
 */
export async function requestTranscriptionPermissions() {
  const manager = new ExtensionScriptManager();
  return await manager.requestAllPermissions();
}

/**
 * Quick tab reload helper
 */
export async function reloadTranscriptionTabs() {
  const manager = new ExtensionScriptManager();
  await manager.reloadTranscriptionTabs();
}

/* ------------------------------------------------------------------ */
/* 📚 Usage Examples                                                  */
/* ------------------------------------------------------------------ */

/**
 * BACKGROUND SCRIPT USAGE:
 * 
 * import ExtensionScriptManager from './extensionScriptManager.js';
 * 
 * // Initialize manager
 * const scriptManager = new ExtensionScriptManager();
 * 
 * // Extension startup
 * chrome.runtime.onStartup.addListener(async () => {
 *   // Request permissions
 *   const hasPermissions = await scriptManager.requestAllPermissions();
 *   
 *   if (hasPermissions) {
 *     // Register all content scripts
 *     await scriptManager.registerContentScripts();
 *     console.log('Transcription extension ready');
 *   } else {
 *     console.warn('Missing required permissions');
 *   }
 * });
 * 
 * // Settings change handler
 * chrome.storage.onChanged.addListener(async (changes) => {
 *   if (changes.transcriptionSettings) {
 *     // Reload scripts to pick up new settings
 *     await scriptManager.reloadTranscriptionTabs();
 *   }
 * });
 * 
 * // Custom script registration
 * await scriptManager.registerContentScripts({
 *   customSite: {
 *     id: 'custom-site-support',
 *     matches: ['https://example.com/*'],
 *     js: ['customSiteScript.js'],
 *     runAt: 'document_end'
 *   }
 * });
 * 
 * SIMPLE HELPER USAGE:
 * 
 * import { registerContentScripts, requestTranscriptionPermissions } from './extensionScriptManager.js';
 * 
 * // One-liner setup
 * if (await requestTranscriptionPermissions()) {
 *   await registerContentScripts();
 * }
 */