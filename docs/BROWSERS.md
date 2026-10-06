# Browser extensions

Cake Tagger requires Windows x64 and the local service started with `Start.cmd`. Extensions connect to port 8765 and provide upload controls; inference runs in Node.

## Firefox

Requires Firefox Desktop 140 or later. The development package is unsigned.

1. Extract `outputs/Cake-Tagger-Firefox.zip` (`extensions/Cake-Tagger-Firefox.zip` in the full release).
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on** and select the extracted `manifest.json`.
4. Allow access to cake.ski and loopback when requested, then reload cake.ski.

To update, replace the extracted files, reload the add-on in about:debugging, then reload cake.ski. Temporary add-ons are removed when Firefox restarts. Permanent Firefox installation requires a signed extension.

## Chrome

Requires Chrome Desktop 120 or later.

1. Use `outputs/chrome/` (`extensions/chrome/` in the full release).
2. Open `chrome://extensions` and enable **Developer mode**.
3. Choose **Load unpacked** and select the folder containing `manifest.json`.
4. Reload cake.ski and open its upload area.

To update, replace the folder contents, reload the extension, then reload cake.ski. Export page results before reloading; saved preferences remain.

## Upload workflow

Select videos in the site's Single or Bulk upload area. **Bulk selection can create server-side drafts immediately.** New videos are analyzed automatically by default; disable automatic analysis in **Settings** to start manually.

Review suggested tags beside the existing video player, deselect incorrect suggestions, and add manual tags through the site's own input. Uncertain candidates remain unchecked. Enable **Hide cake.ski AI tag suggestions** in **Settings** to hide the site-provided suggestion panels in Single and Bulk uploads; turning it off restores their normal visibility. This changes visibility only, not the site analysis or existing tags. **Apply tags** adds selected suggestions while preserving existing tags, inherited Bulk tags and per-card exclusions. Captions, performers and publishing controls are untouched; the extension never publishes posts.

The upload toolbar provides analysis controls, **Download JSON**, **Settings** and **Quit**. The extension menu provides **Open upload** and **Quit**. Quit stops the local service and unfinished work. Files selected before the extension loaded must be selected again. Transfers require unique exact filenames; image sets are unsupported.

Both extensions require storage and download permissions. Browser download preferences control the destination; existing filenames are uniquified. Preferences are shared by the local server. Automatic language and accent colors follow the site.

## Development

Build with `runtime/node.exe scripts/Build-Extension.mjs firefox` or `runtime/node.exe scripts/Build-Extension.mjs chrome`. Each build assembles a fresh allowlisted package. Previous unpacked contents are preserved under ignored `work/extension-build/`, outside current releases.

Firefox uses a background script; Chrome uses a module service worker and `extension/webext-api.js` for asynchronous messaging. Integration code, license notices and provenance are bundled; model binaries remain with the local service. See [testing](TESTING.md), [integration](INTEGRATION.md) and [security](SECURITY.md).
