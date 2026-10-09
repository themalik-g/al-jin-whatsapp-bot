# One-Click Start — Run Al-Jin on Windows, Android (Termux), Linux or macOS

**You do not need to know anything about programming.** You download one small file, open it, type your WhatsApp number, and enter a code in WhatsApp. The file does everything else: it sets up what the bot needs, downloads the bot, starts it, and starts it again if it stops.

| Where you run it | The file | How to start it |
|---|---|---|
| Windows laptop or PC | [`Al-Jin-Start.bat`](https://raw.githubusercontent.com/themalik-g/al-jin-whatsapp-bot/main/Al-Jin-Start.bat) | double-click |
| Android phone (Termux) | [`aljin.sh`](https://raw.githubusercontent.com/themalik-g/al-jin-whatsapp-bot/main/aljin.sh) | paste one line (below) |
| Linux, macOS | [`aljin.sh`](https://raw.githubusercontent.com/themalik-g/al-jin-whatsapp-bot/main/aljin.sh) | `bash aljin.sh` |

You need: an internet connection, WhatsApp on your phone, and about 1 GB of free space. **You do not need to install Node.js, npm or git first**, and you do not need administrator rights.

---

## Windows (step by step)

1. **Make a folder** for the bot, for example `Al-Jin-Bot` on your Desktop. (Recommended: the bot's files and your WhatsApp login will live next to the file you download.)
2. **Download `Al-Jin-Start.bat`** into that folder: open [this link](https://raw.githubusercontent.com/themalik-g/al-jin-whatsapp-bot/main/Al-Jin-Start.bat), right-click the page → **Save as…** (or right-click the link above → *Save link as*). Check the name is exactly `Al-Jin-Start.bat` and not `Al-Jin-Start.bat.txt`.
3. **If your browser says the file "can't be downloaded safely"**, that is only because it is a script file. Open the browser's download list and click **Keep** (in Edge: `…` → **Keep** → **Keep anyway**).
4. **Double-click the file.**
   - If a blue box says **"Windows protected your PC"**, click **More info → Run anyway**.
   - No administrator prompt will appear. If you see one, you can say No.
5. **Wait.** The first time it downloads what it needs. This can take several minutes. A black window with text is normal. **Do not close it.**
6. **Type your WhatsApp number** when asked: digits only, with the country code, no `+` and no spaces (for example `923001234567`), then press Enter.
7. **Enter the pairing code.** An 8-character code appears in the window. On your phone open WhatsApp → **Settings → Linked devices → Link a device → Link with phone number instead**, and type the code. You have about five minutes.
8. **Done.** Send `.menu` from WhatsApp to see the commands.

> The bot runs **only while the black window is open and the computer is on and awake**. Closing the window stops the bot.

### If you close the window, restart the PC, or the power goes off

Just **double-click `Al-Jin-Start.bat` again** (the same file, in the same folder). It remembers your number and your WhatsApp login, so there is **no code to enter again** and nothing to download again.

**Start automatically when you sign in to Windows (optional):**

1. Right-click `Al-Jin-Start.bat` → **Show more options** → **Create shortcut**.
2. Press **Windows key + R**, type `shell:startup`, press Enter.
3. Move the shortcut into the folder that opens.

Also set Windows **Settings → System → Power → Screen and sleep** to **Never** for "when plugged in", otherwise the PC may sleep and the bot goes offline.

---

## Android phone (Termux)

1. Install **Termux from F-Droid** (<https://f-droid.org/en/packages/com.termux/>). Do not use the Play Store version.
2. Open Termux, paste this **one line**, press Enter:

```bash
pkg install -y curl && curl -fsSL -o aljin.sh https://raw.githubusercontent.com/themalik-g/al-jin-whatsapp-bot/main/aljin.sh && bash aljin.sh
```

3. Wait while it sets up (several minutes on a phone), type your number, then enter the pairing code in WhatsApp (same steps as Windows, step 7).
4. In Android settings turn **off battery optimisation** for Termux (**Settings → Apps → Termux → Battery → Unrestricted**; the wording differs by phone). The script already asks Android to keep Termux awake.

### If Termux was closed or the phone restarted

Open Termux and run:

```bash
bash aljin.sh
```

(Termux opens in the folder where you saved it. If not, run `cd ~` first.) No code is needed again.

**Start automatically when the phone boots (optional).** Install **Termux:Boot** from F-Droid (the same source as Termux), open it once, then run:

```bash
mkdir -p ~/.termux/boot
printf '#!/data/data/com.termux/files/usr/bin/sh\ntermux-wake-lock\ncd ~ && bash aljin.sh\n' > ~/.termux/boot/aljin
chmod +x ~/.termux/boot/aljin
```

---

## Linux and macOS

```bash
curl -fsSL -o aljin.sh https://raw.githubusercontent.com/themalik-g/al-jin-whatsapp-bot/main/aljin.sh
bash aljin.sh
```

If Node.js 20 or newer is missing, a private copy is downloaded into a `runtime` folder. No `sudo`, nothing is installed system-wide.

**To start it again later:** open a terminal, go to the folder with `aljin.sh`, run `bash aljin.sh`.

**24/7 on a server:** use the [VPS guide](./whatsapp-bot-deployment.md#3-vps--linux-server-recommended) with PM2, or run the script inside `tmux`.

---

## What the script does

1. **Node.js:** uses yours if it is version 20 or newer; otherwise downloads a private copy (Windows, Linux, macOS) or installs it with `pkg` (Termux). The download is checked against the official checksum.
2. **Launcher:** downloads `index.js` if it is not next to the script. If the script is alone in a busy folder, it works in its own `Al-Jin` subfolder.
3. **Number:** asks once and saves it in `.aljin-number`.
4. **Bot:** the launcher downloads the bot (with `git` if you have it, otherwise as a plain archive), installs its packages, and shows the pairing code.
5. **Keeps it running:** if the bot stops (a crash or an owner `.update`), it starts again after 5 seconds. If it fails 3 times in a row within seconds, it stops and leaves the error on screen instead of looping forever.

## Where everything is

| File or folder | What it is |
|---|---|
| `Al-Jin/` | Created next to the script when it was saved alone. Everything below lives inside it. |
| `runtime/` | The private Node.js copy (only if your computer had none). Safe to delete; it comes back by itself. |
| `wraith/` | The bot itself. |
| `instances/` or `wraith/instances/` | **Your WhatsApp login.** Back it up and never share it. Deleting it logs the bot out. |
| `.aljin-number` | Your number, so you are asked only once. |

If you move the script to another folder, move the `Al-Jin` folder with it, or the bot starts from scratch and asks for a new code.

## Good to know

- **Not a service.** Closing the window (or Termux) stops the bot. For an always-on bot use a VPS, a panel or Docker: [Deployment Guide](./whatsapp-bot-deployment.md).
- **Movies and video downloads** need free disk space and `ffmpeg`. Windows, Linux and macOS use the copy the bot downloads itself; Termux installs it with `pkg`. See [movie downloader requirements](./whatsapp-bot-deployment.md#movie-and-video-downloader-requirements).
- **Updates.** An owner `.update` pulls the newest bot. If you edited the bot's files yourself, `.update` can overwrite your changes.
- **Another number.** Send `.addsession <number>` from WhatsApp.
- **Manual setup** (`git clone`, `npm install`, PM2, Docker) is still available. Use it only if one-click fails: [Deployment Guide](./whatsapp-bot-deployment.md).

## Troubleshooting

| Problem | Fix |
|---|---|
| Windows shows "protected your PC" | **More info → Run anyway.** |
| Browser blocks the download | Open the downloads list → **Keep** → **Keep anyway**. |
| The window closes at once | You are probably running it from inside a zip. Extract it (or move the file to a normal folder) and try again. |
| `Node.js download failed` / `Download failed` | No internet, or a network (school, office, proxy) blocks the download. Try another network or a phone hotspot. |
| `Windows "tar" not found` | Your Windows is older than Windows 10 (version 1803). Install Node.js LTS from <https://nodejs.org>, then run the file again. |
| Stops after "failed 3 times in a row" | Read the last error lines above the message. Most often: no internet, or no free disk space. Fix that and run the file again. |
| `npm install failed` | Not enough free space, or the connection dropped. Free some space and run the file again; it continues where it stopped. |
| Termux: `pkg install` fails or is very slow | Run `termux-change-repo`, pick a different mirror, then paste the one-line command again. |
| Termux: `Unsupported CPU` or Node errors on Linux | Alpine and very old systems cannot use the downloaded Node. Install Node.js 20+ with your package manager and run `bash aljin.sh` again. |
| Asked for a code on every start | The `instances` folder is not being kept. Start it from the same folder every time and do not delete the folder. |
| Wrong number saved | Delete `.aljin-number` and the `instances` (or `wraith/instances`) folder, then start again. |
| Anything else | [Troubleshooting](./whatsapp-bot-troubleshooting.md) and [Deployment troubleshooting](./whatsapp-bot-deployment.md#12-deployment-troubleshooting). |
