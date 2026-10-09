import { messageError } from './messages.mjs';
import { excluded } from './tag-policy.mjs';
export const ANALYSIS_VERSION = 'coverage-v7';
// Arrays are alternative labels. An all-rule requires every group in the same
// frame; its score is the weakest group's evidence, not a joint probability.
// Fixed production calibration, mirrored in model/policy.json and checked by tests.
export const calibratedTagRules = Object.freeze({
  piercings:Object.freeze({threshold:.45,coverage:.125}),
  'vaginal penetration':Object.freeze({threshold:.3,coverage:.51})
});
export function mappingGroups(rule) { return Array.isArray(rule) ? [rule] : rule.all; }
export function mappedFrameScore(frame, rule) {
  if (Array.isArray(rule)) return Math.max(...rule.map(index => frame[index]));
  return Math.min(...mappingGroups(rule).map(group => Math.max(...group.map(index => frame[index]))));
}
export const details = new Set(['glasses', 'choker', 'collar', 'cat ears', 'bunny ears', 'maid outfit', 'skirt', 'underwear', 'lingerie', 'bikini', 'swimsuit', 'thigh highs', 'knee high socks', 'pantyhose', 'fishnet', 'high heels', 'hoodie', 'mask', 'earrings', 'piercings', 'blindfold', 'handcuffs', 'butt plug', 'dildo', 'vibrator', 'sex toy']);
export function aggregate(frameScores, mapping, threshold = 0.5, coverage = 'majority', options = {}) {
  if (!['majority', 'brief'].includes(coverage)) throw messageError('error.invalidTemporalCoverage');
  const required = coverage === 'majority' ? Math.max(2, Math.floor(frameScores.length / 2) + 1) : 2;
  const predicted = [], uncertain = [];
  const userExcluded = new Set(options.excludedTags ?? ['hairy', 'watermark']);
  for (const [tag, indices] of Object.entries(mapping)) {
    // Manual-only categories must not appear in either automatic output list.
    if ((excluded.has(tag) && tag !== 'hairy' && tag !== 'watermark') || userExcluded.has(tag)) continue;
    const isDetail = coverage === 'majority' && details.has(tag);
    const calibrated = coverage === 'majority' ? (options.tagRules ?? calibratedTagRules)[tag] : null;
    // Above the 40% default, user strictness also raises calibrated cutoffs.
    const tagThreshold = calibrated ? Math.min(1,calibrated.threshold + Math.max(0,threshold-.4)) : isDetail || tag === 'dance' ? Math.max(0.65, threshold) : threshold;
    const tagRequired = calibrated ? Math.max(2,Math.ceil(frameScores.length*calibrated.coverage)) : isDetail ? Math.max(2, Math.ceil(frameScores.length / 4)) : required;
    const scores = frameScores.map(frame => mappedFrameScore(frame, indices)).filter(Number.isFinite).sort((a, b) => b - a);
    if (!scores.length) continue;
    const support = scores.filter(v => v >= tagThreshold).length;
    const confidence = scores.length >= 2 ? (scores[0] + scores[1]) / 2 : scores[0];
    // Default: more than half of all sampled images, not just two isolated matches.
    if (support >= tagRequired) predicted.push({ tag, confidence, supportingFrames: support });
    else if (scores[0] >= threshold) uncertain.push({ tag, confidence, supportingFrames: support });
  }
  predicted.sort((a, b) => b.confidence - a.confidence); uncertain.sort((a, b) => b.confidence - a.confidence);
  // The review lab can inspect the full candidate set without changing upload defaults.
  const uncertainScores = options.limitResults === false ? uncertain : uncertain.slice(0, 15);
  return { tags: options.limitResults === false ? predicted : predicted.slice(0, 20), uncertain: uncertainScores.map(row => row.tag), uncertainScores, reviewRequired: true };
}
