# Security boundaries

## Local data and trust

The browser decodes local videos and sends sampled RGBA frames to the authenticated Python service on this computer. The service accepts no media paths and saves no inference inputs. Upload results remain in page memory. Settings are stored in ignored `data/preferences.json`; pre-existing correction files are preserved. Exports contain filenames and content tags and may contain private information.

The development review lab stores annotations, scores, previews and selected original videos in browser-local IndexedDB for restoration. Videos are excluded from JSON exports and release packages. There is no telemetry.

The extension performs tag transfer only. It does not publish posts. Selecting Bulk files on cake.ski can already upload drafts through the website; use local fixtures when testing without uploads.

## Loopback API

The service binds only to `127.0.0.1`. The exact Host and permitted Origin are required, preventing alternate-host and website-origin requests. State-changing and inference routes require a per-process bearer token, except the guarded connection handshake. Static serving uses an explicit allowlist, never arbitrary filesystem paths. Model weights, private data and backend source are inaccessible.

Local handshakes require the exact local Origin and custom client header. Extension origins receive narrowly scoped CORS permission; privileged extension requests may omit Origin. Local processes and installed extensions with loopback access are inside this trust boundary. The handshake does not verify extension identity. Tokens stay in the extension/Localhost channel and are never sent to cake.ski.

Request sizes, frame dimensions/counts, content types, corrections and hardware overrides are validated. Duplicate Content-Length and chunked request framing are rejected. HTTP connections and waiting inference jobs are bounded independently. Socket reads have an inactivity timeout. Native inference is cancelled between calls; Quit waits for active work before closing the program. A stuck native library call cannot safely be interrupted in-process.

Downloads use random, short-lived capability URLs and fixed attachment filenames. The URLs intentionally need no additional bearer header so browser download managers can access them. Keep them private; snapshots expire after five minutes and are bounded to three in memory.

## Browser integration

Messages validate parent window, origin, channel and file objects. Background relays validate senders and the owning Cake tab. Embedded views cannot address unrelated tabs. Tag transfers validate the catalog, unique filenames and live target pills; already added tags survive a later error.

Trusted user actions are required for applying tags, downloads and Quit. Connection recovery probes the transport before commands and preserves current results. Actions with unknown outcomes are never replayed automatically. Content Security Policy restricts local scripts and embedding to validated extension bridges and cake.ski.

## Dependencies and external use

CPython, CPU ONNX Runtime, model weights and wheels are pinned in `scripts/assets.json`. Setup verifies archive SHA-256 values before extraction; wheel paths are checked before installation. Third-party licenses remain in the prepared runtime and installed package metadata. Hashes establish artifact identity, not semantic safety.

The application-local interpreter isolates search paths from global Python and user-site packages. The current account, operating system, browser, native runtime, pinned model and site remain trusted components. The project does not sandbox other applications under the same account.

External integrations should import the core into their existing authenticated backend. The local listener has no remote-bind mode and is not a public deployment server. Define independent authentication, tenant isolation, upload limits, timeouts, allowed models and queue policy. Do not let remote callers choose filesystem/model paths.

Keep browsers and dependencies updated, review upstream advisories, and update versions, checksums and notices together. Relevant sources: [Python security](https://www.python.org/dev/security/), [ONNX Runtime security](https://github.com/microsoft/onnxruntime/security). Automated tests do not certify third-party binaries or recognition accuracy.
