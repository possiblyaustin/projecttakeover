# llama.cpp + Gemma 4 E2B — Dev PC Setup Walkthrough

*Status: Phase D dev-environment setup (architecture §6b step 4). One-time install on the Windows dev PC. Steam Deck install is documented separately in [steam-deck-benchmark-report.md](steam-deck-benchmark-report.md) — that path needs a build-from-source flow we're not repeating here.*

---

## What you're setting up

A local HTTP server that runs the Gemma 4 E2B model on your dev PC. The game's `LlamaCppModelService` (Phase D code, landing after this) talks to it over `localhost:8080` using OpenAI-compatible `/v1/chat/completions` requests. No internet involved at runtime; once the model is loaded, everything is local.

This is the dev setup only. Shipping the game later means bundling these binaries inside the Tauri build — that's a separate problem.

## Prerequisites

- Windows 10 or 11
- ~3 GB free disk (model weights are ~1.5 GB; binary + extraction overhead the rest)
- A folder you'll remember — recommendation: `C:\llm\` so the paths in this doc copy cleanly
- A terminal — bash (Git Bash) or PowerShell, either is fine; commands below show both

You do **not** need: Visual Studio, CMake, a compiler, Python, or admin rights.

---

## Step 1 — download llama.cpp (Windows binary)

The benchmark we ran on the Deck built llama.cpp from source because SteamOS makes the prebuilt binaries unhappy. Windows has none of those issues — the official prebuilt zip works out of the box.

1. Open the [llama.cpp releases page](https://github.com/ggml-org/llama.cpp/releases).
2. On the latest release, find the asset that looks like **`llama-bXXXX-bin-win-cpu-x64.zip`** (the `cpu-x64` part is the one we want — CPU-only, 64-bit Windows). Plain CPU build matches what the Deck benchmark validated. Avoid the CUDA / Vulkan / HIP variants for now.
3. Download and extract to `C:\llm\llama.cpp\`. After extraction you should see `llama-server.exe` (and friends) directly in that folder, not nested.

**Sanity check:** open a terminal in `C:\llm\llama.cpp\` and run:

```bash
./llama-server.exe --version
```

You should see a version banner with a build number (e.g. `version: 4123 (...)`) and exit cleanly.

> **Heads-up:** if a future llama.cpp release renames the `--reasoning off` flag, the server will refuse to start with it. The flag has been stable, but if you hit a "unknown argument" error, ping me and we'll grab the matching release tag from the [benchmark report](steam-deck-benchmark-report.md) (it pinned commit `b8763`).

## Step 2 — download the Gemma 4 E2B model weights

We need the **Q4_K_M quantization** specifically — that's what the Sprint 1 Deck benchmark validated, and it's the right size/quality tradeoff for our targets. Don't grab a different quant unless we've talked about it.

The canonical source: [`unsloth/gemma-4-E2B-it-GGUF`](https://huggingface.co/unsloth/gemma-4-E2B-it-GGUF) on Hugging Face. Open the **Files and versions** tab on that repo and grab the file with `Q4_K_M` in its name — typically `gemma-4-E2B-it-Q4_K_M.gguf` or close to it. Single `.gguf` file, ~1.5 GB.

Place it at `C:\llm\models\` (create the `models` folder if needed). Note the exact filename — you'll paste it into the start command in Step 3. If the filename in the repo differs slightly from what's shown in this doc, use whatever the actual file is called.

**Don't grab the other quants** in that repo (Q5, Q6, Q8, F16, etc.). They're larger, slower, and weren't part of the validated Deck config — switching quants is a real decision, not a default.

## Step 3 — start `llama-server`

The flags below match the validated Deck benchmark config. The only addition is `--host 127.0.0.1` so the server only listens on localhost (not your LAN) — important because we don't want a random device on your network poking at your dev model.

**Bash (Git Bash):**

```bash
cd /c/llm/llama.cpp
./llama-server.exe \
  --model "C:/llm/models/gemma-4-E2B-it-Q4_K_M.gguf" \
  --host 127.0.0.1 \
  --port 8080 \
  --threads 4 \
  --ctx-size 8192 \
  --reasoning off
```

**PowerShell (one line; use backticks if you want to break it):**

```powershell
C:\llm\llama.cpp\llama-server.exe --model "C:\llm\models\gemma-4-E2B-it-Q4_K_M.gguf" --host 127.0.0.1 --port 8080 --threads 4 --ctx-size 8192 --reasoning off
```

You should see startup output ending with something like:

```
main: HTTP server is listening, hostname: 127.0.0.1, port: 8080
```

Leave this terminal open. Stopping the server is `Ctrl+C` in that window.

**What each flag does:**

| Flag | Why |
|------|-----|
| `--model <path>` | The GGUF file to load |
| `--host 127.0.0.1` | Localhost only — no LAN exposure |
| `--port 8080` | Where the server listens (matches what the game will hit) |
| `--threads 4` | CPU threads. Pinned to 4 in dev specifically for **Deck parity** — same thread count the Sprint 1 benchmark validated. The shipped game should detect cores at runtime and use what's available; higher-end systems shouldn't be artificially capped. That auto-detect logic is a Tauri-spawn concern (post-D), not a flag-tuning decision today. |
| `--ctx-size 8192` | Context window. Bumped from 4096 on 2026-05-06 — at 4096 the conversation rolled into permanent fallback around turns 5–10 once persona prompt + `[HELPYR_STATE]` injection + accumulated history started crowding the window. 8192 gives comfortable headroom for HELPYR-length conversations and leaves room for the reputation-injection block. |
| `--reasoning off` | **Mandatory.** Gemma 4 burns 200+ invisible reasoning tokens otherwise — exchanges balloon from ~1.5s to ~20s. See [benchmark §Reasoning Mode](steam-deck-benchmark-report.md) |

## Step 4 — smoke test

Open a **second** terminal (leave the server running in the first) and run:

```bash
curl -s http://127.0.0.1:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemma-4-2b-it",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user",   "content": "Say the single word PONG."}
    ],
    "max_tokens": 16
  }'
```

You want to see a JSON response that contains `"content": "PONG"` (or close to it — small models can be a little chatty). Anything that comes back as well-formed JSON with a non-empty `choices[].message.content` means the server is wired correctly.

Common responses to a successful run:
- `PONG`
- `PONG.`
- `PONG!` (Gemma is enthusiastic)

If you get a connection-refused error, the server isn't running — go back to Step 3 and check the first terminal for an error.

## Step 5 — convenience: a one-click start

Once everything works, you'll want to start the server without retyping the flags every time. Save the following as `C:\llm\start-llama.bat`:

```bat
@echo off
cd /d C:\llm\llama.cpp
llama-server.exe --model "C:\llm\models\gemma-4-E2B-it-Q4_K_M.gguf" --host 127.0.0.1 --port 8080 --threads 4 --ctx-size 8192 --reasoning off
pause
```

Double-click to start. The `pause` at the end keeps the window open if there's a startup error so you can read it.

---

## Troubleshooting

**`llama-server.exe is not recognized`** — you're not in the right folder, or extraction didn't put the `.exe` at the path you think it did. `cd C:\llm\llama.cpp` first and `dir llama-server.exe`.

**`failed to load model`** — the path to the `.gguf` is wrong. Check the filename character-for-character. If the file is on a different drive, use that drive letter.

**`unknown argument: --reasoning`** — your llama.cpp build is too old (or the flag was renamed in a very new build). Grab the latest release zip and re-extract.

**Curl returns nothing or hangs** — the model is still loading. First-time startup takes 2–3 seconds (per benchmark), but if you're on slower disk it can be longer. Watch the first terminal — once it prints `HTTP server is listening`, the smoke test will succeed.

**Antivirus quarantines `llama-server.exe`** — Windows Defender or third-party AV occasionally false-positives on llama.cpp binaries because they do unusual things with memory mapping. Whitelist the `C:\llm\llama.cpp\` folder.

**Conversation appears to "forget" earlier turns past depth ~16** — by design as of v0.0.39. `LlamaCppModelService` caps the chat history forwarded to llama-server at `historyTurnCap` (default 16 exchanges) so prompt processing stays under the 30s `timeoutMs`. The system prompt, `[HELPYR_STATE]` block, and reputation context are re-sent in full every turn so character coherence isn't affected — only the literal exchange-by-exchange transcript is windowed. Tune via `LlamaCppConfig.historyTurnCap` if needed; the per-turn `[Chat] LLM turn: prompt=..., kept=..., dropped=...` console log shows the live numbers.

---

## What happens next

Once the smoke test passes, the dev PC is ready. The Phase D code work (D.1 onward) wires the game to this server:

- **D.1** — `LlamaCppModelService` + the §6d output parser. A `?backend=llamacpp` URL flag swaps the contact off `MockModelService` for live testing while keeping mock as the default.
- **D.2** — fallback path (§6f): one transparent retry, then in-fiction glitch artifact, then canned fallback dialogue. The fallback corpus already exists in `HelpyrDialogue` / `HelpyrWildcards`.
- **D.3** — HELPYR persona prompt + `[HELPYR_STATE]` block injection. Iterate empirically against real Gemma output until format adherence is solid.

You don't need to start the server for D.1 development — that work can land while llama is installing. You'll need it running for the first end-to-end test.

---

*Last updated: 2026-05-03*
