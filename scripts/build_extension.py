"""Build browser packages from an explicit source allowlist."""

import json
import posixpath
import re
import tempfile
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = """src/shared/trusted-event.mjs extension/webext-api.js src/shared/preferences.mjs src/shared/settings-ui.mjs src/shared/messages.mjs model/tags.txt model/LICENSE.txt
extension/background.js extension/command-relay.mjs extension/popup.html extension/popup.mjs extension/popup.css extension/server-connection.mjs
extension/bridge.html extension/bridge.mjs extension/bridge.css extension/content.js extension/content.css extension/embedded-upload.mjs extension/upload-ui.mjs
src/shared/site-theme.mjs src/shared/message-contract.mjs extension/upload-adapter.mjs extension/_locales/en/messages.json extension/_locales/de/messages.json""".split()


def package_path(source):
    """Keep source layout separate from the browser's deployable resources."""
    if source.startswith("extension/_locales/"):
        return source.removeprefix("extension/")
    if source.startswith(("extension/", "src/shared/")):
        return "app/" + posixpath.basename(source)
    if source == "model/tags.txt":
        return "assets/tags.txt"
    if source == "model/LICENSE.txt":
        return "licenses/JoyTag.txt"
    return source


# Both browser entry points also appear in sender-origin comparisons.
PATHS = {name: package_path(name) for name in FILES + ["extension/chrome-worker.mjs", "assets/logo.svg"]}


def relocate_manifest(value):
    if isinstance(value, dict):
        return {key: relocate_manifest(item) for key, item in value.items()}
    if isinstance(value, list):
        return [relocate_manifest(item) for item in value]
    return PATHS.get(value, value) if isinstance(value, str) else value


def relocate_text(source, content):
    """Rewrite exact resource literals and imports against the output location."""
    destination = package_path(source)

    def replace(match):
        quote, literal = match.group(1), match.group(2)
        if literal in PATHS:
            resolved = PATHS[literal]
        else:
            dependency = posixpath.normpath(posixpath.join(posixpath.dirname(source), literal))
            if dependency not in PATHS:
                return match.group(0)
            resolved = posixpath.relpath(PATHS[dependency], posixpath.dirname(destination))
            if not resolved.startswith("."):
                resolved = "./" + resolved
        return quote + resolved + quote

    return re.sub(r"(['\"])([^'\"\r\n]+)\1", replace, content)


EXTENSION_NOTICES = """# Extension notices

Cake Tagger is an independent project and is not an official cake.ski application.
This document does not grant an additional license for the project's source code.

The upstream JoyTag license is retained unchanged in `licenses/JoyTag.txt`.
Source: https://github.com/fpgaminer/joytag
Model provenance and backend dependency notices accompany the separate local application.
"""


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
    if target == "firefox":
        files.append("assets/logo.svg")
    manifest = relocate_manifest(json.loads(
        (
            root
            / (
                "extension/manifest.chrome.json"
                if target == "chrome"
                else "extension/manifest.json"
            )
        ).read_text(encoding="utf-8")
    ))
    entries = {
        "manifest.json": json.dumps(manifest, indent=2).encode(),
        "THIRD_PARTY.md": EXTENSION_NOTICES.encode("utf-8"),
        "README.md": (root / "docs/BROWSERS.md")
        .read_text(encoding="utf-8")
        .split("## Development")[0]
        .encode("utf-8"),
    }
    for name in files:
        destination = package_path(name)
        if destination in entries:
            raise ValueError("Duplicate extension resource: " + destination)
        content = (root / name).read_bytes()
        if Path(name).suffix in (".js", ".mjs", ".html", ".css"):
            content = relocate_text(name, content.decode("utf-8")).encode("utf-8")
        entries[destination] = content
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
