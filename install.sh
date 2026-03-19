#!/usr/bin/env bash
set -e

REPO="https://github.com/onchaindude/trac-sentinel.git"
INSTALL_DIR="$HOME/.config/trac-sentinel"
REPO_DIR="$INSTALL_DIR/repo"

bold()   { printf "\033[1m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
cyan()   { printf "\033[36m%s\033[0m\n" "$*"; }
red()    { printf "\033[31m%s\033[0m\n" "$*"; }

echo ""
bold "  TracSentinel — P2P Crypto Rug Pull Detector"
cyan "  Built on Trac Network · tracsystems.io"
echo ""

# ── Check dependencies ────────────────────────────────────────────────────────
for dep in git node npm; do
  if ! command -v "$dep" &>/dev/null; then
    red "  ✗ $dep is required but not installed."
    case "$dep" in
      git)  red "    Install from https://git-scm.com" ;;
      node|npm) red "    Install from https://nodejs.org" ;;
    esac
    exit 1
  fi
done

# ── Clone or update ───────────────────────────────────────────────────────────
mkdir -p "$INSTALL_DIR"

if [ -d "$REPO_DIR/.git" ]; then
  cyan "  ↻ Updating to latest version…"
  git -C "$REPO_DIR" pull --ff-only
else
  cyan "  ↓ Downloading TracSentinel…"
  git clone --depth=1 "$REPO" "$REPO_DIR"
fi

# ── Install deps + build ──────────────────────────────────────────────────────
cyan "  ⚙ Installing dependencies…"
npm install --prefix "$REPO_DIR" --quiet

cyan "  ⚙ Building…"
npm run build --prefix "$REPO_DIR" --silent

# ── Copy .env if needed ───────────────────────────────────────────────────────
ENV_FILE="$REPO_DIR/apps/backend/.env"
if [ ! -f "$ENV_FILE" ]; then
  cp "$REPO_DIR/apps/backend/.env.example" "$ENV_FILE"
fi

# ── Ollama prompt ─────────────────────────────────────────────────────────────
echo ""
if command -v ollama &>/dev/null; then
  green "  ✓ Ollama already installed"
else
  bold "  ┌─────────────────────────────────────────────────────────────────┐"
  bold "  │  Local AI (Ollama) — optional                                   │"
  bold "  │  Generates human-readable summaries. Runs on your machine.      │"
  bold "  │  Requirements: ~5 GB disk · 8 GB RAM · one-time download        │"
  bold "  │  Without it: scanner works fully, AI summaries are skipped.     │"
  bold "  └─────────────────────────────────────────────────────────────────┘"
  echo ""
  printf "  Install Ollama for AI summaries? [y/N] "
  read -r answer
  if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
    if [ "$(uname)" = "Darwin" ] || [ "$(uname)" = "Linux" ]; then
      cyan "  ⚙ Installing Ollama…"
      curl -fsSL https://ollama.ai/install.sh | sh
    else
      yellow "  → Download Ollama from https://ollama.ai and re-run."
    fi
  else
    yellow "  → Skipping Ollama. Install later from https://ollama.ai"
  fi
fi

if command -v ollama &>/dev/null; then
  MODEL=$(grep "^OLLAMA_MODEL=" "$ENV_FILE" 2>/dev/null | cut -d= -f2)
  MODEL="${MODEL:-qwen2.5:7b}"
  MODEL_FAMILY="${MODEL%%:*}"
  if ollama list 2>/dev/null | grep -q "$MODEL_FAMILY"; then
    green "  ✓ Ollama model ready: $MODEL"
  else
    cyan "  ⚙ Downloading AI model ($MODEL)…"
    ollama pull "$MODEL"
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
green "  ✓ TracSentinel installed!"
echo ""
bold "  ┌─────────────────────────────────────────────────────────────────┐"
bold "  │  OPTIONAL: Add API keys to enable live scanning                 │"
bold "  │                                                                 │"
bold "  │  Edit: $ENV_FILE"
bold "  │                                                                 │"
bold "  │    ETHERSCAN_API_KEY  → etherscan.io/apis (free)                │"
bold "  │    GOPLUS_APP_KEY     → gopluslabs.io (free)                   │"
bold "  │    HELIUS_API_KEY     → helius.dev (free, Solana only)          │"
bold "  └─────────────────────────────────────────────────────────────────┘"
echo ""

# ── Create launcher script ────────────────────────────────────────────────────
LAUNCHER="$INSTALL_DIR/start.sh"
cat > "$LAUNCHER" <<'LAUNCHER'
#!/usr/bin/env bash
cd "$HOME/.config/trac-sentinel/repo"
NODE_ENV=production node apps/backend/dist/index.js
LAUNCHER
chmod +x "$LAUNCHER"

cyan "  To start TracSentinel, run:"
echo ""
bold "    NODE_ENV=production node $REPO_DIR/apps/backend/dist/index.js"
echo ""
cyan "  Or add this alias to your shell profile (~/.zshrc or ~/.bashrc):"
echo ""
bold "    alias trac-sentinel='NODE_ENV=production node $REPO_DIR/apps/backend/dist/index.js'"
echo ""
