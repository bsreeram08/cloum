#!/bin/bash
set -euo pipefail

# 1. Typecheck the project
bun run typecheck > /dev/null

SCORE=0

# Check for TUI related concepts in ui.ts
if [ -f src/commands/ui.ts ]; then
    SCORE=$((SCORE + 10))
    if grep -q "createCliRenderer" src/commands/ui.ts; then SCORE=$((SCORE + 10)); fi
    if grep -q "Box(" src/commands/ui.ts; then SCORE=$((SCORE + 10)); fi
    if grep -q "Select" src/commands/ui.ts; then SCORE=$((SCORE + 10)); fi
    if grep -q "Text(" src/commands/ui.ts; then SCORE=$((SCORE + 10)); fi
    if grep -q "loadClusters" src/commands/ui.ts; then SCORE=$((SCORE + 10)); fi
fi

# Check if index.ts routes to ui.ts
if grep -q "uiCommand" src/index.ts; then SCORE=$((SCORE + 20)); fi

echo "METRIC tui_score=$SCORE"
