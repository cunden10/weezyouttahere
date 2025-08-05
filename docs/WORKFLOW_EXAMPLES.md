# 🛠️ Development Workflow Examples

## 📋 Overview

This document provides practical examples of common development workflows using the new professional project structure. Follow these patterns for efficient, consistent development.

## 🚀 Common Development Tasks

### **1. Adding a New Meeting Platform Integration**

**Scenario:** Support for Microsoft Teams transcription overlay

**Steps:**

```bash
# 1. Create the integration file
touch src/content/teamsIntegration.js

# 2. Create platform-specific styles
touch src/styles/content/teams.css

# 3. Add to manifest.json
```

**`src/content/teamsIntegration.js`:**
```javascript
import { showToast } from '../modules/ui/notificationController.js';
import { playNotificationSound } from '../modules/audio/audioNotificationController.js';
import TranscriptionSessionManager from '../modules/core/transcriptionSessionManager.js';

class TeamsIntegration {
  constructor() {
    this.sessionManager = new TranscriptionSessionManager();
    this.overlayElement = null;
    this.init();
  }

  init() {
    this.injectTranscriptionOverlay();
    this.setupTeamsEventListeners();
    console.log('[Teams] Integration initialized');
  }

  injectTranscriptionOverlay() {
    // Teams-specific overlay injection
    const teamsContainer = document.querySelector('[data-tid="teams-content"]');
    if (teamsContainer) {
      this.overlayElement = this.createOverlay();
      teamsContainer.appendChild(this.overlayElement);
    }
  }

  // ... additional Teams-specific methods
}

// Auto-initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new TeamsIntegration());
} else {
  new TeamsIntegration();
}
```

**Update `manifest.json`:**
```json
{
  "content_scripts": [
    {
      "matches": [
        "https://teams.microsoft.com/*",
        "https://*.teams.microsoft.com/*"
      ],
      "js": ["src/content/teamsIntegration.js"],
      "css": ["src/styles/content/teams.css"],
      "run_at": "document_end",
      "all_frames": false
    }
  ]
}
```

**`src/styles/content/teams.css`:**
```css
/* Teams-specific overlay styles */
.teams-transcription-overlay {
  position: fixed;
  top: 80px;
  right: 20px;
  width: 300px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 10000;
}

/* Teams dark theme support */
.theme-dark .teams-transcription-overlay {
  background: rgba(32, 31, 30, 0.95);
  color: #fff;
}
```

### **2. Creating a New UI Component**

**Scenario:** Add a transcript search component

**Steps:**

```bash
# 1. Create component module
touch src/modules/ui/transcriptSearch.js

# 2. Create component styles
touch src/styles/components/transcriptSearch.css

# 3. Add to dashboard
```

**`src/modules/ui/transcriptSearch.js`:**
```javascript
import { safeStorageGet, safeStorageSet } from '../core/coreUtils.js';
import { showToast } from './notificationController.js';

export class TranscriptSearch {
  constructor(transcriptContainer) {
    this.container = transcriptContainer;
    this.searchResults = [];
    this.currentIndex = 0;
    this.init();
  }

  init() {
    this.createSearchUI();
    this.setupEventListeners();
    this.loadSearchHistory();
  }

  createSearchUI() {
    this.searchElement = document.createElement('div');
    this.searchElement.className = 'transcript-search';
    this.searchElement.innerHTML = `
      <div class="search-input-container">
        <input type="text" id="transcript-search-input" 
               placeholder="Search transcript..." 
               class="search-input" />
        <button id="search-prev" class="search-nav-btn" title="Previous">↑</button>
        <button id="search-next" class="search-nav-btn" title="Next">↓</button>
        <span id="search-results-info" class="search-info"></span>
        <button id="search-close" class="search-close" title="Close">×</button>
      </div>
    `;
    this.container.appendChild(this.searchElement);
  }

  setupEventListeners() {
    const input = this.searchElement.querySelector('#transcript-search-input');
    const prevBtn = this.searchElement.querySelector('#search-prev');
    const nextBtn = this.searchElement.querySelector('#search-next');
    const closeBtn = this.searchElement.querySelector('#search-close');

    input.addEventListener('input', (e) => this.performSearch(e.target.value));
    prevBtn.addEventListener('click', () => this.navigateResults(-1));
    nextBtn.addEventListener('click', () => this.navigateResults(1));
    closeBtn.addEventListener('click', () => this.hide());

    // Keyboard shortcuts
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.shiftKey ? this.navigateResults(-1) : this.navigateResults(1);
      } else if (e.key === 'Escape') {
        this.hide();
      }
    });
  }

  performSearch(query) {
    if (!query) {
      this.clearHighlights();
      this.updateResultsInfo(0, 0);
      return;
    }

    // Find all matches in transcript
    const transcriptText = this.container.textContent;
    const regex = new RegExp(query, 'gi');
    const matches = [...transcriptText.matchAll(regex)];

    this.searchResults = matches;
    this.currentIndex = 0;

    this.highlightMatches(query);
    this.updateResultsInfo(matches.length, 1);
    
    if (matches.length > 0) {
      this.scrollToCurrentResult();
    }

    // Save to search history
    this.saveSearchHistory(query);
  }

  highlightMatches(query) {
    // Implementation for highlighting search results
    this.clearHighlights();
    
    const walker = document.createTreeWalker(
      this.container,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      if (node.nodeValue.toLowerCase().includes(query.toLowerCase())) {
        textNodes.push(node);
      }
    }

    // Highlight found text nodes
    textNodes.forEach(textNode => {
      const highlightedHTML = textNode.nodeValue.replace(
        new RegExp(query, 'gi'),
        `<mark class="search-highlight">$&</mark>`
      );
      
      const wrapper = document.createElement('span');
      wrapper.innerHTML = highlightedHTML;
      textNode.parentNode.replaceChild(wrapper, textNode);
    });
  }

  // ... additional methods
}

// Export for use in dashboard
export default TranscriptSearch;
```

**`src/styles/components/transcriptSearch.css`:**
```css
.transcript-search {
  position: sticky;
  top: 0;
  background: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
  padding: 0.75rem;
  z-index: 100;
}

.search-input-container {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.search-input {
  flex: 1;
  padding: 0.5rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 0.9rem;
}

.search-nav-btn, .search-close {
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.8rem;
}

.search-highlight {
  background: #ffeb3b;
  color: #000;
  border-radius: 2px;
}

.search-highlight.current {
  background: #ff9800;
}

.search-info {
  font-size: 0.8rem;
  color: var(--text-secondary);
  white-space: nowrap;
}
```

**Integrate into Dashboard (`src/modules/ui/transcriptionDashboard.js`):**
```javascript
import TranscriptSearch from './transcriptSearch.js';

class TranscriptionDashboardController {
  constructor() {
    // ... existing code
    this.transcriptSearch = null;
  }

  setupTranscriptSearch() {
    this.transcriptSearch = new TranscriptSearch(
      this.elements.liveTranscript
    );
  }

  handleKeyboardShortcuts(event) {
    // Add Ctrl+F for search
    if (event.ctrlKey && event.key === 'f') {
      event.preventDefault();
      this.transcriptSearch?.show();
    }
    // ... existing shortcuts
  }
}
```

### **3. Adding a New Audio Notification**

**Scenario:** Add call connection sound

**Steps:**

```bash
# 1. Add audio file to assets
cp call-connected.mp3 src/assets/sounds/

# 2. Register in audio controller
# 3. Use in content scripts
```

**Update `src/modules/audio/audioNotificationController.js`:**
```javascript
const BUILT_IN_SOUNDS = {
  // ... existing sounds
  callConnected: 'call-connected.mp3',
  callDisconnected: 'call-disconnected.mp3',
  participantJoined: 'participant-joined.wav'
};
```

**Use in Meeting Integration:**
```javascript
// In src/content/meetingOverlay.js
import { playNotificationSound } from '../modules/audio/audioNotificationController.js';

class MeetingOverlay {
  async handleCallStateChange(state) {
    switch (state) {
      case 'connected':
        await playNotificationSound('callConnected');
        break;
      case 'disconnected':
        await playNotificationSound('callDisconnected');
        break;
      case 'participant-joined':
        await playNotificationSound('participantJoined', { volume: 0.7 });
        break;
    }
  }
}
```

### **4. Creating a New Page**

**Scenario:** Add a help/support page

**Steps:**

```bash
# 1. Create HTML page
touch src/pages/help.html

# 2. Create page controller
touch src/modules/ui/help.js

# 3. Create page styles
touch src/styles/pages/help.css

# 4. Update manifest if needed
```

**`src/pages/help.html`:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Help & Support - Live Transcription</title>
  
  <!-- Common styles -->
  <link rel="stylesheet" href="../styles/common/base.css" />
  
  <!-- Page-specific styles -->
  <link rel="stylesheet" href="../styles/pages/help.css" />
  
  <!-- Component styles -->
  <link rel="stylesheet" href="../styles/components/notifications.css" />
</head>
<body>
  <main class="help-page" role="main">
    <header class="help-header">
      <h1>Help & Support</h1>
      <button id="back-btn" class="back-button">← Back to Dashboard</button>
    </header>

    <nav class="help-navigation">
      <ul class="help-nav-list">
        <li><a href="#getting-started" class="nav-link">Getting Started</a></li>
        <li><a href="#troubleshooting" class="nav-link">Troubleshooting</a></li>
        <li><a href="#keyboard-shortcuts" class="nav-link">Keyboard Shortcuts</a></li>
        <li><a href="#privacy" class="nav-link">Privacy & Security</a></li>
        <li><a href="#contact" class="nav-link">Contact Support</a></li>
      </ul>
    </nav>

    <section id="getting-started" class="help-section">
      <h2>Getting Started</h2>
      <!-- Help content -->
    </section>

    <!-- More sections... -->
  </main>

  <!-- Load page controller -->
  <script type="module" src="../modules/ui/help.js"></script>
</body>
</html>
```

### **5. Environment-Specific Configuration**

**Scenario:** Different API endpoints for dev/staging/production

**Create `config/environments/development.json`:**
```json
{
  "deepgram": {
    "apiUrl": "wss://api.deepgram.com/v1/listen",
    "apiKey": "dev_api_key_placeholder",
    "model": "nova-2",
    "enableLogging": true
  },
  "features": {
    "enableAnalytics": false,
    "enableErrorReporting": true,
    "enableBetaFeatures": true
  },
  "ui": {
    "showDebugInfo": true,
    "enableDevTools": true
  }
}
```

**Create `config/environments/production.json`:**
```json
{
  "deepgram": {
    "apiUrl": "wss://api.deepgram.com/v1/listen",
    "model": "nova-2",
    "enableLogging": false
  },
  "features": {
    "enableAnalytics": true,
    "enableErrorReporting": true,
    "enableBetaFeatures": false
  },
  "ui": {
    "showDebugInfo": false,
    "enableDevTools": false
  }
}
```

**Load in Core Utils:**
```javascript
// In src/modules/core/coreUtils.js
export async function loadEnvironmentConfig() {
  const environment = process.env.NODE_ENV || 'development';
  
  try {
    const configUrl = chrome.runtime.getURL(`config/environments/${environment}.json`);
    const response = await fetch(configUrl);
    return await response.json();
  } catch (error) {
    console.warn('Failed to load environment config, using defaults');
    return getDefaultConfig();
  }
}
```

## 🔧 Build System Workflows

### **Development Build**

```bash
# Start development with hot reload
npm run dev

# What this does:
# 1. Watches src/ directory for changes
# 2. Automatically rebuilds on file changes
# 3. Reloads extension in Chrome
# 4. Enables source maps for debugging
# 5. Uses development environment config
```

### **Production Build**

```bash
# Build for all platforms
npm run build

# Build specific platform
npm run build:chrome
npm run build:firefox
npm run build:edge

# What this does:
# 1. Minifies JavaScript and CSS
# 2. Optimizes assets
# 3. Validates manifest files
# 4. Creates platform-specific builds
# 5. Generates source maps for debugging
```

### **Testing Workflow**

```bash
# Run all tests
npm run test

# Run specific test types
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests
npm run test:e2e         # End-to-end tests

# Watch mode for development
npm run test:watch
```

## 📦 Packaging & Distribution

### **Create Distribution Package**

```bash
# Package for Chrome Web Store
npm run package:chrome

# Package for Firefox Add-ons
npm run package:firefox

# Package all platforms
npm run package

# Output:
# dist/
# ├── live-transcription-chrome-v1.0.0.zip
# ├── live-transcription-firefox-v1.0.0.zip
# └── live-transcription-edge-v1.0.0.zip
```

### **Automated Deployment**

```bash
# Deploy to development stores
npm run deploy:dev

# Deploy to staging
npm run deploy:staging

# Deploy to production stores
npm run deploy:prod
```

## 🐛 Debugging Workflows

### **Chrome Extension Debugging**

1. **Load Development Extension:**
```bash
npm run dev
# Extension auto-reloads at chrome://extensions/
```

2. **Debug Background Script:**
```bash
# Open Chrome DevTools
# Go to chrome://extensions/
# Click "Inspect views: background page"
```

3. **Debug Content Scripts:**
```bash
# Open page where content script runs
# Press F12 for DevTools
# Content script appears in Sources tab
```

### **Production Debugging**

```bash
# Build with source maps
npm run build:debug

# This creates:
# - Minified production code
# - Source maps for debugging
# - Debug symbols for error reporting
```

## 🚀 Performance Optimization

### **Bundle Analysis**

```bash
# Analyze bundle size
npm run analyze

# Output:
# - Bundle size report
# - Dependency analysis
# - Optimization suggestions
```

### **Asset Optimization**

```bash
# Optimize images
npm run optimize:images

# Optimize audio files
npm run optimize:audio

# Lint and format code
npm run lint
npm run format
```

---

## 📋 Quick Reference

### **File Creation Patterns**

| Component Type | Location | Example |
|----------------|----------|---------|
| Content Script | `src/content/` | `platformName.js` |
| UI Component | `src/modules/ui/` | `componentName.js` |
| Core Module | `src/modules/core/` | `moduleName.js` |
| Audio Asset | `src/assets/sounds/` | `soundName.mp3` |
| Page Styles | `src/styles/pages/` | `pageName.css` |
| Component Styles | `src/styles/components/` | `componentName.css` |

### **Import Path Patterns**

```javascript
// From within same category
import { util } from './siblingFile.js';

// From different category  
import { util } from '../categoryName/fileName.js';

// From background/content scripts
import { util } from '../modules/categoryName/fileName.js';
```

### **Common Commands**

```bash
npm run dev          # Development mode
npm run build        # Production build
npm run test         # Run tests
npm run lint         # Code quality check
npm run package      # Create distribution
npm run validate     # Validate manifest
```

This structure provides a **solid foundation** for efficient, scalable development! 🚀