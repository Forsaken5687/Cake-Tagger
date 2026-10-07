# Cake Tagger

Local AI-assisted video tagging for cake.ski. The Firefox and Chrome extensions suggest tags beside the site's upload videos. You review the suggestions before applying them or downloading JSON.

Inference runs locally in Node using JoyTag FP32 on the CPU.

## Getting started

Requires Windows x64 and Firefox 140+ or Chrome 120+.

1. Extract the complete release into a writable folder.
2. Install the [browser extension](docs/BROWSERS.md).
3. Run `Start.cmd`.
4. Select videos in cake.ski's upload area. New videos are analyzed automatically by default.
5. Review the suggestions and choose **Apply tags**. Add manual tags through the site's own input.

The extension preserves existing tags and never publishes posts. **Selecting Bulk files can already upload drafts through cake.ski itself.**

Use **Download JSON** to keep results before closing or reloading the upload page. **Quit**, available on the upload toolbar and extension menu, stops the local service and unfinished analysis.

For a source checkout, run `Setup.cmd` once to download and verify dependencies. Complete releases include them; `Start.cmd` prepares the native runtime on first use.

## Settings

Open **Settings** on the upload toolbar. Preferences are shared by all connected browsers and persist on the local server.

- **Language:** Automatic, German or English. Automatic follows the site's language in upload views. Tag names stay unchanged.
- **Automatic analysis:** Start analysis when new upload videos are selected.
- **Images per video:** Automatic by duration, or a fixed count from 4 to 48.
- **CPU parallelism:** Automatic uses the server's recommendation. Manual values can use up to the displayed hardware limit; higher counts can be slower.
- **Suggestions:** Show scores or uncertain candidates, and exclude individual tags. `hairy` and `watermark` are excluded by default.
- **Site AI suggestions:** Hide cake.ski's own suggestion panels. This does not prevent the website from running its analysis.

**Save** applies changes. **Defaults** resets the form. Existing selections and corrections are preserved.

## Scores and limitations

The confidence score is the average of the two strongest sampled-frame scores. It is a model signal, not the probability that a tag is correct or the proportion of the video showing it.

- Videos must be at most 10 minutes. Codec support depends on the browser.
- Sampled frames can miss short events and cannot reliably establish motion or context.
- 219 of 302 bundled tags have automatic mappings under default settings. Mapping coverage is not recognition accuracy; see [tag coverage](docs/TAG_COVERAGE.md).
- Context-dependent and identity-related tags remain manual. Corrections do not train the model.
- Tag transfer requires unique filenames. Image sets are unsupported.

## Privacy

The browser decodes videos and sends sampled frames to the server on this computer. The inference server does not save videos or frames. Upload results remain in page memory; settings are saved locally. JSON exports contain filenames and tags.

The development review tool additionally saves a browser-local session backup. See [security boundaries](docs/SECURITY.md) and [third-party components](THIRD_PARTY.md).

## Development

- Run `scripts/Test.ps1` after code changes.
- Build extensions with `runtime/node.exe scripts/Build-Extension.mjs firefox` or `runtime/node.exe scripts/Build-Extension.mjs chrome`.
- Run `scripts/Package.ps1` to create `outputs/Cake-Tagger.zip`, containing the Firefox ZIP and unpacked Chrome extension. Share this package, not the working directory.
- Start `Review.cmd` for the [review lab](docs/REVIEW.md): video annotations, frame evidence and A/B rule comparisons. This tool and tests are excluded from releases.
- For performance troubleshooting, open [runtime diagnostics](http://127.0.0.1:8765/diagnostics.html) while the service is running.

Application code lives in `src/client/`, `src/server/` and `src/shared/`; browser integration lives in `extension/`. Documentation, tooling and tests are in `docs/`, `scripts/` and `tests/`. Private state, experiments and generated packages belong in ignored `data/`, `work/` and `outputs/`.

Further reading: [architecture](docs/TECHNICAL.md), [integration](docs/INTEGRATION.md), [testing](docs/TESTING.md).
