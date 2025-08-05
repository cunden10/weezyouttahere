#!/bin/bash
# ================================================================
# ICON GENERATION SCRIPT
# ================================================================
# Converts the SVG icon template to all required PNG sizes
# Requires ImageMagick to be installed

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SVG_FILE="src/assets/icons/live-transcription-icon.svg"
OUTPUT_DIR="src/assets/icons"
SIZES=(16 32 48 128)

echo -e "${BLUE}🎨 Live Transcription Extension - Icon Generator${NC}"
echo "================================================="

# Check if ImageMagick is installed
if ! command -v magick &> /dev/null && ! command -v convert &> /dev/null; then
    echo -e "${RED}❌ Error: ImageMagick is not installed${NC}"
    echo ""
    echo "Install ImageMagick:"
    echo "  macOS: brew install imagemagick"
    echo "  Ubuntu/Debian: sudo apt-get install imagemagick"
    echo "  Windows: Download from https://imagemagick.org/script/download.php"
    echo ""
    echo "Alternative: Use online converters:"
    echo "  - https://svgtopng.com"
    echo "  - https://cloudconvert.com"
    echo "  - https://convertio.co"
    exit 1
fi

# Determine which command to use
if command -v magick &> /dev/null; then
    CONVERT_CMD="magick"
else
    CONVERT_CMD="convert"
fi

# Check if SVG file exists
if [ ! -f "$SVG_FILE" ]; then
    echo -e "${RED}❌ Error: SVG file not found: $SVG_FILE${NC}"
    exit 1
fi

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

echo -e "${YELLOW}📁 Input:${NC} $SVG_FILE"
echo -e "${YELLOW}📁 Output:${NC} $OUTPUT_DIR"
echo ""

# Generate PNG files for each size
for size in "${SIZES[@]}"; do
    output_file="$OUTPUT_DIR/icon-${size}.png"
    
    echo -e "${BLUE}🔄 Generating ${size}×${size}px icon...${NC}"
    
    if $CONVERT_CMD "$SVG_FILE" -resize ${size}x${size} "$output_file"; then
        # Get file size
        file_size=$(du -h "$output_file" | cut -f1)
        echo -e "${GREEN}✅ Created: icon-${size}.png (${file_size})${NC}"
    else
        echo -e "${RED}❌ Failed to create icon-${size}.png${NC}"
        exit 1
    fi
done

echo ""
echo -e "${GREEN}🎉 All icons generated successfully!${NC}"
echo ""

# Display file information
echo -e "${YELLOW}📊 Generated Icons:${NC}"
echo "==================="
for size in "${SIZES[@]}"; do
    file_path="$OUTPUT_DIR/icon-${size}.png"
    if [ -f "$file_path" ]; then
        file_size=$(du -h "$file_path" | cut -f1)
        dimensions=$(identify -ping -format '%wx%h' "$file_path" 2>/dev/null || echo "unknown")
        echo "  📄 icon-${size}.png - ${dimensions} - ${file_size}"
    fi
done

echo ""
echo -e "${BLUE}🔧 Next Steps:${NC}"
echo "1. Load the extension in Chrome (chrome://extensions/)"
echo "2. Enable Developer mode and click 'Load unpacked'"
echo "3. Select your extension directory"
echo "4. Check that icons appear correctly in:"
echo "   • Browser toolbar (16px)"
echo "   • Extension management page (48px)"
echo "   • Chrome Web Store listing (128px)"

echo ""
echo -e "${YELLOW}💡 Tips:${NC}"
echo "• Test icons on both light and dark themes"
echo "• Ensure good visibility at all sizes"
echo "• Consider creating alternative versions for different contexts"

echo ""
echo -e "${GREEN}✨ Icon generation complete!${NC}"