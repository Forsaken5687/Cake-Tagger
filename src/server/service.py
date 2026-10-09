"""Authenticated loopback HTTP adapter for the reusable inference engine.

The listener deliberately cannot be exposed remotely. External deployments
import the core package and supply their own authentication and transport.
"""

import argparse
import hmac
import json
import logging
import mimetypes
import os
import queue
import re
import secrets
import select
import socket
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

from .config import capabilities, load_catalog, normalize_settings
from .core import FRAME_BYTES, Engine, aggregate, resolve_threads
from .metrics import memory_snapshot, process_priority
from .validation import export_item, now, validate_record

logger = logging.getLogger(__name__)

EXTENSION_ORIGIN = re.compile(
    r"(?:moz-extension://[a-f0-9-]{36}|chrome-extension://[a-p]{32})\Z"
)
PUBLIC_FILES = set(
    """src/client/analysis.html src/client/diagnostics.html src/client/app.js
src/client/diagnostics.mjs src/client/i18n.mjs src/client/native-client.mjs
src/client/local-session.mjs src/client/page-bridge.mjs src/client/runtime-metrics.mjs
src/client/sampling.mjs src/client/style.css src/client/auto-analysis.mjs
src/client/integration.mjs src/shared/analysis-settings.mjs src/shared/corrections.mjs
src/shared/messages.mjs src/shared/preferences.mjs src/shared/session-url.mjs
src/shared/tag-policy.mjs src/shared/tagging.mjs src/shared/site-theme.mjs
model/mapping.json model/tags.txt model/provenance.json assets/logo.svg""".split()
)
REVIEW_FILES = set(
    """src/client/review.html src/client/review.mjs src/client/review.css
src/client/review-session.mjs src/shared/evaluation.mjs""".split()
)


def encode(value):
    return json.dumps(
        value, ensure_ascii=False, allow_nan=False, separators=(",", ":")
    ).encode("utf-8")


def atomic_json(path, value):
    """Never truncate the existing settings file on an interrupted write."""
    path = Path(path)
    temporary = path.with_name(path.name + "." + secrets.token_hex(8) + ".tmp")
    try:
        with temporary.open("x", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, allow_nan=False)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


class RequestError(Exception):
    def __init__(self, status, error):
        self.status, self.error = status, error


class LocalService(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False
    request_queue_size = 16

    def __init__(self, root, port=8765, data_dir=None, engine=None):
        self.root = Path(root).resolve()
        self.data = Path(data_dir).resolve() if data_dir else self.root / "data"
        self.data.mkdir(parents=True, exist_ok=True)
        self.tags, self.policy, self.provenance = load_catalog(self.root / "model")
        self.capabilities = capabilities()
        self.settings_file = self.data / "preferences.json"
        self.settings = None
        try:
            self.settings = normalize_settings(
                json.loads(self.settings_file.read_text(encoding="utf-8-sig"))
            )
        except (OSError, ValueError):
            pass
        self.settings_lock = threading.Lock()
        self.download_lock = threading.Lock()
        self.downloads = {}
        self.token = secrets.token_hex(24)
        self.stopping = threading.Event()
        self.connections = set()
        self.connection_lock = threading.Lock()
        self.slots = threading.BoundedSemaphore(16)
        self.engine = engine
        self.engine_lock = threading.Lock()
        self.review_enabled = (self.root / "src/client/review.html").is_file() and (
            self.root / "src/shared/evaluation.mjs"
        ).is_file()
        self.public = PUBLIC_FILES | (REVIEW_FILES if self.review_enabled else set())
        super().__init__(("127.0.0.1", port), Handler)

    def get_engine(self):
        with self.engine_lock:
            if self.stopping.is_set():
                raise ValueError("analysis.stopped")
            if self.engine is None:
                self.engine = Engine(
                    self.root / "model/joytag.onnx",
                    self.provenance["sha256"],
                    self.policy,
                    self.capabilities,
                )
            return self.engine

    def process_request(self, request, address):
        # Bound HTTP readers as well as queued inference payloads.
        if not self.slots.acquire(blocking=False):
            try:
                request.sendall(
                    b"HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"
                )
            finally:
                self.shutdown_request(request)
            return
        with self.connection_lock:
            self.connections.add(request)
        try:
            super().process_request(request, address)
        except Exception:
            with self.connection_lock:
                self.connections.discard(request)
            self.slots.release()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            with self.connection_lock:
                self.connections.discard(request)
            self.slots.release()

    def handle_error(self, *_):
        # Request failures never expose tokens, filenames or a Python traceback.
        pass

    def close_program(self):
        self.shutdown()
        with self.connection_lock:
            for connection in list(self.connections):
                try:
                    connection.shutdown(socket.SHUT_RDWR)
                except OSError:
                    pass
                connection.close()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "CakeTagger"
    sys_version = ""

    def setup(self):
        super().setup()
        self.connection.settimeout(60)
        self.cors = None
        self.stream_started = False

    def log_message(self, *_):
        pass

    def reply(self, status, value=None, headers=None, body=None):
        payload = encode(value) if value is not None else body or b""
        self.send_response(status)
        defaults = {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
            "Content-Length": str(len(payload)),
            "Connection": "close",
        }
        if self.cors:
            defaults.update(
                {"Access-Control-Allow-Origin": self.cors, "Vary": "Origin"}
            )
        defaults.update(headers or {})
        for key, val in defaults.items():
            self.send_header(key, val)
        self.end_headers()
        self.close_connection = True
        if self.command != "HEAD":
            self.wfile.write(payload)
            self.wfile.flush()

    def body(self, maximum, content_type):
        if (
            self.headers.get("Transfer-Encoding") is not None
            or len(self.headers.get_all("Content-Length", [])) != 1
        ):
            raise RequestError(400, "error.invalidAnalysisData")
        if not re.fullmatch("[0-9]+", self.headers["Content-Length"]):
            raise RequestError(400, "error.invalidAnalysisData")
        length_text = self.headers["Content-Length"].lstrip("0") or "0"
        if len(length_text) > len(str(maximum)):
            raise RequestError(413, "error.invalidAnalysisData")
        length = int(length_text)
        if not 0 < length <= maximum:
            raise RequestError(
                413,
                "error.exportIsTooLarge"
                if content_type == "application/json"
                else "error.invalidModelInputImage",
            )
        actual = self.headers.get("Content-Type", "")
        if (
            actual.split(";", 1)[0].strip()
            if content_type == "application/json"
            else actual
        ) != content_type:
            raise RequestError(
                415,
                "error.expectedJson"
                if content_type == "application/json"
                else "error.invalidModelInputImage",
            )
        data = self.rfile.read(length)
        if len(data) != length:
            raise RequestError(400, "error.invalidAnalysisData")
        if content_type == "application/json":
            try:
                return json.loads(
                    data, parse_constant=lambda _: (_ for _ in ()).throw(ValueError())
                )
            except (ValueError, UnicodeError, RecursionError):
                raise RequestError(400, "error.invalidAnalysisData") from None
        return data

    def authenticated(self):
        if len(self.headers.get_all("Authorization", [])) != 1:
            raise RequestError(401, "error.openUsingStart")
        supplied = self.headers.get("Authorization", "")
        if not hmac.compare_digest(
            supplied.encode("utf-8"), ("Bearer " + self.server.token).encode("ascii")
        ):
            raise RequestError(401, "error.openUsingStart")

    def disconnected(self):
        readable, _, _ = select.select([self.connection], [], [], 0)
        if not readable:
            return False
        try:
            return not self.connection.recv(1, socket.MSG_PEEK)
        except OSError:
            return True

    def stream(self, value):
        self.wfile.write(encode(value) + b"\n")
        self.wfile.flush()

    def infer(self, params):
        s = self.server
        parallelism = params.get("parallelism", ["auto"])[0] or "auto"
        try:
            threads = resolve_threads(parallelism, s.capabilities)
        except ValueError as error:
            raise RequestError(400, str(error)) from None
        settings = s.settings or normalize_settings()
        exclusions = settings["excludedTags"]
        try:
            if self.headers.get("X-Cake-Tagger-Exclusions"):
                exclusions = json.loads(self.headers["X-Cake-Tagger-Exclusions"])
            if (
                not isinstance(exclusions, list)
                or len(exclusions) > len(s.tags)
                or any(not isinstance(x, str) or x not in s.tags for x in exclusions)
            ):
                raise ValueError()
        except ValueError:
            raise RequestError(400, "error.invalidAnalysisPolicy") from None
        payload = self.body(48 * FRAME_BYTES, "application/octet-stream")
        if len(payload) % FRAME_BYTES:
            raise RequestError(400, "error.invalidModelInputImage")
        engine = s.get_engine()
        progress = queue.SimpleQueue()
        job_id = secrets.token_hex(16)
        future = engine.submit(
            job_id,
            payload,
            parallelism,
            lambda current, total: progress.put(
                dict(type="progress", current=current, total=total)
            ),
        )
        logger.info(
            "Analysis queued: %d images, %s threads",
            len(payload) // FRAME_BYTES,
            threads,
        )
        self.send_response(200)
        for key, value in {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Connection": "close",
        }.items():
            self.send_header(key, value)
        if self.cors:
            self.send_header("Access-Control-Allow-Origin", self.cors)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.close_connection = True
        self.stream_started = True
        try:
            self.stream(dict(type="state", state="analysis.loadingModel"))
            while not future.done():
                if self.disconnected():
                    engine.cancel(job_id)
                    return
                try:
                    self.stream(progress.get(timeout=0.05))
                except queue.Empty:
                    pass
            while not progress.empty():
                self.stream(progress.get_nowait())
            result = future.result()
            result["analysis"] = aggregate(
                result["scores"], s.policy, excluded_tags=exclusions,
                suggestion_limit=settings["suggestionLimit"],
                uncertain_limit=settings["uncertainLimit"],
            )
            result["runtime"].update(
                memory_snapshot(),
                processPriority=process_priority(),
                processPowerPolicy=engine.power_policy,
            )
            if params.get("raw") != ["1"]:
                result.pop("scores")
            logger.info(
                "Analysis complete: %d images in %.2f s",
                len(payload) // FRAME_BYTES,
                result["timings"]["workerWallSeconds"],
            )
            self.stream(dict(type="done", **result))
        except (BrokenPipeError, ConnectionError, OSError):
            engine.cancel(job_id)
        except Exception as error:
            engine.cancel(job_id)
            key = (
                str(error)
                if str(error).startswith("error.") or str(error) == "analysis.cancelled"
                else "error.nativeInference"
            )
            logger.info("Analysis ended: %s", key)
            self.stream(dict(type="error", error=key))
        finally:
            if not future.done():
                engine.cancel(job_id)

    def dispatch(self):
        s = self.server
        host = f"127.0.0.1:{s.server_port}"
        origin = self.headers.get("Origin")
        extension = bool(EXTENSION_ORIGIN.fullmatch(origin or ""))
        if (
            len(self.headers.get_all("Origin", [])) > 1
            or len(self.headers.get_all("Host", [])) != 1
            or self.headers["Host"] != host
            or origin
            and origin != "http://" + host
            and not extension
        ):
            raise RequestError(403, "error.nativeServer")
        if extension:
            self.cors = origin
        parsed = urlsplit(self.path)
        if parsed.scheme or parsed.netloc:
            raise RequestError(400, "error.invalidAnalysisData")
        requested = unquote(parsed.path, errors="strict")
        params = parse_qs(parsed.query)
        if s.stopping.is_set():
            raise RequestError(503, "analysis.stopped")
        if (
            self.command == "OPTIONS"
            and extension
            and requested
            in ("/api/connect", "/api/settings", "/api/capabilities", "/api/stop")
        ):
            return self.reply(
                204,
                headers={
                    "Access-Control-Allow-Methods": "GET, POST",
                    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Cake-Tagger-Client",
                },
            )
        if requested == "/api/connect" and self.command == "POST":
            client = self.headers.get("X-Cake-Tagger-Client")
            if not (
                client == "local"
                and origin == "http://" + host
                or client == "extension"
                and (not origin or extension)
            ):
                raise RequestError(403, "error.nativeServer")
            return self.reply(200, dict(token=s.token))
        if requested.startswith("/api/download/") and self.command == "GET":
            with s.download_lock:
                item = s.downloads.get(requested)
                if not item or item["expires"] < time.monotonic():
                    s.downloads.pop(requested, None)
                    raise RequestError(404, "error.downloadExpired")
                data = item["data"]
                filename = item["filename"]
            return self.reply(
                200,
                body=data,
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )
        if requested.startswith("/api/"):
            self.authenticated()
            if requested == "/api/infer" and self.command == "POST":
                return self.infer(params)
            if requested == "/api/status" and self.command == "GET":
                return self.reply(
                    200,
                    dict(app="cake-tagger-browser-v1", backendImplementation="python"),
                )
            if requested == "/api/runtime" and self.command == "GET":
                return self.reply(200, memory_snapshot())
            if requested == "/api/capabilities" and self.command == "GET":
                return self.reply(200, s.capabilities)
            if requested == "/api/settings":
                if self.command == "GET":
                    return self.reply(
                        200,
                        dict(
                            settings=s.settings or normalize_settings(),
                            initialized=s.settings is not None,
                        ),
                    )
                if self.command == "POST":
                    try:
                        value = self.body(32768, "application/json")
                        if not isinstance(value, dict) or not isinstance(
                            value.get("settings"), dict
                        ):
                            raise ValueError()
                        settings = normalize_settings(value["settings"])
                        settings["excludedTags"] = [
                            x for x in settings["excludedTags"] if x in s.tags
                        ]
                        resolve_threads(settings["parallelism"], s.capabilities)
                        with s.settings_lock:
                            atomic_json(s.settings_file, settings)
                            s.settings = settings
                        return self.reply(200, dict(settings=settings))
                    except (ValueError, OSError):
                        raise RequestError(400, "error.settingsSave") from None
            if requested == "/api/export" and self.command == "POST":
                review = params.get("evaluation") == ["1"]
                if review and not s.review_enabled:
                    raise RequestError(404, "error.noValidResults")
                try:
                    value = self.body(
                        64000000 if review else 16000000, "application/json"
                    )
                    if (
                        not isinstance(value, dict)
                        or not isinstance(value.get("items"), list)
                        or not 0 < len(value["items"]) <= 10000
                    ):
                        raise ValueError("error.noValidResults")
                    items = [
                        export_item(validate_record(item, s.tags))
                        for item in value["items"]
                    ]
                    extra = {}
                    if review:
                        from .review import review_export

                        extra = review_export(
                            value.get("evaluation"), items, s.policy, s.tags
                        )
                    snapshot = encode(
                        dict(
                            dict(
                                version=2,
                                source="cake-tagger-review"
                                if review
                                else "cake-tagger-local",
                                createdAt=now(),
                                items=items,
                            ),
                            **extra,
                        )
                    )
                    path = "/api/download/" + secrets.token_hex(24)
                    with s.download_lock:
                        for key in list(s.downloads):
                            if s.downloads[key]["expires"] < time.monotonic():
                                del s.downloads[key]
                        while len(s.downloads) >= 3:
                            del s.downloads[next(iter(s.downloads))]
                        s.downloads[path] = dict(
                            data=snapshot,
                            filename="cake-tag-review.json"
                            if review
                            else "cake-tags.json",
                            expires=time.monotonic() + 300,
                        )
                    return self.reply(200, dict(download=path))
                except (ValueError, TypeError, KeyError, RecursionError) as error:
                    raise RequestError(
                        400,
                        str(error)
                        if str(error).startswith(("error.", "review."))
                        else "error.invalidAnalysisData",
                    ) from None
            if requested == "/api/stop" and self.command == "POST":
                logger.info("Shutdown requested from the browser")
                s.stopping.set()
                try:
                    with s.engine_lock:
                        if s.engine:
                            s.engine.stop()
                except Exception:
                    s.stopping.clear()
                    raise RequestError(500, "error.stopFailed") from None
                try:
                    self.reply(200, dict(stopped=True))
                finally:
                    threading.Thread(
                        target=s.close_program, name="cake-shutdown"
                    ).start()
                return
            raise RequestError(
                404
                if requested
                not in (
                    "/api/settings",
                    "/api/infer",
                    "/api/status",
                    "/api/runtime",
                    "/api/capabilities",
                    "/api/stop",
                    "/api/export",
                )
                else 405,
                "error.requestFailed",
            )
        if self.command not in ("GET", "HEAD"):
            raise RequestError(405, "error.requestFailed")
        if requested in ("/", "/index.html"):
            return self.reply(302, headers={"Location": "https://cake.ski/"})
        aliases = {
            "/analysis.html": "src/client/analysis.html",
            "/diagnostics.html": "src/client/diagnostics.html",
        }
        if s.review_enabled:
            aliases["/review.html"] = "src/client/review.html"
        relative = aliases.get(requested, requested[1:])
        if relative not in s.public:
            raise RequestError(404, "error.requestFailed")
        file = (s.root / relative).resolve()
        if not file.is_relative_to(s.root) or not file.is_file():
            raise RequestError(404, "error.requestFailed")
        bridge = params.get("bridgeOrigin", [""])[0]
        ancestors = (
            bridge + " https://cake.ski"
            if params.get("integration") == ["1"]
            and params.get("embedded") == ["1"]
            and EXTENSION_ORIGIN.fullmatch(bridge)
            else "'none'"
        )
        mime = {
            ".mjs": "text/javascript",
            ".js": "text/javascript",
            ".svg": "image/svg+xml",
        }.get(file.suffix, mimetypes.guess_type(file)[0] or "application/octet-stream")
        return self.reply(
            200,
            body=file.read_bytes(),
            headers={
                "Content-Type": mime + "; charset=utf-8",
                "Content-Security-Policy": "default-src 'self'; script-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; connect-src 'self'; style-src 'self'; frame-ancestors "
                + ancestors
                + "; base-uri 'none'; object-src 'none'",
            },
        )

    def handle_request(self):
        try:
            self.dispatch()
        except RequestError as error:
            self.reply(error.status, dict(error=error.error))
        except (BrokenPipeError, ConnectionError, OSError):
            pass
        except ValueError as error:
            if not self.stream_started:
                self.reply(
                    500,
                    dict(
                        error=str(error)
                        if str(error).startswith(("error.", "analysis."))
                        else "error.nativeInference"
                    ),
                )
        except Exception:
            if not self.stream_started:
                self.reply(500, dict(error="error.nativeInference"))

    do_GET = do_POST = do_HEAD = do_OPTIONS = do_PUT = do_DELETE = do_PATCH = (
        handle_request
    )


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Start the authenticated Cake Tagger loopback service."
    )
    parser.add_argument(
        "--root", type=Path, default=Path(__file__).resolve().parents[2]
    )
    parser.add_argument(
        "--port", type=int, default=int(os.environ.get("CAKE_TAGGER_PORT", "8765"))
    )
    parser.add_argument("--data-dir", type=Path)
    parser.add_argument(
        "--quiet", action="store_true", help="Suppress operational console logs"
    )
    parser.add_argument(
        "--open-review", action="store_true", help="Open the development review page"
    )
    args = parser.parse_args(argv)
    if not args.quiet:
        logging.basicConfig(
            level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%H:%M:%S"
        )
    if not 0 <= args.port <= 65535:
        parser.error("Port must be between 0 and 65535")
    server = LocalService(args.root, args.port, args.data_dir)
    atomic_json(
        server.data / "session.json",
        dict(
            url=f"http://127.0.0.1:{server.server_port}/#{server.token}",
            pid=os.getpid(),
        ),
    )
    print("Cake Tagger is ready.", flush=True)
    logger.info("Local backend: http://127.0.0.1:%d", server.server_port)
    logger.info("Keep this terminal open. Press Ctrl+C or use Quit to stop.")
    if args.open_review and server.review_enabled:
        webbrowser.open(f"http://127.0.0.1:{server.server_port}/review.html")
    try:
        server.serve_forever(poll_interval=0.05)
    except KeyboardInterrupt:
        logger.info("Stopping; waiting for the current inference call to finish...")
    finally:
        server.stopping.set()
        if server.engine:
            server.engine.stop()
        server.server_close()
        with server.connection_lock:
            for connection in list(server.connections):
                connection.close()
        # Remove only this process's session; never delete another running service's token.
        try:
            if (
                json.loads((server.data / "session.json").read_text())["pid"]
                == os.getpid()
            ):
                (server.data / "session.json").unlink()
        except (OSError, ValueError, KeyError):
            pass
        logger.info("Cake Tagger stopped.")


if __name__ == "__main__":
    main()
