import { excluded } from './tag-policy.mjs';
export const ANALYSIS_VERSION = 'coverage-v5';
const details = new Set(['glasses', 'choker', 'collar', 'cat ears', 'bunny ears', 'maid outfit', 'skirt', 'underwear', 'lingerie', 'bikini', 'swimsuit', 'bra', 'panties', 'thigh highs', 'knee high socks', 'pantyhose', 'fishnet', 'high heels', 'hoodie', 'mask', 'earrings', 'piercings', 'hat', 'gag', 'blindfold', 'handcuffs', 'butt plug', 'dildo', 'vibrator', 'sex toy']);
export function aggregate(frameScores, mapping, threshold = 0.5, coverage = 'majority') {
  if (!['majority', 'brief'].includes(coverage)) throw Error('Ungültige zeitliche Abdeckung.');
  const required = coverage === 'majority' ? Math.max(2, Math.floor(frameScores.length / 2) + 1) : 2;
  const predicted = [], uncertain = [];
  for (const [tag, indices] of Object.entries(mapping)) {
    // Manual-only categories must not appear in either automatic output list.
    if (excluded.has(tag)) continue;
    const isDetail = coverage === 'majority' && details.has(tag);
    const tagThreshold = isDetail || tag === 'dance' ? Math.max(0.65, threshold) : threshold;
    const tagRequired = isDetail ? Math.max(2, Math.ceil(frameScores.length / 4)) : required;
    const scores = frameScores.map(frame => Math.max(...indices.map(i => frame[i]))).filter(Number.isFinite).sort((a, b) => b - a);
    if (!scores.length) continue;
    const support = scores.filter(v => v >= tagThreshold).length;
    const confidence = scores.length >= 2 ? (scores[0] + scores[1]) / 2 : scores[0];
    // Default: more than half of all sampled images, not just two isolated matches.
    if (support >= tagRequired) predicted.push({ tag, confidence, supportingFrames: support });
    else if (scores[0] >= threshold) uncertain.push({ tag, confidence, supportingFrames: support });
  }
  predicted.sort((a, b) => b.confidence - a.confidence); uncertain.sort((a, b) => b.confidence - a.confidence);
  const uncertainScores = uncertain.slice(0, 15);
  return { tags: predicted.slice(0, 20), uncertain: uncertainScores.map(row => row.tag), uncertainScores, reviewRequired: true };
}
