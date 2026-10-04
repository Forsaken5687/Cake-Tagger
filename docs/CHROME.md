# Chrome extension

Requires Chrome Desktop 120 or later. The interface uses the local Cake Tagger server on Windows x64. Run `Start.cmd` before analysis.

## Load and update

Run the local application's `Start.cmd` before analysis. Updating to the native backend requires loopback permission. Only port 8765 is used by the extension.

1. Use `outputs/chrome/` after a local build, or use `extensions/chrome/` from the full release.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the folder containing `manifest.json`.
4. Reload cake.ski and open its upload area.

To update, replace the package files, reload the extension on `chrome://extensions`, and reload cake.ski. Page results are session-only and are lost on reload. Saved preferences remain.

## Use

Select videos in cake.ski's upload area. Bulk selection can create server-side drafts immediately. New videos are analyzed automatically by default; disable **Automatically analyze upload videos** in Settings to use **Suggest tags** manually.

In Settings, choose **Suggestions on upload cards** or **Side panel**. Both Single and Bulk uploads are supported. Review tags next to the existing video players, deselect incorrect tags and add missing ones. Expand **Other suggestions** to inspect uncertain candidates. Use **Apply tags** for each video; only selected tags are added, respecting existing tags, inherited Bulk tags and per-card exclusions.

The upload toolbar provides **Download JSON**, **Settings** and **Quit**. The extension menu provides **Open upload** and **Quit**. Quit shuts down the local program, including unfinished tasks; it does not merely close a tab. Download session results before quitting or reloading. The separate analysis window is removed; direct Localhost navigation provides service controls.

All views share server preferences. The upload interface follows the site's accent color and Automatic language setting. Layout changes retain results and corrections. Selection changes during analysis are processed afterwards. Files chosen before the extension was loaded must be selected again. Transfers require a unique exact filename; image sets are unsupported. Captions, performers, questions and publishing controls are untouched. The extension never submits posts.

## Development and validation

`runtime/node.exe scripts/Build-Chrome.mjs` produces the unpacked folder and ZIP. Integration code, a thin frame bridge, licenses and provenance are copied from a fixed list; native inference dependencies stay with the local server. PNG icons are derived from the project's own SVG.

Chrome uses a module service worker with static imports. `webext-api.js` adapts async message listeners through `sendResponse`. Video decoding and review run in the shared Localhost document; inference, tag aggregation and the resource queue run in Node. The background service worker retains no video data or inference session.

Automated tests and local fixtures cover messages, settings, manifests and UI behavior. Installation and the real website flow must also be checked in Chrome. See [testing](TESTING.md) and [security](SECURITY.md).

References: [service workers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics), [messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging).
