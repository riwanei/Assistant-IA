#!/usr/bin/env bash
# Installation Linux x86_64 sans sudo, destinée à cet environnement cloud.
set -euo pipefail
[ "$(uname -s)" = Linux ] && [ "$(uname -m)" = x86_64 ] || { echo 'Linux x86_64 requis'; exit 1; }
version=0.40.11
destination=/workspace/tools/ollama
archive=/tmp/ollama-linux-amd64.tar.zst
if [ -x "$destination/bin/ollama" ] && "$destination/bin/ollama" --version 2>&1 | grep -q "$version"; then
  echo "Ollama $version déjà installé."
  exit 0
fi
if [ ! -f "$archive" ]; then
  curl -fL --retry 2 "https://github.com/ollama/ollama/releases/download/v$version/ollama-linux-amd64.tar.zst" -o "$archive"
fi
printf '%s\n' "7bedab90dd122661be78798e9f0edf37fccf0cccf2699d2c58ea1a3afdc04b6d  $archive" | sha256sum -c -
mkdir -p "$destination"
tar --zstd -xf "$archive" -C "$destination"
"$destination/bin/ollama" --version
