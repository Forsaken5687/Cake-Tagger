# Cake Tagger

Local AI-assisted video tagging for cake.ski. Cake Tagger samples frames from a video, suggests tags from the bundled taxonomy, and lets you review and edit them before applying them to upload fields or downloading JSON.

The project is in development. Model scores are not calibrated probabilities, and recognition accuracy has not been measured on an independent test set.

## Browser extensions

The Firefox and Chrome extensions include the model and inference runtime. They work without the standalone server or separate AI software.

- [Firefox installation and usage](docs/FIREFOX.md)
- [Chrome installation and usage](docs/CHROME.md)

Select videos in the cake.ski upload area. By default, the embedded panel opens and starts analyzing new files automatically. Review the suggestions, then use **Apply tags** for each video. Existing tags and per-card exclusions are preserved. The extension does not submit or publish posts.

**Important:** cake.ski itself can upload Bulk files as drafts as soon as you select them. Local analysis does not change that behavior.

The extension follows the connected page's colors, including changes to its accent color. Clicking the toolbar icon opens a separate analysis view with JSON export.

## Standalone application

Requires Windows x64 and a current Firefox or Chrome browser with WebAssembly, video decoding and Canvas support. Inference runs on the CPU.

1. Extract the complete release into a writable folder.
2. Run `Start.cmd`.
3. Select videos and click **Suggest tags**.
4. Review the suggestions, deselect incorrect tags and add missing ones.
5. Click **Download JSON** to save `cake-tags.json`.

Results are kept only for the current page session. Download anything you want to retain before closing or reloading the page. **Quit** stops the local server.

A Git checkout omits three large dependencies. Run `Setup.cmd` once to download their pinned versions and verify SHA-256 checksums. Complete release packages already include them. The standalone application can then analyze videos offline.

## Settings

**Settings** is available in the standalone, separate extension and embedded views.

- Language: Automatic, German or English. Automatic follows cake.ski in connected extension views and the browser language in standalone use. Tag names are unchanged.
- Automatically analyze upload videos: enabled by default; applies only to the embedded upload workflow.
- Images per video: automatic by duration, or a fixed count from 4 to 48.
- Show or hide model scores and uncertain suggestions.
- Exclude tags from new automatic suggestions. `hairy` and `watermark` are excluded by default and can be enabled individually.

**Save** applies preferences; **Defaults** resets the form draft. Settings persist across reloads. Extensions share settings within their browser; the standalone application has its own storage. Changes preserve existing selections and manual corrections.

## Analysis and results

Automatic sampling uses 8/12/16/24/32/48 frames for videos up to 15/30/60/120/300/600 seconds. Click previews to enlarge them and navigate with buttons or arrow keys.

The base threshold is fixed at 0.4. Most suggested tags require support in more than half of the sampled frames. Selected clothing, accessory and object tags require at least a quarter of the frames, with a minimum of two and a score of at least 0.65. `dance` also requires a threshold of at least 0.65. Uncertain candidates remain visible but unchecked by default.

The displayed score is the average of the two strongest frame matches. It is not the proportion of the video showing a tag or the probability that the tag is correct. The JSON export preserves selections, original suggestions, scores, tag origins and analysis timings.

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

Analysis takes place in the browser. Videos and preview images are not sent to a tagging service or saved in the project. Results, corrections and analysis caches remain in page memory. The local server binds only to `127.0.0.1` and uses a per-session token for protected actions. Downloads are short-lived in-memory snapshots.

Settings are persisted; exports contain filenames and tags. Selecting files on cake.ski and applying tags can trigger that website's normal upload and search requests. See [security boundaries](docs/SECURITY.md) and [third-party components](THIRD_PARTY.md).

## Development and sharing

Run `scripts/Test.ps1` after changes. Build extensions with `runtime/node.exe scripts/Build-Firefox.mjs` and `runtime/node.exe scripts/Build-Chrome.mjs`.

`scripts/Package.ps1` builds `outputs/Cake-Tagger.zip` from tracked project files and checksum-verified assets. It includes `extensions/Cake-Tagger-Firefox.zip` and the unpacked `extensions/chrome/` directory. Private data, media, scratch files and Git history are excluded. Share this package rather than the working directory.

Source lives in the project root and `extension/`; documentation in `docs/`, tooling in `scripts/`, and synthetic tests in `tests/`. `work/`, `data/` and `outputs/` are ignored.

Further reading: [architecture](docs/TECHNICAL.md), [integration contract](docs/INTEGRATION.md), [testing](docs/TESTING.md).
