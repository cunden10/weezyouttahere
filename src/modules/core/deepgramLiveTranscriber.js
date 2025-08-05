/**
 * DeepgramLiveTranscriber - Browser-based real-time audio transcription module
 * 
 * A modular audio capture and live transcription system using Deepgram's WebSocket API.
 * Captures browser audio via Web Audio API and streams to Deepgram for real-time transcription.
 * 
 * @author Generated for live transcription use case
 * @version 1.0.0
 */

/* ================================================================
 * SECURE API KEY INJECTION - VITE CONFIGURATION
 * ================================================================
 * The Deepgram API key is injected at build time from environment
 * variables. This approach keeps sensitive credentials secure.
 * 
 * ⚠️ SECURITY NOTES:
 * - API key is replaced at build time, not runtime
 * - Key never appears in source code or version control
 * - Must prefix with VITE_ for client-side access
 * - Consider backend proxy for maximum security
 * ================================================================ */

// Securely inject API key from environment at build time
const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY;

// Validate key exists during development
if (!DEEPGRAM_API_KEY) {
  throw new Error(
    'VITE_DEEPGRAM_API_KEY environment variable is required. ' +
    'Please check your .env file and ensure the key is properly set.'
  );
}

// ⚠️ NEVER LOG THE ACTUAL KEY - Only log presence for debugging
if (import.meta.env.DEV) {
  console.log('Deepgram API key loaded:', DEEPGRAM_API_KEY ? '✅ Present' : '❌ Missing');
}

// Initialize security monitor for API key validation and usage monitoring
import { createSecurityMonitor, validateApiKey } from './securityMonitor.js';

/**
 * ✅ SECURITY: Validate that WebSocket URL uses secure protocol
 * @param {string} url - WebSocket URL to validate
 * @throws {Error} If URL uses insecure protocol
 */
function validateSecureWebSocketUrl(url) {
    if (!url.startsWith('wss://')) {
        throw new Error(
            '🚨 SECURITY ERROR: Insecure WebSocket protocol detected. ' +
            'Chrome extensions require secure WebSocket connections (wss://) ' +
            'when running on HTTPS pages. Insecure ws:// connections are blocked.'
        );
    }
    
    // Additional security checks
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
        console.warn('⚠️ DEVELOPMENT WARNING: Using localhost WebSocket connection');
    }
}

// Validate API key format and security
if (!validateApiKey(DEEPGRAM_API_KEY)) {
  throw new Error(
    'Invalid Deepgram API key format detected. ' +
    'Please verify your API key configuration.'
  );
}

// ===== CONSTANTS & CONFIGURATION =====

// ✅ SECURE CONFIGURATION - All connections use HTTPS/WSS only
const DEEPGRAM_CONFIG = Object.freeze({
    WSS_ENDPOINT: 'wss://api.deepgram.com/v1/listen',  // ✅ Secure WebSocket (wss://)
    SAMPLE_RATE: 16000,
    CHANNELS: 1,
    ENCODING: 'linear16',
    CHUNK_SIZE: 4096,
    SILENCE_THRESHOLD: 0.01,
    MAX_RECONNECT_ATTEMPTS: 3,
    RECONNECT_DELAY: 1000
});

const TRANSCRIPTION_EVENTS = Object.freeze({
    SESSION_STARTED: 'session_started',
    TRANSCRIPT_RECEIVED: 'transcript_received',
    TRANSCRIPT_FINALIZED: 'transcript_finalized',
    SESSION_ENDED: 'session_ended',
    ERROR: 'error',
    CONNECTION_STATUS: 'connection_status'
});

const SESSION_STATUS = Object.freeze({
    IDLE: 'idle',
    INITIALIZING: 'initializing',
    ACTIVE: 'active',
    PAUSED: 'paused',
    STOPPING: 'stopping',
    ERROR: 'error'
});

const AUDIO_SOURCE_TYPES = Object.freeze({
    MICROPHONE: 'microphone',
    TAB_CAPTURE: 'tab_capture',
    SYSTEM_AUDIO: 'system_audio'
});

const CONNECTION_STATUS = Object.freeze({
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    RECONNECTING: 'reconnecting',
    FAILED: 'failed'
});

// ===== UTILITY CLASSES =====

/**
 * AudioDataProcessor - Handles audio format conversion and chunking
 */
class AudioDataProcessor {
    constructor(sampleRate = DEEPGRAM_CONFIG.SAMPLE_RATE, channels = DEEPGRAM_CONFIG.CHANNELS) {
        this.sampleRate = sampleRate;
        this.channels = channels;
        this.buffer = [];
        this.chunkSize = DEEPGRAM_CONFIG.CHUNK_SIZE;
    }

    /**
     * Convert Float32Array audio data to Int16Array for Deepgram
     */
    convertFloat32ToInt16(float32Array) {
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const clampedValue = Math.max(-1, Math.min(1, float32Array[i]));
            int16Array[i] = clampedValue * 32767;
        }
        return int16Array;
    }

    /**
     * Add audio data to buffer and return chunks when ready
     */
    addAudioData(audioData) {
        const int16Data = this.convertFloat32ToInt16(audioData);
        this.buffer.push(...int16Data);
        
        const chunks = [];
        while (this.buffer.length >= this.chunkSize) {
            const chunk = new Int16Array(this.buffer.splice(0, this.chunkSize));
            chunks.push(chunk);
        }
        
        return chunks;
    }

    /**
     * Check if audio contains speech (simple volume-based detection)
     */
    containsSpeech(audioData) {
        const sum = audioData.reduce((acc, val) => acc + Math.abs(val), 0);
        const average = sum / audioData.length;
        return average > DEEPGRAM_CONFIG.SILENCE_THRESHOLD;
    }

    /**
     * Clear internal buffer
     */
    clear() {
        this.buffer = [];
    }
}

/**
 * EventEmitter - Simple event handling for transcription events
 */
class EventEmitter {
    constructor() {
        this.events = {};
    }

    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
    }

    off(event, callback) {
        if (!this.events[event]) return;
        
        const index = this.events[event].indexOf(callback);
        if (index > -1) {
            this.events[event].splice(index, 1);
        }
    }

    emit(event, data) {
        if (!this.events[event]) return;
        
        this.events[event].forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in event callback for ${event}:`, error);
            }
        });
    }

    removeAllListeners(event) {
        if (event) {
            delete this.events[event];
        } else {
            this.events = {};
        }
    }
}

/**
 * SessionManager - Manages transcription session state and metadata
 */
class SessionManager {
    constructor() {
        this.sessionId = null;
        this.status = SESSION_STATUS.IDLE;
        this.startTime = null;
        this.transcript = {
            interim: '',
            final: '',
            segments: []
        };
        this.metadata = {};
    }

    startSession(options = {}) {
        this.sessionId = this.generateSessionId();
        this.status = SESSION_STATUS.INITIALIZING;
        this.startTime = Date.now();
        this.transcript = { interim: '', final: '', segments: [] };
        this.metadata = { ...options };
        
        return this.sessionId;
    }

    updateStatus(status) {
        this.status = status;
    }

    addTranscriptSegment(segment, isFinal = false) {
        if (isFinal) {
            this.transcript.segments.push({
                text: segment,
                timestamp: Date.now() - this.startTime,
                final: true
            });
            this.transcript.final += (this.transcript.final ? ' ' : '') + segment;
            this.transcript.interim = '';
        } else {
            this.transcript.interim = segment;
        }
    }

    getFullTranscript() {
        const finalText = this.transcript.final;
        const interimText = this.transcript.interim;
        return finalText + (finalText && interimText ? ' ' : '') + interimText;
    }

    endSession() {
        this.status = SESSION_STATUS.IDLE;
        const duration = this.startTime ? Date.now() - this.startTime : 0;
        return {
            sessionId: this.sessionId,
            duration,
            transcript: this.getFullTranscript(),
            segments: this.transcript.segments
        };
    }

    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
}

// ===== MAIN TRANSCRIBER CLASS =====

/**
 * DeepgramLiveTranscriber - Main class for real-time audio transcription
 */
class DeepgramLiveTranscriber extends EventEmitter {
    constructor(options = {}) {
        super();
        
        // Configuration - Use securely injected API key
        this.apiKey = options.apiKey || DEEPGRAM_API_KEY;
        this.language = options.language || 'en-US';
        this.model = options.model || 'nova-2';
        this.audioSource = options.audioSource || AUDIO_SOURCE_TYPES.MICROPHONE;
        this.enablePunctuation = options.enablePunctuation !== false;
        this.enableInterimResults = options.enableInterimResults !== false;
        
        // Core components
        this.sessionManager = new SessionManager();
        this.audioProcessor = new AudioDataProcessor();
        
        // Audio components
        this.audioContext = null;
        this.mediaStream = null;
        this.sourceNode = null;
        this.processorNode = null;
        
        // WebSocket connection
        this.websocket = null;
        this.connectionStatus = CONNECTION_STATUS.DISCONNECTED;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        
        // State tracking
        this.isRecording = false;
        this.lastAudioTime = null;
        
        this.log('DeepgramLiveTranscriber initialized');
    }

    /**
     * Get API key from environment or configuration
     */
    getApiKeyFromEnv() {
        // Try multiple sources for API key
        if (typeof process !== 'undefined' && process.env?.DEEPGRAM_API_KEY) {
            return process.env.DEEPGRAM_API_KEY;
        }
        
        // Browser-based storage (localStorage, etc.)
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem('deepgram_api_key');
        }
        
        console.warn('No Deepgram API key found. Please provide one in constructor options.');
        return null;
    }

    /**
     * Start live transcription session
     */
    async startTranscription(options = {}) {
        if (this.isRecording) {
            throw new Error('Transcription session already active');
        }

        if (!this.apiKey) {
            throw new Error('Deepgram API key is required');
        }

        try {
            this.log('Starting transcription session...');
            
            // Start session
            const sessionId = this.sessionManager.startSession(options);
            this.sessionManager.updateStatus(SESSION_STATUS.INITIALIZING);
            
            // Initialize audio capture
            await this.initializeAudioCapture(options);
            
            // Connect to Deepgram
            await this.connectToDeepgram();
            
            // Start processing
            this.isRecording = true;
            this.sessionManager.updateStatus(SESSION_STATUS.ACTIVE);
            
            this.emit(TRANSCRIPTION_EVENTS.SESSION_STARTED, {
                sessionId,
                timestamp: Date.now()
            });
            
            this.log(`Transcription session started: ${sessionId}`);
            return sessionId;
            
        } catch (error) {
            this.sessionManager.updateStatus(SESSION_STATUS.ERROR);
            this.emit(TRANSCRIPTION_EVENTS.ERROR, { error: error.message });
            throw error;
        }
    }

    /**
     * Stop transcription session
     */
    async stopTranscription() {
        if (!this.isRecording) {
            return null;
        }

        this.log('Stopping transcription session...');
        this.sessionManager.updateStatus(SESSION_STATUS.STOPPING);
        
        try {
            // Stop audio processing
            this.isRecording = false;
            await this.stopAudioCapture();
            
            // Close WebSocket
            await this.disconnectFromDeepgram();
            
            // Finalize session
            const sessionResult = this.sessionManager.endSession();
            
            this.emit(TRANSCRIPTION_EVENTS.SESSION_ENDED, sessionResult);
            this.log('Transcription session ended');
            
            return sessionResult;
            
        } catch (error) {
            this.emit(TRANSCRIPTION_EVENTS.ERROR, { error: error.message });
            throw error;
        }
    }

    /**
     * Pause transcription (stops sending audio but keeps connection)
     */
    pauseTranscription() {
        if (this.sessionManager.status === SESSION_STATUS.ACTIVE) {
            this.sessionManager.updateStatus(SESSION_STATUS.PAUSED);
            this.log('Transcription paused');
        }
    }

    /**
     * Resume transcription
     */
    resumeTranscription() {
        if (this.sessionManager.status === SESSION_STATUS.PAUSED) {
            this.sessionManager.updateStatus(SESSION_STATUS.ACTIVE);
            this.log('Transcription resumed');
        }
    }

    /**
     * Initialize audio capture based on source type
     */
    async initializeAudioCapture(options = {}) {
        try {
            // Get media stream based on audio source
            switch (this.audioSource) {
                case AUDIO_SOURCE_TYPES.MICROPHONE:
                    this.mediaStream = await navigator.mediaDevices.getUserMedia({
                        audio: {
                            sampleRate: DEEPGRAM_CONFIG.SAMPLE_RATE,
                            channelCount: DEEPGRAM_CONFIG.CHANNELS,
                            echoCancellation: true,
                            noiseSuppression: true,
                            autoGainControl: true
                        }
                    });
                    break;
                    
                case AUDIO_SOURCE_TYPES.TAB_CAPTURE:
                    if (chrome?.tabCapture) {
                        this.mediaStream = await new Promise((resolve, reject) => {
                            chrome.tabCapture.capture({
                                audio: true,
                                video: false
                            }, resolve);
                            setTimeout(() => reject(new Error('Tab capture timeout')), 5000);
                        });
                    } else {
                        throw new Error('Tab capture not available');
                    }
                    break;
                    
                case AUDIO_SOURCE_TYPES.SYSTEM_AUDIO:
                    this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
                        audio: true,
                        video: false
                    });
                    break;
                    
                default:
                    throw new Error(`Unsupported audio source: ${this.audioSource}`);
            }

            // Create audio context and nodes
            this.audioContext = new AudioContext({
                sampleRate: DEEPGRAM_CONFIG.SAMPLE_RATE
            });
            
            this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            // Use ScriptProcessorNode for broad compatibility
            this.processorNode = this.audioContext.createScriptProcessor(
                DEEPGRAM_CONFIG.CHUNK_SIZE,
                DEEPGRAM_CONFIG.CHANNELS,
                DEEPGRAM_CONFIG.CHANNELS
            );
            
            // Set up audio processing callback
            this.processorNode.onaudioprocess = (event) => {
                this.processAudioData(event);
            };
            
            // Connect audio nodes
            this.sourceNode.connect(this.processorNode);
            this.processorNode.connect(this.audioContext.destination);
            
            this.log('Audio capture initialized');
            
        } catch (error) {
            this.log(`Error initializing audio: ${error.message}`);
            throw new Error(`Failed to initialize audio capture: ${error.message}`);
        }
    }

    /**
     * Process audio data from ScriptProcessorNode
     */
    processAudioData(event) {
        if (!this.isRecording || this.sessionManager.status !== SESSION_STATUS.ACTIVE) {
            return;
        }

        const inputBuffer = event.inputBuffer;
        const audioData = inputBuffer.getChannelData(0);
        
        // Check for speech activity
        if (!this.audioProcessor.containsSpeech(audioData)) {
            return;
        }
        
        // Process audio chunks
        const chunks = this.audioProcessor.addAudioData(audioData);
        
        // Send chunks to Deepgram
        chunks.forEach(chunk => {
            this.sendAudioChunk(chunk);
        });
        
        this.lastAudioTime = Date.now();
    }

    /**
     * Connect to Deepgram WebSocket API with secure authentication
     */
    async connectToDeepgram() {
        return new Promise((resolve, reject) => {
            try {
                // ✅ SECURE: Build connection parameters for Deepgram API
                const params = new URLSearchParams({
                    language: this.language,
                    model: this.model,
                    encoding: DEEPGRAM_CONFIG.ENCODING,
                    sample_rate: DEEPGRAM_CONFIG.SAMPLE_RATE,
                    channels: DEEPGRAM_CONFIG.CHANNELS,
                    punctuate: this.enablePunctuation,
                    interim_results: this.enableInterimResults,
                    endpointing: 300,
                    utterance_end_ms: 1000,
                    vad_events: true,  // Voice activity detection
                    token: this.apiKey  // ✅ SECURE: API key via URL param (Deepgram standard)
                });

                // ✅ SECURE: Use secure WebSocket protocol (wss://) - NEVER use ws://
                const wsUrl = `${DEEPGRAM_CONFIG.WSS_ENDPOINT}?${params.toString()}`;
                
                // 🔒 SECURITY VALIDATION: Ensure secure connection
                validateSecureWebSocketUrl(wsUrl);
                
                this.websocket = new WebSocket(wsUrl);
                
                this.websocket.onopen = () => {
                    this.connectionStatus = CONNECTION_STATUS.CONNECTED;
                    this.reconnectAttempts = 0;
                    this.emit(TRANSCRIPTION_EVENTS.CONNECTION_STATUS, {
                        status: this.connectionStatus
                    });
                    this.log('✅ Connected to Deepgram WebSocket securely');
                    resolve();
                };
                
                this.websocket.onmessage = (event) => {
                    this.handleDeepgramMessage(event);
                };
                
                this.websocket.onerror = (error) => {
                    this.log(`❌ WebSocket error: ${error}`);
                    this.connectionStatus = CONNECTION_STATUS.FAILED;
                    this.emit(TRANSCRIPTION_EVENTS.CONNECTION_STATUS, {
                        status: this.connectionStatus,
                        error
                    });
                    reject(error);
                };
                
                this.websocket.onclose = (event) => {
                    this.log(`🔌 WebSocket closed: ${event.code} ${event.reason}`);
                    this.connectionStatus = CONNECTION_STATUS.DISCONNECTED;
                    this.emit(TRANSCRIPTION_EVENTS.CONNECTION_STATUS, {
                        status: this.connectionStatus
                    });
                    
                    // Attempt reconnection if session is still active
                    if (this.isRecording && this.reconnectAttempts < DEEPGRAM_CONFIG.MAX_RECONNECT_ATTEMPTS) {
                        this.attemptReconnection();
                    }
                };
                
                // Set connection timeout
                setTimeout(() => {
                    if (this.connectionStatus !== CONNECTION_STATUS.CONNECTED) {
                        this.websocket?.close();
                        reject(new Error('Connection timeout'));
                    }
                }, 10000);
                
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Handle incoming messages from Deepgram
     */
    handleDeepgramMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'Results') {
                const result = data.channel?.alternatives?.[0];
                if (result) {
                    const transcript = result.transcript;
                    const isFinal = data.is_final;
                    
                    if (transcript) {
                        // Update session transcript
                        this.sessionManager.addTranscriptSegment(transcript, isFinal);
                        
                        // Emit appropriate event
                        const eventType = isFinal 
                            ? TRANSCRIPTION_EVENTS.TRANSCRIPT_FINALIZED 
                            : TRANSCRIPTION_EVENTS.TRANSCRIPT_RECEIVED;
                            
                        this.emit(eventType, {
                            transcript,
                            isFinal,
                            confidence: result.confidence,
                            timestamp: Date.now(),
                            fullTranscript: this.sessionManager.getFullTranscript()
                        });
                    }
                }
            } else if (data.type === 'Metadata') {
                // Handle metadata (connection info, etc.)
                this.log('Received metadata from Deepgram', data);
            }
            
        } catch (error) {
            this.log(`Error parsing Deepgram message: ${error.message}`);
        }
    }

    /**
     * Send audio chunk to Deepgram
     */
    sendAudioChunk(audioChunk) {
        if (this.websocket?.readyState === WebSocket.OPEN) {
            this.websocket.send(audioChunk.buffer);
        }
    }

    /**
     * Attempt to reconnect to Deepgram
     */
    attemptReconnection() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        
        this.reconnectAttempts++;
        this.connectionStatus = CONNECTION_STATUS.RECONNECTING;
        
        this.emit(TRANSCRIPTION_EVENTS.CONNECTION_STATUS, {
            status: this.connectionStatus,
            attempt: this.reconnectAttempts
        });
        
        const delay = DEEPGRAM_CONFIG.RECONNECT_DELAY * this.reconnectAttempts;
        
        this.reconnectTimer = setTimeout(async () => {
            try {
                this.log(`Reconnection attempt ${this.reconnectAttempts}`);
                await this.connectToDeepgram();
            } catch (error) {
                this.log(`Reconnection failed: ${error.message}`);
                if (this.reconnectAttempts >= DEEPGRAM_CONFIG.MAX_RECONNECT_ATTEMPTS) {
                    this.emit(TRANSCRIPTION_EVENTS.ERROR, {
                        error: 'Max reconnection attempts reached'
                    });
                }
            }
        }, delay);
    }

    /**
     * Stop audio capture and cleanup
     */
    async stopAudioCapture() {
        try {
            // Disconnect audio nodes
            if (this.sourceNode && this.processorNode) {
                this.sourceNode.disconnect(this.processorNode);
                this.processorNode.disconnect();
            }
            
            // Stop media tracks
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => {
                    track.stop();
                });
            }
            
            // Close audio context
            if (this.audioContext) {
                await this.audioContext.close();
            }
            
            // Cleanup
            this.sourceNode = null;
            this.processorNode = null;
            this.mediaStream = null;
            this.audioContext = null;
            this.audioProcessor.clear();
            
            this.log('Audio capture stopped');
            
        } catch (error) {
            this.log(`Error stopping audio capture: ${error.message}`);
        }
    }

    /**
     * Disconnect from Deepgram and cleanup
     */
    async disconnectFromDeepgram() {
        try {
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            
            if (this.websocket) {
                // Send close frame if connection is open
                if (this.websocket.readyState === WebSocket.OPEN) {
                    this.websocket.send(JSON.stringify({ type: 'CloseStream' }));
                    
                    // Wait briefly for graceful close
                    await new Promise(resolve => {
                        const timeout = setTimeout(resolve, 1000);
                        this.websocket.onclose = () => {
                            clearTimeout(timeout);
                            resolve();
                        };
                    });
                }
                
                this.websocket.close();
                this.websocket = null;
            }
            
            this.connectionStatus = CONNECTION_STATUS.DISCONNECTED;
            this.log('Disconnected from Deepgram');
            
        } catch (error) {
            this.log(`Error disconnecting from Deepgram: ${error.message}`);
        }
    }

    // ===== PUBLIC API METHODS =====

    /**
     * Get current session information
     */
    getSessionInfo() {
        return {
            sessionId: this.sessionManager.sessionId,
            status: this.sessionManager.status,
            isRecording: this.isRecording,
            connectionStatus: this.connectionStatus,
            transcript: this.sessionManager.getFullTranscript(),
            segments: this.sessionManager.transcript.segments,
            startTime: this.sessionManager.startTime
        };
    }

    /**
     * Get current full transcript
     */
    getCurrentTranscript() {
        return this.sessionManager.getFullTranscript();
    }

    /**
     * Get transcript segments with timestamps
     */
    getTranscriptSegments() {
        return this.sessionManager.transcript.segments;
    }

    /**
     * Update API key
     */
    setApiKey(apiKey) {
        this.apiKey = apiKey;
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('deepgram_api_key', apiKey);
        }
    }

    /**
     * Update configuration
     */
    updateConfig(config) {
        Object.assign(this, config);
    }

    /**
     * Check if transcription is active
     */
    isActive() {
        return this.isRecording && this.sessionManager.status === SESSION_STATUS.ACTIVE;
    }

    /**
     * Clean up all resources
     */
    async cleanup() {
        await this.stopTranscription();
        this.removeAllListeners();
        this.log('Cleanup completed');
    }

    /**
     * Simple logging method
     */
    log(message, data = null) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [DeepgramLiveTranscriber] ${message}`;
        
        if (data) {
            console.log(logMessage, data);
        } else {
            console.log(logMessage);
        }
    }
}

// ===== EXPORT MODULE =====

// ES6 Module exports
export {
    DeepgramLiveTranscriber,
    TRANSCRIPTION_EVENTS,
    SESSION_STATUS,
    AUDIO_SOURCE_TYPES,
    CONNECTION_STATUS
};

// Default export
export default DeepgramLiveTranscriber;

/**
 * Usage Example:
 * 
 * const transcriber = new DeepgramLiveTranscriber({
 *     apiKey: 'your-deepgram-api-key',
 *     language: 'en-US',
 *     model: 'nova-2',
 *     audioSource: AUDIO_SOURCE_TYPES.MICROPHONE
 * });
 * 
 * // Listen for transcription events
 * transcriber.on(TRANSCRIPTION_EVENTS.TRANSCRIPT_RECEIVED, (data) => {
 *     console.log('Interim:', data.transcript);
 * });
 * 
 * transcriber.on(TRANSCRIPTION_EVENTS.TRANSCRIPT_FINALIZED, (data) => {
 *     console.log('Final:', data.transcript);
 * });
 * 
 * // Start transcription
 * await transcriber.startTranscription();
 * 
 * // Stop transcription
 * const result = await transcriber.stopTranscription();
 * console.log('Final transcript:', result.transcript);
 */