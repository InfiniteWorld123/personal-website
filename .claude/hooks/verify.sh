#!/usr/bin/env bash
# Stop hook: refuse to end a turn on code that does not compile or pass tests.
# Exit 2 sends stderr back to Claude, which then has to fix it.

input=$(cat)

# Already looping on a red gate: let the turn end so the user can step in.
case "$input" in *'"stop_hook_active":true'*) exit 0 ;; esac

cd "$CLAUDE_PROJECT_DIR" || exit 0
export PATH="$HOME/.bun/bin:$PATH"

# Nothing touched in src/ means nothing to verify.
if git diff --quiet --stat HEAD -- src/ 2>/dev/null && [ -z "$(git ls-files --others --exclude-standard src/)" ]; then
  exit 0
fi

failures=""

if ! tc=$(bun run typecheck 2>&1); then
  failures+="TYPECHECK FAILED\n$(echo "$tc" | tail -40)\n\n"
fi

if ! ts=$(bun run test 2>&1); then
  failures+="TESTS FAILED\n$(echo "$ts" | tail -60)\n"
fi

if [ -n "$failures" ]; then
  printf "Do not finish yet. The gate is red:\n\n%b" "$failures" >&2
  exit 2
fi

exit 0
