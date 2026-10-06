# Local tag review

This developer tool is available in the source checkout only. It is excluded from runtime releases and both extensions.

Run `Review.cmd` to start or reuse the local backend and open `http://127.0.0.1:8765/review.html`. No browser extension or cake.ski account is required. The normal upload workflow remains separate.

1. Choose local videos and a sampling count, then select **Suggest tags**.
2. Choose a video from the queue and watch it in the player. Correct the checked tags; search the full taxonomy to add missing tags. **Show all tags** exposes manual-only categories too.
3. Check **Review complete** only after checking the whole video. Editing a tag clears this mark. Unreviewed videos never contribute to comparison metrics.
4. Adjust the candidate threshold and frame coverage to compare experimental rules using the same model scores. This does not rerun inference, modify production rules or change your reviewed selections.
5. Select **Download JSON** before closing. Reviews and inference scores remain in page memory. The download is generated directly in the page and does not depend on the backend session. If the browser declines the initial download, click **Download prepared JSON**. The local link remains valid until a review changes or the page closes. If Blob downloads are unavailable, select **Prepare alternative download**, then click the prepared link. This optional alternative uses a backend attachment that expires after five minutes and is subject to a 64 MB request limit; it does not replace or discard the local snapshot. Reloading loses them; videos and sampled images are not included in the download.

The experiment uses a global threshold and requires at least two matching frames. Its score is the mean across all frames; production uses existing per-category support rules and the two strongest frames for its confidence score. The experiment is not a claim of better accuracy.

Precision is the fraction of predicted tags in your reviewed selection. Recall is the fraction of reviewed tags predicted. Empty denominators show a dash. Both are pooled across reviewed videos and only measure agreement with your annotations. Manual-only tags can reduce recall even when the model performs as designed. Use separate held-out videos before claiming improvements from tuned rules.

The version-2 download retains ordinary correction-export fields. Additional `evaluation` metadata includes the mapping snapshot, candidate rules, preprocessing version, timestamps, raw model scores and candidate suggestions, enabling offline recalculation. It contains no video bytes, image previews, server credentials or automatic disk records. Raw scores can make the JSON substantially larger than a normal upload export. Local review downloads have no HTTP request-size limit.

Videos are sampled by the same `src/client/sampling.mjs` implementation as the upload bridge, and inference uses the same native API and central backend queue. A changed frame-count setting reanalyzes videos while preserving reviewed labels; completed results with the same sampling setting are reused during this page session. The evaluator is not packaged in either extension.
