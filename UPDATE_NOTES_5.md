# Update 5 — Truly one-click deployment

**Files changed:** `Al-Jin-Start.bat`, `aljin.sh`, `index.js`, `README.md`, `docs/one-click-deploy.md`, `docs/whatsapp-bot-deployment.md`, `docs/whatsapp-bot-troubleshooting.md`, `llms.txt`, `llms-full.txt`.

## Problems fixed
- **Windows hung at "The installer will request to run as administrator".** The old `.bat` installed Node.js with `winget`, which needs a UAC prompt that can stay hidden. It now uses Node.js 20+ if present and otherwise downloads a private, checksum-verified Node.js 22 into `runtime/`. No winget, no admin.
- **git is no longer required.** `index.js` clones with git when available and otherwise downloads the repository as a `.tar.gz` and unpacks it with the system `tar`.
- **`npm install` failed on Windows.** `npm` is `npm.cmd` there and cannot be spawned without a shell. `index.js` now runs it through a shell on Windows.
- **`MODULE_TYPELESS_PACKAGE_JSON` warning.** Silenced (`NODE_NO_WARNINGS`), and a standalone launcher gets its own `Al-Jin/` folder with a `package.json`.
- **Endless restart loop.** Both scripts stop after 3 failures within 40 seconds and keep the error visible.
- **Termux / Linux / macOS (`aljin.sh`).** No git or sudo needed; a private checksum-verified Node.js is used on Linux and macOS, `pkg` on Termux; same own-folder and failure-stop behaviour as Windows.

## Docs
README now starts with a "Deploy in One Click" guide for complete beginners (including how to restart after closing the window or rebooting); manual install is described as the fallback.

## Not covered
Not verified on a real Windows, Termux or macOS machine yet. Alpine Linux (musl) cannot use the downloaded Node.js; install Node.js 20+ with the package manager there.
