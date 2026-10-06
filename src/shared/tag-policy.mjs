// Context-dependent tags and metadata assigned by the upload site are manual-only.
export const excluded = new Set(('vertical|horizontal|hd|sd|no sound|long video|featured|welcome|ai tagged|ai tagged bare|ai needs review|4:3|ksjhgf|tightjob|teen|milf|gilf|asian|latina|ebony|interracial|russian|german|trans|gay|lesbian|femboy|sissy|tomboy|incest|forced|blackmail|freeuse|taboo|cuck|used|degrading').split('|'));
excluded.add('hairy');
excluded.add('watermark');
export function readTags(text) {
  return [...new Set(text.replace(/^\uFEFF/, '').split(/\r?\n/).map(s => s.trim()).filter(Boolean))];
}

// Preserve annotations across website taxonomy renames in all review readers.
const reviewRenames = { supine: 'lying on back', 'side fuck': 'lying on side', couch: 'on couch', 'League of Legends': 'league of legends', 'ai-tagged-bare': 'ai tagged bare', 'ai-needs-review': 'ai needs review' };
export const canonicalTagName = tag => Object.hasOwn(reviewRenames, tag) ? reviewRenames[tag] : tag;
