#!/usr/bin/env bash
# Fast single call against a warm OpenCode server.
# Terminal 1:  opencode serve --port 4096
# Terminal 2:  ./warm-server-call.sh "Your prompt"

set -euo pipefail

ATTACH="${ATTACH:-http://localhost:4096}"
AGENT="${AGENT:-code-improver}"
PROMPT="${1:-Refactor the selected function for better error handling}"
OUT="${OUT:-iteration_$(date +%s).json}"

opencode run --attach "$ATTACH" \
  --format json \
  --agent "$AGENT" \
  "$PROMPT" \
  > "$OUT"

echo "Wrote $OUT"
