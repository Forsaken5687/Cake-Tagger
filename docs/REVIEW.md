# Review lab

The review lab is a development-only tool. Start `Review.cmd` from a source checkout. It uses the production sampling implementation and central native inference queue, but its experimental rules never change upload suggestions.

## Workflow

1. Choose local videos and analyze them. Select a video in the queue.
2. Correct its tags. **Show all tags** exposes the entire catalog, including manual-only tags. Mark ambiguous tags **Not assessable** rather than guessing; their judgments are excluded from precision, recall, problem reports and A/B improvements.
3. Mark **Review complete** after checking the whole clip. Changing annotations clears this mark. Rules and resampling preserve annotations; metrics only use completed reviews.
4. Click a tag name to inspect its sampled frames, individual scores and timestamps. Click a frame to seek the original video. Highlighted frames meet the selected experimental variant's threshold, not necessarily production's per-tag support rules.
5. Compare **Variant A** and **Variant B**. Each has global threshold and required-frame coverage. The evidence panel can override both values for one mapped tag; **Use global rule** removes that override. Every rule requires at least two matching frames. All experiments reuse existing scores and do not rerun inference.
6. Open **Problem tags** for frequent incorrect suggestions and missing tags. Select production, A or B and open an example directly. A/B changes identify improvements and regressions only on reviewed, assessable judgments.
7. Tune using the **Development** group. Approximately one quarter of clips are assigned to **Holdout** by a stable content-hash partition. Adding videos does not move existing clips. You can assign a group explicitly; identical hashes always move together. Holdout suggestions and metrics stay hidden until **Reveal holdout results**. Reveal them for a final check, not repeated tuning. Related footage and the same performer can still leak across groups; this partition does not establish independent accuracy.

## Saving and restoration

The lab automatically saves annotations, raw scores, both variants, grouping and sampled JPEG previews to IndexedDB in the current browser after changes and after each successful analysis. **Save now** flushes pending changes. Wait for **Saved locally** before closing. If storage is blocked or full, the page reports the failure and retains the working session; download JSON instead. Browser storage is tied to the browser profile and exact origin/port, can be cleared by the browser and is not a substitute for a separate backup.

On reopening, **Restore session** restores the saved draft. It never silently overwrites an existing session. Original videos are not stored: select them again to play or resample. Restored files are matched by SHA-256, not guessed by filename. Scores and annotations can be inspected without a video. **New session** removes this lab's backup after confirmation; it does not touch upload corrections, exports or backend preferences.

**Download JSON** preserves completed reviews, raw scores, timestamps, both variants, per-tag overrides, not-assessable tags and group assignments. It deliberately omits videos and preview images. **Import JSON** accepts current lab downloads, older version-2 review exports and draft snapshots. Known renamed tags are canonicalized on a copied record; imported files are not rewritten. Malformed data is rejected before replacing the current session. Imports are limited to 256 MB and 1,000 videos. A draft may also contain queued videos; standard review exports contain only completed analyses.

The visible **Download prepared JSON** link remains available if an automatic Blob download is declined. **Prepare alternative download** uses the backend attachment fallback, includes the same lab metadata and expires after five minutes. That fallback is subject to the server's 64 MB request limit and accepts the backend's current taxonomy. Historic retired annotations should use the local download path instead.

## Interpreting results

Precision is the fraction of suggested tags that agree with your reviewed labels. Recall is the fraction of reviewed positive tags detected. Empty denominators show a dash; manual-only labels can lower complete recall. Counts are over reviewed video records. Exact duplicate imports stay in the same group but may contribute multiple records, so use one review per clip when comparing results. The confidence score is a model signal, not a calibrated probability.

Production keeps its own thresholds, temporal rules and top-two confidence score. Experimental A/B confidence uses the mean across sampled frames. A custom threshold alone does not make an unavailable model label recognizable.

## Offline analysis

Run `runtime/node.exe scripts/Analyze-Reviews.mjs <review.json> work/review-analysis/report.md`. The script accepts review downloads and recovered request bodies, excludes unreviewed/ambiguous judgments, groups identical content, rejects conflicting duplicates and respects recorded exclusions. It uses the same stable content-hash split and explicit group assignments. Markdown and JSON reports are written only under ignored `work/`.

The review UI, session module, evaluator, development launcher and tests are excluded from production packages and extensions. No additional dependency or model download is required.
