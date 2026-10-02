#!/usr/bin/env bash
# Explicit owner action. Only the dependency recipe is sent to Docker.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
receipt="$(mktemp "${TMPDIR:-/tmp}/cuesheet-toolchain.XXXXXX")"
trap 'rm -f "$receipt"' EXIT
docker build --pull=false --iidfile "$receipt" "$root/scripts/toolchain"
image="$(cat "$receipt")"
[[ "$image" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo "Invalid immutable image receipt" >&2; exit 1; }
printf 'CUESHEET_TOOL_IMAGE=%s cuesheet surface\n' "$image"
