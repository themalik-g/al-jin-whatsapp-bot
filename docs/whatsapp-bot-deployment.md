# Deployment Guide — Host the Al-Jin WhatsApp Bot on a VPS, Termux, Docker, Heroku, Koyeb and More

This guide shows how to run **Al-Jin** 24/7 on every common hosting option. Pick one section; you do not need the others.

- [1. Which host should I choose?](#1-which-host-should-i-choose)
- [2. Before you start (all hosts)](#2-before-you-start-all-hosts)
- [3. VPS / Linux server (recommended)](#3-vps--linux-server-recommended)
- [4. Termux on Android](#4-termux-on-android)
- [5. Pterodactyl & bot-hosting panels](#5-pterodactyl--bot-hosting-panels)
- [6. Docker & Docker Compose](#6-docker--docker-compose)
- [7. Heroku](#7-heroku)
- [8. Koyeb](#8-koyeb)
- [9. Render, Railway and Fly.io](#9-render-railway-and-flyio)
- [10. After the bot is online](#10-after-the-bot-is-online)
- [11. Backup, restore and moving to another host](#11-backup-restore-and-moving-to-another-host)
- [12. Deployment troubleshooting](#12-deployment-troubleshooting)

---

## 1. Which host should I choose?

Al-Jin keeps its WhatsApp login (the *session*) in files on disk, in the `instances/` folder. **A host that wipes its disk on restart will log the bot out every time it restarts.** That is the most important thing to check.

| Host | Always on | Keeps the session | Cost (check current pricing) | Verdict |
|---|---|---|---|---|
| **VPS** (Ubuntu/Debian) | ✅ | ✅ | Paid, from a few dollars a month | ⭐ Best choice |
| **Termux** (your Android phone) | ⚠️ While the phone stays on | ✅ | Free | Good for testing or a spare phone |
| **Pterodactyl / bot panels** | ✅ | ✅ | Free and paid plans exist | Easy, no server skills needed |
| **Docker** (on a VPS or home server) | ✅ | ✅ with a volume | Your server cost | Good for tidy installs |
| **Koyeb** | ✅ on paid worker | ✅ only with a paid volume | Free plan does not fit (see §8) | Possible, paid only |
| **Railway / Fly.io / Render** | ✅ on paid plans | ✅ only with a volume or disk | Paid | Possible with a volume |
| **Heroku** | ✅ on a worker dyno | ❌ disk is wiped at least daily | Paid (no free tier) | Not recommended |

---

## 2. Before you start (all hosts)

**What you need**

- A WhatsApp account to link to the bot (a spare number is best).
- **Node.js 22 LTS** (Node 20 or newer works; 22 is recommended).
- `git` (the launcher downloads the bot with it).
- Optional but recommended: `ffmpeg` installed on the system, for stickers, subtitles and video tools.

**Your number**

Write it with the country code, digits only: no `+`, no spaces, no dashes. Example for Pakistan: `923001234567`.

**How `index.js` works**

`index.js` is a small launcher. If it sits next to the bot's files it starts the bot. If it is alone in an empty folder, it downloads the bot into a `wraith/` folder, installs the dependencies, asks WhatsApp for a pairing code and starts the bot. After the bot is linked, it resumes the saved session by itself on every restart.

At the top of `index.js` you will find this line:

```js
const BOT_NUMBER = '';
```

Put your number between the quotes, for example `const BOT_NUMBER = '923001234567';`. With the number set, the bot sends the pairing code automatically, even on hosts that have no keyboard (panels, PM2, Docker).

You can also pass the number when starting: `node index.js --phone=923001234567`.

> `index.js` reads the number only from `BOT_NUMBER` or `--phone=`. It does not read environment variables such as `WRAITH_PHONE`.

**Link WhatsApp with the pairing code**

1. Start the bot. Within a minute the console prints an 8-character code.
2. On your phone open WhatsApp → **Settings → Linked devices → Link a device**.
3. Tap **Link with phone number instead**.
4. Type the code. The bot is now linked and sends you a message.

You have about five minutes to enter the code. If it expires, restart the bot to get a new one.

---

## 3. VPS / Linux server (recommended)

Works on Ubuntu 22.04/24.04 and Debian 11/12 from any provider (Hetzner, DigitalOcean, Contabo, Oracle Cloud, AWS Lightsail, …). 1 vCPU and 1 GB of RAM is enough; 2 GB is more comfortable. The bot opens no web port, so you do not need to open any firewall port.

### Step 1 — Connect and install the tools

```bash
ssh root@YOUR_SERVER_IP
apt update && apt upgrade -y
apt install -y curl git ffmpeg
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v        # must print v20 or higher (v22 recommended)
npm install -g pm2
```

If you are not logged in as `root`, put `sudo` in front of the `apt`, `curl … | bash` and `npm install -g` commands.

### Step 2 — Get `index.js` onto the server

Choose **one** way.

**Way A — upload the file you downloaded**

1. Download `index.js` from the repository: open <https://github.com/themalik-g/al-jin-whatsapp-bot/blob/main/index.js> and use the **Download raw file** button.
2. Upload it with any SFTP tool (FileZilla, WinSCP) or with `scp`:

```bash
ssh root@YOUR_SERVER_IP "mkdir -p ~/al-jin"
scp index.js root@YOUR_SERVER_IP:~/al-jin/index.js
```

**Way B — download it directly on the server**

```bash
mkdir -p ~/al-jin && cd ~/al-jin
curl -L -o index.js https://raw.githubusercontent.com/themalik-g/al-jin-whatsapp-bot/main/index.js
```

### Step 3 — Make sure the file is named exactly `index.js`

Browsers add a number when a file with that name already exists, so your download may be called `index (1).js`, `index(2).js`, or on Windows even `index.js.txt`. The server only understands `index.js`. Check and fix it:

```bash
cd ~/al-jin
ls
```

If you see `index (1).js` or similar, rename it:

```bash
mv "index (1).js" index.js
```

Do the same for any other extra number or extension. Only one file called `index.js` should be in the folder.

### Step 4 — Put your number in the file

```bash
nano index.js
```

Find the line `const BOT_NUMBER = '';`, type your number between the quotes (for example `'923001234567'`), then save: press **Ctrl+O**, **Enter**, then **Ctrl+X**.

### Step 5 — First start (pairing)

```bash
cd ~/al-jin
node index.js
```

Wait while it downloads the bot and installs the dependencies (a few minutes the first time). When the pairing code appears, enter it in WhatsApp as described in [section 2](#2-before-you-start-all-hosts). When you receive the bot's message, press **Ctrl+C** to stop it.

> If your Node version is older than 20.19 and you see `Cannot use import statement outside a module`, install Node 22 as shown in Step 1. If you cannot upgrade, run `echo '{"type":"module"}' > package.json` in the `al-jin` folder and try again.

### Step 6 — Keep it running 24/7 with PM2

```bash
cd ~/al-jin
pm2 start index.js --name al-jin
pm2 save
pm2 startup
```

`pm2 startup` prints one command that starts with `sudo`; copy it, run it, then run `pm2 save` again. The bot now restarts by itself after crashes and server reboots, and it stays linked, so no number or code is needed again.

### Everyday commands

```bash
pm2 logs al-jin          # live logs
pm2 restart al-jin       # restart
pm2 stop al-jin          # stop
pm2 monit                # CPU and RAM
```

To update the bot, send `.update` from the owner number in WhatsApp (or `cd ~/al-jin/wraith && git pull`, then `pm2 restart al-jin`).

To add another WhatsApp number, send `.addsession <number>` in WhatsApp, or run `node index.js --add` in the terminal.

### Cloning the whole repository instead (alternative)

```bash
git clone https://github.com/themalik-g/al-jin-whatsapp-bot.git
cd al-jin-whatsapp-bot
nano index.js            # set BOT_NUMBER
node index.js            # first start and pairing
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

---

## 4. Termux on Android

Termux runs the bot on an Android phone with no server. It is free, but the bot is only online while the phone is on, charged and connected to the internet.

### Step 1 — Install Termux from F-Droid (official source)

Use the official F-Droid build: **<https://f-droid.org/en/packages/com.termux/>**

1. Open the link on your phone.
2. Scroll to the newest version and tap **Download APK**. You do not need to install the F-Droid app.
3. Open the downloaded APK and allow **Install unknown apps** for your browser if Android asks.
4. Open **Termux**.

> **Do not use the Google Play Store version.** It is deprecated and no longer receives working updates. Also do not mix sources: install Termux and its add-ons (Termux:Boot, Termux:API) all from F-Droid, or all from the same place, otherwise Android reports a signature conflict.

### Step 2 — Update and install the tools

Paste these in Termux, one block at a time (answer `y` if asked):

```bash
pkg update -y && pkg upgrade -y
pkg install -y nodejs-lts git ffmpeg nano curl tmux
node -v        # must print v20 or higher
```

If `node -v` prints a version lower than 20, run `pkg install -y nodejs` instead.

### Step 3 — Get `index.js`

```bash
mkdir -p ~/al-jin && cd ~/al-jin
curl -L -o index.js https://raw.githubusercontent.com/themalik-g/al-jin-whatsapp-bot/main/index.js
ls
```

If you downloaded `index.js` with a browser and moved it to Termux instead, make sure it is named exactly `index.js`: a name like `index (1).js` must be renamed with `mv "index (1).js" index.js`.

### Step 4 — Put your number in the file

```bash
nano index.js
```

Change `const BOT_NUMBER = '';` to your number, digits only, with country code: `const BOT_NUMBER = '923001234567';`. Save with **Ctrl+O**, **Enter**, then **Ctrl+X**. (In Termux, the **Ctrl** key is in the extra keys row above the keyboard.)

### Step 5 — First start (pairing)

Run inside `tmux`, so the bot keeps running when you leave Termux:

```bash
tmux new -s aljin
node index.js
```

The first start downloads the bot and installs the dependencies (this can take several minutes on a phone). When the 8-character pairing code appears, enter it in WhatsApp → **Settings → Linked devices → Link a device → Link with phone number instead**.

To leave the bot running: press **Ctrl+B**, release, then press **D**. To come back later: `tmux attach -t aljin`.

### Step 6 — Stop Android from killing Termux

- In the Termux notification, tap **Acquire wakelock** (or run `termux-wake-lock`).
- Android **Settings → Apps → Termux → Battery → Unrestricted** (the wording differs between phones). On some brands also lock Termux in the recent-apps list and allow auto-start.
- Keep the phone charging and on stable Wi-Fi.

### Start it again after a reboot

```bash
cd ~/al-jin
tmux new -s aljin
node index.js
```

The bot is still linked, so it starts without asking for a code.

### Termux notes

- The bot uses the `ffmpeg` you installed with `pkg`. Stickers, subtitles and audio tools need it.
- Commands that download YouTube or other video sites use a `yt-dlp` program. On some phones the program that npm downloads cannot run under Termux. If those commands fail, run `pkg install yt-dlp` and ask in the issues section; every other feature is unaffected. This guide has not been tested on every phone and architecture.
- If `npm install` stops with an error about `ffmpeg-static`, go into the downloaded folder and run `npm install --ignore-scripts`, then `node scripts/apply-baileys-patch.js`, then start the bot again with `node ~/al-jin/index.js`.

---

## 5. Pterodactyl & bot-hosting panels

Works on Pterodactyl and similar Node.js panels (bot-hosting, Bisecthosting, Sparked Host and others).

1. Create a server with a **Node.js 20 or newer** egg (choose 22 if offered). Give it at least 512 MB of RAM, preferably 1 GB, and a few GB of disk.
2. Open the **File Manager** of the server.
3. Upload `index.js` (download it from <https://github.com/themalik-g/al-jin-whatsapp-bot/blob/main/index.js> with **Download raw file**).
4. **Check the name.** If the file shows up as `index (1).js` or has a number added, rename it to exactly `index.js` and delete older copies.
5. Open `index.js`, set `const BOT_NUMBER = '923001234567';` (your number, digits only), and save.
6. In **Startup**, make the main file `index.js` (the startup command is `node index.js`). Leave any "auto update" and "additional packages" fields empty.
7. Press **Start** and watch the **Console**. The first start downloads the bot and installs the dependencies; then the pairing code appears. Enter it in WhatsApp → **Linked devices → Link a device → Link with phone number instead**.
8. After the bot sends you its first message, restart the server once to confirm it comes back linked.

Panels do not give the bot a keyboard, which is why the number has to be written in `index.js`.

If the panel limits threads or processes and the bot crashes with `thread_create`, add these variables in the panel's **Startup** tab:

```env
UV_THREADPOOL_SIZE=2
WRAITH_V8_POOL_SIZE=2
```

Every `WRAITH_*` variable can also be written `AL_JIN_*`.

---

## 6. Docker & Docker Compose

Use this on a VPS or a home server that already has Docker. The session is stored in the `instances` folder, so **always mount that folder as a volume**.

### Build and run

```bash
git clone https://github.com/themalik-g/al-jin-whatsapp-bot.git
cd al-jin-whatsapp-bot
docker build -t al-jin .

# first run: give your number so the pairing code is printed in the logs
docker run -d --name al-jin \
  -v "$(pwd)/instances:/app/instances" \
  --restart unless-stopped \
  al-jin node index.js --phone=923001234567

docker logs -f al-jin        # shows the pairing code
```

After the bot is linked you can recreate the container without the number, because the session is in the volume:

```bash
docker rm -f al-jin
docker run -d --name al-jin -v "$(pwd)/instances:/app/instances" --restart unless-stopped al-jin
```

### Docker Compose

```yaml
services:
  al-jin:
    build: .
    container_name: al-jin
    restart: unless-stopped
    command: node index.js --phone=923001234567   # remove after the first link
    volumes:
      - ./instances:/app/instances
```

```bash
docker compose up -d --build
docker compose logs -f
```

---

## 7. Heroku

**Heroku is not recommended for Al-Jin.** Heroku has no free tier, and every dyno has an ephemeral filesystem: all files are deleted whenever the dyno restarts, and Heroku restarts every dyno at least once a day. The WhatsApp session is lost with it, so the bot logs out and needs a new pairing code every day. Use a VPS, a panel or Termux for a bot that must run unattended.

If you still want to try it (for a short test), use a **worker** dyno, not a web dyno, because the bot does not open a web port:

1. Fork the repository to your own **private** GitHub account (the number is stored in the code, so keep the fork private).
2. In your fork, edit `index.js` and set `const BOT_NUMBER = '923001234567';`.
3. Make sure a file named `Procfile` exists in the repository root (it is included) with this content:

   ```
   worker: node index.js
   ```
4. Create an app on Heroku and connect your fork under **Deploy → GitHub**, then deploy the `main` branch.
5. Turn the worker on and the web dyno off:

   ```bash
   heroku ps:scale web=0 worker=1 -a YOUR_APP_NAME
   heroku logs --tail -a YOUR_APP_NAME
   ```
6. Read the pairing code from the logs and enter it in WhatsApp.

An **Eco** dyno costs about 5 USD a month (shared hours) and a **Basic** dyno about 7 USD a month; check <https://www.heroku.com/pricing> for the current price. Expect to pair again after every restart.

---

## 8. Koyeb

Koyeb's free instance does **not** fit Al-Jin: it is a web service that is put to sleep after an hour without traffic, and it cannot be a worker or use a volume. A WhatsApp bot must run all the time and keep its session files, so Koyeb needs a **paid worker service with a volume**. Check <https://www.koyeb.com/pricing> and <https://www.koyeb.com/docs/reference/volumes> for the current rules; at the time of writing, volumes are a public-preview feature that works with paid instances and a single instance only.

1. Fork the repository to a **private** GitHub account.
2. In Koyeb, **Create Service → GitHub** and select your fork.
3. Builder: **Dockerfile** (the repository has one).
4. Service type: **Worker** (no public port).
5. Instance: a paid instance with at least 512 MB of RAM (1 GB is better).
6. **Run command override:** `node index.js --phone=923001234567` (your number, digits only).
7. **Volumes:** create a volume (1 GB is plenty) and mount it at `/app/instances`.
8. Scale: exactly 1 instance.
9. Deploy and open the service **Logs** for the pairing code. Enter it in WhatsApp.
10. After the bot is linked, redeploys keep the session because it is saved on the volume.

---

## 9. Render, Railway and Fly.io

All three can run the bot as a Docker service **only if the session folder is on a persistent volume**. Without a volume the bot logs out at every deploy or restart. Pricing and features change often, so confirm them on each platform before you pay.

The settings are the same everywhere:

| Setting | Value |
|---|---|
| Source | Your private GitHub fork, built with the repository's `Dockerfile` |
| Service type | Background worker / no public port |
| Start command | `node index.js --phone=923001234567` (digits only) |
| Persistent volume | Mount at `/app/instances` |
| Instances | Exactly 1 |

**Render:** create a **Background Worker** (paid) from your fork, choose **Docker**, then add a **Disk** with mount path `/app/instances`.

**Railway:** create a service from your GitHub repo, set the **Start Command**, then add a **Volume** and mount it at `/app/instances`.

**Fly.io:**

```bash
fly launch --no-deploy          # accept the Dockerfile, do not add a public web service
fly volumes create aljin_data --size 1
```

In `fly.toml` remove any `[http_service]` block, add the volume and the start command:

```toml
[mounts]
  source = "aljin_data"
  destination = "/app/instances"

[processes]
  app = "node index.js --phone=923001234567"
```

Then run `fly deploy` and watch `fly logs` for the pairing code. Keep one machine only.

---

## 10. After the bot is online

1. From the linked number send `.menu` or `.help` to see all commands.
2. Choose who can use the bot: `.mode` (private = owner only, public = everyone for non-owner commands).
3. Choose how selections look: `.replymode text`, `.replymode poll` or `.replymode buttons`.
4. Set download limits: `.dlcap` shows them; for example `.dlcap 800` and `.dlcap quality 720`.
5. Optional free keys for faster AI and speech: see the [Configuration Guide](./whatsapp-bot-configuration.md).
6. Optional resource limits: `.ramlimit 512` and `.cpulimit auto`.

---

## 11. Backup, restore and moving to another host

Everything the bot needs (login, settings, owner, history) is inside the `instances` folder:

- Folder layout when you used the standalone `index.js`: `~/al-jin/wraith/instances/`
- Folder layout when you cloned the whole repository: `./instances/`

**Backup:**

```bash
tar czf al-jin-backup-$(date +%F).tar.gz instances/
```

**Restore or move to a new host:** install the tools (section 2), place `index.js` (or the repository), extract the backup so that `instances/` is in the same place, and start the bot. It resumes without asking for a code. Do not run the same session on two hosts at once: WhatsApp will disconnect one of them.

**Keep the backup private.** It contains the login of the linked account.

---

## 12. Deployment troubleshooting

| Problem | Fix |
|---|---|
| `Cannot find module` or the bot does not start | The file is not named exactly `index.js`. Look for `index (1).js`, `index(2).js` or `index.js.txt` and rename it. |
| `Cannot use import statement outside a module` | Node is too old. Install Node 22 LTS. |
| `no phone number configured` | Set `const BOT_NUMBER = '923001234567';` at the top of `index.js`, or start with `node index.js --phone=923001234567`. |
| `ignoring invalid phone value` | The number must be 10–15 digits, no `+`, no spaces. |
| `git clone failed` | The server cannot reach GitHub, or `git` is not installed (`apt install git` / `pkg install git`). |
| `npm install failed` | Not enough disk or RAM, or a flaky connection. Free some space and start again. On a 512 MB host, add swap on a VPS. |
| No pairing code appears | Wait one to two minutes during the first install. Check the console or logs. The number must be the WhatsApp account you want to link. |
| Code is rejected or expired | Restart the bot for a new code and enter it within five minutes. |
| Bot asks for a code after every restart | The `instances` folder is not saved (Heroku, no volume, a container without `-v`). Add a persistent volume. |
| Bot is linked but silent | Send `.alive`. If nothing comes back, check `pm2 logs al-jin` or the panel console, and confirm `.mode` allows your number. |
| "Waiting for this message" on the bot's own phone | Send `.fixkeys` as owner. See [Troubleshooting](./whatsapp-bot-troubleshooting.md). |
| Out of memory | Use at least 512 MB (1 GB is better) and set `.ramlimit 450`. Downloads and video tools use the most memory. |
