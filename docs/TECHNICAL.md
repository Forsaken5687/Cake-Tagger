# Architecture

## Structure and integration boundary

The installable Python package is `src/server/`:

- `core.py`: model verification, preprocessing, inference, aggregation and the shared queue.
- `config.py`: catalog loading, CPU capabilities and preference normalization.
- `validation.py`: strict correction, export and diagnostic validation.
- `metrics.py`: current-process and operating-system diagnostics.
- `service.py`: authenticated loopback HTTP adapter and atomic local persistence.
- `review.py`: development review export validation; excluded from runtime releases.

External Python applications import the core API and provide their own transport, authentication and deployment policy. They do not need the extension or local listener. See [Python integration](PYTHON.md). Browser decoding and extension integration remain JavaScript because they use browser APIs.

## Processing

The browser computes incremental SHA-256 hashes with 1 MiB reads and samples videos through Video/Canvas APIs. The upload interface reuses the website's video players. Each inference request contains 1Ã¢â‚¬â€œ48 packed 448 Ãƒâ€” 448 RGBA images, white-padded to a square. Full videos, paths and filenames are not inference inputs.

The Python engine verifies the pinned JoyTag FP32 model's SHA-256, normalizes RGB using CLIP mean/std and converts 5,813 logits through sigmoid. Normalization computes in double precision before storing float32 input. Browser resizing differs from Pillow bicubic resizing; integrations must preserve preprocessing when comparing scores.

One process owns one FIFO queue, one inference thread and one warm ONNX Runtime CPU session. Eight additional jobs can wait. Sixteen HTTP connections may be active; excess connections receive HTTP 503. Both limits are published or documented resource bounds. Cancellation removes queued work immediately. Active cancellation waits for the current native call and stops before another image; partial results are discarded. An inference failure drops the session so following jobs can recreate it.

CPU threads cooperate on each image; images are processed sequentially. Automatic parallelism recommends a third of available logical processors, minimum one. The manual test ceiling is the available logical processor count. Affinity-aware processor APIs are used where available. This recommendation is a heuristic, not a measured optimum. Higher overrides can be slower. Changing thread count rebuilds the session between videos. Intra/inter-operator spinning is disabled.

On Windows, the engine disables execution-speed throttling for its own process, preserving other power flags and scheduling priority. Diagnostics report whether this succeeded. No system power plan is changed.

## Tag policy

`model/policy.json` contains the backend's versioned detail/manual rules, audited coverage reasons and historical renames. `model/mapping.json` maps label indices to website tags. Browser comparison rules mirror the production semantics; automated parity checks prevent drift.

Alternative labels use their maximum score per image. Compound `all` rules require every label group in the same image and use the minimum of their group maxima. Most tags require more than half the sampled images above 0.4, with at least two matches. Detail tags require a quarter of images above at least 0.65, minimum two. `dance` also uses at least 0.65. These are heuristics, not motion recognition.

Confidence is the average of the two strongest frame scores. `supportingFrames` records temporal support separately. Upload output defaults to at most 20 selected and 15 uncertain suggestions. `suggestionThreshold` (0–1, default 0.4) controls the frame-support threshold, retaining stricter detail rules. Upload requests can supply a frozen threshold and count limits; cache keys distinguish those settings. Backend settings `suggestionLimit` (1–303) and `uncertainLimit` (0–303) adjust these independent limits for new analyses, preserving score order. The review lab can inspect the full candidate set independently of upload limits. Context-dependent categories remain manual; `hairy` and `watermark` are configurable default exclusions. Regenerate coverage with `scripts/update_coverage.py`.

## HTTP and state

The local service binds only to `127.0.0.1`, default port 8765. It validates Host, Origin, bearer tokens, content type, body size and overrides. Static files use an explicit allowlist; source, private state and model weights cannot be downloaded. The root redirects to cake.ski. The review route exists only in a development checkout.

The custom-header `/api/connect` handshake supplies a per-process token. Local pages require the exact local Origin; privileged extensions may omit Origin. The extension origin allowlist supports Firefox and Chrome. Tokens are never forwarded to cake.ski. Authentication rejections can renew the session before processing starts; actions with unknown outcomes are never replayed.

`/api/infer` streams NDJSON state/progress followed by one done or error record. `raw=1` includes label scores for development; normal upload responses contain aggregated tags. Binary requests require Content-Length and reject ambiguous/chunked framing. Bodies are limited to 48 frames; exports to 16 MB, review exports to 64 MB and preferences to 32 KiB. Socket reads time out after 60 seconds of inactivity.

Preferences are written atomically to ignored `data/preferences.json`. Existing corrections are preserved. `data/session.json` records the live address and process ID and is removed on orderly exit. Start reuses only an authenticated existing service. Quit blocks new work, cancels queued tasks, waits for active native work, flushes acknowledgement and closes connections. Disconnecting the initiating browser does not prevent shutdown.

Upload results remain in page memory. The review lab retains its own browser-local annotations and video cache. Export snapshots contain validated selections, origins, original suggestions, scores and timings. At most three snapshots remain in process memory for five minutes, accessible through random capability URLs.

## Diagnostics and distribution

Timing fields distinguish sampling, loading, preprocessing, inference, queue wait and transport. `cpuSeconds` measures total process CPU during a job; it can exceed wall time and includes other activity. RSS snapshots describe the whole process, not isolated or peak model memory. Python exports `serverMemory: {rssBytes, scope: "process-rss"}`; unavailable measurements are null. Legacy export formats remain readable.

`Start.cmd` automatically restores the checksum-pinned application-local CPython runtime, wheels and model. It does not change global Python or install packages into a user's environment. `scripts/package.py` packages only the explicit release allowlist, model weights and a clean runtime assembled from verified archives. The release interpreter is `runtime/python.exe`; source checkouts retain `runtime/cpython/` and the archive cache. Firefox is a ZIP; Chrome is an unpacked folder. External Python integrations use the source checkout and provide their own model and dependency setup.

Browser messages, inactivity recovery, tag transfer and download-manager behavior are described in [integration](INTEGRATION.md). Browser-specific checks are still required after website or extension changes.

## Local startup

`Start.cmd` launches the local service in the current terminal. `scripts/launch.cmd` bootstraps the pinned portable interpreter using Windows curl, certutil and tar when it is absent; the interpreter archive is verified before execution. `scripts/setup.py` restores hash-verified wheels and model weights. Python handles readiness, duplicate-service detection and errors; no shell process performs inference. The development review page is opened directly at `http://127.0.0.1:8765/review.html`.

Terminal logs report startup, queued/completed analyses and shutdown without request URLs, tokens, filenames, tags or frame contents. Ctrl+C follows the same engine cleanup contract as browser Quit: finish the active native call, discard unfinished analysis and retain saved preferences. Closing a terminal window can forcibly terminate the process, so Ctrl+C or Quit is preferred. Importing the package does not configure application logging.

## Calibrated production rules

The `coverage-v7` policy calibrates only `piercings` and `vaginal penetration` in majority mode. Their default frame thresholds and required image shares are 45% / 12.5% and 30% / 51%, respectively, with at least two matching images. Other tags and brief mode retain their existing rules. The global score setting defaults to 40%; raising it above that default raises calibrated cutoffs by the same amount, capped at 100%. Exclusions and result limits still apply.

Python reads `tagRules` from `model/policy.json`; the review's JavaScript mirror is verified against that catalog. New cache keys and exports identify policy v7. Offline replay of older exports disables these calibrations and preserves the original annotations. Existing saved review results are not recomputed on import.
