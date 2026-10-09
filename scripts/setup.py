"""Restore checksum-pinned application-local dependencies."""

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

from install_runtime import install

ROOT = Path(__file__).resolve().parents[1]


def restore(asset, root=ROOT):
    root = Path(root).resolve()
    target = (root / asset["path"]).resolve()
    if not target.is_relative_to(root):
        raise ValueError("Dependency path is outside the project")

    def valid(path):
        with path.open("rb") as stream:
            return hashlib.file_digest(stream, "sha256").hexdigest() == asset["sha256"]

    if target.is_file() and valid(target):
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as output:
            temporary = Path(output.name)
            print("Downloading: " + asset["path"], flush=True)
            with urllib.request.urlopen(asset["url"], timeout=60) as response:
                if not response.url.startswith("https://"):
                    raise ValueError("Dependency download must use HTTPS")
                while block := response.read(1024 * 1024):
                    output.write(block)
        if not valid(temporary):
            raise ValueError("Dependency checksum mismatch: " + target.name)
        os.replace(temporary, target)
        return target
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)


def ready(root=ROOT):
    manifest = json.loads((Path(root) / "scripts/assets.json").read_text())
    code = (
        "import sys,importlib.metadata as m,numpy,onnxruntime; assert sys.version.split()[0] == "
        + repr(manifest["python"]["runtime"]["version"])
    )
    for wheel in manifest["python"]["wheels"]:
        code += (
            "; assert m.version("
            + repr(wheel["name"])
            + ") == "
            + repr(wheel["version"])
        )
    return (
        subprocess.run(
            [sys.executable, "-c", code],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        ).returncode
        == 0
        and assets_ready(root, manifest)
    )


def assets_ready(root, manifest):
    """Check artifact identity so startup can repair an existing corrupt model."""
    try:
        for asset in manifest["assets"]:
            with (Path(root) / asset["path"]).open("rb") as stream:
                if hashlib.file_digest(stream, "sha256").hexdigest() != asset["sha256"]:
                    return False
        return True
    except OSError:
        return False


def setup(root=ROOT):
    root = Path(root)
    manifest = json.loads((root / "scripts/assets.json").read_text())
    for asset in manifest["assets"] + [manifest["python"]["runtime"]]:
        restore(asset, root)
    for wheel in manifest["python"]["wheels"]:
        restore(dict(wheel, path="runtime/archives/" + wheel["file"]), root)
    if not ready(root):
        install(root)
    if not ready(root):
        raise RuntimeError("Python dependency verification failed")
    print("Dependencies are ready.", flush=True)


if __name__ == "__main__":
    try:
        setup()
    except KeyboardInterrupt:
        print("Setup cancelled.", file=sys.stderr)
        sys.exit(130)
    except (OSError, ValueError, RuntimeError) as error:
        print("Setup failed: " + str(error), file=sys.stderr)
        sys.exit(1)
