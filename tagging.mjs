export function aggregate(frameScores, mapping, threshold = 0.5) {
  const predicted = [], uncertain = [];
  for (const [tag, indices] of Object.entries(mapping)) {
    const scores = frameScores.map(frame => Math.max(...indices.map(i => frame[i]))).filter(Number.isFinite).sort((a, b) => b - a);
    if (!scores.length) continue;
    const support = scores.filter(v => v >= threshold).length;
    const confidence = scores.length >= 2 ? (scores[0] + scores[1]) / 2 : scores[0];
    // Require support in at least two sampled images. A strong isolated frame remains uncertain.
    if (support >= Math.min(2, scores.length)) predicted.push({ tag, confidence, supportingFrames: support });
    else if (scores[0] >= threshold) uncertain.push({ tag, confidence: scores[0] });
  }
  predicted.sort((a, b) => b.confidence - a.confidence); uncertain.sort((a, b) => b.confidence - a.confidence);
  return { tags: predicted.slice(0, 20), uncertain: uncertain.slice(0, 15).map(row => row.tag), reviewRequired: true };
}
