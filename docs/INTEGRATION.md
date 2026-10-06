# Browser integration

Firefox and Chrome use the same upload adapter and local Node inference service. The embedded processing document handles browser decoding and session state. Start the service before analyzing videos.

## Upload contract

The adapter uses the website's rendered DOM rather than a stable public API. Recheck selectors and behavior whenever cake.ski changes its upload interface.

| View | Tag target | Matching |
| --- | --- | --- |
| Single | Tag input inside `.stok-up .stok-pillfield` | Filename from `.stok-up-drop.has-file`; image strips are excluded. |
| Bulk | Tag input inside each `.stok-bulk-card` | Exact `.stok-bulk-name` text; completed and hidden cards are excluded. |

Shared Bulk tags and performers live outside individual cards. Tag controls use `.stok-ta-input`; assigning text alone does not update the website's selected tags. The adapter invokes the Enter selection path and waits for visible tag pills to confirm each addition. Search behavior can differ between member and maintainer roles.

The site changes from Single to Bulk when multiple selected files include a video. Image-only sets follow a separate workflow and are not supported by this analyzer.

**Bulk file selection can already upload server-side drafts.** A test requiring no upload must use a local fixture, not select files on the live site.

## Workflow and boundaries

1. The content script captures user-selected video File references in the active upload mount.
2. A thin extension-origin bridge receives files through a checked parent/origin/session channel and forwards them to the shared Localhost application inside it. The extension performs no inference, aggregation or job scheduling.
3. New files are analyzed automatically when enabled. Busy selection changes are queued; existing content hashes retain results and corrections.
4. The user reviews suggestions on native upload cards and explicitly applies selected tags. The common toolbar provides JSON export and Quit.
5. The background relay checks the sender and target tab. Embedded views can address only their own Cake tab.
6. The adapter requires a unique filename, validates tags against the bundled list, and rechecks the live target for each addition.

Inherited Bulk tags count as present. A shared tag explicitly removed from one card remains excluded for that card. Duplicate tags are skipped. If a card disappears or an input is edited during transfer, the adapter stops. Previously added tags remain; there is no rollback.

The extension does not submit files, captions, performers, upload questions, confirmations or publishing actions. Filename matching does not verify content identity between the analysis file and upload card.

## Settings, theme and browser differences

Preferences are stored on the local backend. Content scripts read them through the extension background; settings saves use the authenticated backend API. Legacy extension settings migrate only if server settings have not been initialized. Theme updates carry only known color tokens and page language; they are not persisted.

Firefox uses a Manifest V3 background script. Chrome uses a module service worker and an async messaging adapter. The Localhost application uses a restricted channel bridge to request upload integration. The extension menu opens the site upload area. Its isolated content script registers a tab/channel and communicates with the hidden processing bridge through an acknowledged runtime port. Neither relay performs inference or owns the analysis queue.

## Validation

Synthetic tests cover sender boundaries, file message channels, target ambiguity, tag plans and manifests. Local fixtures use isolated upload and analysis origins and intercepted APIs. Real-browser checks are still needed for permissions, codecs, full model inference, member-role search and DOM changes. See [testing](TESTING.md).
