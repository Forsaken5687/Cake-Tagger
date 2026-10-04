# Chrome extension

Requires Chrome Desktop 120 or later. The model and inference runtime are bundled, so the extension does not need the standalone server.

## Load and update

1. Extract `outputs/Cake-Tagger-Chrome.zip`, use `outputs/chrome/` after a local build, or use `extensions/chrome/` from the full release.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the folder containing `manifest.json`.
4. Reload cake.ski and open its upload area.

To update, replace the package files, reload the extension on `chrome://extensions`, and reload cake.ski. Page results are session-only and are lost on reload. Saved preferences remain.

## Use

Select videos in the upload area. New files automatically open the embedded analysis panel and start analysis by default. Settings includes **Automatically analyze upload videos** to disable this behavior. When disabled, use **Open** and **Suggest tags** manually.

Review the results, then click **Apply tags** on each video's card. Single and Bulk are supported. Existing tags and per-card exclusions are preserved. The extension does not submit posts, answer upload questions, change performers or transfer video files to the site. cake.ski itself may upload Bulk drafts immediately when files are selected.

The toolbar icon opens a separate analysis view with JSON export. The separate and embedded views share settings within Chrome; Firefox has its own storage. Both connected views follow the selected cake.ski tab's colors and optional Automatic language setting.

Reselect files that were chosen before the extension was loaded. Transfers require a unique exact filename. Image sets are unsupported.

## Development and validation

`runtime/node.exe scripts/Build-Chrome.mjs` produces the unpacked folder and ZIP. Shared code, licensed dependencies and provenance are copied from a fixed list; large assets are checksum-verified. PNG icons are derived from the project's own SVG.

Chrome uses a module service worker with static imports. `webext-api.js` adapts async message listeners through `sendResponse`. Analysis runs in the visible extension document and its worker, so service worker suspension does not hold video data or interrupt inference.

Automated tests and local fixtures cover messages, settings, manifests and UI behavior. Installation and the real website flow must also be checked in Chrome. See [testing](TESTING.md) and [security](SECURITY.md).

References: [service workers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics), [messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging).
