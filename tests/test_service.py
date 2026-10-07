"""HTTP hardening, disconnected shutdown and validation regression tests."""

import copy
import http.client
import json
import socket
import tempfile
import threading
import time
import unittest
from pathlib import Path

from server.config import capabilities, load_catalog, normalize_settings
from server.review import review_export
from server.service import LocalService
from server.validation import export_item, validate_record

ROOT = Path(__file__).resolve().parents[1]


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.service = LocalService(ROOT, 0, self.folder.name)
        self.worker = threading.Thread(
            target=self.service.serve_forever, kwargs={"poll_interval": 0.01}
        )
        self.worker.start()
        self.port = self.service.server_port

    def tearDown(self):
        if self.worker.is_alive():
            self.service.shutdown()
        self.worker.join(5)
        self.service.server_close()
        self.folder.cleanup()

    def request(self, path="/api/status", method="GET", headers=None, body=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        connection.request(
            method,
            path,
            body,
            headers or {"Authorization": "Bearer " + self.service.token},
        )
        response = connection.getresponse()
        data = response.read()
        connection.close()
        return response.status, data, response.headers

    def raw(self, data):
        with socket.create_connection(
            ("127.0.0.1", self.port), timeout=5
        ) as connection:
            connection.sendall(data)
            return connection.recv(65536)

    def test_origin_host_cors_and_auth(self):
        auth = {"Authorization": "Bearer " + self.service.token}
        for origin in ("null", "https://cake.ski", "https://example.com"):
            self.assertEqual(self.request(headers=dict(auth, Origin=origin))[0], 403)
        self.assertEqual(
            self.request(headers=dict(auth, Host="localhost:" + str(self.port)))[0], 403
        )
        self.assertEqual(
            self.request(headers={"Authorization": "Bearer " + "b" * 48})[0], 401
        )
        status, data, _ = self.request(
            "/api/connect",
            "POST",
            {
                "Origin": f"http://127.0.0.1:{self.port}",
                "X-Cake-Tagger-Client": "local",
            },
        )
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(data)["token"], self.service.token)
        extension = "moz-extension://12345678-1234-1234-1234-123456789abc"
        self.assertEqual(
            self.request("/api/connect", "OPTIONS", {"Origin": extension})[0], 204
        )
        self.assertEqual(
            self.request("/api/infer", "OPTIONS", {"Origin": "https://cake.ski"})[0],
            403,
        )

    def test_private_files_and_embedding(self):
        for path in (
            "/data/session.json",
            "/model/joytag.onnx",
            "/src/server/service.py",
            "/.git/config",
            "/model/%2e%2e/data/session.json",
        ):
            self.assertEqual(self.request(path)[0], 404)
        origin = "chrome-extension://" + "a" * 32
        status, _, headers = self.request(
            "/analysis.html?integration=1&embedded=1&bridgeOrigin=" + origin
        )
        self.assertEqual(status, 200)
        self.assertIn(origin + " https://cake.ski", headers["Content-Security-Policy"])
        self.assertIn(
            "frame-ancestors 'none'",
            self.request(
                "/analysis.html?integration=1&embedded=1&bridgeOrigin=https://example.com"
            )[2]["Content-Security-Policy"],
        )

    def test_ambiguous_and_oversized_request_framing(self):
        prefix = f"POST /api/settings HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\nAuthorization: Bearer {self.service.token}\r\nContent-Type: application/json\r\n"
        for suffix in [
            "Content-Length: 2\r\nContent-Length: 2\r\n\r\n{}",
            "Transfer-Encoding: chunked\r\n\r\n0\r\n\r\n",
            "Content-Length: -1\r\n\r\n",
            "Content-Length: 99999999\r\n\r\n",
        ]:
            response = self.raw((prefix + suffix).encode())
            self.assertRegex(response, rb"HTTP/1.1 (400|413) ")

    def test_quit_disconnect_still_stops(self):
        entered = threading.Event()
        release = threading.Event()

        class Engine:
            def stop(self):
                entered.set()
                release.wait(5)

        self.service.engine = Engine()
        connection = socket.create_connection(("127.0.0.1", self.port))
        connection.sendall(
            f"POST /api/stop HTTP/1.1\r\nHost: 127.0.0.1:{self.port}\r\nAuthorization: Bearer {self.service.token}\r\nContent-Length: 0\r\n\r\n".encode()
        )
        self.assertTrue(entered.wait(5))
        connection.close()
        release.set()
        self.worker.join(5)
        self.assertFalse(self.worker.is_alive())
        self.assertTrue(self.service.stopping.is_set())

    def test_snapshot_expiry_and_bounded_http_readers(self):
        self.service.downloads["/api/download/" + "a" * 48] = dict(
            expires=time.monotonic() - 1, data=b"{}", filename="cake-tags.json"
        )
        self.assertEqual(self.request("/api/download/" + "a" * 48)[0], 404)
        self.assertEqual(len(self.service.downloads), 0)
        held = []
        try:
            for _ in range(16):
                held.append(socket.create_connection(("127.0.0.1", self.port)))
            for _ in range(100):
                if len(self.service.connections) >= 16:
                    break
                time.sleep(0.005)
            with socket.create_connection(
                ("127.0.0.1", self.port), timeout=2
            ) as excess:
                self.assertIn(b"503", excess.recv(1024))
        finally:
            for connection in held:
                connection.close()


class ValidationTests(unittest.TestCase):
    def setUp(self):
        self.tags, self.policy, _ = load_catalog(ROOT / "model")
        self.record = dict(
            filename="synthetic.mp4",
            sha256="a" * 64,
            tags=["tattoos"],
            candidateTags=["tattoos", "glasses"],
            reviewed=True,
            originalSuggestionsKnown=True,
            tagSources={"tattoos": "manual", "glasses": "suggestion"},
            updatedAt="2026-01-01T00:00:00Z",
            result=dict(
                sha256="a" * 64,
                tags=[dict(tag="glasses", confidence=0.8, supportingFrames=2)],
                uncertain=["tattoos"],
                uncertainScores=[
                    dict(tag="tattoos", confidence=0.6, supportingFrames=0)
                ],
                sampledFrames=2,
                threshold=0.4,
                model="JoyTag-FP32",
                analysisPolicy="coverage-v6:majority:[]",
                durationSeconds=10,
            ),
        )

    def test_corrections_and_sources_survive(self):
        item = export_item(validate_record(self.record, self.tags))
        self.assertEqual(item["tags"], ["tattoos"])
        self.assertEqual(item["removedTags"], ["glasses"])
        self.assertEqual(item["addedTags"], ["tattoos"])
        self.assertEqual(item["tagSources"]["tattoos"], "manual")
        self.assertEqual(item["uncertainScores"][0]["supportingFrames"], 0)
        with self.subTest("unknown originals"):
            self.record["originalSuggestionsKnown"] = False
            self.record.pop("tagSources")
            self.assertIsNone(
                export_item(validate_record(self.record, self.tags))[
                    "originalSuggestions"
                ]
            )

    def test_bad_export_metadata(self):
        for field, value in [
            ("sampledFrames", True),
            ("sampledFrames", 49),
            ("durationSeconds", 601),
            ("threshold", float("nan")),
            ("analysisPolicy", "bad"),
            ("tags", [dict(tag="tattoos", confidence=0.8, supportingFrames=3)]),
        ]:
            item = copy.deepcopy(self.record)
            item["result"][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate_record(item, self.tags)
        for sources in [[], {"tattoos": "bogus"}, {"__proto__": "manual"}]:
            item = copy.deepcopy(self.record)
            item["tagSources"] = sources
            with self.assertRaises(ValueError):
                validate_record(item, self.tags)

    def test_review_validation_and_compound_rules(self):
        item = export_item(validate_record(self.record, self.tags))
        scores = [[0.9] * 5813 for _ in range(2)]
        evaluation = dict(
            comparisonRules=dict(
                threshold=0.5, coverage=0.5, excludedTags=[], tagRules={}
            ),
            videos=[
                dict(
                    sha256=item["sha256"],
                    modelScores=scores,
                    timestamps=[1, 2],
                    ignoredTags=["glasses"],
                    partition="holdout",
                )
            ],
        )
        result = review_export(evaluation, [item], self.policy, self.tags)
        self.assertEqual(result["items"][0]["evaluation"]["partition"], "holdout")
        evaluation["videos"][0]["timestamps"] = [2, 1]
        with self.assertRaises(ValueError):
            review_export(evaluation, [item], self.policy, self.tags)

    def test_thread_policy_and_settings(self):
        self.assertEqual(capabilities(24)["recommendedThreads"], 8)
        self.assertEqual(capabilities(24)["testMaximum"], 24)
        self.assertEqual(
            normalize_settings(dict(parallelism="16", hideSiteAI=True))["parallelism"],
            "16",
        )
        self.assertEqual(
            normalize_settings(dict(parallelism=True))["parallelism"], "auto"
        )


if __name__ == "__main__":
    unittest.main()
