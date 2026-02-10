#!/usr/bin/env bash
set -euo pipefail

REPO="noisedeck/noisemaker"
ASSET="noisemaker-shaders.tar.gz"
TARGET_DIR="./vendor/noisemaker"
VERSION=""

usage() {
  echo "Usage: $0 [target-dir] [--version TAG]"
  echo ""
  echo "Download pre-built Noisemaker shader bundles from GitHub releases."
  echo ""
  echo "  target-dir   Where to extract (default: $TARGET_DIR)"
  echo "  --version    Release tag to download (default: latest)"
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION="$2"
      shift 2
      ;;
    --help|-h)
      usage
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage
      ;;
    *)
      TARGET_DIR="$1"
      shift
      ;;
  esac
done

mkdir -p "$TARGET_DIR"

TMPFILE=$(mktemp)
trap 'rm -f "$TMPFILE"' EXIT

echo "Downloading $ASSET${VERSION:+ ($VERSION)}..."

if command -v gh &>/dev/null; then
  # gh handles authentication for private repos
  if [[ -n "$VERSION" ]]; then
    gh release download "$VERSION" --repo "$REPO" --pattern "$ASSET" --output "$TMPFILE" --clobber
  else
    gh release download --repo "$REPO" --pattern "$ASSET" --output "$TMPFILE" --clobber
  fi
else
  # curl fallback (public repos only)
  if [[ -n "$VERSION" ]]; then
    URL="https://github.com/$REPO/releases/download/$VERSION/$ASSET"
  else
    URL="https://github.com/$REPO/releases/latest/download/$ASSET"
  fi
  curl -fsSL -o "$TMPFILE" "$URL"
fi

echo "Extracting to $TARGET_DIR..."
tar -xzf "$TMPFILE" -C "$TARGET_DIR"

echo ""
echo "Done. Contents:"
ls -1 "$TARGET_DIR"
