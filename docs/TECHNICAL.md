# Architecture

## Processing pipeline

`app.js` reads local files, computes SHA-256 content hashes and samples frames through Video and Canvas APIs. Previews are JPEG images with a maximum edge of 640 pixels. Model input is prepared as 448 x 448 RGBA buffers, padded white to a square, and sent together in one binary body per video to the authenticated `/api/infer` endpoint on loopback; JPEG previews are not decoded again for inference.

`native-worker.mjs` runs JoyTag INT8 through ONNX Runtime Node 1.30.0 on the CPU. RGB channels use CLIP mean/std normalization; sigmoid converts 5,813 logits to per-label scores. The model checksum is verified before creating a session. Browser resizing is not identical to Pillow bicubic resizing. Native CPU and WASM scores are not numerically equivalent for this quantized artifact; new cache signatures include `native-cpu-v1`. Browser model execution is removed.

`native-engine.mjs` owns one reusable Node worker and one FIFO video queue. Eight additional video jobs may wait; excess jobs receive the streamed `error.nativeBusy` response. This is an admission/backpressure limit, not a CPU-thread or RAM limit. Each job holds at most 48 images. Automatic uses a third of `os.availableParallelism()`, with a minimum of one thread. Manual overrides use any integer up to all available logical processors. `native-policy.mjs` publishes the operating recommendation, hardware-derived test ceiling, its reason and queue capacity. RAM does not limit overrides.

Each worker uses intra-operator parallelism: multiple CPU threads cooperate on a single image. Images are processed sequentially by one warmed session, using the full configured CPU thread budget. Intra-op and inter-op worker spinning are disabled: waiting threads block instead of consuming CPU cycles. Applied spinning and process scheduling metadata are included in exports. Process priority is observed, not changed. The session remains warm between videos. Higher thread counts can reduce throughput. Thread changes rebuild the shared session between videos. The browser captures settings before submitting a batch. Queued cancellations remove the whole job; active cancellations discard the current native call and stop before another frame begins, preserving other clients' warmed session. Worker failure rejects the current job and recreates the worker for subsequent jobs. Partial video results are never aggregated.

`local-session.mjs` obtains the current token automatically for direct local navigation and renews it after an HTTP 401. Concurrent handshakes are shared. Only authentication rejections are replayed, before backend processing has begun; running jobs and results are not restarted. Main and diagnostic pages use this transport.

The server streams newline-delimited JSON: state/progress records followed by one done or error record. The done record contains server-aggregated tags, uncertain candidates, timings and runtime metadata. Normal UI requests do not send raw label scores back to the browser. `raw=1` supplies the full score matrix for synthetic diagnostics and comparisons. Only the backend owns inference, result aggregation, the job queue and resource policy.

`sampling.mjs` distributes samples at bin midpoints and limits videos to 600 seconds. Automatic counts are 8/12/16/24/32/48 at duration boundaries 15/30/60/120/300/600 seconds; fixed counts remain available. Files above 250 MiB are rejected before hashing or sampling.

## Tag aggregation

`mapping.json` maps model label indices to the bundled taxonomy. `tagging.mjs` takes the maximum of mapped label scores for each tag and each sampled frame. Most tags require more than half the frames to pass the base threshold of 0.4, with at least two supporting frames.

An explicit detail-tag set uses a threshold of at least 0.65 and requires a quarter of the sampled frames, with a minimum of two. `dance` also has a threshold of at least 0.65. These are heuristics, not calibrated classifiers or motion recognition.

The displayed `confidence` is the average of the two strongest frame scores. Temporal support is recorded separately as `supportingFrames`. At most 20 selected suggestions and 15 unchecked uncertain candidates are returned. `uncertainScores` preserves candidate scores and support; missing legacy scores are not invented.

`tag-policy.mjs` keeps context-dependent, identity-related and website-assigned categories manual-only. `hairy` and `watermark` are configurable default exclusions. `piercings` maps additional specific piercing labels; ear piercing is not added as an extra synonym. `scripts/Update-Coverage.mjs` regenerates the coverage report without changing mappings.

## Session state and exports

Results, selections, corrections, previews and caches are held in page memory. Hashes match identical file content within a session. Cache keys include model provenance, mapping, sample count, threshold, coverage/exclusion policy and `preprocess-v2`. Cached results retain the original inference timings.

`corrections.mjs` preserves tag origins and manual selections when a new baseline is analyzed. JSON exports contain selected tags, original suggestions, added/removed/deselected tags, scores and timings. The legacy `reviewed` field remains for format compatibility and has no current UI control. Corrections do not train the model.

Current analysis policies include a JSON exclusion snapshot after `coverage-v5:majority`. Validation also accepts older v2-v5 coverage keys. Arrays, scores, support counts, durations and timing fields are validated before a standalone export is created.

Old correction files are not loaded or overwritten. Legacy browser databases are left untouched and are not used by the current application. Settings remain persisted separately.

The standalone server holds up to three download snapshots, each with a five-minute access window. Expired snapshots are inaccessible and removed on later export/download operations or process exit; there is no background expiry timer. All interfaces download through this same endpoint.

## Timing metadata

`timings` includes sampling, model loading, preprocessing, inference, queue waiting and total wall time. Optional `cpuSeconds` counts CPU time consumed by the Node process during the worker job; `workerWallSeconds` records that job's elapsed time. CPU time can exceed wall time because multiple threads run simultaneously. These metrics include other process activity and are not isolated operator timings. Native model-stage durations are summed across frames; total includes decoding, local transport and queue waiting. The first video can include model initialization; subsequent videos with the same thread configuration reuse the session.

New runtime metadata records `provider: native-cpu`, `configuredNativeThreads`, the number of active inference workers, per-session thread counts, resident sessions, server logical processor availability, runtime version and model SHA-256. Legacy WASM metadata remains accepted. Preferences are recorded under `parallelismLimit`; metadata also retains logical processors, recommended threads, the manual test maximum and queue capacity. Optional `runtime.memory` describes only page JavaScript heap or unavailable browser metrics. `hostMemory` reports OS total/free bytes; `serverMemory` reports Node process RSS, heap and external allocations. RSS includes native allocations across Node worker threads; other fields do not measure the native model. These snapshots are neither isolated model RAM nor peak RAM.

The standalone diagnostics page uses the production native API with one synthetic frame. It does not read videos or corrections. Open it from an authenticated application session or with that session's URL fragment. Synthetic timings do not establish video recognition quality.

## Local server

`static.mjs` binds only to `127.0.0.1`, default port 8765. Inference requires a per-session bearer token, the exact binary content type and 1–48 tightly packed 448 × 448 RGBA frames (802,816 bytes each). Unexpected hosts, website origins, oversized bodies and invalid thread settings are rejected. Browser extensions connect to port 8765; custom ports are supported only by standalone views.

The extension background acquires a token with a custom-header POST to `/api/connect`. It places the token in the Localhost application's URL fragment; the application moves it into session storage and removes the fragment. The token is never relayed to cake.ski. CORS permits browser-extension origins, not website or null origins. Browsers may omit Origin on privileged extension requests, so the custom header remains required. Any installed extension with loopback permissions is inside this trust boundary; this is not authentication against malicious local processes or privileged extensions. No inference endpoint accepts paths, filenames or arbitrary model arguments. Standalone credentials arrive in a URL fragment and move to session storage. Static path allowlists and CSP protect private project files.

`session-url.mjs` validates saved loopback session URLs before reopening an existing server. PowerShell receives a URL through an environment variable rather than interpolated command text. The standalone server is not a LAN service and must not be exposed as one without redesigning authentication and deployment.

## Shutdown

**Quit** is visible in the main application header and the embedded analysis heading. The authenticated `POST /api/stop` endpoint stops admission, rejects queued and active jobs, lets the current native calls finish, releases their sessions, awaits termination of every current or retiring native worker, reports success, then closes all HTTP connections and exits Node. Hard termination of a live ONNX call is avoided because native cleanup must complete before the worker exits. The UI stays open to show the result; closing a tab is not shutdown. Once shutdown has been requested, it completes even if the initiating tab disconnects. Preferences and existing data files are preserved. Unsaved results remain session-only, so download them before quitting. A shutdown failure is displayed and restores the button.

## Extension integration

`extension/embedded-upload.mjs` mounts a thin extension-origin bridge outside the changing Single/Bulk renderer. `bridge.html` contains no analysis UI; its child iframe loads the same Localhost application used standalone. The toolbar opens that Localhost application directly. `local-bridge.js` relays only upload integration messages for that document. Closing hides it without destroying the session. File references are tied to their upload mount and captured from trusted file selection/drop events.

`message-contract.mjs` checks parent window, Cake origin, session channel and File objects. Extension pages communicate through the background relay, which verifies the sender and target host. Embedded views cannot address another tab. `content.js` accepts transfer commands only from the extension background. The adapter validates filename matching and tag membership and confirms additions against live pills.

Firefox uses background scripts; Chrome uses `chrome-worker.mjs` with static imports. `webext-api.js` adapts Promise-style listeners to Chrome's response callback, keeps async response channels open, and ignores unhandled messages. Neither background implementation retains video or inference state.

## Preferences and automatic analysis

`preferences.mjs` normalizes language, frame count, CPU parallelism, tag exclusions, display flags and `autoAnalyzeEmbed`. Every view loads/saves the same authenticated `/api/settings` API. Node persists preferences atomically in ignored `data/preferences.json`. Legacy localStorage and extension storage.local settings migrate only if no server configuration exists; originals are preserved. Unknown fields are discarded. Thread overrides are validated against the actual server hardware.

`settings-ui.mjs` renders a shared modal form. Save applies the draft; Defaults resets only the form. Exclusions affect subsequent analyses and form part of the cache key. An active batch uses an immutable settings snapshot. Display changes preserve selected tags and underlying scores.

`extension/auto-analysis.mjs` serializes selection preparation and automatic batches. It keeps the latest pending selection, analyzes only new files without existing results or preparation errors, and does not automatically retry cancellation/failure. Standalone file selections use the same queue with automatic analysis disabled. New embedded videos open the panel automatically when enabled.

## Language, theme and previews

`i18n.mjs` supports German and English. The shared `messages.mjs` catalog stores explicit English and German values under stable IDs. Named placeholders carry counts and filenames; descriptors preserve nested errors across worker/runtime messaging. No reverse dictionary or sentence matching is used. `i18n.mjs` retains IDs and parameters for visible text and attributes so language changes refresh them without changing selections. Unrecognized browser/library errors remain readable in their original wording. Automatic uses the connected site's language or the standalone browser language. Explicit preferences take priority and tag names remain unchanged.

When adding UI text, define both languages under a descriptive ID and use identical named placeholders, such as `analysis.progress` with `{current}` and `{total}`. Pass values through `message(id, params)` or `t(id, params)`. Use `localizedText`/`localizedAttribute` for elements that must follow language changes. Create application errors with `messageError` and send their `errorMessage` descriptor across process boundaries. Keep filenames and tag names as literal parameters. The localization tests check referenced IDs, placeholder parity, encoding and nested-error rendering.

Browser-managed metadata uses native WebExtensions localization: both manifests reference `_locales/en/messages.json` and `_locales/de/messages.json` through `__MSG_*__` tokens, with English as the fallback locale. The extension-manager description and toolbar tooltip follow the browser's UI language independently of application preferences and cake.ski's language. Reload/update the extension to apply metadata changes. The product name remains Cake Tagger in both languages. See [Mozilla's internationalization documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Internationalization).

`site-theme.mjs` reads known `--cake-*` variables from `.stok-root`. Only validated color values cross the frame boundary. Style/class/language changes update the palette without persistence; separate views receive updates from their selected tab. Playback control updates do not delay root theme synchronization.

Native modal dialogs provide focus containment for settings and enlarged previews. Previews use existing images, not a second full-resolution extraction. Escape and arrow-key navigation are supported. The inline logo follows theme tokens; browser icons retain their packaged artwork.

## Dependencies and packaging

Dependencies are pinned in `scripts/assets.json` and provenance metadata. Large artifacts are SHA-256 verified. Third-party licenses must remain unchanged. `Build-Extension.mjs` uses a fixed file list and produces both browsers' packages; `Package.ps1` builds a runtime-only release from scripts/release-files.json and verified assets, including Firefox ZIP and Chrome folder.

CPU inference is the supported path. A GPU provider would require compatibility, timing and output comparisons for this quantized model and should not be enabled merely because WebGPU is available. See [ONNX Runtime WebGPU](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html).
