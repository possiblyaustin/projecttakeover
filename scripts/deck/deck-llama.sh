#!/usr/bin/env bash
# Deck-side llama-server launch — the validated Vulkan/E4B config from
# the 2026-06-09 benchmark session (inference-acceleration memo v3):
# full GPU offload on the Van Gogh iGPU, RADV nogttspill, E4B QAT Q4_0.
#
# Defaults match the benchmark session's real locations on the Deck
# (verified 2026-06-10: build 9586 with libggml-vulkan, RADV VANGOGH
# detected). Env-overridable for future moves:
#
#   LLAMA_BIN=/path/to/llama-server MODEL=/path/to/model.gguf ./deck-llama.sh
set -euo pipefail

LLAMA_BIN="${LLAMA_BIN:-$HOME/llama.cpp/build/bin/llama-server}"
MODEL="${MODEL:-$HOME/llama.cpp/models/gemma-4-E4B_q4_0-it.gguf}"
NGL="${NGL:-99}"
THREADS="${THREADS:-4}"   # benchmark-validated Deck CPU thread count
CTX="${CTX:-8192}"
PORT="${PORT:-8080}"

if [[ ! -x "$LLAMA_BIN" ]]; then
  echo "deck-llama: llama-server not found/executable at $LLAMA_BIN (set LLAMA_BIN=)" >&2
  exit 1
fi
if [[ ! -f "$MODEL" ]]; then
  echo "deck-llama: model not found at $MODEL (set MODEL=)" >&2
  exit 1
fi

# localhost-only on purpose: the game reaches inference through
# deckServe.py's same-origin /llama proxy, never across the LAN.
# --parallel 1: build 9586 defaults to n_parallel=4 (four 8192-ctx
# slots), which quadruples KV memory on the 9 GiB iGPU and makes the
# auto-fit hold layers back — the game is strictly one conversation at
# a time.
exec env RADV_PERFTEST=nogttspill "$LLAMA_BIN" \
  --model "$MODEL" \
  --host 127.0.0.1 \
  --port "$PORT" \
  --threads "$THREADS" \
  --ctx-size "$CTX" \
  --parallel 1 \
  --reasoning off \
  -ngl "$NGL"
