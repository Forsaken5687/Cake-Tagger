# Security and privacy boundaries

Cake Tagger is a local application and browser extension under development. Code review and synthetic tests reduce known risks but do not establish that the project or its dependencies are free of vulnerabilities.

## Data flow

Video decoding and frame extraction run in the browser. Binary 448 × 448 RGBA samples are sent only to the local Node server for native CPU inference. The server does not accept file paths or save samples. Full videos and filenames are not sent for inference. Results stay in page memory; there is no project telemetry. Exported JSON contains filenames and content tags and can therefore contain private information.

Settings persist in ignored `data/preferences.json` on the local server. Original legacy browser preferences remain untouched after migration. The standalone server also writes an ignored `data/session.json` containing its random session token and process ID. Treat this file as private. Legacy corrections are not loaded or overwritten.

The extension's analysis does not upload videos, but cake.ski may stage Bulk drafts on file selection. Applying tags uses the site's normal input/search behavior. Its network requests are controlled by the website, not by the local model.

## Enforced boundaries

- The local server binds only to loopback and rejects unexpected Host/Origin values.
- Export/status/stop actions require a per-session random bearer token. Download links are random short-lived capabilities.
- Static files are explicitly allowlisted. Project data, tokens, Git files and scratch folders are not served.
- CSP limits scripts, connections and embedding; analysis pages use DOM text rather than untrusted HTML.
- Saved session addresses must match the expected loopback port, path and token shape. URLs are passed to PowerShell as data, not executable command fragments.
- Extension messages check extension identity, sender document and target website. Embedded transfer is confined to its own tab.
- Frame messages require the expected parent, origin and session channel. The Localhost application permits embedding only through a validated extension origin with cake.ski as its outer ancestor. Other pages deny embedding. Theme messages permit only known color tokens.
- Tag transfer requires a unique exact filename, allowed tag values and a live unchanged target. It preserves existing tags and explicit per-card exclusions.
- Preference persistence uses a field allowlist, authentication, hardware thread validation and atomic file replacement.
- Package builders exclude private data and verify pinned large artifacts. Third-party notices and provenance accompany dependencies.

## Remaining trust and limitations

`/api/infer` requires a bearer token, validates content type, frame size and thread settings, and uses a bounded queue. Extension pages request loopback access and acquire the token through a custom-header connection request. CORS permits extension origins and rejects unrelated website/null origins. Privileged extension requests may omit Origin. Installed extensions with loopback permission and local processes are inside the trust boundary; the handshake does not establish extension identity. The bridge passes the token only in the Localhost frame's URL fragment; the application moves it to session storage and removes the fragment. The token is never sent to cake.ski. Inference responses include optional system and Node memory snapshots with separate scopes. They do not inspect other processes or measure peak model RAM.

The browser, local operating system, pinned Node runtime, ONNX Runtime Node, community-converted model and cake.ski page remain trusted components. Checksums establish artifact identity; they do not prove that an artifact is safe. This project does not sandbox other applications running under the same local account.

Browsers decode media and Node loads native runtime binaries; keep supported browsers updated. Large batches can consume substantial CPU and memory despite per-video limits. The model's semantic accuracy and frame-coverage heuristics need an independently reviewed dataset.

The adapter depends on a changing website DOM. Unsupported changes should stop transfer, but complete target-browser and real-site checks remain necessary. Only filenames link separate-view analyses to upload cards; the extension does not verify the site's uploaded bytes.

Do not expose the standalone server to a LAN or public network. Do not share the working folder or session files; share the generated release instead. Keep licenses and asset provenance when distributing it.

## Maintenance

Review upstream release notes and advisories when changing dependencies, update version/checksum metadata together, and rerun the automated suite and browser checks. Useful sources: [Node security](https://nodejs.org/en/security/), [Node release notes](https://nodejs.org/en/blog/release/v24.19.0), [ONNX Runtime security](https://github.com/microsoft/onnxruntime/security).

When reporting a problem, include the application/browser version, a minimal synthetic reproduction and expected/actual behavior. Do not include session tokens, private videos or personal export data in public reports.
