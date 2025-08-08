#!/bin/bash

# Extension Packaging Script (No Node.js Required)
# Creates a basic package of the extension for testing

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directories
BUILD_DIR="build"
CHROME_BUILD_DIR="$BUILD_DIR/chrome"
PACKAGE_DIR="$BUILD_DIR/packages"
SOURCE_DIR="src"

echo -e "${BLUE}🚀 Starting extension packaging process...${NC}\n"

# Create build directories
echo -e "${BLUE}📁 Creating build directories...${NC}"
mkdir -p "$BUILD_DIR"
mkdir -p "$CHROME_BUILD_DIR"
mkdir -p "$PACKAGE_DIR"

# Copy source files to build directory
echo -e "${BLUE}📋 Copying source files...${NC}"

# Copy manifest
cp manifest.json "$CHROME_BUILD_DIR/"

# Copy source files
cp -r "$SOURCE_DIR"/* "$CHROME_BUILD_DIR/"

# Copy config files
if [ -d "config" ]; then
    cp -r config "$CHROME_BUILD_DIR/"
fi

# Copy assets
if [ -d "src/assets" ]; then
    mkdir -p "$CHROME_BUILD_DIR/assets"
    cp -r src/assets/* "$CHROME_BUILD_DIR/assets/"
fi

# Create a simple .env file for the build
echo -e "${BLUE}🔧 Creating environment configuration...${NC}"
cat > "$CHROME_BUILD_DIR/.env" << EOF
VITE_DEEPGRAM_API_KEY=your_deepgram_api_key_here
NODE_ENV=production
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_DEBUG_LOGGING=false
VITE_ENABLE_BETA_FEATURES=false
VITE_EXTENSION_VERSION=1.0.0
VITE_EXTENSION_NAME="Live Transcription Extension"
VITE_API_BASE_URL=https://api.yourbackend.com
VITE_ANALYTICS_ENDPOINT=https://analytics.yourbackend.com
VITE_DEV_SERVER_PORT=3000
VITE_ENABLE_SOURCE_MAPS=false
EOF

# Validate required files
echo -e "${BLUE}🔍 Validating package...${NC}"
required_files=(
    "manifest.json"
    "background/background.js"
    "content/contentScript.js"
    "pages/popup.html"
)

for file in "${required_files[@]}"; do
    if [ ! -f "$CHROME_BUILD_DIR/$file" ]; then
        echo -e "${RED}❌ Missing required file: $file${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✅ Package validation passed${NC}"

# Create zip package
echo -e "${BLUE}📦 Creating zip package...${NC}"
cd "$CHROME_BUILD_DIR"
zip -r "../packages/live-transcription-extension.zip" . -x "*.DS_Store" "*.git*" "*.env"
cd - > /dev/null

# Get file size
if command -v stat >/dev/null 2>&1; then
    size=$(stat -f%z "$PACKAGE_DIR/live-transcription-extension.zip" 2>/dev/null || stat -c%s "$PACKAGE_DIR/live-transcription-extension.zip" 2>/dev/null || echo "unknown")
    if [ "$size" != "unknown" ]; then
        size_mb=$(echo "scale=2; $size / 1024 / 1024" | bc 2>/dev/null || echo "unknown")
        echo -e "${GREEN}✅ Package created: live-transcription-extension.zip ($size_mb MB)${NC}"
    else
        echo -e "${GREEN}✅ Package created: live-transcription-extension.zip${NC}"
    fi
else
    echo -e "${GREEN}✅ Package created: live-transcription-extension.zip${NC}"
fi

echo -e "${GREEN}📁 Location: $PACKAGE_DIR/live-transcription-extension.zip${NC}"

echo -e "\n${GREEN}🎉 Packaging completed successfully!${NC}"
echo -e "\n${YELLOW}📋 Next steps:${NC}"
echo -e "1. Load the extension in Chrome: chrome://extensions/"
echo -e "2. Enable \"Developer mode\""
echo -e "3. Click \"Load unpacked\" and select the $CHROME_BUILD_DIR directory"
echo -e "4. Or use the zip file for distribution"
echo -e "\n${YELLOW}⚠️  Note:${NC} This is a basic package without build optimization."
echo -e "For production use, install Node.js and run: npm run package" 