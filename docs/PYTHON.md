# Python integration

The complete backend uses Python. The reusable package is `server`, under `src/server/`; the local HTTP service is an optional adapter. Windows releases bundle isolated CPython 3.13.16 and pinned CPU dependencies. Run `Start.cmd`; it prepares missing local dependencies automatically.

## Use from another Python application

From a source checkout, create a dedicated Python 3.13+ environment and install the package with `python -m pip install .`. Model weights are distributed separately; obtain the pinned artifact from `scripts/assets.json` and retain its license. The Windows release lock is `scripts/python-requirements.txt`; other platforms require their own verified dependency lock.

```python
from server import create_engine
from server.core import aggregate

# catalog/ contains tags.txt, mapping.json, policy.json and provenance.json.
# rgba contains 1ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“48 packed 448 x 448 RGBA frames in chronological order.
with create_engine("catalog", model_file="joytag.onnx") as engine:
    future = engine.submit("unique-job-id", rgba, parallelism="auto")
    result = future.result()
    suggestions = aggregate(result["scores"], engine.policy,
                            excluded_tags=["hairy", "watermark"])
```

Use unique job IDs within each engine. `cancel(job_id)` cancels queued or active work between native calls. `stop()` cancels unfinished work and joins the inference worker. Always stop the owned engine or use a context manager. One application should share one engine rather than create a model session per request. Progress and completion callbacks run on the inference thread and should return promptly. Calling `stop()` from that worker signals shutdown; another thread must join it if synchronous completion is required.

The core has no HTTP, browser, settings-file or site dependency. It validates input dimensions/counts, model checksum and CPU overrides. The caller owns decoding, preprocessing compatibility, request authentication and admission limits outside the engine. Never accept arbitrary model paths or deserialize untrusted model artifacts from remote clients.

## External deployment

Import the package into the site's existing backend and expose a separately authenticated endpoint there. The bundled loopback listener intentionally has no remote-bind switch and is not a public deployment server. External services must define upload limits, tenant isolation, cancellation, timeouts, permitted models and queue backpressure. Match padding, resizing, normalization, mapping and policy versions before comparing results with the extension.

CPU ONNX Runtime is the supported provider. The package can run on compatible platforms, but the bundled runtime and hash lock target Windows x64. Other operating systems are not covered by the Windows release checks.

## Tools

```console
.\runtime\cpython\python.exe .\scripts\build_extension.py firefox
.\runtime\cpython\python.exe .\scripts\build_extension.py chrome
.\runtime\cpython\python.exe .\scripts\analyze_reviews.py "%USERPROFILE%\Downloads\cake-tag-review.json" .\work\review-analysis\report.md
.\runtime\cpython\python.exe .\scripts\package.py
```

[Testing](TESTING.md) describes parity checks, inference smoke tests and browser validation.

## Logging and lifecycle

Importing `server` or creating an engine does not configure logging, open a terminal or start the local listener. Operational messages use the standard `server.service` logger; applications choose their own handlers and levels. CLI startup configures terminal logs; `--quiet` suppresses those operational messages. `Start.cmd` is only a local launcher and is not used by external integrations.
