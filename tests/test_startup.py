"""Launcher verification, dependency integrity and CLI lifecycle checks."""

import hashlib
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from setup import restore
from start import running

from server.service import LocalService, main

ROOT = Path(__file__).resolve().parents[1]


class StartupTests(unittest.TestCase):
    def test_bootstrap_matches_pinned_runtime(self):
        runtime = json.loads((ROOT / "scripts/assets.json").read_text())["python"][
            "runtime"
        ]
        bootstrap = (ROOT / "scripts/launch.cmd").read_text()
        self.assertIn(runtime["sha256"], bootstrap)
        self.assertIn(runtime["url"], bootstrap)
        self.assertLess(bootstrap.index("certutil.exe"), bootstrap.index("tar.exe"))
        self.assertFalse(list((ROOT / "scripts").glob("*.ps1")))

    def test_rejected_download_preserves_existing_file(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            old = root / "fixture"
            old.write_bytes(b"existing")
            asset = dict(
                path="fixture",
                url="https://example.invalid/file",
                sha256=hashlib.sha256(b"expected").hexdigest(),
            )
            response = io.BytesIO(b"wrong")
            response.url = asset["url"]
            with patch("setup.urllib.request.urlopen", return_value=response):
                with self.assertRaisesRegex(ValueError, "checksum"):
                    restore(asset, root)
            self.assertEqual(old.read_bytes(), b"existing")
            self.assertEqual(list(root.iterdir()), [old])
            with self.assertRaisesRegex(ValueError, "outside"):
                restore(dict(asset, path="../escape"), root)

    def test_existing_service_requires_valid_local_session(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "data").mkdir()
            state = root / "data/session.json"
            state.write_text(
                json.dumps(dict(url="http://example.invalid/#" + "a" * 48))
            )
            with patch("start.urllib.request.urlopen") as request:
                self.assertFalse(running(root))
                request.assert_not_called()
            for invalid in (None, [], 1, {"url": None}, {"url": 42}):
                state.write_text(json.dumps(invalid))
                self.assertFalse(running(root))
            state.write_text(json.dumps(dict(url="http://127.0.0.1:8765/#" + "a" * 48)))
            response = io.BytesIO(
                json.dumps(
                    dict(app="cake-tagger-browser-v1", backendImplementation="python")
                ).encode()
            )
            with patch("start.urllib.request.urlopen", return_value=response):
                self.assertTrue(running(root))

    def test_import_has_no_logging_or_terminal_side_effects(self):
        code = "import logging; before=list(logging.getLogger().handlers); import server.service; assert logging.getLogger().handlers == before"
        result = subprocess.run(
            [sys.executable, "-c", code], capture_output=True, text=True
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout + result.stderr, "")

    def test_keyboard_interrupt_stops_engine_and_removes_owned_session(self):
        class Engine:
            stopped = False

            def stop(self):
                self.stopped = True

        engine = Engine()
        with tempfile.TemporaryDirectory() as folder:
            service = LocalService(ROOT, 0, folder, engine=engine)
            with (
                patch("server.service.LocalService", return_value=service),
                patch.object(service, "serve_forever", side_effect=KeyboardInterrupt),
            ):
                main(
                    [
                        "--root",
                        str(ROOT),
                        "--port",
                        "0",
                        "--data-dir",
                        folder,
                        "--quiet",
                    ]
                )
            self.assertTrue(engine.stopped)
            self.assertTrue(service.stopping.is_set())
            self.assertFalse((Path(folder) / "session.json").exists())

    def test_partial_interpreter_bootstrap_recovers_offline(self):
        import os
        import shutil

        with tempfile.TemporaryDirectory(dir=ROOT / "work") as folder:
            root = Path(folder)
            (root / "scripts").mkdir()
            (root / "runtime/cpython").mkdir(parents=True)
            (root / "runtime/archives").mkdir()
            shutil.copyfile(ROOT / "scripts/launch.cmd", root / "scripts/launch.cmd")
            shutil.copyfile(
                ROOT / "runtime/cpython/python.exe", root / "runtime/cpython/python.exe"
            )
            (root / "scripts/start.py").write_text('print("bootstrap-ok")')
            runtime = json.loads((ROOT / "scripts/assets.json").read_text())["python"][
                "runtime"
            ]
            os.link(ROOT / runtime["path"], root / runtime["path"])
            result = subprocess.run(
                ["cmd.exe", "/d", "/c", "scripts\\launch.cmd start"],
                cwd=root,
                capture_output=True,
                text=True,
                timeout=30,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn("bootstrap-ok", result.stdout)

    def test_start_prepares_missing_dependencies_before_serving(self):
        from start import main as start_main

        steps = []
        with (
            patch("sys.argv", ["start.py", "--port", "8799"]),
            patch("start.running", return_value=False),
            patch("start.socket.socket"),
            patch("start.ready", return_value=False),
            patch("start.setup", side_effect=lambda: steps.append("setup")),
            patch(
                "server.service.main", side_effect=lambda args: steps.append("serve")
            ),
        ):
            start_main()
        self.assertEqual(steps, ["setup", "serve"])
        self.assertFalse((ROOT / "Setup.cmd").exists())
