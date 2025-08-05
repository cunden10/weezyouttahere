/* =======================================================================
 * content.js
 * -----------------------------------------------------------------------
 * Chrome Extension Content Script for Live Transcription
 * 
 * Injected into web pages to provide transcription functionality
 * and communicate with the background service worker.
 * ===================================================================== */

// Only run on pages where transcription makes sense
if (window.location.protocol === 'https:' || window.location.protocol === 'http:') {
  
  // Prevent multiple injections
  if (!window.liveTranscriptionInjected) {
    window.liveTranscriptionInjected = true;
    
    console.log('[Content] Live transcription content script loaded');
    
    /* ------------------------------------------------------------------ */
    /* 🔧  Initialization                                                 */
    /* ------------------------------------------------------------------ */
    
    let isTranscriptionActive = false;
    let transcriber = null;
    
    // Communication with background script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[Content] Received message:', message.type);
      
      switch (message.type) {
        case 'ACTIVATE_TRANSCRIPTION':
          handleActivateTranscription(message.config, sendResponse);
          return true;
          
        case 'DEACTIVATE_TRANSCRIPTION':
          handleDeactivateTranscription(sendResponse);
          return true;
          
        case 'GET_TRANSCRIPTION_STATUS':
          sendResponse({ active: isTranscriptionActive });
          break;
          
        case 'INJECT_OVERLAY':
          handleInjectOverlay(sendResponse);
          return true;
          
        default:
          console.warn('[Content] Unknown message type:', message.type);
      }
    });
    
    /* ------------------------------------------------------------------ */
    /* 📝  Transcription Handlers                                         */
    /* ------------------------------------------------------------------ */
    
    async function handleActivateTranscription(config, sendResponse) {
      try {
        if (isTranscriptionActive) {
          sendResponse({ success: false, error: 'Transcription already active' });
          return;
        }
        
        // Dynamic import of transcription modules
        const { default: createLiveTranscriber } = await import(chrome.runtime.getURL('transcriptionBootstrap.js'));
        
        // Get API key from background
        const apiKeyResponse = await sendMessageToBackground({ type: 'GET_API_KEY' });
        if (!apiKeyResponse.success || !apiKeyResponse.apiKey) {
          throw new Error('No API key configured');
        }
        
        // Create transcriber instance
        transcriber = createLiveTranscriber({
          deepgramKey: apiKeyResponse.apiKey,
          language: config.language || 'en-US',
          model: config.model || 'nova-2',
          enableInterimResults: config.enableInterimResults !== false,
          enableLogging: config.enableLogging || false,
          
          onTranscript: (text, meta) => {
            handleTranscriptReceived(text, meta, false);
          },
          
          onFinalTranscript: (text, meta) => {
            handleTranscriptReceived(text, meta, true);
          },
          
          onError: (error) => {
            console.error('[Content] Transcription error:', error);
            handleTranscriptionError(error);
          },
          
          onSessionStart: (sessionId) => {
            console.log('[Content] Transcription session started:', sessionId);
            isTranscriptionActive = true;
            notifyTranscriptionStatus('started', { sessionId });
          },
          
          onSessionEnd: (data) => {
            console.log('[Content] Transcription session ended:', data);
            isTranscriptionActive = false;
            notifyTranscriptionStatus('ended', data);
          }
        });
        
        // Start transcription
        await transcriber.start();
        
        sendResponse({ success: true });
        
      } catch (error) {
        console.error('[Content] Failed to activate transcription:', error);
        sendResponse({ success: false, error: error.message });
      }
    }
    
    async function handleDeactivateTranscription(sendResponse) {
      try {
        if (!isTranscriptionActive || !transcriber) {
          sendResponse({ success: false, error: 'No active transcription' });
          return;
        }
        
        await transcriber.stop();
        transcriber = null;
        isTranscriptionActive = false;
        
        sendResponse({ success: true });
        
      } catch (error) {
        console.error('[Content] Failed to deactivate transcription:', error);
        sendResponse({ success: false, error: error.message });
      }
    }
    
    /* ------------------------------------------------------------------ */
    /* 📺  Overlay Management                                             */
    /* ------------------------------------------------------------------ */
    
    function handleInjectOverlay(sendResponse) {
      try {
        // Check if overlay already exists
        if (document.getElementById('live-transcription-overlay')) {
          sendResponse({ success: true, message: 'Overlay already exists' });
          return;
        }
        
        // Create transcription overlay
        const overlay = createTranscriptionOverlay();
        document.body.appendChild(overlay);
        
        sendResponse({ success: true });
        
      } catch (error) {
        console.error('[Content] Failed to inject overlay:', error);
        sendResponse({ success: false, error: error.message });
      }
    }
    
    function createTranscriptionOverlay() {
      const overlay = document.createElement('div');
      overlay.id = 'live-transcription-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        width: 300px;
        min-height: 100px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        border-radius: 8px;
        padding: 16px;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        font-size: 14px;
        line-height: 1.4;
        z-index: 10000;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        max-height: 300px;
        overflow-y: auto;
        display: none;
      `;
      
      overlay.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <span style="font-weight: 600; color: #4CAF50;">🎙️ Live Transcription</span>
          <button id="close-transcription-overlay" style="
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            padding: 4px;
            font-size: 16px;
            opacity: 0.7;
          ">×</button>
        </div>
        <div id="transcription-content" style="
          min-height: 60px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          padding: 8px;
          background: rgba(255, 255, 255, 0.05);
        ">
          <div id="interim-transcript" style="color: #ccc; font-style: italic;"></div>
          <div id="final-transcript" style="color: white; margin-top: 4px;"></div>
        </div>
        <div style="margin-top: 12px; display: flex; gap: 8px;">
          <button id="toggle-transcription" style="
            background: #4CAF50;
            border: none;
            color: white;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
          ">Start</button>
          <button id="clear-transcript" style="
            background: #666;
            border: none;
            color: white;
            padding: 6px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
          ">Clear</button>
        </div>
      `;
      
      // Add event listeners
      overlay.querySelector('#close-transcription-overlay').addEventListener('click', () => {
        overlay.style.display = 'none';
      });
      
      overlay.querySelector('#toggle-transcription').addEventListener('click', () => {
        toggleTranscription();
      });
      
      overlay.querySelector('#clear-transcript').addEventListener('click', () => {
        clearTranscript();
      });
      
      return overlay;
    }
    
    /* ------------------------------------------------------------------ */
    /* 📝  Transcript Handling                                           */
    /* ------------------------------------------------------------------ */
    
    function handleTranscriptReceived(text, meta, isFinal) {
      const overlay = document.getElementById('live-transcription-overlay');
      if (!overlay) return;
      
      if (isFinal) {
        const finalDiv = overlay.querySelector('#final-transcript');
        finalDiv.textContent += text + ' ';
        
        // Clear interim
        const interimDiv = overlay.querySelector('#interim-transcript');
        interimDiv.textContent = '';
        
        // Auto-scroll to bottom
        const content = overlay.querySelector('#transcription-content');
        content.scrollTop = content.scrollHeight;
      } else {
        const interimDiv = overlay.querySelector('#interim-transcript');
        interimDiv.textContent = text;
      }
      
      // Show overlay if hidden
      if (overlay.style.display === 'none') {
        overlay.style.display = 'block';
      }
    }
    
    function handleTranscriptionError(error) {
      const overlay = document.getElementById('live-transcription-overlay');
      if (!overlay) return;
      
      const interimDiv = overlay.querySelector('#interim-transcript');
      interimDiv.style.color = '#ff6b6b';
      interimDiv.textContent = `Error: ${error.message}`;
      
      // Reset button state
      const toggleBtn = overlay.querySelector('#toggle-transcription');
      toggleBtn.textContent = 'Start';
      toggleBtn.style.background = '#4CAF50';
    }
    
    function clearTranscript() {
      const overlay = document.getElementById('live-transcription-overlay');
      if (!overlay) return;
      
      overlay.querySelector('#final-transcript').textContent = '';
      overlay.querySelector('#interim-transcript').textContent = '';
    }
    
    async function toggleTranscription() {
      const overlay = document.getElementById('live-transcription-overlay');
      const toggleBtn = overlay.querySelector('#toggle-transcription');
      
      if (isTranscriptionActive) {
        // Stop transcription
        const response = await sendMessageToBackground({ type: 'STOP_TRANSCRIPTION' });
        if (response.success) {
          toggleBtn.textContent = 'Start';
          toggleBtn.style.background = '#4CAF50';
        }
      } else {
        // Start transcription
        toggleBtn.textContent = 'Starting...';
        toggleBtn.style.background = '#ff9800';
        
        const response = await sendMessageToBackground({ 
          type: 'START_TRANSCRIPTION',
          config: { enableLogging: true }
        });
        
        if (response.success) {
          // Will be handled by activation logic
        } else {
          toggleBtn.textContent = 'Start';
          toggleBtn.style.background = '#4CAF50';
          handleTranscriptionError(new Error(response.error));
        }
      }
    }
    
    /* ------------------------------------------------------------------ */
    /* 💬  Communication Utilities                                       */
    /* ------------------------------------------------------------------ */
    
    function sendMessageToBackground(message) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (response) => {
          resolve(response || { success: false, error: 'No response' });
        });
      });
    }
    
    function notifyTranscriptionStatus(status, data) {
      // Could notify other parts of the page or send analytics
      console.log(`[Content] Transcription ${status}:`, data);
      
      // Update overlay button state
      const overlay = document.getElementById('live-transcription-overlay');
      if (overlay) {
        const toggleBtn = overlay.querySelector('#toggle-transcription');
        if (status === 'started') {
          toggleBtn.textContent = 'Stop';
          toggleBtn.style.background = '#f44336';
        } else if (status === 'ended') {
          toggleBtn.textContent = 'Start';
          toggleBtn.style.background = '#4CAF50';
        }
      }
    }
    
    /* ------------------------------------------------------------------ */
    /* 🎯  Page Integration                                               */
    /* ------------------------------------------------------------------ */
    
    // Listen for keyboard shortcut to toggle overlay
    document.addEventListener('keydown', (event) => {
      // Ctrl+Shift+T to toggle transcription overlay
      if (event.ctrlKey && event.shiftKey && event.key === 'T') {
        event.preventDefault();
        const overlay = document.getElementById('live-transcription-overlay');
        if (overlay) {
          overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
        } else {
          handleInjectOverlay(() => {
            document.getElementById('live-transcription-overlay').style.display = 'block';
          });
        }
      }
    });
    
    // Auto-inject overlay on pages with video/audio elements
    function checkForMediaElements() {
      const hasVideo = document.querySelector('video');
      const hasAudio = document.querySelector('audio');
      
      if ((hasVideo || hasAudio) && !document.getElementById('live-transcription-overlay')) {
        // Auto-inject but keep hidden
        handleInjectOverlay(() => {});
      }
    }
    
    // Check for media elements after page load
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', checkForMediaElements);
    } else {
      checkForMediaElements();
    }
    
    console.log('[Content] Live transcription content script ready');
  }
}