# Settings

Open **Settings** on the upload toolbar. Controls are grouped into General, Analysis, Suggestions and Excluded tags. Preferences are shared by all connected browsers and persist on the local server.

- **Language:** Automatic, German or English. Automatic follows the site's language in upload views. Tag names stay unchanged.
- **Automatic analysis:** Start analysis when new upload videos are selected.
- **Images per video:** Automatic by duration, or a fixed count from 4 to 48.
- **CPU parallelism:** Automatic uses the server's recommendation. Manual values can use up to the displayed hardware limit; higher counts can be slower.
- **Suggestion threshold:** Frame score setting for recurring evidence (default: 40%). Tag-specific calibration and temporal support rules also apply. Values above 40% raise calibrated tag cutoffs by the same amount. This is not a probability of correctness. Changes apply to new upload analyses.
- **Tag counts:** Set the maximum suggested and uncertain tags per video (defaults: 20 and 15). Limits apply to new upload analyses, not the review lab; existing selections are preserved. Set uncertain tags to 0 to omit them.
- **Suggestions:** Show scores or uncertain candidates, and exclude individual tags. `hairy` and `watermark` are excluded by default.
- **Site AI suggestions:** Hide cake.ski's own suggestion panels. This does not prevent the website from running its analysis.

**Save** applies changes. **Defaults** resets the form. Existing selections and corrections are preserved.

## Scores

The confidence score is the average of the two strongest sampled-frame scores. It is a model signal, not the probability that a tag is correct or the proportion of the video showing it.
