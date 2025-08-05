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

// Send message to all tabs
async function broadcastToTabs(message) {
  try {
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {
        // Ignore errors for tabs that can't receive messages
      });
    });
  } catch (error) {
    console.error('[Background] Failed to broadcast message:', error);
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