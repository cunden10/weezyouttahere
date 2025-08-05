# 🔄 Migration Guide: Professional Project Structure

## 📋 Overview

This guide covers the migration from the original flat file structure to our new professional, scalable architecture. Follow these steps to update existing code and establish new development workflows.

## 🗂️ Directory Structure Migration

### **Before → After Mapping**

```diff
OLD STRUCTURE                    →    NEW STRUCTURE
─────────────────────────────────     ──────────────────────────────────────
/                                     /
├── background.js                →    ├── src/background/background.js
├── content.js                   →    ├── src/content/contentScript.js
├── featureActivation.js         →    ├── src/modules/activation/featureActivation.js
├── transcriptionBootstrap.js    →    ├── src/modules/activation/transcriptionBootstrap.js
├── coreUtils.js                 →    ├── src/modules/core/coreUtils.js
├── deepgram-live-transcriber.js →    ├── src/modules/core/deepgramLiveTranscriber.js
├── transcriptionSessionManager.js →  ├── src/modules/core/transcriptionSessionManager.js
├── audioNotificationController.js →  ├── src/modules/audio/audioNotificationController.js
├── soundManager.js              →    ├── [CONSOLIDATED INTO audioNotificationController.js]
├── notificationController.js    →    ├── src/modules/ui/notificationController.js
├── transcriptionDashboard.js    →    ├── src/modules/ui/transcriptionDashboard.js
├── scripts/settings.js          →    ├── src/modules/ui/settings.js
├── scripts/onboarding.js        →    ├── src/modules/ui/onboarding.js
├── index.html                   →    ├── src/pages/activation.html
├── transcriptionDashboard.html  →    ├── src/pages/dashboard.html
├── settings.html                →    ├── src/pages/settings.html
├── onboarding.html              →    ├── src/pages/onboarding.html
├── activationStyles.css         →    ├── src/styles/components/activation.css
├── notificationStyles.css       →    ├── src/styles/components/notifications.css
├── deepgramRuleset.json         →    ├── config/deepgramRuleset.json
├── AUDIO_SETUP.md               →    ├── docs/AUDIO_SETUP.md
├── assets/                      →    ├── src/assets/
└── README.md                         └── README.md (updated)
```

## 🔧 Critical Import Path Updates

### **JavaScript Module Imports**

All ES6 module imports need updating to reflect the new directory structure:

**Core Utilities:**
```javascript
// ❌ OLD
import { safeStorageGet, MiniEmitter } from './coreUtils.js';

// ✅ NEW - From UI modules
import { safeStorageGet, MiniEmitter } from '../core/coreUtils.js';

// ✅ NEW - From activation modules  
import { safeStorageGet, MiniEmitter } from '../core/coreUtils.js';

// ✅ NEW - From background scripts
import { safeStorageGet, MiniEmitter } from '../modules/core/coreUtils.js';
```

**UI Components:**
```javascript
// ❌ OLD
import { showToast } from './notificationController.js';

// ✅ NEW - Within UI modules
import { showToast } from './notificationController.js';

// ✅ NEW - From other module categories
import { showToast } from '../ui/notificationController.js';

// ✅ NEW - From pages or content scripts
import { showToast } from '../modules/ui/notificationController.js';
```

**Audio System:**
```javascript
// ❌ OLD
import { playSound } from './soundManager.js';
import { playNotificationSound } from './audioNotificationController.js';

// ✅ NEW - Consolidated audio system
import { playNotificationSound } from '../audio/audioNotificationController.js';

// ✅ NEW - From background/content scripts
import { playNotificationSound } from '../modules/audio/audioNotificationController.js';
```

**Session Management:**
```javascript
// ❌ OLD
import TranscriptionSessionManager from './transcriptionSessionManager.js';

// ✅ NEW
import TranscriptionSessionManager from '../core/transcriptionSessionManager.js';
```

### **HTML Script References**

Update `<script>` and `<link>` tags in HTML files:

**Dashboard Page:**
```html
<!-- ❌ OLD -->
<link rel="stylesheet" href="transcriptionDashboard.css" />
<link rel="stylesheet" href="notificationStyles.css" />
<script type="module" src="transcriptionDashboard.js"></script>

<!-- ✅ NEW -->
<link rel="stylesheet" href="../styles/pages/dashboard.css" />
<link rel="stylesheet" href="../styles/components/notifications.css" />
<script type="module" src="../modules/ui/transcriptionDashboard.js"></script>
```

**Settings Page:**
```html
<!-- ❌ OLD -->
<link rel="stylesheet" href="styles/settings.css" />
<script type="module" src="scripts/settings.js"></script>

<!-- ✅ NEW -->
<link rel="stylesheet" href="../styles/pages/settings.css" />
<script type="module" src="../modules/ui/settings.js"></script>
```

## 📦 New Development Workflow

### **Package.json Scripts**

```bash
# 🔄 Development Workflow
npm run dev          # Development build with hot reload
npm run dev:chrome   # Chrome-specific development build
npm run dev:firefox  # Firefox-specific development build

# 🏗️ Production Builds  
npm run build        # Build all platforms
npm run build:chrome # Production Chrome extension
npm run build:firefox # Production Firefox addon
npm run build:edge   # Production Edge extension

# 🧪 Testing & Quality
npm run test         # Run complete test suite
npm run test:unit    # Unit tests only
npm run test:e2e     # End-to-end tests
npm run lint         # ESLint code quality
npm run format       # Prettier code formatting

# 📦 Distribution
npm run package      # Create distribution packages
npm run package:chrome # Chrome Web Store package
npm run validate     # Validate manifest & dependencies

# 🚀 Deployment
npm run deploy:dev   # Deploy to development environment
npm run deploy:staging # Deploy to staging store
npm run deploy:prod  # Deploy to production stores
```

### **Environment-Specific Development**

**Development Environment:**
```bash
# Start development server with hot reload
npm run dev

# This will:
# - Start webpack dev server
# - Enable source maps
# - Watch for file changes
# - Automatically reload extension
# - Serve from src/ directory
```

**Platform-Specific Builds:**
```bash
# Chrome Extension
npm run build:chrome
# Output: build/chrome/

# Firefox Addon  
npm run build:firefox
# Output: build/firefox/

# Edge Extension
npm run build:edge
# Output: build/edge/
```

## 🔒 Security & Permissions Updates

### **Content Security Policy**

Updated CSP in `manifest.json`:

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; connect-src 'self' wss://api.deepgram.com https://api.deepgram.com; object-src 'self';"
  }
}
```

### **Web Accessible Resources**

Updated resource paths:

```json
{
  "web_accessible_resources": [
    {
      "resources": [
        "src/pages/*",
        "src/styles/*", 
        "src/assets/*",
        "src/modules/*"
      ],
      "matches": ["<all_urls>"]
    }
  ]
}
```

## 🚀 Easy Feature Addition

### **Adding New Platform Integration**

1. **Create Integration File:**
```bash
touch src/content/newPlatformIntegration.js
```

2. **Update Manifest:**
```json
{
  "content_scripts": [
    {
      "matches": ["https://newplatform.com/*"],
      "js": ["src/content/newPlatformIntegration.js"],
      "css": ["src/styles/content/newPlatform.css"],
      "run_at": "document_end"
    }
  ]
}
```

3. **Add Platform Styles:**
```bash
touch src/styles/content/newPlatform.css
```

### **Adding New UI Component**

1. **Create Component:**
```bash
touch src/modules/ui/newComponent.js
```

2. **Add Component Styles:**
```bash
touch src/styles/components/newComponent.css
```

3. **Import in Dashboard:**
```javascript
import { NewComponent } from '../modules/ui/newComponent.js';
```

### **Adding New Audio Feedback**

1. **Add Audio File:**
```bash
cp new-sound.mp3 src/assets/sounds/
```

2. **Register in Audio Controller:**
```javascript
// In audioNotificationController.js
const BUILT_IN_SOUNDS = {
  // ... existing sounds
  newSound: 'new-sound.mp3'
};
```

3. **Use Anywhere:**
```javascript
await playNotificationSound('newSound');
```

## ⚙️ Build Process Updates

### **Webpack Configuration Updates**

```javascript
// webpack.config.js
module.exports = {
  entry: {
    background: './src/background/background.js',
    contentScript: './src/content/contentScript.js',
    popup: './src/modules/ui/popup.js',
    dashboard: './src/modules/ui/transcriptionDashboard.js',
    settings: './src/modules/ui/settings.js',
    onboarding: './src/modules/ui/onboarding.js'
  },
  output: {
    path: path.resolve(__dirname, 'build/chrome'),
    filename: '[name].js'
  },
  // ... additional config
};
```

### **File Watching Patterns**

Update development server to watch new directories:

```javascript
// dev-server.config.js
module.exports = {
  watchOptions: {
    ignored: /node_modules/,
    poll: 1000
  },
  contentBase: [
    path.join(__dirname, 'src'),
    path.join(__dirname, 'config'),
    path.join(__dirname, 'src/assets')
  ]
};
```

## 🧪 Testing Updates

### **Test File Organization**

```
tests/
├── unit/
│   ├── modules/
│   │   ├── core/
│   │   │   ├── coreUtils.test.js
│   │   │   └── transcriptionSessionManager.test.js
│   │   ├── audio/
│   │   │   └── audioNotificationController.test.js
│   │   └── ui/
│   │       └── notificationController.test.js
│   └── background/
│       └── background.test.js
├── integration/
│   ├── transcription-flow.test.js
│   └── settings-persistence.test.js
└── e2e/
    ├── onboarding-flow.test.js
    └── dashboard-interaction.test.js
```

### **Test Import Updates**

```javascript
// ❌ OLD
import { safeStorageGet } from '../coreUtils.js';

// ✅ NEW
import { safeStorageGet } from '../../src/modules/core/coreUtils.js';
```

## 📋 Migration Checklist

### **Phase 1: Core Structure** ✅
- [x] Move all files to new directory structure
- [x] Update manifest.json paths
- [x] Update HTML script references
- [x] Update ES6 module imports
- [x] Create package.json with build scripts
- [x] Add .gitignore for new structure

### **Phase 2: Styling System** (Next Priority)
- [ ] Create `src/styles/common/base.css` - Design system foundation
- [ ] Create `src/styles/pages/` - Page-specific stylesheets
- [ ] Create `src/styles/content/` - Content script styles
- [ ] Update all HTML files to use new CSS paths

### **Phase 3: Build System** (High Priority)
- [ ] Create `tools/build.js` - Multi-platform build script
- [ ] Create `config/buildConfig.js` - Build configuration
- [ ] Set up webpack configuration for new structure
- [ ] Implement environment-specific builds
- [ ] Add development server with hot reload

### **Phase 4: Missing Integrations** (Medium Priority)
- [ ] Create `src/content/meetingOverlay.js`
- [ ] Create `src/content/apolloIntegration.js`
- [ ] Create `src/content/salesloftIntegration.js`
- [ ] Add corresponding CSS files

### **Phase 5: Testing Infrastructure** (Medium Priority)
- [ ] Set up Jest configuration for new structure
- [ ] Create unit tests for core modules
- [ ] Set up Playwright for E2E testing
- [ ] Add continuous integration workflows

### **Phase 6: Assets & Documentation** (Low Priority)
- [ ] Add extension icons (16px, 32px, 48px, 128px)
- [ ] Add audio notification files
- [ ] Create API documentation
- [ ] Add deployment guides

## 🆘 Troubleshooting

### **Common Import Errors**

**Error:** `Cannot resolve module '../notificationController.js'`
**Solution:** Update import path to `../ui/notificationController.js`

**Error:** `Failed to load resource: chrome-extension://[id]/background.js`
**Solution:** Update manifest.json `service_worker` path to `src/background/background.js`

**Error:** `Stylesheet not found: transcriptionDashboard.css`
**Solution:** Update HTML link to `../styles/pages/dashboard.css`

### **Build Issues**

**Error:** Webpack can't resolve entry points
**Solution:** Update webpack config entry paths to new `src/` structure

**Error:** Extension won't load in Chrome
**Solution:** Verify all manifest.json paths point to existing files

### **Getting Help**

- 📖 Check `docs/DEVELOPMENT.md` for detailed development setup
- 🐛 Review `CHANGELOG.md` for breaking changes
- 🔍 Use `npm run validate` to check for common issues
- 💬 File issues with detailed error messages and file paths

---

## 🎯 Next Steps

1. **Update any remaining import paths** following the patterns above
2. **Run `npm install`** to set up the development environment  
3. **Use `npm run dev`** to start development with the new structure
4. **Test thoroughly** to ensure all functionality works with new paths
5. **Add missing CSS files** for complete styling system

The new structure provides a **solid foundation** for scalable development! 🚀