# BRAZOS Developer Control Center

Double-click launchers for common local development tasks. Every script:

- opens a normal, attached `cmd.exe` window (no silent background processes)
- prints a title and a short description of what it's about to do before doing it
- fails gracefully with an explanation instead of a cryptic error
- pauses at the end so the window doesn't vanish before you can read the output

None of these scripts install/upgrade packages (beyond the existing
install-if-missing check in **Start BRAZOS**), push, deploy, merge, or switch
branches. They only run existing `package.json` scripts or plain git/OS
commands.

### Changing the Metro port

Every script that starts, stops, or checks the dev server reads its port
from a `METRO_PORT` variable that defaults to **8081** and can be
overridden by setting a `BRAZOS_METRO_PORT` environment variable before
launching (e.g. `set BRAZOS_METRO_PORT=8090` in a terminal, then run the
script from that same terminal — double-clicking from Explorer won't pick
up a variable set this way unless it's a permanent user environment
variable). This keeps Start/Restart/Stop/Build/Clear Cache/Status/Health
Check all pointed at the same port instead of assuming 8081 everywhere.

## Launchers

### Start BRAZOS.bat
Checks the current git branch, working tree cleanliness, and whether
`node_modules` exists (installing only if it's missing), then runs
`npm start -- --port <METRO_PORT>` attached to the window so you can see
the QR code for Expo Go. Use this for a normal day-to-day dev session.

### 🔄 Restart BRAZOS.bat
Stops any Metro bundler already running on the configured port, re-runs
the same branch/tree/dependency checks as Start BRAZOS, then starts a
fresh dev server. Use this when the dev server is in a bad state (stuck
bundler, stale connection) and you want a clean restart without manually
killing the process first. Correctly handles a port that shows up twice in
`netstat` (once for IPv4, once for IPv6) without printing a false
"could not stop" warning for the second entry.

### 🛑 Stop BRAZOS.bat
Finds whatever process is listening on the configured port (the Metro
bundler) and kills it — deduplicated so a dual-stack (IPv4 + IPv6) listener
only gets one kill attempt and one status line. Prints a clear message if
nothing is running. Use this to cleanly shut down the dev server, e.g.
before closing your laptop.

### 🩺 Health Check.bat
Runs a read-only PASS/WARN/FAIL diagnostic of your local dev environment:
git repo state (branch, clean tree, no merge/rebase in progress), required
tooling (git/node/npm/npx) plus optional tooling (`code`, `claude`, `adb`)
reported as info, dependency state (`node_modules`, `package-lock.json`,
resolved Expo CLI version, `.env` presence), your machine's LAN IP
address(es) for connecting Expo Go on a physical device, and whether the
Metro port is currently in use. Ends with a pass/warning/fail summary. Use
this first when something "isn't working" and you're not sure why.

### 💻 Open VS Code.bat
Opens the project root in VS Code via the `code` CLI. If `code` isn't on
your PATH, it explains how to enable it ("Shell Command: Install 'code'
command in PATH" from VS Code's command palette) instead of failing
silently.

### 🤖 Open Claude Code.bat
Opens a new terminal window with the `claude` CLI running in the project
folder. Claude Code is a CLI tool, not a GUI app, so this launches a
terminal rather than "opening" an application window. If `claude` isn't on
your PATH, it explains how to install it instead of failing silently.

### 📱 Build Android.bat
Runs `npm run android -- --port <METRO_PORT>` (`expo start --android`) to
open the app on a connected Android device/emulator via Expo Go or a dev
client. This is a **dev-server launch, not a production build** — no EAS
build, no APK upload, no deploy.

### 🍎 Build iOS.bat
Runs `npm run ios -- --port <METRO_PORT>` (`expo start --ios`). On Windows
there is no iOS Simulator, so this will still start Metro and let you scan
the QR code with Expo Go on a physical iPhone — the script prints a note
explaining this instead of just failing. Like Build Android, this is a
**dev-server launch, not a production build**.

### 🌐 Start Web.bat
Runs the existing `npm run web` script (`expo start --web`) with the
configured port. This only invokes the pre-existing web script — it does
not change any web/PWA code, config, or deployment. Web/PWA development is
otherwise frozen for this project; use this launcher only when you
specifically need the web target.

### 🧹 Clear Expo Cache.bat
Runs `expo start --clear` to wipe the Metro bundler cache and start fresh.
Use this when you're seeing stale-bundle behavior or changes that aren't
showing up after a normal restart. Does not touch `node_modules` and does
not install/upgrade anything.

### 🔍 Run Tests.bat
Runs the project's test suite (`npm test`, i.e.
`node --test tests/*.test.mjs`) and reports whether everything passed.

### 📊 Project Status.bat
Read-only snapshot: current git branch, last commit, remote origin,
ahead/behind vs. upstream, working tree cleanliness (with a changed-file
count), Node/npm versions, the `expo` version declared in `package.json`
**and** the actually-resolved Expo CLI version (useful if they drift),
whether `node_modules` and `.env` are present, and whether the Metro
bundler is currently running on the configured port. Doesn't change
anything — safe to run any time.

### 💾 Git Checkpoint.bat
Creates a local commit of whatever is currently changed, as a save point.
Before committing it checks that: you're in a git repo, you're not in a
detached HEAD state (or explicitly confirms if you are, since a commit
there can be lost), no merge/rebase/cherry-pick is in progress, `git`
has a configured `user.email`, and there are no unresolved merge conflicts
in the working tree. It shows you the pending changes, asks for
confirmation (`Y`/`Yes`), and lets you add an optional note — the note is
sanitized to strip quote/redirect/pipe characters so it can't break out of
the commit-message argument. It only runs `git add -A` + `git commit` on
your **current** branch — it never pushes, merges, or switches branches.

### 📂 Open Project Folder.bat
Opens the BRAZOS project root in File Explorer.

## Notes

- All scripts `cd` to the project root automatically, so they work
  regardless of where `dev-tools/` is on disk.
- "Build Android" / "Build iOS" are dev-server launches (Expo Go / dev
  client), not EAS production builds — no deploy step is included anywhere
  in this folder.
- **Open VS Code** and **Open Claude Code** depend on the `code` and
  `claude` CLIs being on your PATH. Neither was available in the
  environment these scripts were authored in, so both should be manually
  verified on your machine.
- Scripts that show `git status --porcelain` output (Project Status,
  Health Check, Git Checkpoint) will display filenames containing emoji
  (the launcher files themselves) as escaped octal, e.g.
  `"dev-tools/\360\237\224\204 Restart BRAZOS.bat"`, because `cmd.exe`'s
  console codepage can't render them and git escapes non-ASCII paths by
  default. This is cosmetic only — the file being referenced is still
  clear from context.
