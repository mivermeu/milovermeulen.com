#!/bin/bash
# Build the tracker app for production with the Tailscale Funnel API URL.
# Usage: ./scripts/build-tracker-prod.sh
# Output: apps/tracker/build/ (upload via SFTP)

set -e

cd "$(dirname "$0")/.."

ENV_FILE="apps/tracker/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo "Skipping tracker prod build: no .env at $ENV_FILE"
    exit 0
fi

API_URL=$(grep '^VITE_SATELLITE_API_URL=' "$ENV_FILE" | cut -d= -f2-)
if [ -z "$API_URL" ]; then
    echo "Skipping tracker prod build: no VITE_SATELLITE_API_URL in $ENV_FILE"
    exit 0
fi

echo "Building tracker for production..."
echo "  API URL: $API_URL"

# Build
cd apps/tracker
bun run build

echo ""
echo "Build complete: apps/tracker/build/"
echo "Upload via SFTP to your server."
