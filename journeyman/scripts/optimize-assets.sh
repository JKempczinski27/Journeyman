#!/bin/bash

# Asset Optimization Script for CDN
# Optimizes images and assets before CDN upload

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

BUILD_DIR="${1:-./journeyman/build}"
OPTIMIZED_DIR="${BUILD_DIR}_optimized"

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Check if build directory exists
if [ ! -d "$BUILD_DIR" ]; then
    warning "Build directory not found: $BUILD_DIR"
    warning "Run 'npm run build:prod' first"
    exit 1
fi

log "Optimizing assets in $BUILD_DIR..."

# Create optimized directory
mkdir -p "$OPTIMIZED_DIR"

# Copy all files first
cp -r "$BUILD_DIR"/* "$OPTIMIZED_DIR/"

# Optimize images if tools are available
if command -v optipng >/dev/null 2>&1; then
    log "Optimizing PNG files..."
    find "$OPTIMIZED_DIR" -name "*.png" -exec optipng -o2 {} \; 2>/dev/null || true
fi

if command -v jpegoptim >/dev/null 2>&1; then
    log "Optimizing JPEG files..."
    find "$OPTIMIZED_DIR" -name "*.jpg" -o -name "*.jpeg" -exec jpegoptim --strip-all {} \; 2>/dev/null || true
fi

# Gzip compress text files for CDN
log "Creating gzip versions of text files..."
find "$OPTIMIZED_DIR" \( -name "*.js" -o -name "*.css" -o -name "*.html" -o -name "*.json" -o -name "*.xml" -o -name "*.svg" \) -exec gzip -k -9 {} \; 2>/dev/null || true

log "Asset optimization complete!"
log "Optimized assets are in: $OPTIMIZED_DIR"
