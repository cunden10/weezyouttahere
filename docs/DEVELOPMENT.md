# Development Guide

This guide covers the development setup, architecture, and workflows for the Live Transcription Extension.

## 🚀 Quick Start

### Prerequisites

- **Node.js**: Version 16.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **Chrome**: Version 88 or higher (for testing)
- **Git**: For version control

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd live-transcription-extension
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the extension**
   ```bash
   npm run build:chrome
   ```

4. **Load in Chrome**
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `build/chrome` directory

## 📁 Project Structure

```
/workspace (Live Transcription Extension)
├── README.md                              # Project overview
├── manifest.json                          # Extension manifest
├── package.json                           # Build dependencies & scripts
├── CHANGELOG.md                           # Version history
├── .gitignore                            # Git exclusions
│
├── src/                                   # 📂 SOURCE CODE
│   ├── background/                        # Service Worker scripts
│   ├── content/                          # Content scripts for web pages
│   ├── modules/                          # Core application modules
│   │   ├── core/                         # Utilities & session management
│   │   ├── audio/                        # Audio processing & feedback
│   │   ├── ui/                           # UI controllers & logic
│   │   └── activation/                   # Feature activation & bootstrap
│   ├── pages/                            # HTML pages
│   ├── styles/                           # CSS stylesheets
│   └── assets/                           # Static assets
│
├── config/                               # Configuration files
├── docs/                                 # Documentation
├── tests/                                # Test files
├── build/                                # Build output (generated)
└── tools/                                # Build & development tools
```

## 🏗️ Architecture Overview

### Module System

The extension uses **ES6 modules** with a clean import/export system:

```javascript
// Core utilities
import { safeStorageGet, safeStorageSet } from '../core/coreUtils.js';

// UI components
import { showToast } from './notificationController.js';

// Audio feedback
import { playNotificationSound } from '../audio/audioNotificationController.js';
```

### Key Components

1. **Background Service Worker** (`src/background/background.js`)
   - Chrome Extension service worker (Manifest V3)
   - Manages extension lifecycle and messaging
   - Handles API key management and storage

2. **Content Scripts** (`src/content/`)
   - Inject functionality into web pages
   - Platform-specific integrations (meetings, CRM)
   - Overlay UI components

3. **Core Modules** (`src/modules/core/`)
   - `coreUtils.js` - Shared utilities and helpers
   - `deepgramLiveTranscriber.js` - Deepgram API integration
   - `transcriptionSessionManager.js` - Session orchestration

4. **UI Controllers** (`src/modules/ui/`)
   - `transcriptionDashboard.js` - Main dashboard logic
   - `settings.js` - Settings page controller
   - `onboarding.js` - First-run experience
   - `notificationController.js` - Toast & banner system

5. **Audio System** (`src/modules/audio/`)
   - `audioNotificationController.js` - Sound feedback
   - `soundManager.js` - Audio asset management

## 🔧 Development Workflow

### Building

```bash
# Build for Chrome (default)
npm run build

# Build for specific browser
npm run build:chrome
npm run build:firefox
npm run build:edge

# Development build with watching
npm run dev
```

### Testing

```bash
# Run all tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# End-to-end tests
npm run test:e2e
```

### Code Quality

```bash
# Lint JavaScript
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format
```

### Packaging

```bash
# Create distribution packages
npm run package

# Validate manifest and structure
npm run validate

# Clean build artifacts
npm run clean
```

## 🎯 Module Development Guidelines

### Core Modules (`src/modules/core/`)

**Purpose**: Shared utilities and core transcription logic
**Conventions**:
- Pure functions where possible
- No direct DOM manipulation
- Comprehensive error handling
- Well-documented APIs

**Example**:
```javascript
// coreUtils.js
export const safeStorageGet = async (key, defaultValue = null) => {
  try {
    // Chrome extension storage with fallback to localStorage
    const result = await chrome.storage.local.get(key);
    return result[key] !== undefined ? result[key] : defaultValue;
  } catch (error) {
    console.warn(`Storage get failed for ${key}:`, error);
    return defaultValue;
  }
};
```

### UI Controllers (`src/modules/ui/`)

**Purpose**: DOM manipulation and user interaction logic
**Conventions**:
- Class-based controllers
- DOM caching for performance
- Event delegation
- Accessible markup

**Example**:
```javascript
// Dashboard controller pattern
class TranscriptionDashboardController {
  constructor() {
    this.elements = {};
    this.init();
  }

  cacheDOMElements() {
    this.elements = {
      startBtn: document.getElementById('start-recording-btn'),
      // ... other elements
    };
  }

  setupEventListeners() {
    this.elements.startBtn.addEventListener('click', () => this.handleStartRecording());
  }
}
```

### Content Scripts (`src/content/`)

**Purpose**: Integration with external websites
**Conventions**:
- Check for existing injection
- Clean up on page unload
- Respect CSP restrictions
- Minimal global scope pollution

**Example**:
```javascript
// Prevent multiple injections
if (!window.liveTranscriptionInjected) {
  window.liveTranscriptionInjected = true;
  
  // Your content script logic here
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', cleanup);
}
```

## 🎨 Styling Guidelines

### CSS Architecture

```
src/styles/
├── common/                    # Shared styles
│   ├── base.css              # Reset, typography, base styles
│   ├── components.css        # Reusable components
│   └── themes.css            # Theme variables
├── pages/                    # Page-specific styles
├── components/               # Component-specific styles
└── content/                  # Content script styles
```

### CSS Conventions

1. **CSS Custom Properties** for theming
   ```css
   :root {
     --primary-color: #3498db;
     --text-color: #2c3e50;
     --border-radius: 4px;
   }
   ```

2. **BEM methodology** for class naming
   ```css
   .transcription-dashboard {}
   .transcription-dashboard__header {}
   .transcription-dashboard__header--active {}
   ```

3. **Mobile-first** responsive design
   ```css
   .component {
     /* Mobile styles */
   }
   
   @media (min-width: 768px) {
     .component {
       /* Desktop styles */
     }
   }
   ```

## 🧪 Testing Strategy

### Unit Tests (`tests/unit/`)

Test individual modules and functions:

```javascript
// Example: coreUtils.test.js
import { safeStorageGet, safeStorageSet } from '../../src/modules/core/coreUtils.js';

describe('coreUtils', () => {
  test('safeStorageGet returns default value when key not found', async () => {
    const result = await safeStorageGet('nonexistent', 'default');
    expect(result).toBe('default');
  });
});
```

### Integration Tests (`tests/integration/`)

Test module interactions and API integrations:

```javascript
// Example: transcription.integration.test.js
describe('Transcription Integration', () => {
  test('session manager integrates with dashboard controller', async () => {
    // Test cross-module communication
  });
});
```

### End-to-End Tests (`tests/e2e/`)

Test complete user workflows using Playwright:

```javascript
// Example: onboarding.e2e.test.js
test('user can complete onboarding flow', async ({ page }) => {
  await page.goto('chrome-extension://[id]/src/pages/onboarding.html');
  await page.click('#welcome-continue-btn');
  // ... continue testing flow
});
```

## 🔧 Build System

### Build Configuration (`tools/build.js`)

The build system:
- Copies source files to build directory
- Updates manifest for target browser
- Minifies and optimizes assets
- Validates structure and permissions

### Environment Configurations (`config/environments/`)

Different configs for development, staging, and production:

```json
// config/environments/development.json
{
  "apiEndpoint": "wss://api.deepgram.com/v1/listen",
  "logLevel": "debug",
  "enableDevTools": true
}
```

## 🚀 Deployment

### Chrome Web Store

1. **Build production version**
   ```bash
   npm run build:chrome
   ```

2. **Package for store**
   ```bash
   npm run package
   ```

3. **Upload to Chrome Web Store**
   - Use generated `.zip` file in `build/`
   - Update store listing with screenshots
   - Submit for review

### Development Distribution

For testing and internal distribution:

```bash
# Create development build
npm run build:chrome

# Package as .crx file
npm run package
```

## 🐛 Debugging

### Chrome Extension Debugging

1. **Background Script**: `chrome://extensions/` → Inspect service worker
2. **Content Scripts**: Browser DevTools → Sources → Content scripts
3. **Popup**: Right-click extension icon → Inspect popup

### Logging Strategy

```javascript
// Use consistent logging prefixes
console.log('[Dashboard] Initialized successfully');
console.error('[Settings] Failed to save:', error);
console.warn('[Onboarding] Permission denied:', permission);
```

### Common Issues

1. **Import Path Errors**: Check relative paths match new structure
2. **CSP Violations**: Ensure inline scripts are moved to files
3. **Permission Issues**: Verify manifest permissions match usage
4. **Storage Failures**: Handle async storage operations properly

## 📝 Code Review Guidelines

### Before Submitting

- [ ] Run `npm run lint` and fix all issues
- [ ] Run `npm test` and ensure all tests pass
- [ ] Update documentation if APIs changed
- [ ] Test in clean Chrome profile
- [ ] Verify no console errors in extension pages

### Review Checklist

- [ ] Code follows established patterns and conventions
- [ ] Error handling is comprehensive and user-friendly
- [ ] Performance considerations (DOM caching, event delegation)
- [ ] Accessibility compliance (ARIA labels, semantic HTML)
- [ ] Security best practices (input validation, CSP compliance)

## 📚 Additional Resources

- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Deepgram API Documentation](https://developers.deepgram.com/)
- [Web Audio API Reference](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

---

For questions or additional help, see the project's issue tracker or contact the development team.