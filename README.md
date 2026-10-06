# Cake Tagger

Local AI-assisted video tagging for cake.ski. Cake Tagger samples frames from a video, suggests tags from the bundled taxonomy, and lets you review and edit them before applying them to upload fields or downloading JSON.

The project is in development. Model scores are not calibrated probabilities, and recognition accuracy has not been measured on an independent test set.

## Browser extensions

The Firefox and Chrome extensions provide the interface and upload integration. Start the local Node server with `Start.cmd` before analyzing videos. The model runs on your computer; no separate AI application is required.

- [Browser installation and usage](docs/BROWSERS.md)

Select videos in the cake.ski upload area. By default, new files are analyzed automatically. Suggestions appear directly on the upload cards. Review the suggestions, then use **Apply tags** for each video. Add manual tags using the site's own tag field. Existing tags and per-card exclusions are preserved. The extension does not submit or publish posts.

**Important:** cake.ski itself can upload Bulk files as drafts as soon as you select them. Local analysis does not change that behavior.

The extension follows the connected page's colors, including changes to its accent color. The toolbar menu provides **Open upload** and **Quit**. The upload toolbar contains analysis controls, **Download JSON**, **Settings** and **Quit**. The extension bundles no analysis application or model runner.

The description in the browser's extension manager and the toolbar tooltip follow the browser's UI language (German or English, with English as the fallback). These texts are independent of the language selected inside Cake Tagger.

## Local service

Requires Windows x64 and a current Firefox or Chrome browser with video decoding and Canvas support. Node runs native ONNX Runtime on the CPU; the browser handles video decoding and tag review. On Windows, startup applies explicit CPU performance QoS to the backend process so hidden-window classification does not throttle analysis. Process priority and the global power plan are unchanged.

1. Extract the complete release into a writable folder.
2. Run `Start.cmd` to start the local server.
3. Open cake.ski's upload area with the extension installed and select videos.
4. Review suggestions on the cards, then apply them or download JSON.

The separate analysis window has been removed. Direct Localhost navigation redirects to cake.ski. The upload interface remains extension-only. Results are kept only for the current upload-page session. Download anything you want to retain before closing or reloading it. **Quit** cancels unfinished work, waits for the native worker to stop, and shuts down the local server. It is available on the upload toolbar and extension menu.

A Git checkout omits large dependencies. Run `Setup.cmd` once to download pinned artifacts and verify SHA-256 checksums. Complete releases include the archives; `Start.cmd` verifies and extracts the native runtime on first use. Analysis works offline afterward.

## Settings

**Settings** is available on the upload toolbar. Preferences are stored on the local server.

- Language: Automatic, German or English. Automatic follows cake.ski in upload views and the browser language in the extension menu. Tag names are unchanged.
- Automatically analyze upload videos: enabled by default; applies only to the embedded upload workflow.
- Images per video: automatic by duration, or a fixed count from 4 to 48.
- CPU parallelism: leave the field empty for Automatic, or enter a positive thread count. The server recommends a third of its available logical processors and allows manual testing up to their full count. The dialog displays both values. Higher counts can reduce throughput. Changes apply to the next video.
- Show or hide model scores and uncertain suggestions.
- Exclude tags from new automatic suggestions. `hairy` and `watermark` are excluded by default and can be enabled individually.

**Save** applies preferences; **Defaults** resets the form draft. Settings persist across reloads. All browsers and embedded views share the server's configuration. Legacy browser preferences migrate only when the server has no saved configuration; the original storage is preserved. Changes preserve existing selections and manual corrections.

## Analysis and results

Automatic sampling uses 8/12/16/24/32/48 frames for videos up to 15/30/60/120/300/600 seconds. The integration uses the website's existing video players instead of duplicating preview images.

The base threshold is fixed at 0.4. Most suggested tags require support in more than half of the sampled frames. Selected clothing, accessory and object tags require at least a quarter of the frames, with a minimum of two and a score of at least 0.65. `dance` also requires a threshold of at least 0.65. Uncertain candidates are unchecked and displayed beside selected suggestions by default.

The displayed score is the average of the two strongest frame matches. It is not the proportion of the video showing a tag or the probability that the tag is correct. The JSON export preserves selections, original suggestions, scores, tag origins and analysis timings.

All views use one centrally managed native backend in Node. Automatic recommends a third of the available logical processors, with a minimum of one. Manual overrides can use all available logical processors. One model session processes images sequentially using that thread budget; returned scores preserve chronological order. Concurrent views share a bounded queue instead of loading additional model copies. Cancelling discards unfinished results while preserving other views and completed corrections. Native CPU scores can differ from earlier WASM results, so existing exports remain readable and cached browser results are not reused as native analyses.

JSON runtime details include the native provider, configured thread count, ONNX Runtime version, model checksum and memory metrics. Diagnostics also include queue wait time, CPU time, available processors, the recommended thread count and manual test maximum. Optional page heap measurements exclude the native model; unavailable fields are `null`.

Exports include system total/free memory and Node process memory sampled after inference. Node RSS includes the native runtime, model and server allocations; it is not an isolated model measurement or a sampled peak.

## Limitations

- Maximum 10 minutes and 250 MiB per video. Supported codecs depend on the browser; MP4/M4V with H.264 is a practical starting point.
- Frame sampling can miss brief events and cannot establish motion or context reliably.
- JoyTag was trained mainly on illustrations and also on photographs; real video frames can produce incorrect tags.
- 159 of the 258 bundled tags have an automatic mapping under default settings. This is coverage, not accuracy. See [tag coverage](docs/TAG_COVERAGE.md).
- Context-dependent and identity-related categories, and technical tags assigned by the website, are not automatically inferred.
- Manual corrections change the session's selection; they do not train the model.
- Duplicate upload filenames are rejected during tag transfer. Filename matching does not prove that two files have identical content.
- Image sets are not supported by the video analysis workflow.

The processing frame automatically reconnects when the server session changes, preserving results already in page memory.

## Privacy and security

Video decoding takes place in the browser. Only 448 × 448 RGBA samples are sent to the Node server on this computer for inference; full videos, filenames and preview images are not sent for analysis or saved by the server. Results and corrections remain in page memory. The server binds only to `127.0.0.1`, authenticates inference requests and rejects unrelated website origins. Downloads are short-lived in-memory snapshots.

Settings are persisted; exports contain filenames and tags. Selecting files on cake.ski and applying tags can trigger that website's normal upload and search requests. See [security boundaries](docs/SECURITY.md) and [third-party components](THIRD_PARTY.md).

## Development and sharing

For unexpected slowdowns during analysis, open [runtime diagnostics](http://127.0.0.1:8765/diagnostics.html) while the server is running. It uses the same native Node API and can time a single synthetic image without selecting videos. Download the report to compare thread settings and timings across browsers. The configured thread count describes the runtime setting, not measured CPU utilization. Keep the original application tab open to preserve its results.

The `dev` branch includes the local review tool (`Review.cmd`), experiments and synthetic tests. These remain available in the source checkout. Development tools and tests belong to the source checkout and are not included in runtime releases. Run `scripts/Test.ps1` after changes. Build extensions with `runtime/node.exe scripts/Build-Extension.mjs firefox` and `runtime/node.exe scripts/Build-Extension.mjs chrome`.


`scripts/Package.ps1` builds `outputs/Cake-Tagger.zip` from an explicit runtime file list and checksum-verified assets. It includes `extensions/Cake-Tagger-Firefox.zip` and the unpacked `extensions/chrome/` directory. Tests, developer tooling, redundant extension sources, private data, media, scratch files and Git history are excluded. Share this package rather than the working directory.


Further reading: [architecture](docs/TECHNICAL.md), [integration contract](docs/INTEGRATION.md), [testing](docs/TESTING.md).

### Project structure

- `src/client/`: hidden processing document, video sampling, transport and diagnostics.
- `src/server/`: HTTP service, native worker and CPU scheduling.
- `src/shared/`: tagging rules, settings, translations and message contracts.
- `extension/`: browser manifests, toolbar, upload controls and connection bridges.
- `model/`: tag taxonomy, mappings, coverage and model provenance.
- `docs/`, `scripts/`, `tests/`: documentation, tooling and synthetic checks.
- `data/`, `work/`, `outputs/`: ignored preferences, temporary work and current release artifacts.

Complete releases contain only runtime files, notices, documentation and the packaged extensions.
