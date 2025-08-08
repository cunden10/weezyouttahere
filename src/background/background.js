/* =======================================================================
 * background.js
 * -----------------------------------------------------------------------
 * Chrome Extension Manifest V3 Service Worker for Live Transcription
 * 
 * Handles:
 * - Extension lifecycle events
 * - API key storage and retrieval
 * - Dynamic rule updates for Deepgram authentication
 * - Cross-tab communication
 * ===================================================================== */

// Extension constants
const STORAGE_KEYS = {
  API_KEY: 'deepgram_api_key',
  SETTINGS: 'transcription_settings',
  SESSION_DATA: 'session_data'
};

// Build-time injected API key (provided via VITE_DEEPGRAM_API_KEY)
const BUILD_TIME_API_KEY = import.meta.env?.VITE_DEEPGRAM_API_KEY;

/* ------------------------------------------------------------------ */
/* 🚀  Extension Lifecycle Events                                     */
/* ------------------------------------------------------------------ */

// Extension installed/updated
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Background] Extension installed:', details.reason);
  
  if (details.reason === 'install') {
    // First time installation
    await initializeExtension();
  } else if (details.reason === 'update') {
    // Extension updated
    await handleExtensionUpdate(details.previousVersion);
  }
});

// Extension startup
chrome.runtime.onStartup.addListener(() => {
  console.log('[Background] Extension startup');
  initializeExtension();
});

/* ------------------------------------------------------------------ */
/* 🔧  Initialization Functions                                       */
/* ------------------------------------------------------------------ */

async function initializeExtension() {
  try {
    // Set default settings if not exist
    const settings = await getStorageData(STORAGE_KEYS.SETTINGS);
    if (!settings) {
      await setStorageData(STORAGE_KEYS.SETTINGS, {
        audioFeedback: true,
        language: 'en-US',
        model: 'nova-2',
        enableInterimResults: true,
        volume: 0.7
      });
    }

    // Seed API key from build-time env if not already stored
    const existingKey = await getStorageData(STORAGE_KEYS.API_KEY);
    if (!existingKey && typeof BUILD_TIME_API_KEY === 'string' && BUILD_TIME_API_KEY.length > 0) {
      await setStorageData(STORAGE_KEYS.API_KEY, BUILD_TIME_API_KEY);
      console.log('[Background] Seeded Deepgram API key from build-time configuration');
    }
    
    // Update declarative rules with stored API key
    await updateDeepgramRules();
    
    console.log('[Background] Extension initialized successfully');
  } catch (error) {
    console.error('[Background] Initialization failed:', error);
  }
}

async function handleExtensionUpdate(previousVersion) {
  console.log(`[Background] Updated from ${previousVersion} to ${chrome.runtime.getManifest().version}`);
  
  // Handle version-specific migrations here
  // Example: migrate settings format between versions
}

/* ------------------------------------------------------------------ */
/* 🔑  API Key Management                                             */
/* ------------------------------------------------------------------ */

async function updateDeepgramRules() {
  const apiKey = await getStorageData(STORAGE_KEYS.API_KEY);
  
  if (!apiKey) {
    console.log('[Background] No API key found, skipping rule updates');
    return;
  }
  
  try {
    // Get current rules
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    
    // Remove existing Deepgram rules
    const ruleIdsToRemove = rules
      .filter(rule => rule.id >= 1 && rule.id <= 2)
      .map(rule => rule.id);
    
    if (ruleIdsToRemove.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: ruleIdsToRemove
      });
    }
    
    // Add updated rules with real API key
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [
        {
          id: 1,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              {
                header: "Authorization",
                operation: "set",
                value: `Token ${apiKey}`
              }
            ]
          },
          condition: {
            urlFilter: "wss://api.deepgram.com/v1/listen*",
            resourceTypes: ["websocket"]
          }
        },
        {
          id: 2,
          priority: 2,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              {
                header: "User-Agent",
                operation: "set",
                value: "LiveTranscriptionExtension/1.0"
              }
            ]
          },
          condition: {
            urlFilter: "*://api.deepgram.com/*",
            requestMethods: ["get", "post"],
            resourceTypes: ["xmlhttprequest", "websocket"]
          }
        }
      ]
    });
    
    console.log('[Background] Deepgram rules updated successfully');
  } catch (error) {
    console.error('[Background] Failed to update Deepgram rules:', error);
  }
}

/* ------------------------------------------------------------------ */
/* 💬  Message Handling                                              */
/* ------------------------------------------------------------------ */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received message:', message.type);
  
  switch (message.type) {
    case 'GET_API_KEY':
      handleGetApiKey(sendResponse);
      return true; // Keep channel open for async response
      
    case 'SET_API_KEY':
      handleSetApiKey(message.apiKey, sendResponse);
      return true;
      
    case 'GET_SETTINGS':
      handleGetSettings(sendResponse);
      return true;
      
    case 'UPDATE_SETTINGS':
      handleUpdateSettings(message.settings, sendResponse);
      return true;
      
    case 'START_TRANSCRIPTION':
      handleStartTranscription(message.config, sendResponse);
      return true;
      
    case 'STOP_TRANSCRIPTION':
      handleStopTranscription(sendResponse);
      return true;
      
    case 'CHECK_CONTENT_SCRIPTS':
      // ✅ Check registered content scripts using correct API
      handleCheckContentScripts(sendResponse);
      return true;
      
    case 'CHECK_CONTENT_SCRIPT_ACTIVE':
      // ✅ Check if content script is active in specific tab
      handleCheckContentScriptActive(message.tabId, sendResponse);
      return true;
      
    case 'INJECT_CONTENT_SCRIPT':
      // ✅ Inject content script into specific tab
      handleInjectContentScript(message.tabId, message.script, sendResponse);
      return true;
      
    case 'CONTENT_SCRIPT_READY':
      // ✅ Handle content script readiness signals
      handleContentScriptReady(message, sender, sendResponse);
      return true;
      
    default:
      console.warn('[Background] Unknown message type:', message.type);
      sendResponse({ success: false, error: 'Unknown message type' });
  }
});

/* ------------------------------------------------------------------ */
/* 📨  Message Handlers                                              */
/* ------------------------------------------------------------------ */

async function handleGetApiKey(sendResponse) {
  try {
    const apiKey = await getStorageData(STORAGE_KEYS.API_KEY);
    sendResponse({ success: true, apiKey });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleSetApiKey(apiKey, sendResponse) {
  try {
    await setStorageData(STORAGE_KEYS.API_KEY, apiKey);
    await updateDeepgramRules();
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleGetSettings(sendResponse) {
  try {
    const settings = await getStorageData(STORAGE_KEYS.SETTINGS);
    sendResponse({ success: true, settings });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleUpdateSettings(newSettings, sendResponse) {
  try {
    const currentSettings = await getStorageData(STORAGE_KEYS.SETTINGS) || {};
    const updatedSettings = { ...currentSettings, ...newSettings };
    await setStorageData(STORAGE_KEYS.SETTINGS, updatedSettings);
    sendResponse({ success: true, settings: updatedSettings });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleStartTranscription(config, sendResponse) {
  try {
    // Store session data
    await setStorageData(STORAGE_KEYS.SESSION_DATA, {
      active: true,
      startTime: Date.now(),
      config
    });
    
    // Update badge to show active state
    await chrome.action.setBadgeText({ text: '●' });
    await chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
    
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleStopTranscription(sendResponse) {
  try {
    // Clear session data
    await setStorageData(STORAGE_KEYS.SESSION_DATA, {
      active: false,
      endTime: Date.now()
    });
    
    // Clear badge
    await chrome.action.setBadgeText({ text: '' });
    
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * ✅ Check registered content scripts using correct Chrome API
 */
async function handleCheckContentScripts(sendResponse) {
  try {
    const scripts = await chrome.scripting.getRegisteredContentScripts();
    console.log('[Background] Registered content scripts:', scripts.length);
    
    // Analyze scripts for debugging
    const scriptInfo = scripts.map(script => ({
      id: script.id,
      matches: script.matches,
      js: script.js,
      runAt: script.runAt
    }));
    
    sendResponse({ 
      success: true, 
      scripts: scriptInfo,
      count: scripts.length,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('[Background] Failed to get content scripts:', error);
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

/**
 * ✅ Check if content script is active in a specific tab
 */
async function handleCheckContentScriptActive(tabId, sendResponse) {
  try {
    const isActive = await checkContentScriptActive(tabId);
    sendResponse({ 
      success: true, 
      active: isActive,
      tabId,
      timestamp: Date.now()
    });
  } catch (error) {
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

/**
 * ✅ Function to check if content script is active in a tab
 */
async function checkContentScriptActive(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    return response && response.success;
  } catch (error) {
    return false;
  }
}

/**
 * ✅ Inject content script into specific tab
 */
async function handleInjectContentScript(tabId, scriptName, sendResponse) {
  try {
    console.log(`[Background] Injecting ${scriptName} into tab ${tabId}`);
    
    // Define script paths
    const scriptPaths = {
      'salesloft': ['src/content/salesloftIntegration.js'],
      'apollo': ['src/content/apolloIntegration.js'],
      'meeting': ['src/content/meetingOverlay.js'],
      'contentScript': ['src/content/contentScript.js']
    };
    
    const files = scriptPaths[scriptName];
    if (!files) {
      throw new Error(`Unknown script: ${scriptName}`);
    }
    
    // Check if tab exists and is ready
    const tab = await chrome.tabs.get(tabId);
    if (tab.status !== 'complete' || !tab.url.startsWith('http')) {
      throw new Error('Tab not ready for script injection');
    }
    
    // Inject the script
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: files
    });
    
    // Wait a moment for script to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Verify injection worked
    const isActive = await checkContentScriptActive(tabId);
    
    sendResponse({ 
      success: true, 
      injected: true,
      active: isActive,
      script: scriptName,
      tabId,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error(`[Background] Failed to inject script:`, error);
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

/**
 * ✅ Handle content script readiness signals
 */
async function handleContentScriptReady(message, sender, sendResponse) {
  const { script, context, url } = message;
  const tabId = sender.tab?.id;
  
  console.log(`[Background] Content script ready: ${script || context} on tab ${tabId}`);
  console.log(`[Background] URL: ${url}`);
  
  // Store readiness info (could be used for monitoring)
  try {
    const readyScripts = await getStorageData('readyContentScripts') || {};
    readyScripts[tabId] = {
      script: script || context,
      url,
      timestamp: Date.now(),
      tabId
    };
    await setStorageData('readyContentScripts', readyScripts);
    
    sendResponse({ 
      success: true, 
      acknowledged: true,
      tabId,
      timestamp: Date.now()
    });
  } catch (error) {
    sendResponse({ 
      success: false, 
      error: error.message 
    });
  }
}

/* ------------------------------------------------------------------ */
/* 💾  Storage Utilities                                             */
/* ------------------------------------------------------------------ */

function getStorageData(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get([key], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result[key]);
      }
    });
  });
}

function setStorageData(key, value) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/* ------------------------------------------------------------------ */
/* 🎯  Tab Management                                                */
/* ------------------------------------------------------------------ */

// Handle tab updates for active transcription sessions
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    const sessionData = await getStorageData(STORAGE_KEYS.SESSION_DATA);
    if (sessionData?.active) {
      // Could inject content script or notify about active session
      console.log('[Background] Page loaded with active transcription session');
    }
  }
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  // Could handle cleanup of tab-specific transcription sessions
  console.log('[Background] Tab closed:', tabId);
});

/* ------------------------------------------------------------------ */
/* 🔧  Utility Functions                                             */
/* ------------------------------------------------------------------ */

/**
 * ✅ IMPROVED: Send message to tab with proper error handling
 * @param {number} tabId - Tab ID to send message to
 * @param {Object} message - Message to send
 * @returns {Promise<Object|null>} Response or null if failed
 */
async function sendMessageSafely(tabId, message) {
  try {
    // Check if tab exists and is ready
    const tab = await chrome.tabs.get(tabId);
    
    if (tab.status === 'complete' && tab.url.startsWith('http')) {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response;
    } else {
      console.log(`[Background] Tab ${tabId} not ready:`, {
        status: tab.status,
        url: tab.url.substring(0, 50) + '...'
      });
      return null;
    }
  } catch (error) {
    // Handle the lastError gracefully
    if (chrome.runtime.lastError) {
      console.log('[Background] Message sending failed:', chrome.runtime.lastError.message);
    }
    console.log(`[Background] Failed to send message to tab ${tabId}:`, error.message);
    return null;
  }
}

/**
 * ✅ IMPROVED: Send message to all tabs with better error handling
 * @param {Object} message - Message to broadcast
 * @param {Object} options - Broadcast options
 */
async function broadcastToTabs(message, options = {}) {
  try {
    const queryOptions = {
      url: options.urlPattern || ['https://*/*', 'http://*/*'],
      ...options.tabQuery
    };
    
    const tabs = await chrome.tabs.query(queryOptions);
    console.log(`[Background] Broadcasting to ${tabs.length} tabs:`, message.type);
    
    const results = await Promise.allSettled(
      tabs.map(tab => sendMessageSafely(tab.id, message))
    );
    
    const successful = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
    console.log(`[Background] Broadcast completed: ${successful}/${tabs.length} successful`);
    
    return { successful, total: tabs.length };
  } catch (error) {
    console.error('[Background] Failed to broadcast message:', error);
    return { successful: 0, total: 0 };
  }
}

// Get extension info
function getExtensionInfo() {
  const manifest = chrome.runtime.getManifest();
  return {
    name: manifest.name,
    version: manifest.version,
    id: chrome.runtime.id
  };
}

console.log('[Background] Service worker initialized:', getExtensionInfo());