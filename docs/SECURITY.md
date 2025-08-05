# 🔒 Security Guidelines

## 📋 Overview

This document outlines security best practices for the Live Transcription Extension, focusing on API key management, environment variable security, and secure development practices.

## 🔑 API Key Security

### **Secure API Key Injection with Vite**

The extension uses **build-time environment variable injection** to keep API keys secure:

```javascript
// ✅ SECURE: Build-time injection
const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY;

// ✅ SECURE: Validation without logging actual key
if (!DEEPGRAM_API_KEY) {
  throw new Error('VITE_DEEPGRAM_API_KEY environment variable is required.');
}

// ✅ SECURE: Only log presence, never the actual key
if (import.meta.env.DEV) {
  console.log('Deepgram API key loaded:', DEEPGRAM_API_KEY ? '✅ Present' : '❌ Missing');
}
```

### **Environment Variable Setup**

1. **Copy the example file:**
```bash
cp .env.example .env
```

2. **Add your actual API key:**
```bash
# .env file (NEVER commit this!)
VITE_DEEPGRAM_API_KEY=your_actual_deepgram_api_key_here
```

3. **Environment File Hierarchy (Vite):**
```bash
# Priority order (highest to lowest):
.env.local          # Personal overrides (highest priority)
.env.production     # Production-specific settings
.env.development    # Development-specific settings  
.env                # Default settings
.env.example        # Template (not loaded)
```

4. **Environment-specific builds:**
```bash
npm run dev         # Uses .env.development
npm run build       # Uses .env.production
npm run build:chrome # Production build with optimization
```

5. **Vite validates and injects at build time:**
```bash
npm run build:chrome
# ✅ Validates required environment variables
# ✅ API key is replaced in the final bundle
# ❌ Build fails if VITE_DEEPGRAM_API_KEY is missing
```

### **Security Benefits**

✅ **Build-time replacement** - API key never appears in source code  
✅ **Version control safe** - `.env` files are gitignored  
✅ **Environment isolation** - Different keys for dev/staging/production  
✅ **No runtime exposure** - Key is compiled into the bundle  
✅ **Validation checks** - Build fails if key is missing  

## 🚨 Security Anti-Patterns

### **❌ NEVER Do This**

```javascript
// ❌ DANGEROUS: Hardcoded API key
const API_KEY = 'pk_live_abcd1234...'; 

// ❌ DANGEROUS: Runtime fetch from external source
const API_KEY = await fetch('https://myserver.com/api-key');

// ❌ DANGEROUS: Logging actual key value
console.log('API Key:', DEEPGRAM_API_KEY);

// ❌ DANGEROUS: Storing in localStorage
localStorage.setItem('api_key', API_KEY);

// ❌ DANGEROUS: Committing .env files
git add .env  // This exposes your key!
```

### **⚠️ Potentially Unsafe**

```javascript
// ⚠️ RISKY: Runtime environment access (could be intercepted)
const API_KEY = process.env.DEEPGRAM_API_KEY;

// ⚠️ RISKY: User-provided API keys (validate carefully)
const API_KEY = userSettings.apiKey;

// ⚠️ RISKY: URL parameters (logged in browser history)
const wsUrl = `wss://api.deepgram.com/listen?token=${API_KEY}`;
```

## 🛡️ Content Security Policy (CSP)

### **Current CSP Configuration**

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; connect-src 'self' wss://api.deepgram.com https://api.deepgram.com; object-src 'self';"
  }
}
```

### **CSP Security Benefits**

✅ **Script injection prevention** - Only self-hosted scripts allowed  
✅ **Connection restrictions** - Only Deepgram API connections permitted  
✅ **Object embedding protection** - No external objects can be embedded  
✅ **XSS mitigation** - Inline scripts and eval() blocked  

### **Updating CSP for New APIs**

If adding new external services, update the CSP:

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; connect-src 'self' wss://api.deepgram.com https://api.deepgram.com https://api.newservice.com; object-src 'self';"
  }
}
```

## 🔐 Chrome Extension Permissions

### **Principle of Least Privilege**

The extension requests only necessary permissions:

```json
{
  "permissions": [
    "storage",           // ✅ For user preferences
    "declarativeNetRequest", // ✅ For API authentication
    "microphone",        // ✅ For audio capture
    "scripting",         // ✅ For content script injection
    "tabs",              // ✅ For meeting platform integration
    "action"             // ✅ For popup interface
  ]
}
```

### **Host Permissions Scope**

Limited to specific platforms:

```json
{
  "host_permissions": [
    "wss://api.deepgram.com/*",  // ✅ Deepgram WebSocket
    "https://api.deepgram.com/*", // ✅ Deepgram REST API
    "https://meet.google.com/*",  // ✅ Google Meet integration
    "https://zoom.us/*",          // ✅ Zoom integration
    "https://teams.microsoft.com/*", // ✅ Teams integration
    "https://app.apollo.io/*",    // ✅ Apollo.io CRM
    "https://app.salesloft.com/*" // ✅ SalesLoft CRM
  ]
}
```

## 🌐 Network Security

### **Secure WebSocket Authentication**

```javascript
// ✅ SECURE: Token in URL parameters (HTTPS/WSS encrypted)
const params = new URLSearchParams({
  token: this.apiKey,
  language: this.language,
  model: this.model
});
const wsUrl = `${DEEPGRAM_CONFIG.WSS_ENDPOINT}?${params.toString()}`;
this.websocket = new WebSocket(wsUrl);
```

### **HTTPS/WSS Only**

All network connections use encrypted protocols:

- ✅ `wss://api.deepgram.com/*` (WebSocket Secure)
- ✅ `https://api.deepgram.com/*` (HTTPS)
- ❌ No plain HTTP or WS connections

### **Certificate Validation**

Browser automatically validates SSL certificates for all connections.

## 💾 Data Security

### **Audio Data Handling**

```javascript
// ✅ SECURE: Direct streaming, no local storage
const audioChunks = this.audioProcessor.addAudioData(audioData);
audioChunks.forEach(chunk => {
  if (this.websocket.readyState === WebSocket.OPEN) {
    this.websocket.send(chunk);  // Immediate transmission
  }
});
// No audio data is persisted locally
```

### **Transcript Data**

```javascript
// ✅ SECURE: User-controlled storage
const transcriptData = {
  text: finalTranscript,
  timestamp: Date.now(),
  sessionId: this.sessionId
};

// Only stored with explicit user consent
if (userSettings.saveTranscripts) {
  await safeStorageSet('transcripts', transcriptData);
}
```

### **User Preferences Security**

```javascript
// ✅ SECURE: Chrome's secure storage API
await chrome.storage.local.set({
  'user_preferences': {
    language: 'en-US',
    enableNotifications: true
    // No sensitive data in preferences
  }
});
```

## 🔒 Development Security

### **Environment Isolation**

```bash
# Development
VITE_DEEPGRAM_API_KEY=dev_key_with_limited_permissions

# Staging  
VITE_DEEPGRAM_API_KEY=staging_key_for_testing

# Production
VITE_DEEPGRAM_API_KEY=production_key_with_full_access
```

### **API Key Rotation**

1. **Regular rotation schedule** (every 90 days)
2. **Immediate rotation** if compromise suspected
3. **Gradual deployment** to avoid service interruption

```bash
# Rotate API key
export VITE_DEEPGRAM_API_KEY=new_rotated_api_key
npm run build:chrome
# Deploy new version
```

### **Development vs Production Keys**

| Environment | Key Type | Permissions | Usage |
|-------------|----------|-------------|-------|
| Development | Limited | Basic transcription only | Local testing |
| Staging | Standard | Full features, limited quota | Pre-release testing |
| Production | Production | Full features, full quota | Live extension |

## 🚨 Incident Response

### **API Key Compromise**

1. **Immediate steps:**
   ```bash
   # Revoke compromised key at Deepgram console
   # Generate new API key
   # Update environment variables
   export VITE_DEEPGRAM_API_KEY=new_secure_key
   
   # Rebuild and redeploy
   npm run build:chrome
   ```

2. **Assess impact:**
   - Check Deepgram usage logs
   - Monitor for unusual activity
   - Verify no data exfiltration

3. **Prevent recurrence:**
   - Review access controls
   - Update security practices
   - Implement additional monitoring

### **Extension Compromise**

1. **Remove from store immediately**
2. **Notify users via extension update**
3. **Investigate attack vector**
4. **Patch vulnerabilities**
5. **Security audit before re-release**

## 📊 Security Monitoring

### **Deepgram API Usage Monitoring**

```javascript
// Track API usage for anomaly detection
const usage = {
  requestCount: this.requestCount++,
  timestamp: Date.now(),
  source: 'live-transcription-extension'
};

// Report to monitoring service (optional)
if (import.meta.env.VITE_ENABLE_ANALYTICS) {
  this.reportUsage(usage);
}
```

### **Error Monitoring**

```javascript
// Security-aware error handling
try {
  await this.connectToDeepgram();
} catch (error) {
  // ✅ SECURE: Don't log sensitive data
  const sanitizedError = {
    message: error.message,
    code: error.code,
    timestamp: Date.now()
    // No API keys or user data
  };
  
  this.reportError(sanitizedError);
}
```

## 🔧 Security Tools & Validation

### **Build-time Security Checks**

```bash
# Validate manifest permissions
npm run validate

# Check for hardcoded secrets
npm run security:scan

# Verify CSP compliance
npm run security:csp-check
```

### **Runtime Security Validation**

```javascript
// Validate environment setup
if (import.meta.env.DEV) {
  if (!import.meta.env.VITE_DEEPGRAM_API_KEY) {
    throw new Error('Missing required environment variables');
  }
  
  if (import.meta.env.VITE_DEEPGRAM_API_KEY.includes('example')) {
    console.warn('⚠️ Using example API key - replace with real key');
  }
}
```

## 📋 Security Checklist

### **Pre-deployment Security Review**

- [ ] API keys injected via environment variables (not hardcoded)
- [ ] `.env` files added to `.gitignore`
- [ ] CSP restricts to necessary domains only
- [ ] Permissions follow principle of least privilege
- [ ] No sensitive data logged to console
- [ ] HTTPS/WSS used for all network connections
- [ ] Audio data streamed directly (not stored locally)
- [ ] User preferences don't contain sensitive data
- [ ] Error handling doesn't expose secrets
- [ ] Build process validates security requirements

### **Regular Security Maintenance**

- [ ] API key rotation (every 90 days)
- [ ] Security dependency updates
- [ ] CSP policy review
- [ ] Permission audit
- [ ] Usage monitoring review
- [ ] Incident response plan testing

---

## 🎯 Security-First Development

Following these guidelines ensures the Live Transcription Extension maintains the **highest security standards** while providing excellent user experience. Security is not optional—it's fundamental to user trust and regulatory compliance.

**Remember: Security is everyone's responsibility!** 🛡️