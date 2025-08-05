/**
 * Transcription Bootstrap - Entry point for browser-based live audio transcription
 * 
 * This module provides a simple factory function to create and configure a complete
 * audio-to-text transcription pipeline using Deepgram's real-time API.
 * 
 * Handles AudioWorklet registration, audio capture setup, and provides a clean
 * interface for starting/stopping live transcription sessions.
 * 
 * @author Generated for live transcription use case
 * @version 1.0.0
 */

// Import core transcription modules
import { DeepgramLiveTranscriber, TRANSCRIPTION_EVENTS, AUDIO_SOURCE_TYPES } from '../core/deepgramLiveTranscriber.js';

// ===== CONSTANTS =====

const WORKLET_CONFIG = {
    PROCESSOR_NAME: 'audio-stream-processor',
    WORKLET_FILE: './audioStreamProcessor.js',
    REGISTRATION_TIMEOUT: 5000
};

const DEFAULT_OPTIONS = {
    // Deepgram configuration
    deepgramKey: null,
    language: 'en-US',
    model: 'nova-2',
    
    // Audio configuration
    audioSource: AUDIO_SOURCE_TYPES.MICROPHONE,
    enableInterimResults: true,
    enablePunctuation: true,
    
    // Callback functions
    onTranscript: null,
    onFinalTranscript: null,
    onSessionStart: null,
    onSessionEnd: null,
    onError: null,
    onConnectionStatus: null,
    
    // Debug options
    enableLogging: false
};

// ===== WORKLET REGISTRATION MANAGER =====

class WorkletManager {
    constructor() {
        this.registeredContexts = new WeakSet();
        this.registrationPromises = new Map();
    }

    /**
     * Register AudioWorklet processor if not already registered for this context
     */
    async ensureWorkletRegistered(audioContext) {
        // Check if already registered for this context
        if (this.registeredContexts.has(audioContext)) {
            return true;
        }

        // Check if registration is in progress
        const contextId = this.getContextId(audioContext);
        if (this.registrationPromises.has(contextId)) {
            return await this.registrationPromises.get(contextId);
        }

        // Start registration process
        const registrationPromise = this.registerWorklet(audioContext);
        this.registrationPromises.set(contextId, registrationPromise);

        try {
            const result = await registrationPromise;
            if (result) {
                this.registeredContexts.add(audioContext);
            }
            return result;
        } finally {
            this.registrationPromises.delete(contextId);
        }
    }

    /**
     * Actually register the worklet
     */
    async registerWorklet(audioContext) {
        try {
            // Resolve worklet URL (handle different module contexts)
            const workletUrl = await this.resolveWorkletUrl();
            
            // Register with timeout
            await Promise.race([
                audioContext.audioWorklet.addModule(workletUrl),
                new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Worklet registration timeout')), 
                              WORKLET_CONFIG.REGISTRATION_TIMEOUT);
                })
            ]);

            return true;
        } catch (error) {
            console.warn('AudioWorklet registration failed, falling back to ScriptProcessorNode:', error);
            return false;
        }
    }

    /**
     * Resolve the worklet file URL based on current module context
     */
    async resolveWorkletUrl() {
        // Try different resolution strategies
        const strategies = [
            // Relative to current module
            () => new URL(WORKLET_CONFIG.WORKLET_FILE, import.meta.url).href,
            
            // Chrome extension context
            () => chrome?.runtime?.getURL ? chrome.runtime.getURL(WORKLET_CONFIG.WORKLET_FILE) : null,
            
            // Direct relative path
            () => WORKLET_CONFIG.WORKLET_FILE,
            
            // Construct from base URL
            () => `${window.location.origin}/${WORKLET_CONFIG.WORKLET_FILE.replace('./', '')}`
        ];

        for (const strategy of strategies) {
            try {
                const url = strategy();
                if (url) {
                    // Test if URL is accessible
                    await fetch(url, { method: 'HEAD' });
                    return url;
                }
            } catch (error) {
                // Continue to next strategy
                continue;
            }
        }

        throw new Error(`Could not resolve AudioWorklet file: ${WORKLET_CONFIG.WORKLET_FILE}`);
    }

    /**
     * Generate a unique ID for audio context tracking
     */
    getContextId(audioContext) {
        return `${audioContext.sampleRate}_${audioContext.state}_${Date.now()}`;
    }
}

// Global worklet manager instance
const workletManager = new WorkletManager();

// ===== TRANSCRIBER WRAPPER CLASS =====

/**
 * LiveTranscriberInstance - Wrapper that provides a simplified API
 */
class LiveTranscriberInstance {
    constructor(options = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.transcriber = null;
        this.isInitialized = false;
        this.sessionActive = false;
        
        // Validate required options
        if (!this.options.deepgramKey) {
            throw new Error('Deepgram API key is required');
        }
        
        this.log('Live transcriber instance created');
    }

    /**
     * Initialize the transcriber (lazy initialization)
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        try {
            // Create transcriber instance
            this.transcriber = new DeepgramLiveTranscriber({
                apiKey: this.options.deepgramKey,
                language: this.options.language,
                model: this.options.model,
                audioSource: this.options.audioSource,
                enableInterimResults: this.options.enableInterimResults,
                enablePunctuation: this.options.enablePunctuation
            });

            // Set up event listeners
            this.setupEventListeners();
            
            this.isInitialized = true;
            this.log('Transcriber initialized successfully');
            
        } catch (error) {
            this.log('Failed to initialize transcriber:', error);
            throw new Error(`Transcriber initialization failed: ${error.message}`);
        }
    }

    /**
     * Set up event listeners for transcriber events
     */
    setupEventListeners() {
        // Transcript events
        if (this.options.onTranscript) {
            this.transcriber.on(TRANSCRIPTION_EVENTS.TRANSCRIPT_RECEIVED, (data) => {
                this.options.onTranscript(data.transcript, {
                    isFinal: false,
                    confidence: data.confidence,
                    fullTranscript: data.fullTranscript
                });
            });
        }

        if (this.options.onFinalTranscript) {
            this.transcriber.on(TRANSCRIPTION_EVENTS.TRANSCRIPT_FINALIZED, (data) => {
                this.options.onFinalTranscript(data.transcript, {
                    confidence: data.confidence,
                    fullTranscript: data.fullTranscript
                });
            });
        }

        // Session events
        if (this.options.onSessionStart) {
            this.transcriber.on(TRANSCRIPTION_EVENTS.SESSION_STARTED, (data) => {
                this.sessionActive = true;
                this.options.onSessionStart(data.sessionId);
            });
        }

        if (this.options.onSessionEnd) {
            this.transcriber.on(TRANSCRIPTION_EVENTS.SESSION_ENDED, (data) => {
                this.sessionActive = false;
                this.options.onSessionEnd({
                    sessionId: data.sessionId,
                    duration: data.duration,
                    transcript: data.transcript
                });
            });
        }

        // Error handling
        if (this.options.onError) {
            this.transcriber.on(TRANSCRIPTION_EVENTS.ERROR, (data) => {
                this.options.onError(new Error(data.error));
            });
        }

        // Connection status
        if (this.options.onConnectionStatus) {
            this.transcriber.on(TRANSCRIPTION_EVENTS.CONNECTION_STATUS, (data) => {
                this.options.onConnectionStatus(data.status, data);
            });
        }
    }

    /**
     * Start transcription session
     */
    async start(startOptions = {}) {
        if (this.sessionActive) {
            throw new Error('Transcription session already active');
        }

        try {
            // Initialize if needed
            if (!this.isInitialized) {
                await this.initialize();
            }

            this.log('Starting transcription session...');
            const sessionId = await this.transcriber.startTranscription(startOptions);
            
            return sessionId;
            
        } catch (error) {
            this.log('Failed to start transcription:', error);
            throw error;
        }
    }

    /**
     * Stop transcription session
     */
    async stop() {
        if (!this.sessionActive || !this.transcriber) {
            return null;
        }

        try {
            this.log('Stopping transcription session...');
            const result = await this.transcriber.stopTranscription();
            
            return result;
            
        } catch (error) {
            this.log('Failed to stop transcription:', error);
            throw error;
        }
    }

    /**
     * Pause transcription
     */
    pause() {
        if (this.transcriber && this.sessionActive) {
            this.transcriber.pauseTranscription();
        }
    }

    /**
     * Resume transcription
     */
    resume() {
        if (this.transcriber && this.sessionActive) {
            this.transcriber.resumeTranscription();
        }
    }

    /**
     * Get current session info
     */
    getSessionInfo() {
        return this.transcriber ? this.transcriber.getSessionInfo() : null;
    }

    /**
     * Get current transcript
     */
    getCurrentTranscript() {
        return this.transcriber ? this.transcriber.getCurrentTranscript() : '';
    }

    /**
     * Check if session is active
     */
    isActive() {
        return this.sessionActive && this.transcriber?.isActive();
    }

    /**
     * Update configuration
     */
    updateConfig(newOptions) {
        Object.assign(this.options, newOptions);
        
        if (this.transcriber) {
            this.transcriber.updateConfig(newOptions);
        }
    }

    /**
     * Clean up resources
     */
    async cleanup() {
        if (this.transcriber) {
            await this.transcriber.cleanup();
            this.transcriber = null;
        }
        
        this.isInitialized = false;
        this.sessionActive = false;
        this.log('Cleanup completed');
    }

    /**
     * Logging helper
     */
    log(message, data = null) {
        if (this.options.enableLogging) {
            const timestamp = new Date().toISOString();
            const logMessage = `[${timestamp}] [LiveTranscriberInstance] ${message}`;
            
            if (data) {
                console.log(logMessage, data);
            } else {
                console.log(logMessage);
            }
        }
    }
}

// ===== FACTORY FUNCTION =====

/**
 * Create a new live transcriber instance
 * 
 * @param {Object} options - Configuration options
 * @param {string} options.deepgramKey - Deepgram API key (required)
 * @param {string} [options.language='en-US'] - Language code for transcription
 * @param {string} [options.model='nova-2'] - Deepgram model to use
 * @param {string} [options.audioSource='microphone'] - Audio source type
 * @param {boolean} [options.enableInterimResults=true] - Enable interim results
 * @param {boolean} [options.enablePunctuation=true] - Enable punctuation
 * @param {Function} [options.onTranscript] - Callback for interim transcripts
 * @param {Function} [options.onFinalTranscript] - Callback for final transcripts
 * @param {Function} [options.onSessionStart] - Callback for session start
 * @param {Function} [options.onSessionEnd] - Callback for session end
 * @param {Function} [options.onError] - Callback for errors
 * @param {Function} [options.onConnectionStatus] - Callback for connection status
 * @param {boolean} [options.enableLogging=false] - Enable debug logging
 * @returns {LiveTranscriberInstance} Configured transcriber instance
 */
function createLiveTranscriber(options = {}) {
    return new LiveTranscriberInstance(options);
}

// ===== UTILITY FUNCTIONS =====

/**
 * Check if browser supports required APIs
 */
function checkBrowserSupport() {
    const requirements = {
        getUserMedia: !!(navigator.mediaDevices?.getUserMedia),
        audioContext: !!(window.AudioContext || window.webkitAudioContext),
        webSocket: !!window.WebSocket,
        audioWorklet: !!(window.AudioContext?.prototype.audioWorklet || window.webkitAudioContext?.prototype.audioWorklet)
    };

    const supported = Object.values(requirements).every(Boolean);
    const missing = Object.entries(requirements)
        .filter(([_, supported]) => !supported)
        .map(([feature, _]) => feature);

    return {
        supported,
        missing,
        requirements
    };
}

/**
 * Get available audio devices
 */
async function getAudioDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(device => device.kind === 'audioinput');
    } catch (error) {
        console.warn('Could not enumerate audio devices:', error);
        return [];
    }
}

/**
 * Test audio capture permissions
 */
async function testAudioPermissions() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        return true;
    } catch (error) {
        return false;
    }
}

// ===== EXPORTS =====

// Default export - main factory function
export default createLiveTranscriber;

// Named exports for additional utilities
export {
    createLiveTranscriber,
    LiveTranscriberInstance,
    checkBrowserSupport,
    getAudioDevices,
    testAudioPermissions,
    AUDIO_SOURCE_TYPES,
    TRANSCRIPTION_EVENTS
};

/**
 * USAGE EXAMPLES:
 * 
 * Basic usage:
 * ```
 * import createLiveTranscriber from './transcriptionBootstrap.js';
 * 
 * const transcriber = createLiveTranscriber({
 *     deepgramKey: 'your-api-key',
 *     onTranscript: (text, meta) => {
 *         console.log('Interim:', text);
 *     },
 *     onFinalTranscript: (text, meta) => {
 *         console.log('Final:', text);
 *     }
 * });
 * 
 * await transcriber.start();
 * // ... later
 * await transcriber.stop();
 * ```
 * 
 * Advanced usage with error handling:
 * ```
 * import createLiveTranscriber, { checkBrowserSupport } from './transcriptionBootstrap.js';
 * 
 * // Check browser support first
 * const support = checkBrowserSupport();
 * if (!support.supported) {
 *     console.error('Browser missing required features:', support.missing);
 *     return;
 * }
 * 
 * const transcriber = createLiveTranscriber({
 *     deepgramKey: process.env.DEEPGRAM_API_KEY,
 *     language: 'en-US',
 *     enableLogging: true,
 *     onTranscript: (text, meta) => {
 *         document.getElementById('interim').textContent = text;
 *     },
 *     onFinalTranscript: (text, meta) => {
 *         document.getElementById('final').textContent += text + ' ';
 *     },
 *     onError: (error) => {
 *         console.error('Transcription error:', error);
 *     },
 *     onConnectionStatus: (status) => {
 *         console.log('Connection status:', status);
 *     }
 * });
 * 
 * try {
 *     await transcriber.start();
 * } catch (error) {
 *     console.error('Failed to start transcription:', error);
 * }
 * ```
 * 
 * Extension context usage:
 * ```
 * import createLiveTranscriber, { AUDIO_SOURCE_TYPES } from './transcriptionBootstrap.js';
 * 
 * const transcriber = createLiveTranscriber({
 *     deepgramKey: await getStoredApiKey(),
 *     audioSource: AUDIO_SOURCE_TYPES.TAB_CAPTURE,
 *     onFinalTranscript: (text) => {
 *         chrome.runtime.sendMessage({
 *             type: 'TRANSCRIPT_UPDATE',
 *             text: text
 *         });
 *     }
 * });
 * ```
 */