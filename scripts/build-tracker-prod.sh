#!/bin/bash
# Build the tracker app for production with the Tailscale Funnel API URL.
# Usage: ./scripts/build-tracker-prod.sh
# Output: apps/tracker/build/ (upload via SFTP)
#
# Reads the API key from apps/tracker/.env (VITE_SATELLITE_API_KEY).
# Skips gracefully if the key is not set.

set -e

cd "$(dirname "$0")/.."

# Read existing API key from .env
ENV_FILE="apps/tracker/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "Skipping tracker prod build: no .env at $ENV_FILE"
    exit 0
fi

API_KEY=$(grep '^VITE_SATELLITE_API_KEY=' "$ENV_FILE" | cut -d= -f2-)
if [ -z "$API_KEY" ]; then
    echo "Skipping tracker prod build: no VITE_SATELLITE_API_KEY in $ENV_FILE"
    exit 0
fi

API_URL="https://thehuis.tail4fbfb1.ts.net:8080/tles.json"

echo "Building tracker for production..."
echo "  API URL: $API_URL"

# Create production .env
cat > "$ENV_FILE" << EOF
VITE_SATELLITE_API_URL=$API_URL
VITE_SATELLITE_API_KEY=$API_KEY
EOF

# Build
cd apps/tracker
bun run build

echo ""
echo "Build complete: apps/tracker/build/"
echo "Upload via SFTP to your server."
echo ""
echo "Note: The API key is embedded in the build."
echo "Anyone can see it in DevTools. This is fine for a personal project."
echo "For sensitive data, you'd need a backend proxy."
