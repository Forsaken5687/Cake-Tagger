"""Visible local launcher; imported inference code never opens a terminal."""

import argparse
import json
import re
import socket
import sys
import urllib.request
import webbrowser
from pathlib import Path

from setup import ready, setup

ROOT = Path(__file__).resolve().parents[1]


def running(root=ROOT, port=8765):
    try:
        state = json.loads((Path(root) / "data/session.json").read_text())
        match = re.fullmatch(
            r"http://127\.0\.0\.1:" + str(port) + r"/#([a-f0-9]{48})", state["url"]
        )
        if not match:
            return False
        request = urllib.request.Request(
            f"http://127.0.0.1:{port}/api/status",
            headers={"Authorization": "Bearer " + match[1]},
        )
        status = json.load(urllib.request.urlopen(request, timeout=2))
        if status.get("app") != "cake-tagger-browser-v1":
            return False
        if status.get("backendImplementation") != "python":
            raise RuntimeError("Quit the running service before starting this version.")
        return True
    except (OSError, ValueError, KeyError):
        return False


def main():
    parser = argparse.ArgumentParser(description="Start Cake Tagger in this terminal.")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--review", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("Port must be between 1 and 65535")
    if running(port=args.port):
        print(
            "Cake Tagger is already running. Use its original terminal or the extension's Quit button to stop it."
        )
        if args.review:
            webbrowser.open(f"http://127.0.0.1:{args.port}/review.html")
        return
    try:
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", args.port))
    except OSError:
        raise RuntimeError(
            f"Local port {args.port} is occupied. Quit the running service first."
        ) from None
    if not ready():
        setup()
    from server.service import main as serve

    serve(
        ["--root", str(ROOT), "--port", str(args.port)]
        + (["--open-review"] if args.review else [])
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Startup cancelled.", file=sys.stderr)
        sys.exit(130)
    except (OSError, ValueError, RuntimeError) as error:
        print("Could not start Cake Tagger: " + str(error), file=sys.stderr)
        sys.exit(1)
