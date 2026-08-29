#!/bin/bash
# Build the tracker app for production with the Tailscale Funnel API URL.
# Usage: ./scripts/build-tracker-prod.sh
# Output: apps/tracker/build/ (upload via SFTP)

set -e

API_URL="https://thehuis.tail4fbfb1.ts.net:8080/tles.json"
API_KEY=$(cat ~/.config/satellite-api/key)

echo "Building tracker for production..."
echo "  API URL: $API_URL"

cd "$(dirname "$0")/.."

# Create production .env
cat > apps/tracker/.env << EOF
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
