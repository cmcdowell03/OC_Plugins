#!/usr/bin/env bash
# Basic iterative refinement loop over `opencode run`.
# Usage:
#   ./iterative-refine.sh
#   MODEL=ollama/qwen2.5-coder:32b MAX_ITER=10 ./iterative-refine.sh
#   ATTACH=http://localhost:4096 ./iterative-refine.sh

set -euo pipefail

SESSION_ID="${SESSION_ID:-}"
MAX_ITER="${MAX_ITER:-10}"
ITER=0
MODEL="${MODEL:-}"
ATTACH="${ATTACH:-}"
AGENT="${AGENT:-}"
SLEEP_SECS="${SLEEP_SECS:-2}"

PROMPT_FIRST="${PROMPT_FIRST:-Improve the module based on previous feedback. Focus on performance and tests. When fully done, end with TASK_COMPLETE: <summary>.}"
PROMPT_NEXT="${PROMPT_NEXT:-Continue improving based on the last changes and test results. When fully done, end with TASK_COMPLETE: <summary>.}"

extra_args=()
if [[ -n "$MODEL" ]]; then extra_args+=(--model "$MODEL"); fi
if [[ -n "$ATTACH" ]]; then extra_args+=(--attach "$ATTACH"); fi
if [[ -n "$AGENT" ]]; then extra_args+=(--agent "$AGENT"); fi

while (( ITER < MAX_ITER )); do
  echo "=== Iteration $ITER ==="

  if [[ -z "$SESSION_ID" ]]; then
    RESPONSE=$(opencode run --format json "${extra_args[@]}" "$PROMPT_FIRST" 2>/dev/null || true)
  else
    RESPONSE=$(opencode run --format json --continue --session "$SESSION_ID" "${extra_args[@]}" "$PROMPT_NEXT" 2>/dev/null || true)
  fi

  # Best-effort session id extraction (shape may vary by OpenCode version)
  if command -v jq >/dev/null 2>&1; then
    NEW_ID=$(echo "$RESPONSE" | jq -r '.session_id // .sessionID // .session // empty' 2>/dev/null || true)
    if [[ -n "$NEW_ID" && "$NEW_ID" != "null" ]]; then
      SESSION_ID="$NEW_ID"
    fi
  else
    # Fallback grep
    NEW_ID=$(echo "$RESPONSE" | grep -oE '"session(_id|ID)?"[[:space:]]*:[[:space:]]*"[^"]+"' | head -1 | grep -oE '"[^"]+"$' | tr -d '"' || true)
    if [[ -n "$NEW_ID" ]]; then SESSION_ID="$NEW_ID"; fi
  fi

  echo "$RESPONSE" | tail -c 2000
  echo

  if echo "$RESPONSE" | grep -q "TASK_COMPLETE"; then
    echo "Loop finished successfully (TASK_COMPLETE)."
    exit 0
  fi

  ITER=$((ITER + 1))
  sleep "$SLEEP_SECS"
done

echo "Hit MAX_ITER=$MAX_ITER without TASK_COMPLETE."
exit 1
