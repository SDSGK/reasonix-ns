#!/usr/bin/env bash
set -euo pipefail
source_path=${1:?usage: install-studio-macos.sh DMG-OR-APP}
name="Reasonix Studio"
install_dir=${REASONIX_STUDIO_INSTALL_DIR:-/Applications}
target="$install_dir/$name.app"

stage=$(mktemp -d)
cleanup() {
  if [ -n "${mount:-}" ]; then hdiutil detach "$mount" -quiet >/dev/null 2>&1 || true; fi
  rm -rf -- "$stage"
}
trap cleanup EXIT

case "$source_path" in
  *.dmg)
    mount="$stage/mount"
    mkdir -p "$mount"
    hdiutil attach "$source_path" -nobrowse -readonly -mountpoint "$mount" >/dev/null
    app=$(find "$mount" -maxdepth 1 -name '*.app' -print -quit)
    ;;
  *.app)
    app=$source_path
    ;;
  *)
    echo "usage: install-studio-macos.sh DMG-OR-APP" >&2
    exit 1
    ;;
esac
test -n "$app" || { echo "no .app inside $source_path" >&2; exit 1; }

rm -rf -- "$target"
ditto "$app" "$target"
xattr -cr "$target"
info=$(codesign -dvvv "$target" 2>&1 || true)
team=$(printf '%s\n' "$info" | sed -n 's/^TeamIdentifier=//p' | head -1 || true)
runtime=$(printf '%s\n' "$info" | sed -n 's/^flags=.*(\(.*\)).*$/\1/p' | tr ',' '\n' | grep -x runtime || true)
if [ -z "$team" ] || [ "$team" = "not set" ]; then
  if [ -n "$runtime" ] || ! codesign --verify --deep --strict "$target" >/dev/null 2>&1; then
    codesign --force --deep --sign - "$target"
  fi
fi
codesign --verify --deep --strict "$target"
echo "installed $target"
