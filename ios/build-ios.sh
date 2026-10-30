#!/usr/bin/env bash
# Build the unsigned iOS IPA on macOS (Xcode 15.4+).
# Usage: ./ios/build-ios.sh [app-url]
set -euo pipefail

cd "$(dirname "$0")"
APP_URL="${1:-${DZ_APP_URL:-http://192.144.159.220:8080/play}}"

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "xcodegen not found; installing with Homebrew..."
  brew install xcodegen
fi

xcodegen generate
rm -rf ../build/DezhouNight.xcarchive ../build/Payload ../build/DezhouNight-unsigned.ipa
mkdir -p ../build

xcodebuild \
  -project DezhouNight.xcodeproj \
  -scheme DezhouNight \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -archivePath ../build/DezhouNight.xcarchive \
  archive \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  DZ_APP_URL="$APP_URL" \
  -quiet

mkdir -p ../build/Payload
cp -R ../build/DezhouNight.xcarchive/Products/Applications/DezhouNight.app ../build/Payload/
cd ../build
zip -qry DezhouNight-unsigned.ipa Payload
shasum -a 256 DezhouNight-unsigned.ipa | tee DezhouNight-unsigned.ipa.sha256
echo "IPA: $(pwd)/DezhouNight-unsigned.ipa"
