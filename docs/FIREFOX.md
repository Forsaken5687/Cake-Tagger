# Firefox extension

Requires Firefox Desktop 140 or later. The extension connects the shared Localhost interface to the upload adapter. It contains no model runner or copy of the analysis application. Inference requires the local Cake Tagger server on Windows x64, started with `Start.cmd`.

## Load and update

Run the local application's `Start.cmd` before analysis. Updating to the native backend requires loopback permission. Only port 8765 is used by the extension.

The development package is unsigned:

1. Extract `outputs/Cake-Tagger-Firefox.zip`, or use `extensions/Cake-Tagger-Firefox.zip` from the full release.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on** and select the extracted `manifest.json`.
4. Allow access to cake.ski and `127.0.0.1` if requested, then reload any open cake.ski tab.

Firefox removes temporarily loaded add-ons after a restart. A permanent distribution requires signing; the project does not submit packages automatically.

To update, replace the extracted files, click **Reload** in `about:debugging`, and reload cake.ski. Current page results are lost on reload; saved settings remain.

## Use

Select videos in cake.ski's upload area. Bulk selection can create server-side drafts immediately. New videos are analyzed automatically by default; disable **Automatically analyze upload videos** in Settings to use **Suggest tags** manually.

Both Single and Bulk uploads are supported. Review tags next to the existing video players, deselect incorrect tags and add missing ones. Uncertain candidates appear beside selected suggestions and remain unchecked. Use **Apply tags** for each video; only selected tags are added, respecting existing tags, inherited Bulk tags and per-card exclusions.

The upload toolbar provides **Download JSON**, **Settings** and **Quit**. The extension menu provides **Open upload** and **Quit**. Quit shuts down the local program, including unfinished tasks; it does not merely close a tab. Download session results before quitting or reloading. The separate analysis window is removed; direct Localhost navigation redirects to cake.ski.

All views share server preferences. The upload interface follows the site's accent color and Automatic language setting. Layout changes retain results and corrections. Selection changes during analysis are processed afterwards. Files chosen before the extension was loaded must be selected again. Transfers require a unique exact filename; image sets are unsupported. Captions, performers, questions and publishing controls are untouched. The extension never submits posts.

## Development and validation

Run `runtime/node.exe scripts/Build-Firefox.mjs` to build `outputs/Cake-Tagger-Firefox.zip`. Unpacked build intermediates stay in ignored `work/extension-build/firefox/`. The builder copies integration modules, the thin frame bridge, licenses and asset provenance from a fixed file list. Model and inference binaries stay with the local server. Licenses and provenance are included; private files and the Node executable are excluded.

Synthetic tests cover message boundaries, settings, filename matching, tag preservation and manifests. Local browser fixtures exercise the shared interface and upload adapter, but do not replace a complete Firefox test of installation, permissions, model inference and transfer. See [testing](TESTING.md).

For data handling and dependency trust, see [security](SECURITY.md).
