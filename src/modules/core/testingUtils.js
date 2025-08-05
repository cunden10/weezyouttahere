/* =======================================================================
 * testingUtils.js
 * -----------------------------------------------------------------------
 * Testing and validation utilities for the Live Transcription Extension
 * 
 * Use these functions in browser console for debugging and validation:
 * - Test WebSocket connections to Deepgram
 * - Validate API access to SalesLoft
 * - Test Chrome extension message passing
 * - Verify extension functionality
 * ===================================================================== */

/**
 * ✅ Test WebSocket connection to Deepgram
 * Usage: testDeepgramConnection('your_api_key_here')
 * @param {string} apiKey - Deepgram API key
 * @returns {Promise<boolean>} True if connection successful
 */
export const testDeepgramConnection = (apiKey) => {
  return new Promise((resolve, reject) => {
    if (!apiKey || !apiKey.startsWith('sk-')) {
      console.error('❌ Invalid Deepgram API key format. Should start with "sk-"');
      reject(new Error('Invalid API key format'));
      return;
    }

    console.log('🔄 Testing Deepgram WebSocket connection...');
    
    const wsUrl = `wss://api.deepgram.com/v1/listen?` +
      `token=${apiKey}&` +
      `model=nova-2&` +
      `language=en-US&` +
      `interim_results=true&` +
      `vad_events=true`;
    
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      ws.close();
      console.error('❌ Deepgram WebSocket connection timeout');
      reject(new Error('Connection timeout'));
    }, 10000);
    
    ws.onopen = () => {
      clearTimeout(timeout);
      console.log('✅ Deepgram WebSocket connected successfully');
      ws.close();
      resolve(true);
    };
    
    ws.onerror = (error) => {
      clearTimeout(timeout);
      console.error('❌ Deepgram WebSocket connection failed:', error);
      reject(error);
    };

    ws.onclose = (event) => {
      console.log(`🔌 WebSocket closed: ${event.code} ${event.reason}`);
    };
  });
};

/**
 * ✅ Test SalesLoft API access
 * Usage: testSalesLoftAPI('your_salesloft_token_here')
 * @param {string} token - SalesLoft API token
 * @returns {Promise<Object>} API response or error
 */
export const testSalesLoftAPI = async (token) => {
  try {
    if (!token) {
      throw new Error('SalesLoft API token is required');
    }

    console.log('🔄 Testing SalesLoft API access...');
    
    const response = await fetch('https://api.salesloft.com/v2/me.json', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ SalesLoft API accessible:', {
        status: response.status,
        user: data.data?.name || 'Unknown',
        team: data.data?.team?.name || 'Unknown'
      });
      return { success: true, data: data.data };
    } else {
      const errorText = await response.text();
      console.error('❌ SalesLoft API error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('❌ SalesLoft API connection failed:', error.message);
    throw error;
  }
};

/**
 * ✅ Test Chrome extension message passing
 * Usage: testMessagePassing() (run in background script console)
 * @param {string} messageType - Type of message to send
 * @returns {Promise<Array>} Results from all tabs
 */
export const testMessagePassing = async (messageType = 'PING') => {
  try {
    console.log(`🔄 Testing message passing with type: ${messageType}`);
    
    const tabs = await chrome.tabs.query({
      url: ['https://*/*', 'http://*/*']
    });
    
    console.log(`📡 Found ${tabs.length} tabs to test`);
    
    const results = await Promise.allSettled(
      tabs.map(async (tab) => {
        try {
          const response = await chrome.tabs.sendMessage(tab.id, {
            type: messageType,
            timestamp: Date.now(),
            testId: Math.random().toString(36).substr(2, 9)
          });
          
          return {
            tabId: tab.id,
            url: tab.url.substring(0, 50) + '...',
            success: true,
            response
          };
        } catch (error) {
          return {
            tabId: tab.id,
            url: tab.url.substring(0, 50) + '...',
            success: false,
            error: error.message
          };
        }
      })
    );
    
    const successful = results.filter(r => 
      r.status === 'fulfilled' && r.value.success
    ).length;
    
    console.log(`✅ Message passing test completed: ${successful}/${tabs.length} successful`);
    
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const { tabId, url, success, response, error } = result.value;
        if (success) {
          console.log(`✅ Tab ${tabId} (${url}):`, response);
        } else {
          console.log(`❌ Tab ${tabId} (${url}):`, error);
        }
      }
    });
    
    return results.map(r => r.value);
  } catch (error) {
    console.error('❌ Message passing test failed:', error);
    throw error;
  }
};

/**
 * ✅ Test content script readiness on current tab
 * Usage: testContentScriptReadiness() (run in popup or background)
 */
export const testContentScriptReadiness = async () => {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    
    if (!tab) {
      throw new Error('No active tab found');
    }
    
    console.log(`🔄 Testing content script readiness on: ${tab.url}`);
    
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'PING',
      timestamp: Date.now()
    });
    
    console.log('✅ Content script is ready:', response);
    return response;
  } catch (error) {
    console.error('❌ Content script not ready:', error.message);
    throw error;
  }
};

/**
 * ✅ Comprehensive extension health check
 * Usage: runExtensionHealthCheck()
 */
export const runExtensionHealthCheck = async () => {
  console.log('🏥 Running comprehensive extension health check...\n');
  
  const results = {
    permissions: null,
    storage: null,
    messaging: null,
    apiAccess: null
  };
  
  try {
    // Test permissions
    console.log('1️⃣ Checking permissions...');
    const permissions = await chrome.permissions.getAll();
    results.permissions = {
      success: true,
      data: permissions
    };
    console.log('✅ Permissions OK:', permissions.permissions);
  } catch (error) {
    results.permissions = { success: false, error: error.message };
    console.error('❌ Permissions check failed:', error);
  }
  
  try {
    // Test storage
    console.log('\n2️⃣ Checking storage...');
    await chrome.storage.local.set({ healthCheck: Date.now() });
    const stored = await chrome.storage.local.get('healthCheck');
    results.storage = {
      success: true,
      data: stored
    };
    console.log('✅ Storage OK');
  } catch (error) {
    results.storage = { success: false, error: error.message };
    console.error('❌ Storage check failed:', error);
  }
  
  try {
    // Test messaging
    console.log('\n3️⃣ Checking message passing...');
    const messagingResults = await testMessagePassing('HEALTH_CHECK');
    const successful = messagingResults.filter(r => r.success).length;
    results.messaging = {
      success: successful > 0,
      data: { successful, total: messagingResults.length }
    };
    console.log(`✅ Messaging OK: ${successful}/${messagingResults.length} tabs responding`);
  } catch (error) {
    results.messaging = { success: false, error: error.message };
    console.error('❌ Messaging check failed:', error);
  }
  
  // Test API access (requires user input)
  console.log('\n4️⃣ API access check skipped (requires tokens)');
  console.log('   Use testDeepgramConnection(apiKey) and testSalesLoftAPI(token) manually');
  
  console.log('\n🏥 Health check complete:', results);
  return results;
};

// Make functions available globally for console testing
if (typeof window !== 'undefined') {
  window.ExtensionTesting = {
    testDeepgramConnection,
    testSalesLoftAPI,
    testMessagePassing,
    testContentScriptReadiness,
    runExtensionHealthCheck
  };
  
  console.log('🧪 Extension testing utilities loaded. Available at window.ExtensionTesting');
}