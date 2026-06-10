#!/usr/bin/env bash
# Deck-side llama-server launch — the validated Vulkan/E4B config from
# the 2026-06-09 benchmark session (inference-acceleration memo v3):
# full GPU offload on the Van Gogh iGPU, RADV nogttspill, E4B QAT Q4_0.
#
# Paths are env-overridable because the llama build/model locations on
# the Deck came from the benchmark session, not from us — deckDeploy
# passes the real ones once discovered (see docs/deck-remote-testing_v1.md).
#
#   LLAMA_BIN=/path/to/llama-server MODEL=/path/to/model.gguf ./deck-llama.sh
set -euo pipefail

LLAMA_BIN="${LLAMA_BIN:-$HOME/llm/llama.cpp/build/bin/llama-server}"
MODEL="${MODEL:-$HOME/llm/models/gemma-4-E4B_q4_0-it.gguf}"
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
exec env RADV_PERFTEST=nogttspill "$LLAMA_BIN" \
  --model "$MODEL" \
  --host 127.0.0.1 \
  --port "$PORT" \
  --threads "$THREADS" \
  --ctx-size "$CTX" \
  --reasoning off \
  -ngl "$NGL"
