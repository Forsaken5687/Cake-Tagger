# Cake Tagger

Local AI-assisted video tagging for cake.ski. Cake Tagger samples frames from a video, suggests tags from the bundled taxonomy, and lets you review and edit them before applying them to upload fields or downloading JSON.

The project is in development. Model scores are not calibrated probabilities, and recognition accuracy has not been measured on an independent test set.

## Browser extensions

The Firefox and Chrome extensions provide the interface and upload integration. Start the local Node server with `Start.cmd` before analyzing videos. The model runs on your computer; no separate AI application is required.

- [Firefox installation and usage](docs/FIREFOX.md)
- [Chrome installation and usage](docs/CHROME.md)

Select videos in the cake.ski upload area. By default, the embedded panel opens and starts analyzing new files automatically. Review the suggestions, then use **Apply tags** for each video. Existing tags and per-card exclusions are preserved. The extension does not submit or publish posts.

**Important:** cake.ski itself can upload Bulk files as drafts as soon as you select them. Local analysis does not change that behavior.

The extension follows the connected page's colors, including changes to its accent color. Clicking the toolbar icon opens the same Localhost application with upload integration and JSON export. The extension bundles no analysis application or model runner.

The description in the browser's extension manager and the toolbar tooltip follow the browser's UI language (German or English, with English as the fallback). These texts are independent of the language selected inside Cake Tagger.

## Standalone application

Requires Windows x64 and a current Firefox or Chrome browser with video decoding and Canvas support. Node runs native ONNX Runtime on the CPU; the browser handles video decoding, previews and tag review.

1. Extract the complete release into a writable folder.
2. Run `Start.cmd`.
3. Select videos and click **Suggest tags**.
4. Review the suggestions, deselect incorrect tags and add missing ones.
5. Click **Download JSON** to save `cake-tags.json`.

Results are kept only for the current page session. Download anything you want to retain before closing or reloading the page. **Quit** is available in the main page and embedded upload panel. It cancels unfinished work, waits for the native worker to stop, and then shuts down the local server. Download session results before quitting.

A Git checkout omits large dependencies. Run `Setup.cmd` once to download pinned artifacts and verify SHA-256 checksums. Complete releases include the archives; `Start.cmd` verifies and extracts the native runtime on first use. Analysis works offline afterward.

## Settings

**Settings** is available in the main page and embedded upload panel. Both use one configuration on the local server.

- Language: Automatic, German or English. Automatic follows cake.ski in connected extension views and the browser language in standalone use. Tag names are unchanged.
- Automatically analyze upload videos: enabled by default; applies only to the embedded upload workflow.
- Images per video: automatic by duration, or a fixed count from 4 to 48.
- CPU parallelism: leave the field empty for Automatic, or enter a positive thread count. The server recommends half its available logical processors and allows manual testing up to their full count. The dialog displays both values. RAM does not cap this setting; higher counts can reduce throughput. Changes apply to the next video.
- Adaptive image parallelism: process up to two images at once when the image count and thread budget make this useful. Disable it to compare single-session processing or reduce model memory.
- Show or hide model scores and uncertain suggestions.
- Exclude tags from new automatic suggestions. `hairy` and `watermark` are excluded by default and can be enabled individually.

**Save** applies preferences; **Defaults** resets the form draft. Settings persist across reloads. All browsers and embedded views share the server's configuration. Legacy browser preferences migrate only when the server has no saved configuration; the original storage is preserved. Changes preserve existing selections and manual corrections.

## Analysis and results

Automatic sampling uses 8/12/16/24/32/48 frames for videos up to 15/30/60/120/300/600 seconds. Click previews to enlarge them and navigate with buttons or arrow keys.

The base threshold is fixed at 0.4. Most suggested tags require support in more than half of the sampled frames. Selected clothing, accessory and object tags require at least a quarter of the frames, with a minimum of two and a score of at least 0.65. `dance` also requires a threshold of at least 0.65. Uncertain candidates remain visible but unchecked by default.

The displayed score is the average of the two strongest frame matches. It is not the proportion of the video showing a tag or the probability that the tag is correct. The JSON export preserves selections, original suggestions, scores, tag origins and analysis timings.

All views use one centrally managed native backend in Node. Automatic recommends half the available logical processors, with a minimum of one. Manual overrides can use all available logical processors. Adaptive mode divides that budget across up to two model sessions; returned scores preserve chronological order. Concurrent views share a bounded queue instead of loading additional model copies. Cancelling discards unfinished results while preserving other views and completed corrections. Native CPU scores can differ from earlier WASM results, so existing exports remain readable and cached browser results are not reused as native analyses.

JSON runtime details include the native provider, configured thread count, ONNX Runtime version, model checksum and memory metrics. Diagnostics also include queue wait time, CPU time, available processors, the recommended thread count and manual test maximum. Optional page heap measurements exclude the native model; unavailable fields are `null`.

Both standalone and extension exports include system total/free memory and Node process memory sampled after inference. Node RSS includes the native runtime, model and server allocations; it is not an isolated model measurement or a sampled peak.

## Limitations

- Maximum 10 minutes and 250 MiB per video. Supported codecs depend on the browser; MP4/M4V with H.264 is a practical starting point.
- Frame sampling can miss brief events and cannot establish motion or context reliably.
- JoyTag was trained mainly on illustrations and also on photographs; real video frames can produce incorrect tags.
- 159 of the 258 bundled tags have an automatic mapping under default settings. This is coverage, not accuracy. See [tag coverage](docs/TAG_COVERAGE.md).
- Context-dependent and identity-related categories, and technical tags assigned by the website, are not automatically inferred.
- Manual corrections change the session's selection; they do not train the model.
- Duplicate upload filenames are rejected during tag transfer. Filename matching does not prove that two files have identical content.
- Image sets are not supported by the video analysis workflow.

## Privacy and security

Video decoding takes place in the browser. Only 448 × 448 RGBA samples are sent to the Node server on this computer for inference; full videos, filenames and preview images are not sent for analysis or saved by the server. Results and corrections remain in page memory. The server binds only to `127.0.0.1`, authenticates inference requests and rejects unrelated website origins. Downloads are short-lived in-memory snapshots.

Settings are persisted; exports contain filenames and tags. Selecting files on cake.ski and applying tags can trigger that website's normal upload and search requests. See [security boundaries](docs/SECURITY.md) and [third-party components](THIRD_PARTY.md).

## Development and sharing

For unexpected slowdowns in the standalone application, open [runtime diagnostics](http://127.0.0.1:8765/diagnostics.html) while the server is running. It uses the same native Node API and can time a single synthetic image without selecting videos. Download the report to compare thread settings and timings across browsers. The configured thread count describes the runtime setting, not measured CPU utilization. Keep the original application tab open to preserve its results.

Run `scripts/Test.ps1` after changes. Build extensions with `runtime/node.exe scripts/Build-Firefox.mjs` and `runtime/node.exe scripts/Build-Chrome.mjs`.


`scripts/Package.ps1` builds `outputs/Cake-Tagger.zip` from tracked project files and checksum-verified assets. It includes `extensions/Cake-Tagger-Firefox.zip` and the unpacked `extensions/chrome/` directory. Private data, media, scratch files and Git history are excluded. Share this package rather than the working directory.

Source lives in the project root and `extension/`; documentation in `docs/`, tooling in `scripts/`, and synthetic tests in `tests/`. `work/`, `data/` and `outputs/` are ignored.

Further reading: [architecture](docs/TECHNICAL.md), [integration contract](docs/INTEGRATION.md), [testing](docs/TESTING.md).
