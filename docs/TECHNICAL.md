# Architecture

## Processing pipeline

`app.js` reads local files, computes SHA-256 content hashes and samples frames through Video and Canvas APIs. Previews are JPEG images with a maximum edge of 640 pixels. Model input is prepared as 448 x 448 RGBA buffers, padded white to a square, and sent individually as binary bodies to authenticated `/api/infer` requests on loopback; JPEG previews are not decoded again for inference.

`native-worker.mjs` runs JoyTag INT8 through ONNX Runtime Node 1.30.0 on the CPU. RGB channels use CLIP mean/std normalization; sigmoid converts 5,813 logits to per-label scores. The model checksum is verified before creating a session. Browser resizing is not identical to Pillow bicubic resizing. Native CPU and WASM scores are not numerically equivalent for this quantized artifact; new cache signatures include `native-cpu-v1`. The legacy WASM worker and pool remain only for developer comparisons.

`native-engine.mjs` owns one reusable Node worker and serializes all requests. At most eight additional frames wait in its queue; excess requests receive HTTP 429. Automatic uses half of `os.availableParallelism()`, bounded to 1–8 native threads. A manual preference can lower this limit. Changes rebuild the session between frames. Each browser batch captures its settings before starting. Disconnected/cancelled queued frames are removed; active native calls finish and their results are discarded. Cancellation does not terminate another view's session. A worker failure rejects the active call and recreates the worker for subsequent requests. Partial video results are never aggregated.

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

Old correction files are not loaded or overwritten. The legacy IndexedDB result cache is removed on page initialization. Settings remain persisted separately.

The standalone server holds up to three download snapshots, each with a five-minute access window. Expired snapshots are inaccessible and removed on later export/download operations or process exit; there is no background expiry timer. Extension exports use a Blob URL and do not need the server.

## Timing metadata

`timings` includes sampling, model loading, preprocessing, inference and total wall time. Native model-stage durations are summed across frames; total includes decoding, local transport and queue waiting. The first frame can include model initialization; subsequent frames reuse the session.

New runtime metadata records `provider: native-cpu`, `configuredNativeThreads`, one inference worker, server logical processor availability, runtime version and model SHA-256. Legacy WASM metadata remains accepted. Preferences are recorded under `parallelismLimit`. Optional `runtime.memory` describes only page JavaScript heap or unavailable browser metrics. `hostMemory` reports OS total/free bytes; `serverMemory` reports Node process RSS, heap and external allocations. RSS includes native allocations across Node worker threads; other fields do not measure the native model. These snapshots are neither isolated model RAM nor peak RAM.

The standalone diagnostics page uses the production native API with one synthetic frame. It does not read videos or corrections. Open it from an authenticated application session or with that session's URL fragment. Synthetic timings do not establish video recognition quality.

## Local server

`static.mjs` binds only to `127.0.0.1`, default port 8765. Inference requires a per-session bearer token, the exact binary content type and one 448 × 448 RGBA frame (802,816 bytes). Unexpected hosts, website origins, oversized bodies and invalid thread settings are rejected. Browser extensions connect to port 8765; custom ports are supported only by standalone views.

Extension documents acquire the token with a custom-header POST to `/api/connect`; the credential stays in module memory and is never relayed to cake.ski. CORS permits browser-extension origins, not website or null origins. Browsers may omit Origin on privileged extension requests, so the custom header remains required. Any installed extension with loopback permissions is inside this trust boundary; this is not authentication against malicious local processes or privileged extensions. No inference endpoint accepts paths, filenames or arbitrary model arguments. Standalone credentials arrive in a URL fragment and move to session storage. Static path allowlists and CSP protect private project files.

`session-url.mjs` validates saved loopback session URLs before reopening an existing server. PowerShell receives a URL through an environment variable rather than interpolated command text. The standalone server is not a LAN service and must not be exposed as one without redesigning authentication and deployment.

## Extension integration

`extension/embedded-upload.mjs` mounts an extension-origin iframe outside the changing Single/Bulk renderer. Closing hides it without destroying the session. File references are tied to their upload mount and captured from trusted file selection/drop events.

`message-contract.mjs` checks parent window, Cake origin, session channel and File objects. Extension pages communicate through the background relay, which verifies the sender and target host. Embedded views cannot address another tab. `content.js` accepts transfer commands only from the extension background. The adapter validates filename matching and tag membership and confirms additions against live pills.

Firefox uses background scripts; Chrome uses `chrome-worker.mjs` with static imports. `webext-api.js` adapts Promise-style listeners to Chrome's response callback, keeps async response channels open, and ignores unhandled messages. Neither background implementation retains video or inference state.

## Preferences and automatic analysis

`preferences.mjs` normalizes only language, frame count, tag exclusions, display flags and `autoAnalyzeEmbed`. Standalone settings use `localStorage`; extension settings use `storage.local` through `settings-background.mjs`. Unknown message types and unrelated data fields cannot write preferences.

`settings-ui.mjs` renders a shared modal form. Save applies the draft; Defaults resets only the form. Exclusions affect subsequent analyses and form part of the cache key. An active batch uses an immutable settings snapshot. Display changes preserve selected tags and underlying scores.

`extension/auto-analysis.mjs` serializes selection preparation and automatic batches. It keeps the latest pending selection, analyzes only new files without existing results or preparation errors, and does not automatically retry cancellation/failure. Standalone file selections use the same queue with automatic analysis disabled. New embedded videos open the panel automatically when enabled.

## Language, theme and previews

`i18n.mjs` supports German and English. The shared `messages.mjs` catalog stores explicit English and German values under stable IDs. Named placeholders carry counts and filenames; descriptors preserve nested errors across worker/runtime messaging. No reverse dictionary or sentence matching is used. `i18n.mjs` retains IDs and parameters for visible text and attributes so language changes refresh them without changing selections. Unrecognized browser/library errors remain readable in their original wording. Automatic uses the connected site's language or the standalone browser language. Explicit preferences take priority and tag names remain unchanged.

When adding UI text, define both languages under a descriptive ID and use identical named placeholders, such as `analysis.progress` with `{current}` and `{total}`. Pass values through `message(id, params)` or `t(id, params)`. Use `localizedText`/`localizedAttribute` for elements that must follow language changes. Create application errors with `messageError` and send their `errorMessage` descriptor across process boundaries. Keep filenames and tag names as literal parameters. The localization tests check referenced IDs, placeholder parity, encoding and nested-error rendering.

Browser-managed metadata uses native WebExtensions localization: both manifests reference `_locales/en/messages.json` and `_locales/de/messages.json` through `__MSG_*__` tokens, with English as the fallback locale. The extension-manager description and toolbar tooltip follow the browser's UI language independently of application preferences and cake.ski's language. Reload/update the extension to apply metadata changes. The product name remains Cake Tagger in both languages. See [Mozilla's internationalization documentation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Internationalization).

`site-theme.mjs` reads known `--cake-*` variables from `.stok-root`. Only validated color values cross the frame boundary. Style/class/language changes update the palette without persistence; separate views receive updates from their selected tab. Playback control updates do not delay root theme synchronization.

Native modal dialogs provide focus containment for settings and enlarged previews. Previews use existing images, not a second full-resolution extraction. Escape and arrow-key navigation are supported. The inline logo follows theme tokens; browser icons retain their packaged artwork.

## Dependencies and packaging

Dependencies are pinned in `scripts/assets.json` and provenance metadata. Large artifacts are SHA-256 verified. Third-party licenses must remain unchanged. `Build-Extension.mjs` uses a fixed file list and produces both browsers' packages; `Package.ps1` builds a full release from tracked files and verified assets, including Firefox ZIP and Chrome folder.

CPU inference is the supported path. A GPU provider would require compatibility, timing and output comparisons for this quantized model and should not be enabled merely because WebGPU is available. See [ONNX Runtime WebGPU](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html).
