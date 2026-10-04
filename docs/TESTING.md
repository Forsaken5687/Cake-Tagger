# Testing

Run `scripts/Test.ps1` from a writable checkout with the bundled runtime available. It syntax-checks JavaScript modules and runs all `tests/*.test.mjs` through Node's test runner. Tests use synthetic data and ignored `work/` directories.

## Automated coverage

Native checks cover shared-session queue limits, cancellation isolation, worker recovery, token refresh, chronological scores, provider metadata, origin boundaries and malformed input bodies. Also run a production API smoke check with restored native dependencies; mocked workers do not establish inference compatibility or speed. The optional native/WASM comparison tool checks synthetic score differences without personal media.

- Frame sampling boundaries, tag aggregation and uncertain candidate scores.
- Mapping coverage and manual-category exclusions.
- Preference normalization, persistence and browser message relays.
- Automatic analysis queues, latest-selection behavior, disabling, failures and retained corrections.
- Export validation, tag origins, legacy policies and current exclusion snapshots.
- File message parent/origin/channel checks, sender boundaries, target matching and inherited tags.
- Theme token validation and automatic/explicit language behavior.
- Saved session URL validation and rejection of command-shaped payloads.
- An isolated local server: authenticated export, attachment download, Host/Origin rejection, private-path restrictions and preservation of legacy correction files.

Tests do not measure model accuracy or certify third-party binaries. They do not replace installing the extensions in their target browsers.

## Standalone browser checks

1. Start the application and check the empty state and Settings dialog in both languages.
2. Select supported synthetic videos, analyze them, and review suggested/uncertain tags and scores.
3. Add and deselect tags; verify counters and origins.
4. Change file selection during preparation and verify the newest selection is retained.
5. Reselect identical file content during the session; corrections must remain.
6. Download JSON with default and custom exclusions; inspect filenames, selected tags, scores, policy and timings.
7. Reload the page; results must not return. Settings must persist.
8. Check cancellation, invalid codecs, size/duration limits and narrow layouts.
9. Open previews with mouse/keyboard, navigate, close with Escape, and verify focus recovery.

## Extension browser checks

Use local fixtures when no upload is permitted. Real cake.ski Bulk selection may upload drafts immediately.

Check Firefox and Chrome independently: installation, permissions, single/bulk views, automatic start and disabled mode, adding/removing files while busy, retained results, separate analysis/JSON download, unique filename matching and existing/per-card excluded tags. Test member-role search as well as maintainer Enter selection.

Change the site's accent color while the panel and Settings are open. Check buttons, focus, scores and selected chips. Verify Automatic language follows the page while explicit German/English stays selected.

Local fixtures can replace WebExtension APIs and intercept website calls, but cannot prove target-browser permissions, codec behavior, service worker lifecycle or full inference. Keep personal media and review reports outside Git and release packages.

## Release checks

Run the test suite, build both extensions, then run `scripts/Package.ps1`. Verify both manifest versions, required modules, dependency checksums and license notices. Confirm that the release contains the Firefox ZIP and unpacked Chrome directory, and no `data/`, `work/`, videos, session tokens or Git history.
