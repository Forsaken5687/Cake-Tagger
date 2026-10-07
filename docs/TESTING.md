# Testing

Run `scripts/Test.ps1` from a writable checkout with the bundled runtime available. It parses Python and PowerShell sources, runs Python unit tests, syntax-checks browser modules and runs `tests/*.test.mjs` with an isolated development JavaScript test tool. That tool is downloaded and checksum-verified under ignored `work/tools/`; it is not a backend or a release dependency. Tests use synthetic data and ignored `work/` directories.

## Automated coverage

Native checks cover shared-session queue limits, cancellation isolation, session recovery, batch streaming, chronological scores, effective hardware-derived thread overrides, hardware limits, provider metadata, origin boundaries and malformed input bodies. Also run a production API smoke check with restored native dependencies; mocked sessions do not establish inference compatibility or speed. Use identical decoded RGBA inputs, thread settings and exclusion policies when comparing paths. Record cold and warm runs separately; CPU time and RSS snapshots are not CPU utilization or peak model memory.

- Frame sampling boundaries, tag aggregation and uncertain candidate scores.
- Review-session restoration, import validation, ignored judgments, per-tag rules and A/B comparisons.
- Mapping coverage and manual-category exclusions.
- Central preference normalization, legacy migration without overwriting originals, and browser message relays.
- Automatic analysis queues, latest-selection behavior, disabling, failures and retained corrections.
- Export validation, tag origins, legacy policies and current exclusion snapshots.
- File message parent/origin/channel checks, sender boundaries, target matching and inherited tags.
- Theme token validation and automatic/explicit language behavior.
- Saved session URL validation and rejection of command-shaped payloads.
- An isolated local server: authenticated export, attachment download, Host/Origin rejection, private-path restrictions and preservation of legacy correction files.

Tests do not measure model accuracy or certify third-party binaries. They do not replace installing the extensions in their target browsers.

## Browser checks

Use local fixtures when no upload is permitted. Real cake.ski Bulk selection may upload drafts immediately. Test Firefox and Chrome independently; fixtures cannot prove target-browser permissions, codec behavior or service-worker lifecycle.

1. Open the upload area and check Settings in both languages.
2. Select synthetic videos in Single and Bulk layouts. Check automatic and manual analysis, uncertainty scores, deselection and applying tags. Add manual tags using the site's own field.
3. Change selection during preparation and inference. Check the latest pending selection, preserved corrections and cancellation without automatic retries.
4. Download JSON; inspect filenames, selected tags, original suggestions, exclusions and timings. Check visible download status and browser download-list entries.
5. Reload the page: results must not return, while preferences persist.
6. Change the site's accent color and language. Check chips, buttons, focus and Settings.
7. Verify unique filename matching, inherited Bulk tags and per-card exclusions. Check both member and maintainer roles.
8. Test Quit while idle and during inference. Confirm the Python process exits and saved preferences and existing data remain intact.
9. Open runtime diagnostics and run its synthetic single-image check. Record cold and warm runs separately.

Keep personal media and test reports outside Git and release packages.

## Review lab checks

From a source checkout, start `Review.cmd` and use synthetic videos. Check annotation and status changes, frame seeking, per-tag overrides, holdout visibility and A/B example navigation. Verify autosave restoration and JSON import/export without losing judgments. Check desktop and narrow layouts, evidence dismissal and startup failure reporting. See [review lab](REVIEW.md).

## Release checks

Run the test suite, build both extensions, then run `scripts/Package.ps1`. Verify both manifest versions, required modules, dependency checksums and license notices. Confirm that the release contains the Firefox ZIP and unpacked Chrome directory, and no developer tests, build tools, duplicate extension sources, `data/`, `work/`, videos, session tokens or Git history.

For exports, verify the visible preparation and download-manager status, and test a missing bridge receiver and a rejected download. Verify human clicks in Firefox content scripts as well as Chrome; synthetic page events must not trigger exports or shutdown.

Python HTTP tests additionally cover ambiguous body framing, connection admission limits, private routes, embedding policy and shutdown after browser disconnection. Catalog/aggregation and correction exports are checked against browser implementations. Real-model tests require the restored model and runtime; skipped checks must be reported.
