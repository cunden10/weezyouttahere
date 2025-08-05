/* ================================================================
 * securityMonitor.js
 * ================================================================
 * Comprehensive security monitoring for the Live Transcription Extension
 * Handles API key validation, usage monitoring, and security alerts
 * 
 * Features:
 * - API key validation and format checking
 * - Usage monitoring and anomaly detection
 * - Key rotation detection and management
 * - Security event logging and alerting
 * - Client-side security enforcement
 * ================================================================ */

import { safeStorageGet, safeStorageSet } from './coreUtils.js';

/* ================================================================
 * CONSTANTS AND CONFIGURATION
 * ================================================================ */

const SECURITY_CONFIG = Object.freeze({
  // API Key Validation
  MIN_KEY_LENGTH: 32,
  MAX_KEY_LENGTH: 256,
  KEY_HASH_LENGTH: 8,
  
  // Usage Monitoring
  MAX_CALLS_PER_HOUR: 1000,
  MAX_CALLS_PER_MINUTE: 50,
  USAGE_RESET_INTERVAL: 3600000, // 1 hour in ms
  
  // Security Events
  MAX_FAILED_VALIDATIONS: 5,
  SECURITY_LOG_RETENTION: 604800000, // 7 days in ms
  
  // Key Rotation
  KEY_ROTATION_CHECK_INTERVAL: 300000, // 5 minutes in ms
  
  // Storage Keys
  STORAGE_KEYS: {
    API_USAGE: 'security.apiUsage',
    KEY_HASH: 'security.keyHash',
    SECURITY_EVENTS: 'security.events',
    LAST_ROTATION_CHECK: 'security.lastRotationCheck',
    FAILED_VALIDATIONS: 'security.failedValidations'
  }
});

const SECURITY_EVENTS = Object.freeze({
  KEY_VALIDATION_FAILED: 'key_validation_failed',
  USAGE_ANOMALY_DETECTED: 'usage_anomaly_detected',
  KEY_ROTATION_DETECTED: 'key_rotation_detected',
  SECURITY_VIOLATION: 'security_violation',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity'
});

/* ================================================================
 * SECURITY MONITOR CLASS
 * ================================================================ */

export class SecurityMonitor {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.config = { ...SECURITY_CONFIG, ...options };
    this.isInitialized = false;
    this.usageStats = {
      callCount: 0,
      lastResetTime: Date.now(),
      minuteCallCount: 0,
      lastMinuteReset: Date.now()
    };
    
    this.init();
  }

  async init() {
    if (this.isInitialized) return;

    try {
      // Validate API key on initialization
      await this.validateApiKey();
      
      // Load existing usage stats
      await this.loadUsageStats();
      
      // Setup key rotation monitoring
      this.setupKeyRotationMonitoring();
      
      // Setup cleanup intervals
      this.setupCleanupIntervals();
      
      this.isInitialized = true;
      console.log('🛡️ Security Monitor initialized successfully');
      
    } catch (error) {
      await this.logSecurityEvent(SECURITY_EVENTS.SECURITY_VIOLATION, {
        error: error.message,
        context: 'SecurityMonitor initialization failed'
      });
      throw error;
    }
  }

  /* ================================================================
   * API KEY VALIDATION
   * ================================================================ */

  /**
   * Validate API key format and security
   * @returns {Promise<boolean>} True if valid
   */
  async validateApiKey() {
    try {
      const isValid = this.performKeyValidation(this.apiKey);
      
      if (!isValid) {
        await this.handleValidationFailure();
        return false;
      }

      // Reset failed validation counter on success
      await safeStorageSet(this.config.STORAGE_KEYS.FAILED_VALIDATIONS, 0);
      return true;
      
    } catch (error) {
      await this.logSecurityEvent(SECURITY_EVENTS.KEY_VALIDATION_FAILED, {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Perform actual key validation checks
   * @private
   */
  performKeyValidation(key) {
    // Basic existence check
    if (!key || typeof key !== 'string') {
      console.error('🚨 API key is missing or invalid type');
      return false;
    }

    // Length validation
    if (key.length < this.config.MIN_KEY_LENGTH) {
      console.error('🚨 API key is too short');
      return false;
    }

    if (key.length > this.config.MAX_KEY_LENGTH) {
      console.error('🚨 API key is too long');
      return false;
    }

    // Format validation
    if (key.includes('placeholder') || 
        key.includes('your_') || 
        key.includes('example') ||
        key.includes('demo')) {
      console.error('🚨 API key appears to be a placeholder');
      return false;
    }

    // Basic entropy check (simple)
    const uniqueChars = new Set(key).size;
    if (uniqueChars < 10) {
      console.error('🚨 API key has insufficient entropy');
      return false;
    }

    return true;
  }

  /**
   * Handle validation failure
   * @private
   */
  async handleValidationFailure() {
    const failedCount = await safeStorageGet(this.config.STORAGE_KEYS.FAILED_VALIDATIONS) || 0;
    const newCount = failedCount + 1;
    
    await safeStorageSet(this.config.STORAGE_KEYS.FAILED_VALIDATIONS, newCount);
    
    await this.logSecurityEvent(SECURITY_EVENTS.KEY_VALIDATION_FAILED, {
      failedAttempts: newCount,
      timestamp: Date.now()
    });

    if (newCount >= this.config.MAX_FAILED_VALIDATIONS) {
      await this.logSecurityEvent(SECURITY_EVENTS.SECURITY_VIOLATION, {
        reason: 'Too many failed key validations',
        failedAttempts: newCount
      });
      
      // In development, show helpful error
      if (import.meta.env.DEV) {
        alert(
          'Development Error: Deepgram API key validation failed multiple times.\n' +
          'Please check your .env file and ensure VITE_DEEPGRAM_API_KEY is properly configured.'
        );
      }
      
      throw new Error('API key validation failed - service disabled for security');
    }

    throw new Error('Invalid API key configuration');
  }

  /* ================================================================
   * USAGE MONITORING
   * ================================================================ */

  /**
   * Monitor API call and detect anomalies
   * @param {Object} callInfo Information about the API call
   */
  async monitorApiCall(callInfo = {}) {
    try {
      this.updateUsageStats();
      
      // Check for usage anomalies
      await this.checkUsageAnomalies();
      
      // Log the call (in development mode)
      if (import.meta.env.DEV) {
        console.debug('📊 API call monitored:', {
          callsThisHour: this.usageStats.callCount,
          callsThisMinute: this.usageStats.minuteCallCount,
          ...callInfo
        });
      }
      
    } catch (error) {
      console.error('🚨 Usage monitoring error:', error);
    }
  }

  /**
   * Update usage statistics
   * @private
   */
  updateUsageStats() {
    const now = Date.now();
    
    // Reset hourly counter
    if (now - this.usageStats.lastResetTime > this.config.USAGE_RESET_INTERVAL) {
      this.usageStats.callCount = 0;
      this.usageStats.lastResetTime = now;
    }
    
    // Reset minute counter
    if (now - this.usageStats.lastMinuteReset > 60000) {
      this.usageStats.minuteCallCount = 0;
      this.usageStats.lastMinuteReset = now;
    }
    
    this.usageStats.callCount++;
    this.usageStats.minuteCallCount++;
    
    // Persist usage stats
    this.saveUsageStats();
  }

  /**
   * Check for usage anomalies
   * @private
   */
  async checkUsageAnomalies() {
    // Hourly limit check
    if (this.usageStats.callCount > this.config.MAX_CALLS_PER_HOUR) {
      await this.logSecurityEvent(SECURITY_EVENTS.USAGE_ANOMALY_DETECTED, {
        type: 'hourly_limit_exceeded',
        callCount: this.usageStats.callCount,
        limit: this.config.MAX_CALLS_PER_HOUR
      });
      
      console.warn('🚨 Unusual API usage detected - hourly limit exceeded');
    }
    
    // Per-minute limit check (potential rapid-fire attack)
    if (this.usageStats.minuteCallCount > this.config.MAX_CALLS_PER_MINUTE) {
      await this.logSecurityEvent(SECURITY_EVENTS.SUSPICIOUS_ACTIVITY, {
        type: 'rapid_fire_calls',
        callCount: this.usageStats.minuteCallCount,
        limit: this.config.MAX_CALLS_PER_MINUTE
      });
      
      console.warn('🚨 Suspicious activity detected - rapid API calls');
      
      // Optional: Temporarily disable service
      if (this.usageStats.minuteCallCount > this.config.MAX_CALLS_PER_MINUTE * 2) {
        throw new Error('Service temporarily disabled due to suspicious activity');
      }
    }
  }

  /**
   * Load usage stats from storage
   * @private
   */
  async loadUsageStats() {
    const saved = await safeStorageGet(this.config.STORAGE_KEYS.API_USAGE);
    if (saved) {
      this.usageStats = { ...this.usageStats, ...saved };
    }
  }

  /**
   * Save usage stats to storage
   * @private
   */
  async saveUsageStats() {
    await safeStorageSet(this.config.STORAGE_KEYS.API_USAGE, this.usageStats);
  }

  /* ================================================================
   * KEY ROTATION DETECTION
   * ================================================================ */

  /**
   * Setup key rotation monitoring
   * @private
   */
  setupKeyRotationMonitoring() {
    // Check immediately
    this.checkKeyRotation();
    
    // Setup periodic checking
    this.rotationCheckInterval = setInterval(() => {
      this.checkKeyRotation();
    }, this.config.KEY_ROTATION_CHECK_INTERVAL);
  }

  /**
   * Check if API key has been rotated
   * @private
   */
  async checkKeyRotation() {
    try {
      const currentKeyHash = this.generateKeyHash(this.apiKey);
      const lastKnownHash = await safeStorageGet(this.config.STORAGE_KEYS.KEY_HASH);
      
      if (lastKnownHash && lastKnownHash !== currentKeyHash) {
        await this.handleKeyRotation(lastKnownHash, currentKeyHash);
      }
      
      // Update stored hash
      await safeStorageSet(this.config.STORAGE_KEYS.KEY_HASH, currentKeyHash);
      await safeStorageSet(this.config.STORAGE_KEYS.LAST_ROTATION_CHECK, Date.now());
      
    } catch (error) {
      console.error('🚨 Key rotation check failed:', error);
    }
  }

  /**
   * Handle detected key rotation
   * @private
   */
  async handleKeyRotation(oldHash, newHash) {
    console.log('🔄 API key rotation detected');
    
    await this.logSecurityEvent(SECURITY_EVENTS.KEY_ROTATION_DETECTED, {
      oldKeyHash: oldHash,
      newKeyHash: newHash,
      timestamp: Date.now()
    });
    
    // Clear usage stats on key rotation
    this.usageStats = {
      callCount: 0,
      lastResetTime: Date.now(),
      minuteCallCount: 0,
      lastMinuteReset: Date.now()
    };
    
    await this.saveUsageStats();
    
    // Optional: Clear cached sessions, restart connections
    // This would be application-specific
  }

  /**
   * Generate hash for key rotation detection
   * @private
   */
  generateKeyHash(key) {
    // Simple hash for rotation detection (not cryptographic)
    return btoa(key).slice(-this.config.KEY_HASH_LENGTH);
  }

  /* ================================================================
   * SECURITY EVENT LOGGING
   * ================================================================ */

  /**
   * Log security event
   * @param {string} eventType Type of security event
   * @param {Object} eventData Additional event data
   */
  async logSecurityEvent(eventType, eventData = {}) {
    const event = {
      type: eventType,
      timestamp: Date.now(),
      data: eventData,
      userAgent: navigator.userAgent,
      url: window.location.href
    };
    
    try {
      const events = await safeStorageGet(this.config.STORAGE_KEYS.SECURITY_EVENTS) || [];
      events.push(event);
      
      // Keep only recent events
      const cutoff = Date.now() - this.config.SECURITY_LOG_RETENTION;
      const recentEvents = events.filter(e => e.timestamp > cutoff);
      
      await safeStorageSet(this.config.STORAGE_KEYS.SECURITY_EVENTS, recentEvents);
      
      // Log to console in development
      if (import.meta.env.DEV) {
        console.warn('🔐 Security Event:', event);
      }
      
      // Optional: Send to external monitoring service
      if (import.meta.env.VITE_ENABLE_ERROR_REPORTING) {
        this.reportSecurityEvent(event);
      }
      
    } catch (error) {
      console.error('Failed to log security event:', error);
    }
  }

  /**
   * Report security event to external service
   * @private
   */
  reportSecurityEvent(event) {
    // Implementation would depend on your monitoring service
    // Example: Sentry, LogRocket, custom endpoint
    
    if (import.meta.env.VITE_SENTRY_DSN) {
      // Sentry integration example
      // Sentry.addBreadcrumb({
      //   message: `Security Event: ${event.type}`,
      //   level: 'warning',
      //   data: event.data
      // });
    }
  }

  /* ================================================================
   * CLEANUP AND UTILITIES
   * ================================================================ */

  /**
   * Setup cleanup intervals
   * @private
   */
  setupCleanupIntervals() {
    // Clean up old security events daily
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldEvents();
    }, 86400000); // 24 hours
  }

  /**
   * Clean up old security events
   * @private
   */
  async cleanupOldEvents() {
    try {
      const events = await safeStorageGet(this.config.STORAGE_KEYS.SECURITY_EVENTS) || [];
      const cutoff = Date.now() - this.config.SECURITY_LOG_RETENTION;
      const recentEvents = events.filter(e => e.timestamp > cutoff);
      
      if (recentEvents.length !== events.length) {
        await safeStorageSet(this.config.STORAGE_KEYS.SECURITY_EVENTS, recentEvents);
        console.log(`🧹 Cleaned up ${events.length - recentEvents.length} old security events`);
      }
    } catch (error) {
      console.error('Failed to cleanup old events:', error);
    }
  }

  /**
   * Get security status summary
   * @returns {Object} Security status information
   */
  async getSecurityStatus() {
    const events = await safeStorageGet(this.config.STORAGE_KEYS.SECURITY_EVENTS) || [];
    const failedValidations = await safeStorageGet(this.config.STORAGE_KEYS.FAILED_VALIDATIONS) || 0;
    const lastRotationCheck = await safeStorageGet(this.config.STORAGE_KEYS.LAST_ROTATION_CHECK);
    
    return {
      isInitialized: this.isInitialized,
      apiKeyValid: this.performKeyValidation(this.apiKey),
      usageStats: this.usageStats,
      securityEvents: events.length,
      failedValidations,
      lastRotationCheck,
      securityScore: this.calculateSecurityScore(events, failedValidations)
    };
  }

  /**
   * Calculate security score
   * @private
   */
  calculateSecurityScore(events, failedValidations) {
    let score = 100;
    
    // Deduct points for security events
    score -= events.length * 2;
    
    // Deduct points for failed validations
    score -= failedValidations * 10;
    
    // Bonus for recent key rotation
    const recentRotation = events.find(e => 
      e.type === SECURITY_EVENTS.KEY_ROTATION_DETECTED &&
      Date.now() - e.timestamp < 86400000 * 30 // Within 30 days
    );
    if (recentRotation) score += 10;
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Cleanup and destroy
   */
  destroy() {
    if (this.rotationCheckInterval) {
      clearInterval(this.rotationCheckInterval);
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    this.isInitialized = false;
  }
}

/* ================================================================
 * STANDALONE VALIDATION FUNCTIONS
 * ================================================================ */

/**
 * Standalone API key validation function
 * @param {string} key API key to validate
 * @returns {boolean} True if valid
 */
export function validateApiKey(key) {
  const monitor = new SecurityMonitor(key);
  return monitor.performKeyValidation(key);
}

/**
 * Create and initialize security monitor
 * @param {string} apiKey API key to monitor
 * @param {Object} options Configuration options
 * @returns {Promise<SecurityMonitor>} Initialized security monitor
 */
export async function createSecurityMonitor(apiKey, options = {}) {
  const monitor = new SecurityMonitor(apiKey, options);
  await monitor.init();
  return monitor;
}

/* ================================================================
 * EXPORTS
 * ================================================================ */

export default SecurityMonitor;
export { SECURITY_EVENTS, SECURITY_CONFIG };