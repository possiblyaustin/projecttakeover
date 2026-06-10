# Deck Remote Testing — Build Push + Native Inference (v1)
### June 9, 2026 · Code thread

**Purpose:** One-command round-trips to the Steam Deck so it doesn't need to be at the desk: `npm run deck:deploy` builds the game, pushes it to the Deck over LAN, and (re)starts everything there. The Deck then plays the REAL stack — built game + **Deck-native llama-server** (Vulkan/E4B, the production config from [inference-acceleration-assessment_v3.md](inference-acceleration-assessment_v3.md)) — with zero URL flags.

This supersedes the old deferral ([deck-testing-harness_v1.md](deck-testing-harness_v1.md) covers *automated* testing on the dev PC; this doc is about *real-Deck* runs): the latency-profile mismatch that made LAN-bridged testing low-value is gone now that llama runs natively on the Deck.

## How it fits together

```
dev PC                                Steam Deck (192.168.169.164 / "steamdeck")
──────                                ──────────────────────────────
npm run deck:deploy ──ssh/scp──►      ~/projecttakeover/
  (vite build, ~264 KB)                 dist/           ← the game
                                        deckServe.py    ← :8000 static + /llama proxy
                                        deck-llama.sh   ← llama-server :8080 (localhost-only)

                  Deck browser → http://localhost:8000/  (or from any LAN device)
```

`deckServe.py` mirrors the Vite dev proxy contract: the game's same-origin `/llama/*` calls forward to the Deck-local llama-server. So `defaultLlamaBaseUrl()` just works, llama-server never binds to the LAN, and the game needs no flags. Two dev modes coexist:

| Mode | Use when | How |
|---|---|---|
| **LAN HMR** (existing) | UI iteration | Deck browser → `http://<dev-pc-ip>:5173` — instant HMR, inference on the dev PC |
| **Native deploy** (this doc) | Real latency/battery/feel | `npm run deck:deploy` → Deck browser → `http://localhost:8000` — everything on-Deck |

## One-time setup

**On the Deck** (desktop mode, Konsole — ~1 minute, Austin does this once):

```bash
passwd                                  # set a password if you never have
sudo systemctl enable --now sshd       # turn on SSH, persist across reboots
```

**On the dev PC** (one interactive command — it asks for the Deck password you just set):

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh deck@steamdeck "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

(The keypair already exists at `~/.ssh/id_ed25519` — generated 2026-06-09.) After this, everything is passwordless and scriptable.

**Then finalize paths** (once): `deck-llama.sh` guesses the llama build/model locations from the benchmark session (`~/llm/...`). On first connect, `ssh deck@steamdeck` and find the real paths of `llama-server` (the Vulkan build) and the E4B GGUF; either move them to match the script's defaults or set `LLAMA_BIN=`/`MODEL=` in the deploy (the script is env-overridable).

## Daily use

```powershell
npm run deck:deploy              # build + push + restart game server
npm run deck:deploy -- --llama   # …and (re)start llama-server (E4B cold load ~30s)
npm run deck:deploy -- --no-build --host 192.168.169.164   # variants
```

Then on the Deck: Web browser → `http://localhost:8000/`. Logs land in `~/projecttakeover/serve.log` and `llama.log` (readable over ssh without touching the Deck).

- llama-server keeps running between deploys — only pass `--llama` when it isn't running or you pushed a new model/config.
- The deploy wipes the remote `dist/` each time, so stale assets can't linger.
- Version check: the in-game readme shows `__APP_VERSION__`, so "is the Deck on the new build?" is answerable on-screen ([build versioning rule](../CLAUDE.md)).

## Quick reference (start here next session)

**Push a build to the Deck** (from the dev PC, ~5s):
```powershell
npm run deck:deploy -- --host 192.168.169.164            # build + push + restart game server
npm run deck:deploy -- --host 192.168.169.164 --llama    # …and restart llama-server (E4B reload ~30s)
npm run deck:deploy -- --host 192.168.169.164 --no-build # push existing dist/ as-is
```
Play on the Deck: browser → `http://localhost:8000/`. From any LAN device: `http://192.168.169.164:8000/`. Always use the IP — the `steamdeck` hostname is flaky.

**SSH on/off:**
| | Command | Notes |
|---|---|---|
| Deck — status | `systemctl status sshd` (in Konsole) | Currently **enabled + persistent** across reboots |
| Deck — turn OFF | `sudo systemctl disable --now sshd` | If you want it off when not testing |
| Deck — turn back ON | `sudo systemctl enable --now sshd` | One command, password needed |
| Dev PC | nothing to start/stop | Windows' built-in OpenSSH *client*; key at `~/.ssh/id_ed25519` |

**Manage the Deck-side processes** (from the dev PC):
```powershell
ssh deck@192.168.169.164 "systemctl --user status pt-llama pt-game-server"   # what's running
ssh deck@192.168.169.164 "systemctl --user stop pt-llama pt-game-server"     # stop everything
ssh deck@192.168.169.164 "bash ~/projecttakeover/deck-restart.sh --llama"    # start/restart by hand
ssh deck@192.168.169.164 "tail -20 ~/projecttakeover/llama.log"              # inference logs
ssh deck@192.168.169.164 "tail -20 ~/projecttakeover/serve.log"              # game-server/proxy logs
```
The processes are systemd user units — they keep running after you disconnect, across game sessions, until stopped or the Deck reboots (after a reboot, just deploy again or run deck-restart.sh).

## Status / validation

- **END-TO-END VALIDATED 2026-06-10**: v0.2.34 deployed, game served at `:8000`, `/llama` proxy round-tripping real completions against Deck-native E4B on Vulkan at **19.9 tok/s generation** (matches the inference memo's benchmark exactly).
- **Server processes are transient systemd user units** (`pt-game-server` / `pt-llama`, started by `deck-restart.sh` via `systemd-run --user`): SteamOS kills an ssh session's children on disconnect — nohup did NOT survive (llama died 2.2s into its cold load on the first attempt). Units persist because the Deck is always logged into its graphical session. Manage with `systemctl --user status|stop pt-llama`; logs still land in `~/projecttakeover/{serve,llama}.log`.
- **`deck-llama.sh` pins `--parallel 1`**: build 9586 defaults to four 8192-ctx slots, which quadruples KV memory on the 9 GiB iGPU and cost ~20% generation speed (15.7 → 19.9 tok/s).
- **Prefer `--host 192.168.169.164` over the `steamdeck` hostname** — name resolution drops out intermittently (WiFi power-save + mDNS); the IP has been stable. DHCP may move it eventually.
- Deck-side reality: llama build 9586 (Vulkan, RADV VANGOGH) at `~/llama.cpp/build/bin/llama-server`, E4B QAT at `~/llama.cpp/models/gemma-4-E4B_q4_0-it.gguf` (deck-llama.sh defaults match). `~/projecttakeover/` also contains an old repo clone from the benchmark era — harmless; our deploy only touches `dist/`, the three scripts, and the logs.
