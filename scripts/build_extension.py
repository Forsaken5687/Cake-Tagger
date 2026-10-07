"""Build browser packages from an explicit source allowlist."""

import json
import tempfile
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = """src/shared/trusted-event.mjs extension/webext-api.js src/shared/preferences.mjs src/shared/settings-ui.mjs src/shared/messages.mjs model/tags.txt assets/logo.svg
THIRD_PARTY.md scripts/assets.json model/LICENSE.txt model/coverage.json model/provenance.json model/top_tags.txt vendor/LICENSE-ONNX.txt vendor/ThirdPartyNotices.txt
extension/background.js extension/command-relay.mjs extension/popup.html extension/popup.mjs extension/popup.css extension/server-connection.mjs
extension/bridge.html extension/bridge.mjs extension/bridge.css extension/content.js extension/content.css extension/embedded-upload.mjs extension/upload-ui.mjs
src/shared/site-theme.mjs src/shared/message-contract.mjs extension/upload-adapter.mjs extension/_locales/en/messages.json extension/_locales/de/messages.json""".split()


def rename(source, target):
    for attempt in range(20):
        try:
            source.rename(target)
            return
        except PermissionError:
            if attempt == 19:
                raise
            time.sleep(0.1)


def build_extension(target, root=ROOT):
    if target not in ("firefox", "chrome"):
        raise ValueError("Unsupported browser")
    root = Path(root).resolve()
    build = root / "work/extension-build"
    build.mkdir(parents=True, exist_ok=True)
    output = root / (
        "outputs/chrome" if target == "chrome" else "work/extension-build/firefox"
    )
    staging = Path(tempfile.mkdtemp(prefix=target + "-staging-", dir=build))
    files = list(FILES)
    if target == "chrome":
        files += ["extension/chrome-worker.mjs"] + [
            f"assets/logo-{size}.png" for size in (16, 32, 48, 128)
        ]
    manifest = json.loads(
        (
            root
            / (
                "extension/manifest.chrome.json"
                if target == "chrome"
                else "extension/manifest.json"
            )
        ).read_text(encoding="utf-8")
    )
    entries = {
        "manifest.json": json.dumps(manifest, indent=2).encode(),
        "README.md": (root / "docs/BROWSERS.md")
        .read_text(encoding="utf-8")
        .split("## Development")[0]
        .encode("utf-8"),
    }
    for name in files:
        content = (root / name).read_bytes()
        if name == "scripts/assets.json":
            metadata = json.loads(content)
            metadata.pop("development", None)
            content = json.dumps(metadata, indent=2).encode("utf-8")
        elif name == "THIRD_PARTY.md":
            content = "\n\n".join(
                part
                for part in content.decode("utf-8").split("\n\n")
                if not part.startswith("The browser-module test suite uses")
            ).encode("utf-8")
        entries[
            name.removeprefix("extension/")
            if name.startswith("extension/_locales/")
            else name
        ] = content
    archive = root / (
        "work/extension-build/Cake-Tagger-Chrome.zip"
        if target == "chrome"
        else "outputs/Cake-Tagger-Firefox.zip"
    )
    archive.parent.mkdir(parents=True, exist_ok=True)
    temporary = archive.with_suffix(".zip.tmp")
    with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in entries.items():
            z.writestr(name, data)
            dest = staging / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
    temporary.replace(archive)
    previous = None
    if output.exists():
        previous = (
            Path(tempfile.mkdtemp(prefix=target + "-previous-", dir=build)) / "package"
        )
        rename(output, previous)
    try:
        output.parent.mkdir(parents=True, exist_ok=True)
        rename(staging, output)
    except Exception:
        if previous:
            rename(previous, output)
        raise
    return dict(files=list(entries), previous=str(previous) if previous else None)


if __name__ == "__main__":
    import sys

    print(json.dumps(build_extension(sys.argv[1])))
