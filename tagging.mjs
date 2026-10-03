export const ANALYSIS_VERSION = 'coverage-v3';
const details = new Set(['glasses', 'choker', 'collar', 'cat ears', 'bunny ears', 'maid outfit', 'skirt', 'underwear', 'lingerie', 'bikini', 'swimsuit', 'bra', 'panties', 'thigh highs', 'knee high socks', 'pantyhose', 'fishnet', 'high heels', 'hoodie', 'mask', 'earrings', 'piercings', 'hat', 'gag', 'blindfold', 'handcuffs', 'butt plug', 'dildo', 'vibrator', 'sex toy']);
export function aggregate(frameScores, mapping, threshold = 0.5, coverage = 'majority') {
  if (!['majority', 'brief'].includes(coverage)) throw Error('Ungültige zeitliche Abdeckung.');
  const required = coverage === 'majority' ? Math.max(2, Math.floor(frameScores.length / 2) + 1) : 2;
  const predicted = [], uncertain = [];
  for (const [tag, indices] of Object.entries(mapping)) {
    // Frequent false positives in reviewed footage; keep available for manual selection.
    if (tag === 'hairy') continue;
    const isDetail = coverage === 'majority' && details.has(tag);
    const tagThreshold = isDetail ? Math.max(0.65, threshold) : threshold;
    const tagRequired = isDetail ? Math.max(2, Math.ceil(frameScores.length / 4)) : required;
    const scores = frameScores.map(frame => Math.max(...indices.map(i => frame[i]))).filter(Number.isFinite).sort((a, b) => b - a);
    if (!scores.length) continue;
    const support = scores.filter(v => v >= tagThreshold).length;
    const confidence = scores.length >= 2 ? (scores[0] + scores[1]) / 2 : scores[0];
    // Default: more than half of all sampled images, not just two isolated matches.
    if (support >= tagRequired) predicted.push({ tag, confidence, supportingFrames: support });
    else if (scores[0] >= threshold) uncertain.push({ tag, confidence: scores[0] });
  }
  predicted.sort((a, b) => b.confidence - a.confidence); uncertain.sort((a, b) => b.confidence - a.confidence);
  return { tags: predicted.slice(0, 20), uncertain: uncertain.slice(0, 15).map(row => row.tag), reviewRequired: true };
}
