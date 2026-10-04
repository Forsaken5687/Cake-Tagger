import { messageError } from './messages.mjs';
import { MAX_FRAMES, MAX_DURATION } from './sampling.mjs';
import { validateTimings, validateAnalysisPolicy, validateRuntime } from './analysis-settings.mjs';

export function tagSource(entry, tag) {
  return entry.tagSources?.[tag] || (entry.originalSuggestionsKnown === false ? 'unknown' : entry.result.tags.some(row => row.tag === tag) ? 'suggestion' : 'manual');
}
export function makeRecord(entry) {
  return { filename: entry.file.name, sha256: entry.result.sha256,
    tags: [...entry.selected].filter(([, enabled]) => enabled).map(([tag]) => tag),
    candidateTags: [...entry.selected.keys()], reviewed: !!entry.reviewed,
    tagSources: Object.fromEntries([...entry.selected.keys()].map(tag => [tag, tagSource(entry, tag)])),
    originalSuggestionsKnown: entry.originalSuggestionsKnown !== false,
    result: { ...entry.result, cached: undefined }, updatedAt: entry.updatedAt || new Date().toISOString() };
}
export function applyRecord(entry, record, baseline = record.result) {
  entry.result = { ...baseline, filename: entry.file.name };
  entry.originalSuggestionsKnown = record.originalSuggestionsKnown !== false;
  const enabled = new Set(record.tags);
  const candidates = [...new Set([...baseline.tags.map(row => row.tag), ...record.candidateTags, ...record.tags, ...baseline.uncertain])];
  entry.selected = new Map(candidates.map(tag => [tag, enabled.has(tag)]));
  // Preserve the actual source even if a later analysis changes the suggestions.
  entry.tagSources = Object.fromEntries(candidates.map(tag => [tag, record.tagSources?.[tag] || (record.candidateTags.includes(tag) || record.tags.includes(tag)
    ? record.originalSuggestionsKnown === false ? 'unknown' : record.result.tags.some(row => row.tag === tag) ? 'suggestion' : 'manual'
    : 'suggestion')]));
  entry.reviewed = record.reviewed; entry.updatedAt = record.updatedAt;
  return entry;
}
export function exportItem(entry) {
  const record = makeRecord(entry), known = record.originalSuggestionsKnown;
  const original = new Set(entry.result.tags.map(row => row.tag)), selected = new Set(record.tags);
  return { filename: record.filename, sha256: record.sha256, tags: record.tags, reviewed: record.reviewed,
    originalSuggestionsKnown: known, originalSuggestions: known ? entry.result.tags : null,
    tagSources: record.tagSources,
    addedTags: known ? record.tags.filter(tag => !original.has(tag)) : null,
    removedTags: known ? [...original].filter(tag => !selected.has(tag)) : null,
    deselectedTags: record.candidateTags.filter(tag => !selected.has(tag)), candidateTags: record.candidateTags,
    uncertain: entry.result.uncertain, uncertainScores: entry.result.uncertainScores ?? null, sampledFrames: entry.result.sampledFrames,
    threshold: entry.result.threshold ?? null, analysisPolicy: entry.result.analysisPolicy ?? null, samplingMode: entry.result.samplingMode ?? null, durationSeconds: entry.result.durationSeconds ?? null, model: entry.result.model,
    timings: entry.result.timings ?? null,
    runtime: entry.result.runtime ?? null,
    analysisCreatedAt: entry.result.createdAt ?? null, editedAt: record.updatedAt };
}
export function validateRecord(input, tags) {
  const allowed = new Set(tags);
  const list = value => {
    if (!Array.isArray(value) || value.length > tags.length || value.some(t => typeof t !== 'string' || !allowed.has(t))) throw messageError('error.invalidTagsInTheCorrection');
    return [...new Set(value)];
  };
  if (!input || typeof input.filename !== 'string' || !input.filename || input.filename.length > 240 || !/^[a-f0-9]{64}$/.test(input.sha256) || typeof input.reviewed !== 'boolean' || typeof input.originalSuggestionsKnown !== 'boolean') throw messageError('error.invalidFileAssociation');
  const r = input.result;
  validateAnalysisPolicy(r?.analysisPolicy);
  if (r?.samplingMode != null && !['auto', 'fixed'].includes(r.samplingMode)) throw messageError('error.invalidFrameSelection');
  if (r?.durationSeconds != null && (!Number.isFinite(r.durationSeconds) || r.durationSeconds <= 0 || r.durationSeconds > MAX_DURATION)) throw messageError('error.invalidVideoDuration');
  if (!r || r.sha256 !== input.sha256 || !Array.isArray(r.tags) || r.tags.length > tags.length || !Number.isInteger(r.sampledFrames) || r.sampledFrames < 1 || r.sampledFrames > MAX_FRAMES || (r.threshold != null && (!Number.isFinite(r.threshold) || r.threshold < 0 || r.threshold > 1)) || typeof r.model !== 'string' || r.model.length > 120) throw messageError('error.invalidAnalysisData');
  const suggestions = r.tags.map(row => {
    if (!row || !allowed.has(row.tag) || !Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 1 || (row.supportingFrames != null && (!Number.isInteger(row.supportingFrames) || row.supportingFrames < 1 || row.supportingFrames > r.sampledFrames))) throw messageError('error.invalidModelScores');
    return { tag: row.tag, confidence: row.confidence, ...(row.supportingFrames != null ? { supportingFrames: row.supportingFrames } : {}) };
  });
  const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
  const uncertain = list(r.uncertain);
  if (r.uncertainScores != null && (!Array.isArray(r.uncertainScores) || r.uncertainScores.length > uncertain.length)) throw messageError('error.invalidUncertainModelScores');
  const uncertainScores = r.uncertainScores == null ? null : r.uncertainScores.map(row => {
    if (!row || !uncertain.includes(row.tag) || !Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 1 || !Number.isInteger(row.supportingFrames) || row.supportingFrames < 0 || row.supportingFrames > r.sampledFrames) throw messageError('error.invalidUncertainModelScores');
    return { tag: row.tag, confidence: row.confidence, supportingFrames: row.supportingFrames };
  });
  if (input.tagSources != null && (typeof input.tagSources !== 'object' || Array.isArray(input.tagSources) || Object.entries(input.tagSources).some(([tag, source]) => !allowed.has(tag) || !['suggestion', 'manual', 'unknown'].includes(source)))) throw messageError('error.invalidTagOrigin');
  return { filename: input.filename, sha256: input.sha256, tags: list(input.tags), candidateTags: list(input.candidateTags),
    ...(input.tagSources != null ? { tagSources: Object.fromEntries(Object.entries(input.tagSources)) } : {}),
    reviewed: input.reviewed, originalSuggestionsKnown: input.originalSuggestionsKnown,
    result: { filename: input.filename, sha256: input.sha256, tags: suggestions, uncertain, uncertainScores, sampledFrames: r.sampledFrames, threshold: r.threshold ?? null, analysisPolicy: r.analysisPolicy ?? null, samplingMode: r.samplingMode ?? null, durationSeconds: r.durationSeconds ?? null, timings: validateTimings(r.timings), runtime: validateRuntime(r.runtime), model: r.model, createdAt: date(r.createdAt), reviewRequired: true },
    updatedAt: date(input.updatedAt) || new Date().toISOString() };
}
