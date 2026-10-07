import hashlib
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src/server"))
import numpy as np
from cake_tagger.core import FRAME_BYTES, Engine, aggregate, resolve_threads


class CoreTests(unittest.TestCase):
    def test_policy_matches_js(self):
        fixture = json.load(sys.stdin)
        for case in fixture["cases"]:
            actual = aggregate(
                case["scores"],
                fixture["policy"],
                case["threshold"],
                case["coverage"],
                case["excludedTags"],
                case["limitResults"],
            )
            self.assertEqual(actual, case["expected"])

    def test_override_and_checksum(self):
        capabilities = dict(
            recommendedThreads=8, testMaximum=24, queueCapacity=8, logicalProcessors=24
        )
        self.assertEqual(resolve_threads("16", capabilities), 16)
        for value in ["0", "25", "1.5", False, "01"]:
            with self.assertRaises(ValueError):
                resolve_threads(value, capabilities)
        with tempfile.TemporaryDirectory() as folder:
            model = Path(folder) / "model.onnx"
            model.write_bytes(b"fixture")
            with self.assertRaisesRegex(ValueError, "nativeModelChecksum"):
                Engine(model, "0" * 64, {}, capabilities)

    def test_failed_session_recovers(self):
        sessions = []

        class Session:
            def __init__(self, *args, **kwargs):
                self.broken = not sessions
                sessions.append(self)

            def get_inputs(self):
                return [type("Input", (), {"name": "input"})()]

            def run(self, *args):
                if self.broken:
                    raise RuntimeError("synthetic inference failure")
                return [np.zeros((1, 5813), dtype=np.float32)]

        with (
            tempfile.TemporaryDirectory() as folder,
            patch("cake_tagger.core.ort.InferenceSession", Session),
        ):
            model = Path(folder) / "fixture"
            model.write_bytes(b"fixture")
            with Engine(
                model,
                hashlib.sha256(b"fixture").hexdigest(),
                {},
                dict(
                    recommendedThreads=1,
                    testMaximum=1,
                    queueCapacity=1,
                    logicalProcessors=1,
                ),
            ) as engine:
                with self.assertRaisesRegex(RuntimeError, "synthetic"):
                    engine.submit("failed", bytes(FRAME_BYTES)).result(5)
                self.assertEqual(
                    len(
                        engine.submit("recovered", bytes(FRAME_BYTES)).result(5)[
                            "scores"
                        ]
                    ),
                    1,
                )
                self.assertEqual(len(sessions), 2)

    def test_queue_cancel_active_cancel_stop_and_thread_override(self):
        entered, release = threading.Event(), threading.Event()
        options = []

        class Session:
            def __init__(self, model, opts, providers):
                options.append(opts.intra_op_num_threads)

            def get_inputs(self):
                return [type("Input", (), {"name": "input"})()]

            def run(self, *args):
                entered.set()
                release.wait(5)
                return [np.zeros((1, 5813), dtype=np.float32)]

        with (
            tempfile.TemporaryDirectory() as folder,
            patch("cake_tagger.core.ort.InferenceSession", Session),
        ):
            model = Path(folder) / "fixture"
            model.write_bytes(b"fixture")
            engine = Engine(
                model,
                hashlib.sha256(b"fixture").hexdigest(),
                {},
                dict(
                    recommendedThreads=8,
                    testMaximum=24,
                    queueCapacity=1,
                    logicalProcessors=24,
                ),
            )
            payload = bytes(FRAME_BYTES)
            try:
                active = engine.submit(1, payload * 2, "16")
                self.assertTrue(entered.wait(5))
                queued = engine.submit(2, payload, "16")
                with self.assertRaisesRegex(ValueError, "nativeBusy"):
                    engine.submit(3, payload, "16")
                engine.cancel(2)
                with self.assertRaisesRegex(ValueError, "cancelled"):
                    queued.result(5)
                cancelled_future = engine.submit(3, payload, "16")
                self.assertTrue(cancelled_future.cancel())
                self.assertNotIn(3, engine.pending)
                following = engine.submit(4, payload, "16")
                engine.cancel(1)
                release.set()
                with self.assertRaisesRegex(ValueError, "cancelled"):
                    active.result(5)
                result = following.result(5)
                self.assertEqual(result["runtime"]["configuredNativeThreads"], 16)
                self.assertEqual(options, [16])
                entered.clear()
                release.clear()
                stopping = engine.submit(5, payload * 2, "16")
                self.assertTrue(entered.wait(5))
                stop_thread = threading.Thread(target=engine.stop)
                stop_thread.start()
                self.assertTrue(engine.stopping.wait(5))
                self.assertTrue(stop_thread.is_alive())
                release.set()
                stop_thread.join(5)
                self.assertFalse(stop_thread.is_alive())
                with self.assertRaisesRegex(ValueError, "cancelled"):
                    stopping.result(5)
                with self.assertRaisesRegex(ValueError, "stopped"):
                    engine.submit(6, payload, "auto")
            finally:
                release.set()
                engine.stop()


if __name__ == "__main__":
    unittest.main()
