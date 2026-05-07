# Dev Session Startup — How to Fire Everything Up

*Quick reference for starting a Project Takeover dev session on the Windows dev PC. Assumes the one-time setup from [docs/llama-setup_v1.md](llama-setup_v1.md) is done.*

---

## TL;DR (the four steps)

1. **Start `llama-server`** — double-click `C:\llm\start-llama.bat`
2. **Pull latest** — in project root: `git pull origin main`
3. **Start Vite** — in project root: `npm run dev`
4. **Open Chrome** at `http://localhost:5173/?backend=llamacpp`

If the in-game README shows the expected version, you're live. If not, jump to [Troubleshooting](#troubleshooting) below.

---

## Step-by-step

### 1. Start `llama-server`

**Easiest:** double-click `C:\llm\start-llama.bat`. A terminal window opens, model loads (~2–3s), then you'll see something ending with:

```
main: HTTP server is listening, hostname: 127.0.0.1, port: 8080
```

That window is now your server. **Leave it open** for the whole session — closing it kills the server.

**Alternative (no .bat):** open Git Bash inside `C:\llm` and run:

```
./llama-server.exe --model "C:/llm/models/gemma-4-E2B-it-Q4_K_M.gguf" --host 127.0.0.1 --port 8080 --threads 4 --ctx-size 8192 --reasoning off
```

### 2. Pull latest

In a Git Bash window inside the project root (`C:\Users\dunca\Documents\projecttakeover`):

```
git pull origin main
```

If anything new merged on GitHub since last session, this brings it down. If nothing new, you'll see "Already up to date."

### 3. Start Vite

Same project-root Git Bash window:

```
npm run dev
```

You'll see Vite print its banner:

```
  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
```

**Leave this window open** — Vite needs to keep running for the game to load. Hot-reload is on, so source changes propagate without restarting it.

> **Heads-up:** the version number in the in-game README is baked at Vite startup. If you `git pull` something new, **restart Vite** (Ctrl+C, `npm run dev` again) or you'll keep seeing the old version even after pulling.

### 4. Open Chrome

Navigate to:

```
http://localhost:5173/?backend=llamacpp
```

The `?backend=llamacpp` flag hits the live LLM. Drop the flag (just `http://localhost:5173/`) to use the mock backend — no server needed for that, and dev iteration is instant.

Hard reload with `Ctrl+Shift+R` if you've just pulled and the README still shows the old version.

---

## Stopping everything

In whatever order:

- **Vite:** click into its terminal, press `Ctrl+C`
- **`llama-server`:** click into its terminal, press `Ctrl+C`
- **Chrome:** close the tab

No cleanup needed — both servers stop cleanly.

---

## Troubleshooting

### "Connection refused" or page won't load
Vite isn't running, or you're hitting the wrong port. Check the project-root Git Bash window — Vite prints the actual port (usually 5173, sometimes 5174 if 5173 is busy). Match the URL.

### In-game README shows the wrong version
You restarted Vite *before* the pull, or didn't restart at all. Ctrl+C the Vite terminal, run `npm run dev` again, hard-reload Chrome (`Ctrl+Shift+R`).

### LLM responses fail to generate (immediate fallback every turn)
`llama-server` isn't running. Open the .bat-spawned terminal and check for the `HTTP server is listening` line. If the window is closed or shows an error, restart via Step 1.

### Git Bash command runs but prints nothing (e.g., `cat`, `head`, `curl` body)
Known stdout-display bug in Git Bash on ARM Windows. The command worked, the terminal just isn't rendering it. Open the file in Notepad instead, or pipe to a file and open that.

### "Cannot find module" or other npm errors after pulling
Probably a new dependency landed. Run `npm install` in project root, then start Vite again.

### Conversation gets stuck in fallback after many turns
First check: confirm `llama-server` is running with `--ctx-size 8192` (bumped from 4096 on 2026-05-06 to give the prompt + history headroom). If your `C:\llm\start-llama.bat` still has `4096`, edit it to `8192` and restart the server. If the bump doesn't resolve it, hard-reload the page to start a fresh conversation and flag for deeper investigation.

---

## What's running where

| What | Where | Port |
|------|-------|------|
| `llama-server` (LLM inference) | Its own .bat-spawned terminal | 8080 |
| Vite dev server (game UI) | Project-root Git Bash | 5173 (default) |
| Chrome (the game itself) | Browser | n/a |

llama-server is bound to `127.0.0.1` only (not LAN-exposed). Vite binds to all interfaces (LAN-accessible) but no LAN testing is set up yet — that's deferred until llama runs natively on Deck.

---

*Last updated: 2026-05-04*
