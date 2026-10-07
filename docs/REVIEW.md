# Review lab

Start the service with `Start.cmd` from a source checkout and open `http://127.0.0.1:8765/review.html`. The lab uses the local inference service to evaluate tag suggestions. Its experimental rules do not change the upload extension's suggestions. It is excluded from release packages.

## Review videos

1. Choose videos and run **Suggest tags**. Select a video from the queue.
2. Choose **Correct**, **Incorrect** or **Unclear** for each tag. Unclear judgments are excluded from evaluation. Search or enable **Show all tags** to add missing labels. Use Ãƒâ€” in the search field to clear the filter.
3. Click a tag name to inspect sampled frames and scores. Click a frame to seek the video. Close the evidence drawer with its close button, Escape or a click outside.
4. Choose **Complete & next** after reviewing the whole clip. **Previous** and **Next** navigate without completing a review. **Reopen review** returns a completed video to pending.

**Candidate minimum score (%)** controls which additional model matches appear for review (default: 20%). Lower it to inspect weaker signals. This display filter uses stored scores and does not require another analysis. Existing judgments and current/A/B suggestions stay visible. Recorded upload suggestions and comparison rules remain unchanged.

Changing a judgment marks the review as pending. Changing experimental rules or resampling preserves annotations. Only completed reviews contribute to accuracy metrics.

Candidates are sorted by confidence score, highest first. Click **Confidence score**, **Matching frames (A)** or **Tag** to sort by that column; click again to reverse the order. The sort preference is saved with the browser session. Missing evidence stays at the end.

**Confidence score** averages the two strongest frame scores. **Matching frames (A)** shows how many frames meet Variant A's threshold. Neither is a guaranteed probability of correctness.

## Compare and improve rules

**Compare rules** evaluates two variants against your annotations using the existing scores; no new inference is needed. Each variant has a score threshold and required frame coverage. Rules require at least two matching frames.

Enable **Compare columns** to see current, A and B predictions beside your judgments. In the evidence drawer, **Adjust tag rule** sets a custom threshold and coverage for one mapped tag. **Use global rule** removes the override.

**Problem tags** lists incorrect suggestions and missed tags. Choose current suggestions, A or B, then click an example to open its video and evidence.

- **Precision:** the fraction of suggested tags that agree with your annotations.
- **Recall:** the fraction of your positive tags detected.

Manual-only tags can lower recall. Use one review per clip to avoid counting duplicates. A/B scores use the mean across sampled frames; the displayed confidence score and production rules use their own aggregation.

## Development and holdout groups

Use **Development** videos to tune rules. Reserve **Holdout** videos for checking the final changes. About a quarter of videos are assigned to holdout by content hash; you can change the group explicitly. Identical content stays in the same group.

Holdout suggestions and metrics remain hidden until **Reveal holdout results** is enabled. Closely related clips can still bias the comparison, so this split alone does not establish independent accuracy.

## Sessions and downloads

The lab automatically saves annotations, scores, rules and preview images in the current browser. Selected videos are cached separately in this browser for automatic reconnection during session restore or JSON import. This uses browser disk storage; video files are never included in JSON exports. Wait for **Saved locally** before closing. Browser storage can be cleared; download JSON as a separate backup.

Under **Session options** you can change frame count, import JSON, save immediately or start a new session. **New session** clears this lab's browser backup after confirmation. **Restore session** reloads a saved session. Videos are restored from the browser cache by content hash. If the cache is unavailable or cleared, select missing videos again for playback or resampling. Video cache failures do not prevent annotation saves. Starting a new session also clears the video cache.

**Download JSON** includes analyzed videos, annotations, scores, timestamps and rules, but no video files or previews. **Import JSON** restores these results. Unreviewed analyzed videos are included, but excluded from accuracy metrics.

If the download does not appear, use **Download prepared JSON** or **Prepare alternative download**. The alternative link expires after five minutes and supports exports up to the server's 64 MB request limit. For historic tags no longer in the current catalog, use the local download.

Restart the local service after updating application files. Saved sessions remain in the browser.

## Offline reports

Open a terminal in the project folder and run:

```console
.\runtime\cpython\python.exe .\scripts\analyze_reviews.py "%USERPROFILE%\Downloads\cake-tag-review.json" .\work\review-analysis\report.md
```

Change the input filename to match your downloaded export. The reports are written to `work/review-analysis/report.md` and `report.json`. These reports cannot be imported as review sessions; keep the JSON downloaded from the lab to restore your work. Reports use completed, assessable judgments and the recorded group assignments and exclusions. Known website renames are resolved without changing the export. Session imports also migrate custom tag rules; conflicting rules after a rename are rejected rather than silently overwritten. Other historical labels absent from the current catalog are preserved and listed; rule replay uses the available mapping.
