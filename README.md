# Cake Tagger

Local AI-assisted video tagging for cake.ski. The Firefox and Chrome extensions suggest tags beside the site's upload videos. You review the suggestions before applying them or downloading JSON.

Inference runs locally in Python using JoyTag FP32 on the CPU.

## Getting started

Requires Windows x64 and Firefox 140+ or Chrome 120+.

1. Download `Cake-Tagger.zip` from [GitHub Releases](https://github.com/Forsaken5687/Cake-Tagger/releases) and extract it into a writable folder.
2. Download the separate ZIP for your browser from the same release and [install the extension](docs/BROWSERS.md).
3. Run `Cake-Tagger.exe` and leave its terminal open.
4. Select videos in cake.ski's upload area. New videos are analyzed automatically by default.
5. Review the suggestions and choose **Apply tags**. Add manual tags through the site's own input.

The extension preserves existing tags and never publishes posts. **Selecting Bulk files can already upload drafts through cake.ski itself.**

Use **Download JSON** to keep results before closing or reloading the upload page. **Quit**, available on the upload toolbar and extension menu, stops the local service and unfinished analysis.

The terminal shows operational logs. Press **Ctrl+C** to stop gracefully, or use **Quit** in the extension. Closing the terminal can force termination while native work is active; use these controls to wait for cleanup. Logs omit filenames, tags, payloads and session tokens.

`Cake-Tagger.exe` checks dependency versions and model checksums, restores missing or damaged model weights, and prepares the isolated Python runtime automatically. A source checkout downloads missing verified dependencies on first use; complete releases include the ready-to-run interpreter and dependencies directly in `runtime/`, without installation archives.

## Settings

Open **Settings** on the upload toolbar. Controls are grouped into General, Analysis, Suggestions and Excluded tags. Preferences are shared by all connected browsers and persist on the local server.

- **Language:** Automatic, German or English. Automatic follows the site's language in upload views. Tag names stay unchanged.
- **Automatic analysis:** Start analysis when new upload videos are selected.
- **Images per video:** Automatic by duration, or a fixed count from 4 to 48.
- **CPU parallelism:** Automatic uses the server's recommendation. Manual values can use up to the displayed hardware limit; higher counts can be slower.
- **Suggestion threshold:** Frame score setting for recurring evidence (default: 40%). Tag-specific calibration and temporal support rules also apply. Values above 40% raise calibrated tag cutoffs by the same amount. This is not a probability of correctness. Changes apply to new upload analyses.
- **Tag counts:** Set the maximum suggested and uncertain tags per video (defaults: 20 and 15). Limits apply to new upload analyses, not the review lab; existing selections are preserved. Set uncertain tags to 0 to omit them.
- **Suggestions:** Show scores or uncertain candidates, and exclude individual tags. `hairy` and `watermark` are excluded by default.
- **Site AI suggestions:** Hide cake.ski's own suggestion panels. This does not prevent the website from running its analysis.

**Save** applies changes. **Defaults** resets the form. Existing selections and corrections are preserved.

## Scores and limitations

The confidence score is the average of the two strongest sampled-frame scores. It is a model signal, not the probability that a tag is correct or the proportion of the video showing it.

- Videos must be at most 10 minutes. Codec support depends on the browser.
- Sampled frames can miss short events and cannot reliably establish motion or context.
- 220 of 303 bundled tags have automatic mappings under default settings. Mapping coverage is not recognition accuracy; see [tag coverage](docs/TAG_COVERAGE.md).
- Context-dependent and identity-related tags remain manual. Corrections do not train the model.
- Tag transfer requires unique filenames. Image sets are unsupported.

## Privacy

The browser decodes videos and sends sampled frames to the server on this computer. The inference server does not save videos or frames. Upload results remain in page memory; settings are saved locally. JSON exports contain filenames and tags.

The development review tool additionally saves a browser-local session backup. See [security boundaries](docs/SECURITY.md) and [third-party components](THIRD_PARTY.md).

## Development

- In a fresh source checkout, run `scripts\launch.cmd setup`, then `runtime/cpython/python.exe scripts/build_launcher.py` to create `Cake-Tagger.exe`.
- Run `runtime/cpython/python.exe scripts/test.py` after code changes.
- The [reusable Python package](docs/PYTHON.md) can also be integrated into another backend.
- Build extensions with `runtime/cpython/python.exe scripts/build_extension.py firefox` or `runtime/cpython/python.exe scripts/build_extension.py chrome`.
- Run `runtime/cpython/python.exe scripts/package.py` to create the complete Windows ZIP, separate browser-extension ZIPs and `SHA256SUMS.txt` in `outputs/`. Share the packages, not the working directory.
- Open `http://127.0.0.1:8765/review.html` after starting the service for the [review lab](docs/REVIEW.md): video annotations, frame evidence and A/B rule comparisons. This tool and tests are excluded from releases.
- For performance troubleshooting, open [runtime diagnostics](http://127.0.0.1:8765/diagnostics.html) while the service is running.

Application code lives in `src/client/`, `src/server/` and `src/shared/`; browser integration lives in `extension/`. Documentation, tooling and tests are in `docs/`, `scripts/` and `tests/`. Private state, experiments and generated packages belong in ignored `data/`, `work/` and `outputs/`.

Further reading: [architecture](docs/TECHNICAL.md), [integration](docs/INTEGRATION.md), [testing](docs/TESTING.md).
