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

1. Select videos in the cake.ski upload area. Bulk selection may already create server-side upload drafts.
2. By default, Cake Tagger opens and analyzes new videos automatically. Turn off **Automatically analyze upload videos** in Settings to start manually with **Open** and **Suggest tags**.
3. Review and edit the suggested tags.
4. Click **Apply tags** on each video's card.

Single and Bulk use the same panel. Closing it hides the analysis document without clearing its session. Selection changes during analysis are processed afterwards. Already analyzed files retain their results and corrections within the page session.

The toolbar icon opens the Localhost application with file selection, upload integration and JSON download. Choose the intended upload tab there before applying tags. Files selected before the extension was loaded must be selected again.

Only selected tags are added. Existing tags, inherited Bulk tags and per-card exclusions are respected. Captions, performers, upload questions and publishing controls are untouched. Exact filenames must match uniquely; image sets are unsupported.

The panel follows the connected page's colors and, in Automatic language mode, its language. Localhost and all extension views share server preferences. **Quit** is visible in the main page and embedded panel and shuts down the local program. JSON export is available in the separate view.

## Development and validation

Run `runtime/node.exe scripts/Build-Firefox.mjs` to build `outputs/firefox/` and the ZIP. The builder copies integration modules, the thin frame bridge, licenses and asset provenance from a fixed file list. Model and inference binaries stay with the local server. Licenses and provenance are included; private files and the Node executable are excluded.

Synthetic tests cover message boundaries, settings, filename matching, tag preservation and manifests. Local browser fixtures exercise the shared interface and upload adapter, but do not replace a complete Firefox test of installation, permissions, model inference and transfer. See [testing](TESTING.md).

For data handling and dependency trust, see [security](SECURITY.md).
