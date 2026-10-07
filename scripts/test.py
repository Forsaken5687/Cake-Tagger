"""Run backend and browser-module checks."""

import ast
import json
import subprocess
import sys
from pathlib import Path

from setup import restore

ROOT = Path(__file__).resolve().parents[1]


def main():
    manifest = json.loads((ROOT / "scripts/assets.json").read_text())
    restore(manifest["development"]["javascriptLicense"])
    javascript = restore(manifest["development"]["javascriptRuntime"])
    for folder in ("src/server", "scripts", "tests"):
        for file in (ROOT / folder).rglob("*.py"):
            ast.parse(file.read_text(encoding="utf-8-sig"), filename=str(file))
    subprocess.run(
        [
            sys.executable,
            "-m",
            "unittest",
            "discover",
            "-s",
            "tests",
            "-p",
            "test_*.py",
            "-v",
        ],
        cwd=ROOT,
        check=True,
    )
    for folder in ("src", "extension"):
        for file in (ROOT / folder).rglob("*"):
            if file.suffix in (".js", ".mjs"):
                subprocess.run(
                    [str(javascript), "--check", str(file)], cwd=ROOT, check=True
                )
    subprocess.run(
        [
            str(javascript),
            "--test",
            *map(str, sorted((ROOT / "tests").glob("*.test.mjs"))),
        ],
        cwd=ROOT,
        check=True,
    )
    print("All checks passed.")


if __name__ == "__main__":
    main()
