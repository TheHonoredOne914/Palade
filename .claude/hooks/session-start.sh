#!/bin/bash
set -euo pipefail

# Only run in Claude Code on the web (remote) environments — local devs
# already manage their own toolchain.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Install JS dependencies so tests/linters/build work.
npm install

# Install graphify (code knowledge graph CLI) if not already present, so
# `/graphify` and `graphify query/explain/path` work without re-reading
# the whole codebase. See graphify-out/ and the "Codebase Knowledge Graph"
# section in CLAUDE.md.
if ! command -v graphify >/dev/null 2>&1; then
  pip install --user --quiet graphifyy
fi

export PATH="$HOME/.local/bin:$PATH"
echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$CLAUDE_ENV_FILE"

# Register the graphify skill + CLAUDE.md pointer for this session's
# Claude Code instance (idempotent).
graphify install --platform claude >/dev/null 2>&1 || true
