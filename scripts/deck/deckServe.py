#!/usr/bin/env python3
"""Deck-side game server: static dist/ + /llama proxy.

Mirrors the Vite dev server's contract (vite.config.js) so the built
game runs on the Deck unmodified and flag-free:
  - serves the built game (dist/) as static files
  - forwards /llama/* to the llama-server on 127.0.0.1:8080, stripping
    the /llama prefix — same-origin from the browser's point of view,
    so llama-server stays bound to localhost (no LAN exposure) and the
    game's defaultLlamaBaseUrl() just works.

Python stdlib only — SteamOS ships python3, nothing to install.

Usage (deckDeploy.mjs starts it like this):
    python3 deckServe.py --dir ~/projecttakeover/dist --port 8000
"""

import argparse
import http.server
import os
import socketserver
import sys
import urllib.error
import urllib.request

LLAMA_ORIGIN = "http://127.0.0.1:8080"

# Headers that are hop-by-hop or that urllib/http.server manage
# themselves — forwarding these corrupts the proxied exchange.
SKIP_HEADERS = {
    "host", "connection", "keep-alive", "transfer-encoding",
    "content-length", "accept-encoding",
}


class GameHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        if self.path.startswith("/llama"):
            self._proxy("GET")
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith("/llama"):
            self._proxy("POST")
        else:
            self.send_error(405)

    def _proxy(self, method):
        target = LLAMA_ORIGIN + self.path[len("/llama"):]
        body = None
        if method == "POST":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length) if length else b""
        headers = {
            k: v for k, v in self.headers.items() if k.lower() not in SKIP_HEADERS
        }
        req = urllib.request.Request(target, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=120) as upstream:
                payload = upstream.read()
                self.send_response(upstream.status)
                for k, v in upstream.headers.items():
                    if k.lower() not in SKIP_HEADERS:
                        self.send_header(k, v)
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
        except urllib.error.HTTPError as e:
            payload = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", e.headers.get("Content-Type", "text/plain"))
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except OSError as e:
            # llama-server down/unreachable — let the game's in-fiction
            # fallback handle it; 502 is what the Vite proxy emits too.
            msg = f"llama proxy: {e}".encode()
            self.send_response(502)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)

    def log_message(self, fmt, *args):
        # Quiet static chatter; keep proxy + error lines.
        if self.path.startswith("/llama") or "40" in (args[1] if len(args) > 1 else ""):
            sys.stderr.write(f"{self.address_string()} {fmt % args}\n")


class ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True, help="dist directory to serve")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()
    os.chdir(os.path.expanduser(args.dir))
    with ThreadingServer(("0.0.0.0", args.port), GameHandler) as httpd:
        print(f"serving {os.getcwd()} on 0.0.0.0:{args.port} (llama proxy -> {LLAMA_ORIGIN})")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
