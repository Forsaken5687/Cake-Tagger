# Architecture

## Processing pipeline

`app.js` reads local files, computes SHA-256 content hashes and samples frames through Video and Canvas APIs. Previews are JPEG images with a maximum edge of 640 pixels. Model input is prepared as 448 x 448 RGBA buffers, padded white to a square, and transferred directly to `engine-worker.js`; JPEG previews are not decoded again for inference.

The worker runs JoyTag INT8 with ONNX Runtime Web on the WASM CPU provider. RGB channels use CLIP mean/std normalization. The model returns 5,813 logits; sigmoid converts them to per-label scores. Processing is sequential. Isolated contexts use up to four WASM threads, otherwise one. Browser resizing is not identical to Pillow bicubic resizing.

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

`timings` includes `samplingSeconds`, `modelLoadSeconds`, `preprocessSeconds`, `inferenceSeconds` and `totalSeconds`. Transfer and administration overhead means components need not sum exactly to the total. Timings do not include export. Legacy results may lack timings.

## Local server

`static.mjs` binds to `127.0.0.1`, default port 8765. Protected endpoints require a fresh random session token. The token initially travels in a URL fragment, is moved to session storage and removed from the address bar. Host/Origin validation, a static path allowlist and a restrictive CSP separate the service from unrelated websites and private project files.

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

`i18n.mjs` supports German and English. UI source messages are English. The shared `messages.mjs` catalog translates static and parameterized messages, with legacy German keys accepted for compatibility. Visible statuses and errors retain source messages so a language change can refresh them without changing selections. Automatic uses the connected site's language or the standalone browser language. Explicit preferences take priority and tag names remain unchanged.

`site-theme.mjs` reads known `--cake-*` variables from `.stok-root`. Only validated color values cross the frame boundary. Style/class/language changes update the palette without persistence; separate views receive updates from their selected tab. Playback control updates do not delay root theme synchronization.

Native modal dialogs provide focus containment for settings and enlarged previews. Previews use existing images, not a second full-resolution extraction. Escape and arrow-key navigation are supported. The inline logo follows theme tokens; browser icons retain their packaged artwork.

## Dependencies and packaging

Dependencies are pinned in `scripts/assets.json` and provenance metadata. Large artifacts are SHA-256 verified. Third-party licenses must remain unchanged. `Build-Extension.mjs` uses a fixed file list and produces both browsers' packages; `Package.ps1` builds a full release from tracked files and verified assets, including Firefox ZIP and Chrome folder.

CPU inference is the supported path. A GPU provider would require compatibility, timing and output comparisons for this quantized model and should not be enabled merely because WebGPU is available. See [ONNX Runtime WebGPU](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html).
