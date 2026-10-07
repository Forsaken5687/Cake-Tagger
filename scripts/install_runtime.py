"""Install pinned application-local wheels without pip or system changes."""

import hashlib
import json
import zipfile
from pathlib import Path


def install(root):
    root = Path(root).resolve()
    manifest = json.loads((root / "scripts/assets.json").read_text(encoding="utf-8"))
    destination = root / "runtime/cpython/Lib/site-packages"
    destination.mkdir(parents=True, exist_ok=True)
    for wheel in manifest["python"]["wheels"]:
        source = root / "runtime/archives" / wheel["file"]
        with source.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() != wheel["sha256"]:
                raise ValueError("Wheel checksum mismatch: " + wheel["file"])
        with zipfile.ZipFile(source) as archive:
            for entry in archive.infolist():
                name = entry.filename
                if ".data/" in name:
                    kind, name = name.split(".data/", 1)[1].split("/", 1)
                    if kind not in ("purelib", "platlib"):
                        continue
                target = (destination / name).resolve()
                if not target.is_relative_to(destination.resolve()):
                    raise ValueError("Unsafe wheel path")
                if entry.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    target.write_bytes(archive.read(entry))
    print("Pinned Python dependencies installed.")


if __name__ == "__main__":
    install(Path(__file__).resolve().parents[1])
