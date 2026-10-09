#!/usr/bin/env bash
# ─────────────────────────────────────────────
#  Al-Jin · one-click start for Termux (Android), Linux and macOS
#  Run it:   bash aljin.sh          (from the folder where you saved it)
#  - No git, no sudo, no root needed. If Node.js 20+ is missing, a private copy is
#    downloaded into the "runtime" folder (Termux installs it with pkg instead).
#  - First run: asks your number once and shows the pairing code.
#  - Later runs: resumes the saved session. Restarts the bot if it stops. Ctrl+C to quit.
# ─────────────────────────────────────────────
cd "$(dirname "$0")" || exit 1
RAW="https://raw.githubusercontent.com/themalik-g/al-jin-whatsapp-bot/main/index.js"
say() { printf '\n\033[1;35m[Al-Jin]\033[0m %s\n' "$*"; }
have() { command -v "$1" >/dev/null 2>&1; }
node_ok() { have node && node -e 'process.exit(parseInt(process.versions.node)>=20?0:1)' >/dev/null 2>&1; }
fetch() { # fetch URL OUTFILE
  if have curl; then curl -fsSL "$1" -o "$2"; elif have wget; then wget -q "$1" -O "$2"; else return 127; fi
}

# Standalone script in a busy folder (home, Downloads)? Work in its own "Al-Jin" folder.
if [ ! -f index.js ] && [ ! -f start.js ]; then mkdir -p Al-Jin && cd Al-Jin || exit 1; fi

export NODE_NO_WARNINGS=1
export PATH="$PWD/runtime/bin:$PATH"

IS_TERMUX=0
[[ "${PREFIX:-}" == *com.termux* ]] && IS_TERMUX=1

# Private Node.js 22 (Linux / macOS, no sudo). SHA-256 is verified.
get_portable_node() {
  local os arch base line sum file sha
  case "$(uname -s)" in Linux) os=linux ;; Darwin) os=darwin ;; *) say "Unsupported system. Install Node.js 20+ from nodejs.org and run this again."; return 1 ;; esac
  case "$(uname -m)" in x86_64|amd64) arch=x64 ;; aarch64|arm64) arch=arm64 ;; armv7l) arch=armv7l ;; *) say "Unsupported CPU ($(uname -m)). Install Node.js 20+ yourself and run this again."; return 1 ;; esac
  have tar || { say "'tar' is missing. Install it (for example: sudo apt install tar) and run this again."; return 1; }
  say "Setting up Node.js (one time, about 30 MB, no sudo needed)…"
  base="https://nodejs.org/dist/latest-v22.x"
  mkdir -p runtime
  fetch "$base/SHASUMS256.txt" runtime/SHASUMS256.txt || { say "Could not reach nodejs.org — check your internet (or install curl)."; return 1; }
  line="$(grep -E " node-v[0-9.]+-$os-$arch\.tar\.gz$" runtime/SHASUMS256.txt | head -n1)"
  [ -n "$line" ] || { say "No Node.js build found for $os-$arch."; return 1; }
  sum="${line%% *}"; file="${line##* }"
  fetch "$base/$file" runtime/node.tar.gz || { say "Node.js download failed — check your internet."; return 1; }
  if have sha256sum; then sha="$(sha256sum runtime/node.tar.gz | cut -d' ' -f1)"; else sha="$(shasum -a 256 runtime/node.tar.gz | cut -d' ' -f1)"; fi
  [ "$sha" = "$sum" ] || { say "Node.js download is corrupt (hash mismatch). Run this again."; rm -f runtime/node.tar.gz; return 1; }
  tar -xzf runtime/node.tar.gz -C runtime --strip-components=1 || { say "Could not unpack Node.js."; return 1; }
  rm -f runtime/node.tar.gz runtime/SHASUMS256.txt
}

# 1) prerequisites ───────────────────────────
if [ "$IS_TERMUX" -eq 1 ]; then
  if ! node_ok || ! have ffmpeg || ! have curl || ! have tar; then
    say "Installing Node.js, ffmpeg and curl (Termux)…"
    pkg update -y && pkg install -y nodejs-lts ffmpeg curl tar tmux
  fi
elif ! node_ok; then
  get_portable_node || exit 1
fi
node_ok || { say "Node.js 20+ is still missing (found: $(node -v 2>/dev/null || echo none)). On Alpine/very old systems install Node.js 20+ with your package manager, then run this again."; exit 1; }

# 2) launcher ────────────────────────────────
if [ ! -f index.js ]; then
  say "Downloading the launcher (index.js)…"
  fetch "$RAW" index.js || { say "Download failed — check your internet."; exit 1; }
  [ -f package.json ] || echo '{"type":"module"}' > package.json
fi

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
FAILS=0
while :; do
  if linked || [ ! -s "$NUMFILE" ]; then ARGS=(); else ARGS=("--phone=$(cat "$NUMFILE")"); fi
  say "Starting Al-Jin… (Ctrl+C to stop)"
  START=$(date +%s)
  node index.js "${ARGS[@]}"
  code=$?
  [ "$code" -eq 0 ] && { say "Stopped."; break; }
  if [ $(( $(date +%s) - START )) -lt 40 ]; then FAILS=$((FAILS+1)); else FAILS=0; fi
  if [ "$FAILS" -ge 3 ]; then
    say "Stopped: the bot failed 3 times in a row. Read the error above, fix it, then run: bash aljin.sh"
    exit 1
  fi
  say "Bot exited (code $code) — restarting in 5 s…"; sleep 5
done
