"""Package the runtime release with both browser extensions."""

import hashlib
import json
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

from build_extension import build_extension
from build_launcher import build_launcher
from install_runtime import install

ROOT = Path(__file__).resolve().parents[1]


def verified(path, expected):
    with path.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != expected:
            raise ValueError("Dependency checksum mismatch: " + path.name)


def distribution_text(root, name):
    """Keep source-only commands and notices out of end-user distributions."""
    text = (root / name).read_text(encoding="utf-8")
    if name == "scripts/assets.json":
        manifest = json.loads(text)
        manifest.pop("development", None)
        return json.dumps(manifest, indent=2) + "\n"
    if name in ("docs/BROWSERS.md", "docs/INTEGRATION.md"):
        text = text.replace(
            "[testing](TESTING.md)", "the source checkout's test documentation"
        )
    if name == "docs/BROWSERS.md":
        text = text.split("## Development")[0]
    if name == "THIRD_PARTY.md":
        text = "\n\n".join(
            part
            for part in text.split("\n\n")
            if not part.startswith("The browser-module test suite uses")
        )
    elif name == "docs/PYTHON.md":
        sections = text.split("## Tools", 1)
        text = sections[0]
        if len(sections) == 2 and "## Logging and lifecycle" in sections[1]:
            text += (
                "## Logging and lifecycle"
                + sections[1].split("## Logging and lifecycle", 1)[1]
            )
        text += "Development commands and test instructions are provided in the full source checkout.\n"
    return text


def prepare_runtime(root, destination):
    """Assemble a clean release interpreter from verified upstream artifacts."""
    root, destination = Path(root).resolve(), Path(destination).resolve()
    manifest = json.loads((root / "scripts/assets.json").read_text(encoding="utf-8"))
    runtime = manifest["python"]["runtime"]
    verified(root / runtime["path"], runtime["sha256"])
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(root / runtime["path"]) as archive:
        for entry in archive.infolist():
            target = (destination / entry.filename).resolve()
            if not target.is_relative_to(destination):
                raise ValueError("Unsafe interpreter path")
            if entry.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(entry))
    install(root, destination / "Lib/site-packages")
    (destination / "python313._pth").write_text(
        "python313.zip\n.\nLib/site-packages\n../src\n../scripts\nimport site\n",
        encoding="utf-8",
    )


def package(root=ROOT):
    root = Path(root).resolve()
    manifest = json.loads((root / "scripts/assets.json").read_text())
    release = json.loads((root / "scripts/release-files.json").read_text())
    tracked = set(
        subprocess.check_output(
            [
                "git",
                "-c",
                "core.quotepath=false",
                "ls-files",
                "--cached",
                "--others",
                "--exclude-standard",
            ],
            cwd=root,
            text=True,
        ).splitlines()
    )
    files = release["files"]
    for name in files:
        if (
            name not in tracked
            or name.startswith(("work/", "data/", "outputs/", "tests/", "extension/"))
            or ".." in Path(name).parts
            or Path(name).is_absolute()
        ):
            raise ValueError("Invalid release file: " + name)
    for asset in manifest["assets"]:
        verified(root / asset["path"], asset["sha256"])
    runtime = manifest["python"]["runtime"]
    verified(root / runtime["path"], runtime["sha256"])
    binaries = [asset["path"] for asset in manifest["assets"]]
    for wheel in manifest["python"]["wheels"]:
        name = "runtime/archives/" + wheel["file"]
        verified(root / name, wheel["sha256"])
    for target in ("firefox", "chrome"):
        build_extension(target, root)
    launcher = build_launcher(root)
    output = root / "outputs/Cake-Tagger.zip"
    temporary = output.with_suffix(".zip.tmp")
    with (
        tempfile.TemporaryDirectory(prefix="release-runtime-", dir=root / "work") as staging,
        zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as archive,
    ):
        archive.write(launcher, "Cake-Tagger/Cake-Tagger.exe")
        runtime_directory = Path(staging) / "runtime"
        prepare_runtime(root, runtime_directory)
        for path in sorted(runtime_directory.rglob("*")):
            if path.is_file():
                archive.write(path, "Cake-Tagger/runtime/" + path.relative_to(runtime_directory).as_posix())
        for name in sorted(set(files + binaries)):
            if name == "README.md":
                text = (root / name).read_text(encoding="utf-8")
                text = text.split("## Development")[0]
                text += "## Further reading\n\nSee [architecture](docs/TECHNICAL.md), [integration](docs/INTEGRATION.md) and [Python integration](docs/PYTHON.md). Development tools and tests are available in the source checkout.\n"
                archive.writestr("Cake-Tagger/README.md", text)
            elif name in (
                "THIRD_PARTY.md",
                "docs/PYTHON.md",
                "docs/BROWSERS.md",
                "docs/INTEGRATION.md",
                "scripts/assets.json",
            ):
                archive.writestr("Cake-Tagger/" + name, distribution_text(root, name))
            else:
                archive.write(root / name, "Cake-Tagger/" + name)
        archive.write(
            root / "outputs/Cake-Tagger-Firefox.zip",
            "Cake-Tagger/extensions/Cake-Tagger-Firefox.zip",
        )
        with zipfile.ZipFile(
            root / "work/extension-build/Cake-Tagger-Chrome.zip"
        ) as chrome:
            for entry in chrome.infolist():
                archive.writestr(
                    "Cake-Tagger/extensions/chrome/" + entry.filename,
                    chrome.read(entry),
                )
    temporary.replace(output)
    shutil.copyfile(
        root / "work/extension-build/Cake-Tagger-Chrome.zip",
        root / "outputs/Cake-Tagger-Chrome.zip",
    )
    packages = [
        output, root / "outputs/Cake-Tagger-Chrome.zip",
        root / "outputs/Cake-Tagger-Firefox.zip",
    ]
    checksums = []
    for path in packages:
        with path.open("rb") as stream:
            checksums.append(hashlib.file_digest(stream, "sha256").hexdigest() + "  " + path.name)
    (root / "outputs/SHA256SUMS.txt").write_text("\n".join(checksums) + "\n", encoding="utf-8")
    print("Packages created in outputs/.")


if __name__ == "__main__":
    package()
