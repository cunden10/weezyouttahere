# 🚀 Deployment Guide

## 📋 Overview

This guide covers comprehensive deployment strategies for the Live Transcription Extension across multiple environments (development, staging, production) and browser platforms (Chrome, Firefox, Edge).

## 🔧 Environment Configuration

### **Environment Variables in CI/CD**

The extension uses secure environment variable injection through multiple deployment platforms:

#### **GitHub Actions Secrets**

Configure these secrets in your GitHub repository settings:

```bash
# Development Environment
DEEPGRAM_API_KEY_DEV=your_development_api_key

# Staging Environment  
DEEPGRAM_API_KEY_STAGING=your_staging_api_key

# Production Environment
DEEPGRAM_API_KEY_PROD=your_production_api_key

# Store Deployment Credentials
CHROME_EXTENSION_ID=your_chrome_extension_id
CHROME_CLIENT_ID=your_chrome_oauth_client_id
CHROME_CLIENT_SECRET=your_chrome_oauth_client_secret
CHROME_REFRESH_TOKEN=your_chrome_refresh_token

FIREFOX_API_KEY=your_firefox_addons_api_key
FIREFOX_API_SECRET=your_firefox_addons_api_secret

# Optional Notifications
SLACK_WEBHOOK_URL=your_slack_webhook_url
```

#### **Docker Environment Variables**

```dockerfile
# Dockerfile for containerized builds
FROM node:18-alpine

# Set environment variables
ENV NODE_ENV=production
ENV VITE_DEEPGRAM_API_KEY=your_production_key
ENV VITE_APP_ENV=production
ENV VITE_ENABLE_ANALYTICS=true

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build:chrome

# Output will be in /app/build/chrome/
```

#### **Vercel Environment Variables**

```bash
# Vercel Dashboard > Project Settings > Environment Variables

# Production
VITE_DEEPGRAM_API_KEY=your_production_api_key
VITE_APP_ENV=production
NODE_ENV=production

# Preview (Staging)
VITE_DEEPGRAM_API_KEY=your_staging_api_key
VITE_APP_ENV=staging
NODE_ENV=production

# Development
VITE_DEEPGRAM_API_KEY=your_development_api_key
VITE_APP_ENV=development
NODE_ENV=development
```

#### **Netlify Environment Variables**

```bash
# Netlify Dashboard > Site Settings > Environment Variables

# Build Settings
NODE_VERSION=18
NPM_VERSION=8
VITE_DEEPGRAM_API_KEY=your_api_key
VITE_APP_ENV=production

# Build Command
npm run build:chrome

# Publish Directory
build/chrome
```

## 🏗️ Build Commands

### **Local Development**

```bash
# Set up environment
cp .env.example .env
# Edit .env with your development API key

# Development build with hot reload
npm run dev

# Development build (static)
npm run build:chrome -- --mode development
```

### **Staging Builds**

```bash
# Using staging environment
NODE_ENV=production \
VITE_DEEPGRAM_API_KEY=your_staging_key \
VITE_APP_ENV=staging \
npm run build:chrome

# Multi-browser staging builds
npm run build:chrome -- --mode staging
npm run build:firefox -- --mode staging
```

### **Production Builds**

```bash
# Production build (uses .env.production)
npm run build

# Specific browser builds
npm run build:chrome
npm run build:firefox  
npm run build:edge

# All browsers
npm run build:all
```

### **Packaging for Distribution**

```bash
# Package for specific browser store
npm run package:chrome
npm run package:firefox
npm run package:edge

# Package all browsers
npm run package

# Output: dist/live-transcription-{browser}-v{version}.zip
```

## 🔄 CI/CD Pipeline Overview

### **GitHub Actions Workflow**

Our comprehensive workflow includes:

1. **Quality Assurance**
   - ✅ Code linting (ESLint)
   - ✅ Code formatting (Prettier)
   - ✅ Unit tests (Jest)
   - ✅ Manifest validation

2. **Build Matrix**
   - 🌍 **Environments**: development, staging, production
   - 🌐 **Browsers**: Chrome, Firefox, Edge
   - 🔒 **Security scanning** for exposed secrets
   - 📊 **Build analysis** and optimization

3. **Integration Testing**
   - 🎭 **Playwright E2E tests** across browsers
   - 🔌 **Extension loading tests**
   - 🎤 **Transcription functionality tests**

4. **Deployment**
   - 🚀 **Automatic store deployment** on version tags
   - 📦 **Artifact management** with retention policies
   - 📢 **Slack notifications** for deployment status

### **Build Matrix Strategy**

```yaml
strategy:
  matrix:
    environment: [development, staging, production]
    browser: [chrome, firefox, edge]
    exclude:
      # Edge not supported in development builds
      - environment: development
        browser: edge
```

**Total Builds**: 8 combinations
- Development: Chrome, Firefox (2 builds)
- Staging: Chrome, Firefox, Edge (3 builds)  
- Production: Chrome, Firefox, Edge (3 builds)

## 🏪 Store Deployment

### **Chrome Web Store**

**Setup:**
1. Create extension in [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
2. Generate OAuth credentials
3. Get refresh token
4. Configure GitHub secrets

**Automated Deployment:**
```yaml
- name: 🚀 Deploy to Chrome Web Store
  uses: wOxxOm/chrome-webstore-upload-cli@v2
  with:
    extension-id: ${{ secrets.CHROME_EXTENSION_ID }}
    zip-path: ./artifacts/dist/*.zip
    client-id: ${{ secrets.CHROME_CLIENT_ID }}
    client-secret: ${{ secrets.CHROME_CLIENT_SECRET }}
    refresh-token: ${{ secrets.CHROME_REFRESH_TOKEN }}
```

**Manual Deployment:**
```bash
# Install Chrome Web Store CLI
npm install -g chrome-webstore-upload-cli

# Upload new version
chrome-webstore-upload upload \
  --extension-id YOUR_EXTENSION_ID \
  --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_CLIENT_SECRET \
  --refresh-token YOUR_REFRESH_TOKEN \
  --source dist/live-transcription-chrome-v1.0.0.zip
```

### **Firefox Add-ons**

**Setup:**
1. Create account at [Firefox Add-ons Developer Hub](https://addons.mozilla.org/developers/)
2. Generate API credentials
3. Configure manifest v2 compatibility

**Automated Deployment:**
```bash
npx web-ext sign \
  --source-dir ./build/firefox \
  --api-key ${{ secrets.FIREFOX_API_KEY }} \
  --api-secret ${{ secrets.FIREFOX_API_SECRET }}
```

**Manual Deployment:**
```bash
# Install web-ext
npm install -g web-ext

# Validate extension
web-ext lint --source-dir build/firefox

# Sign and upload
web-ext sign \
  --source-dir build/firefox \
  --api-key YOUR_API_KEY \
  --api-secret YOUR_API_SECRET
```

### **Microsoft Edge Add-ons**

**Setup:**
1. Register at [Microsoft Partner Center](https://partner.microsoft.com/)
2. Create Edge extension entry
3. Manual upload process (no API available)

**Manual Process:**
1. Build Edge version: `npm run build:edge`
2. Package: `npm run package:edge`
3. Upload manually to Partner Center
4. Submit for review

## 🔒 Security in Deployment

### **Environment Variable Security**

```bash
# ✅ SECURE: Environment variables in CI/CD
VITE_DEEPGRAM_API_KEY=${{ secrets.DEEPGRAM_API_KEY }}

# ✅ SECURE: Docker secrets
docker run --env-file .env.production your-app

# ❌ INSECURE: Hardcoded in source
const API_KEY = 'sk-1234567890abcdef';
```

### **Build-time Security Scanning**

```bash
# Scan for exposed secrets in build output
if grep -r "DEEPGRAM_API_KEY" build/chrome/ 2>/dev/null; then
  echo "❌ SECURITY VIOLATION: API key found in build!"
  exit 1
fi
```

### **Store Review Preparation**

**Chrome Web Store Requirements:**
- ✅ No obfuscated code
- ✅ Clear permission justifications
- ✅ Privacy policy link
- ✅ Detailed description
- ✅ Screenshots and promotional images

**Firefox Add-ons Requirements:**
- ✅ Source code review
- ✅ Manifest v2 compatibility
- ✅ No external scripts
- ✅ Permission justifications

## 📊 Deployment Monitoring

### **Build Analytics**

```bash
# Automated build analysis
echo "📊 Build Analysis:"
echo "Total size: $(du -sh build/chrome | cut -f1)"
echo "Files: $(find build/chrome -type f | wc -l)"
echo "JavaScript files: $(find build/chrome -name "*.js" | wc -l)"
```

### **Performance Metrics**

```javascript
// Build-time performance tracking
const buildMetrics = {
  buildTime: Date.now() - buildStartTime,
  bundleSize: await getBundleSize(),
  chunkCount: await getChunkCount(),
  assets: await getAssetManifest()
};

// Report to analytics
if (import.meta.env.VITE_ENABLE_ANALYTICS) {
  reportBuildMetrics(buildMetrics);
}
```

### **Deployment Notifications**

```yaml
# Slack notification on deployment
- name: 📢 Slack Notification
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ needs.deploy-production.result }}
    text: |
      🚀 Live Transcription Extension ${{ github.ref_name }} deployed!
      
      📊 Build Info:
      • Environment: Production
      • Browsers: Chrome, Firefox, Edge
      • Size: ${{ env.BUILD_SIZE }}
      
      🔗 Store Links:
      • Chrome: https://chrome.google.com/webstore/detail/${{ secrets.CHROME_EXTENSION_ID }}
      • Firefox: https://addons.mozilla.org/addon/live-transcription/
```

## 🚀 Deployment Strategies

### **Blue-Green Deployment**

```bash
# Version 1.0.0 (current production)
VITE_EXTENSION_VERSION=1.0.0 npm run build:chrome

# Version 1.1.0 (new version)
VITE_EXTENSION_VERSION=1.1.0 npm run build:chrome

# Deploy to stores with gradual rollout
```

### **Canary Releases**

```bash
# Deploy to staging first
git tag v1.1.0-rc1
git push origin v1.1.0-rc1

# Deploy to production after validation
git tag v1.1.0
git push origin v1.1.0
```

### **Rollback Strategy**

```bash
# Quick rollback to previous version
git tag v1.0.1-hotfix
git push origin v1.0.1-hotfix

# Emergency rollback via store dashboards
# Chrome: Developer Dashboard > Rollback
# Firefox: Developer Hub > Disable version
```

## 📋 Deployment Checklist

### **Pre-deployment**
- [ ] All tests passing
- [ ] Security scan clean
- [ ] Environment variables configured
- [ ] Version number updated
- [ ] Changelog updated
- [ ] Privacy policy current

### **Deployment**
- [ ] Build successful across all browsers
- [ ] Package size within limits
- [ ] Manual testing completed
- [ ] Store requirements met
- [ ] Screenshots/descriptions updated

### **Post-deployment**
- [ ] Extension loads correctly
- [ ] Core functionality working
- [ ] Analytics reporting
- [ ] Error monitoring active
- [ ] User feedback monitored
- [ ] Performance metrics tracked

## 🆘 Troubleshooting

### **Common Build Issues**

**Missing Environment Variables:**
```bash
Error: Missing required environment variables: VITE_DEEPGRAM_API_KEY
Solution: Check .env file or CI/CD secrets configuration
```

**Build Size Too Large:**
```bash
Warning: Extension package exceeds 10MB
Solution: Enable compression, optimize assets, check for duplicates
```

**Manifest Validation Errors:**
```bash
Error: Invalid manifest.json
Solution: Run npm run validate, check permissions syntax
```

### **Store Rejection Issues**

**Chrome Web Store:**
- Review privacy policy requirements
- Justify all permissions used
- Ensure no obfuscated code
- Test on latest Chrome version

**Firefox Add-ons:**
- Submit source code for review
- Ensure no external script loading
- Test manifest v2 compatibility
- Document all permission uses

---

## 🎯 Next Steps

1. **Set up CI/CD pipeline** using the provided GitHub Actions workflow
2. **Configure environment variables** in your deployment platform
3. **Test deployment process** in staging environment
4. **Prepare store assets** (screenshots, descriptions, privacy policy)
5. **Deploy to production** with proper monitoring

Your Live Transcription Extension is now ready for **enterprise-grade deployment** across all major browser platforms! 🚀