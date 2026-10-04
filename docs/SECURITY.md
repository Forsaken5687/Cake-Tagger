# Security and privacy boundaries

Cake Tagger is a local application and browser extension under development. Code review and synthetic tests reduce known risks but do not establish that the project or its dependencies are free of vulnerabilities.

## Data flow

Video decoding, frame extraction and model inference run inside the browser. Analysis data is held in page memory. There is no tagging backend or project telemetry. Exported JSON contains filenames and content tags and can therefore contain private information.

Settings persist in browser storage. The standalone server also writes an ignored `data/session.json` containing its random session token and process ID. Treat this file as private. Legacy corrections are not loaded or overwritten.

The extension's analysis does not upload videos, but cake.ski may stage Bulk drafts on file selection. Applying tags uses the site's normal input/search behavior. Its network requests are controlled by the website, not by the local model.

## Enforced boundaries

- The local server binds only to loopback and rejects unexpected Host/Origin values.
- Export/status/stop actions require a per-session random bearer token. Download links are random short-lived capabilities.
- Static files are explicitly allowlisted. Project data, tokens, Git files and scratch folders are not served.
- CSP limits scripts, connections and embedding; analysis pages use DOM text rather than untrusted HTML.
- Saved session addresses must match the expected loopback port, path and token shape. URLs are passed to PowerShell as data, not executable command fragments.
- Extension messages check extension identity, sender document and target website. Embedded transfer is confined to its own tab.
- Frame messages require the expected parent, origin and session channel. Theme messages permit only known color tokens.
- Tag transfer requires a unique exact filename, allowed tag values and a live unchanged target. It preserves existing tags and explicit per-card exclusions.
- Preference persistence uses a field allowlist and accepts only supported settings message types.
- Package builders exclude private data and verify pinned large artifacts. Third-party notices and provenance accompany dependencies.

## Remaining trust and limitations

The standalone `/api/runtime` endpoint requires the existing session token and rejects cross-origin requests. It reports system memory availability and the Node server's allocations; it does not inspect other processes. Extension pages do not contact this endpoint or request localhost access. Exported memory metrics are optional and distinguish their measurement scopes.

The browser, local operating system, pinned Node runtime, ONNX Runtime Web, community-converted model and cake.ski page remain trusted components. Checksums establish artifact identity; they do not prove that an artifact is safe. This project does not sandbox other applications running under the same local account.

Browsers decode media and execute WebAssembly; keep supported browsers updated. Large batches can consume substantial CPU and memory despite per-video limits. The model's semantic accuracy and frame-coverage heuristics need an independently reviewed dataset.

The adapter depends on a changing website DOM. Unsupported changes should stop transfer, but complete target-browser and real-site checks remain necessary. Only filenames link separate-view analyses to upload cards; the extension does not verify the site's uploaded bytes.

Do not expose the standalone server to a LAN or public network. Do not share the working folder or session files; share the generated release instead. Keep licenses and asset provenance when distributing it.

## Maintenance

Review upstream release notes and advisories when changing dependencies, update version/checksum metadata together, and rerun the automated suite and browser checks. Useful sources: [Node security](https://nodejs.org/en/security/), [Node release notes](https://nodejs.org/en/blog/release/v24.19.0), [ONNX Runtime security](https://github.com/microsoft/onnxruntime/security).

When reporting a problem, include the application/browser version, a minimal synthetic reproduction and expected/actual behavior. Do not include session tokens, private videos or personal export data in public reports.
