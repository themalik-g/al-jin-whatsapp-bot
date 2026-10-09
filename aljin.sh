#!/usr/bin/env bash
# ─────────────────────────────────────────────
#  Al-Jin · one-click start for Termux, Linux and macOS
#  Put this file next to index.js (or alone in an empty folder), then run:   bash aljin.sh
#  First run: installs what is missing, asks your number once, shows the pairing code.
#  Later runs: just resumes. Restarts the bot if it stops (.update, crashes). Ctrl+C to quit.
# ─────────────────────────────────────────────
cd "$(dirname "$0")" || exit 1
RAW="https://raw.githubusercontent.com/themalik-g/al-jin-whatsapp-bot/main/index.js"
say() { printf '\n\033[1;35m[Al-Jin]\033[0m %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
node_ok() { have node && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] 2>/dev/null; }

# 1) prerequisites ───────────────────────────
if ! node_ok || ! have git || ! have curl; then
  say "Installing Node.js 20+, git, ffmpeg and curl…"
  if [ -n "$PREFIX" ] && [ -d "$PREFIX/bin" ] && [[ "$PREFIX" == *com.termux* ]]; then
    pkg update -y && pkg install -y nodejs-lts git ffmpeg curl tmux
  elif have apt-get; then
    SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"
    $SUDO apt-get update -y && $SUDO apt-get install -y git ffmpeg curl ca-certificates
    if ! node_ok; then curl -fsSL https://deb.nodesource.com/setup_22.x | $SUDO -E bash - && $SUDO apt-get install -y nodejs; fi
  elif have brew; then
    brew install node git ffmpeg
  else
    say "Please install Node.js 20+, git and curl yourself, then run this again."; exit 1
  fi
fi
node_ok || { say "Node.js 20+ is still missing (found: $(node -v 2>/dev/null || echo none))."; exit 1; }

# 2) launcher ────────────────────────────────
if [ ! -f index.js ]; then say "Downloading the launcher (index.js)…"; curl -fsSL "$RAW" -o index.js || { say "Download failed — check your internet."; exit 1; }; fi

# 3) number (asked once) ─────────────────────
# A linked session lives in instances/ (bot next to index.js) or wraith/instances/ (bot downloaded by the launcher).
linked() { [ -n "$(ls -A instances 2>/dev/null)" ] || [ -n "$(ls -A wraith/instances 2>/dev/null)" ]; }
NUMFILE=".aljin-number"
if [ ! -s "$NUMFILE" ] && ! linked; then
  while :; do
    read -r -p "Your WhatsApp number, digits only with country code (e.g. 923001234567): " N
    N="${N//[^0-9]/}"
    [ "${#N}" -ge 8 ] && [ "${#N}" -le 15 ] && { echo "$N" > "$NUMFILE"; break; }
    echo "That does not look right — try again."
  done
fi

# 4) keep the phone awake (Termux) ───────────
have termux-wake-lock && termux-wake-lock

# 5) run + auto-restart ──────────────────────
while :; do
  if linked || [ ! -s "$NUMFILE" ]; then ARGS=(); else ARGS=("--phone=$(cat "$NUMFILE")"); fi
  say "Starting Al-Jin… (Ctrl+C to stop)"
  node index.js "${ARGS[@]}"
  code=$?
  [ "$code" -eq 0 ] && { say "Stopped."; break; }
  say "Bot exited (code $code) — restarting in 5 s…"; sleep 5
done
