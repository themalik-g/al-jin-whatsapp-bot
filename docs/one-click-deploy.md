# One-Click Start — Run Al-Jin on Windows, Termux, Linux or macOS

Two small scripts do the whole setup for you. You do not need to edit any file.

| Where you run it | Script | How to start it |
|---|---|---|
| Windows laptop or PC | `Al-Jin-Start.bat` | double-click |
| Android (Termux), Linux, macOS | `aljin.sh` | `bash aljin.sh` |

Both scripts are in the root of the repository, next to `index.js`.

## What the script does

1. **Checks the tools.** It installs what is missing: Node.js 20 or newer, `git` and `ffmpeg` (and `curl` on Linux/Termux). Windows uses `winget`; Termux uses `pkg`; Debian/Ubuntu uses `apt`; macOS uses Homebrew.
2. **Gets the launcher.** If `index.js` is not next to the script, it downloads it.
3. **Asks your number once.** Digits only, with country code (for example `923001234567`). It is saved in a small file called `.aljin-number`.
4. **Shows the pairing code.** In WhatsApp open **Settings → Linked devices → Link a device → Link with phone number instead** and type the 8-character code within about five minutes.
5. **Keeps the bot running.** If the bot stops (a crash, or an owner `.update`), the script starts it again after 5 seconds. A clean stop ends the script.

The next time you start the script it skips steps 1–4 and resumes the saved WhatsApp session.

## Windows

1. Install nothing by hand. Create an empty folder, for example `C:\Al-Jin`.
2. Download [`Al-Jin-Start.bat`](https://raw.githubusercontent.com/themalik-g/al-jin-whatsapp-bot/main/Al-Jin-Start.bat) into it (right-click → *Save link as*). Check that the name is exactly `Al-Jin-Start.bat` and not `….bat.txt`.
3. Double-click it. If Windows shows "protected your PC", choose **More info → Run anyway**.
4. If Node.js or git had to be installed, the window tells you to close it and double-click the file again once. This is normal: Windows needs a fresh window to see the new programs.
5. Type your number, then enter the pairing code in WhatsApp.

The bot is online only while the computer is on and awake. Turn off sleep in Windows power settings if you want it to keep running.

## Termux (Android)

1. Install **Termux from F-Droid** (<https://f-droid.org/en/packages/com.termux/>), not from the Play Store.
2. Paste this in Termux:

```bash
pkg install -y curl && mkdir -p ~/al-jin && cd ~/al-jin && curl -fsSL -o aljin.sh https://raw.githubusercontent.com/themalik-g/al-jin-whatsapp-bot/main/aljin.sh && bash aljin.sh
```

3. Type your number, then enter the pairing code in WhatsApp.
4. In Android settings, turn **off battery optimisation** for Termux. The script already runs `termux-wake-lock` when it is available.

To start the bot again later: `cd ~/al-jin && bash aljin.sh`.

**Start automatically when the phone boots (optional).** Install **Termux:Boot** from F-Droid (the same source as Termux), open it once, then run:

```bash
mkdir -p ~/.termux/boot
printf '#!/data/data/com.termux/files/usr/bin/sh\ntermux-wake-lock\ncd ~/al-jin && bash aljin.sh\n' > ~/.termux/boot/aljin
chmod +x ~/.termux/boot/aljin
```

## Linux and macOS

```bash
mkdir -p ~/al-jin && cd ~/al-jin
curl -fsSL -o aljin.sh https://raw.githubusercontent.com/themalik-g/al-jin-whatsapp-bot/main/aljin.sh
bash aljin.sh
```

On a server that must run 24/7, use the [VPS guide](./whatsapp-bot-deployment.md#3-vps--linux-server-recommended) with PM2 instead, or run the script inside `tmux`.

## Files the script creates

| File or folder | What it is |
|---|---|
| `.aljin-number` | Your number, so you are asked only once. Delete it to enter a different one. |
| `wraith/` | The bot itself, downloaded by the launcher when `index.js` is alone in the folder. |
| `instances/` or `wraith/instances/` | Your WhatsApp login (the session). **Back it up and never share it.** |

## Good to know

- **Movies and video downloads** need `ffmpeg` and some free disk space. The script installs `ffmpeg`; see [movie downloader requirements](./whatsapp-bot-deployment.md#movie-and-video-downloader-requirements).
- **Updates.** The launcher downloads the bot from the project's public repository, so an owner `.update` pulls from there. If you changed the bot's files yourself, `.update` can stash or overwrite your changes.
- **Not a service.** Closing the window or the Termux session stops the bot. For an always-on bot use a VPS, a panel or Docker (see the [Deployment Guide](./whatsapp-bot-deployment.md)).
- **Another number.** Send `.addsession <number>` from WhatsApp, or run the script with a new folder.

## Troubleshooting

| Problem | Fix |
|---|---|
| Windows says Node/git were installed but the script stops | Close the window and double-click the file again. |
| `winget not found` | Install Node.js LTS from <https://nodejs.org> and Git from <https://git-scm.com>, then run the script again. |
| `Node.js 20+ is still missing` | Run `node -v`. If it is lower than 20, update Node (`pkg install nodejs-lts` on Termux). |
| `Download failed` | No internet, or GitHub is blocked. Download `index.js` by hand and put it next to the script. |
| `git clone failed` / `npm install failed` | See [Deployment troubleshooting](./whatsapp-bot-deployment.md#12-deployment-troubleshooting). |
| Asked for a code on every start | The `instances` folder is not kept (run the script from the same folder each time, and do not delete the folder). |
| Wrong number saved | Delete `.aljin-number` and the `instances` / `wraith/instances` folder, then start again. |
