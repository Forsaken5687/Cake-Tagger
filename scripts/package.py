"""Package the runtime release and the reusable Python source distribution."""

import hashlib
import json
import subprocess
import zipfile
from pathlib import Path

from build_extension import build_extension

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
        text = text.split("## Tools")[0]
        text += "Development commands and test instructions are provided in the full source checkout.\n"
    return text


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
    binaries = [asset["path"] for asset in manifest["assets"]] + [runtime["path"]]
    for wheel in manifest["python"]["wheels"]:
        name = "runtime/archives/" + wheel["file"]
        verified(root / name, wheel["sha256"])
        binaries.append(name)
    for target in ("firefox", "chrome"):
        build_extension(target, root)
    output = root / "outputs/Cake-Tagger.zip"
    temporary = output.with_suffix(".zip.tmp")
    with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED) as archive:
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
    # External integrations receive the package and catalog, never private data or a runtime.
    core = root / "outputs/Cake-Tagger-Python-Core.zip"
    core_files = [
        "pyproject.toml",
        "docs/PYTHON.md",
        "THIRD_PARTY.md",
        "scripts/python-requirements.txt",
        "scripts/assets.json",
        "vendor/LICENSE-ONNX.txt",
        "vendor/ThirdPartyNotices.txt",
        "model/LICENSE.txt",
        "model/provenance.json",
        "model/mapping.json",
        "model/policy.json",
        "model/tags.txt",
        "model/top_tags.txt",
    ]
    core_files += [
        p.relative_to(root).as_posix()
        for p in (root / "src/server/cake_tagger").glob("*.py")
    ]
    with zipfile.ZipFile(core, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "README.md",
            "# Cake Tagger Python core\n\nSee [Python integration](docs/PYTHON.md) for installation, model requirements and usage. Model weights and the portable Windows runtime are distributed separately.\n",
        )
        for name in core_files:
            if name in (
                "THIRD_PARTY.md",
                "docs/PYTHON.md",
                "docs/BROWSERS.md",
                "docs/INTEGRATION.md",
                "scripts/assets.json",
            ):
                archive.writestr(name, distribution_text(root, name))
            else:
                archive.write(root / name, name)
    print("Packages created in outputs/.")


if __name__ == "__main__":
    package()
