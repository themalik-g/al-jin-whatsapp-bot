Al-Jin one-click start fix
==========================
Replace these 2 files in your project (same names, same folder):
  Al-Jin-Start.bat
  index.js

If you already ran the old .bat in a folder like C:\Users\<you>, just put the new
.bat anywhere (e.g. a fresh folder on the Desktop) and double-click it.

What was wrong
1. winget install of Node.js needs an administrator (UAC) prompt, which can hide behind
   other windows, so it waited forever. Now Node.js 20+ is used if you have it; otherwise a
   private portable copy (hash-verified) is downloaded to .\runtime - no admin, no winget.
2. git is no longer needed: the bot is downloaded as a zip if git is missing.
3. index.js ran "npm install" in a way that does not work on Windows (npm is npm.cmd).
   Fixed.
4. The MODULE_TYPELESS_PACKAGE_JSON warning is silenced, and a standalone launcher now runs
   in its own "Al-Jin" folder with a package.json instead of cluttering your user folder.
5. The restart loop stops after 3 quick failures and keeps the error on screen
   instead of restarting forever.
