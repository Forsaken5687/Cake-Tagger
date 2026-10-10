import { validateRecord, makeRecord } from '../shared/corrections.mjs';
import { reviewExport, validateVariants, reviewPartition } from '../shared/evaluation.mjs';

export const REVIEW_DATABASE = 'cake-tagger-review-v1';
import { canonicalTagName as canonical } from '../shared/tag-policy.mjs';
const tagName = tag => typeof tag === 'string' && tag.length > 0 && tag.length <= 80 && !['__proto__', 'prototype', 'constructor'].includes(tag);

// Drafts contain annotations and evidence; video files use a separate browser cache.
export function createDraft(entries, variants, frames, language, candidateMinimum = 20, tagSort = {key:'score',direction:'descending'}, excludedTags) {
  return { version: 1, savedAt: new Date().toISOString(), variants, frames, language, candidateMinimum, tagSort: {...tagSort}, ...(excludedTags === undefined ? {} : {excludedTags:[...excludedTags]}),
    entries: entries.map(entry => ({
      file: { name: entry.file.name, size: entry.file.size ?? 0, lastModified: entry.file.lastModified ?? 0 }, knownHash: entry.knownHash,
      ...(entry.result ? { record: makeRecord(entry), scores: entry.scores, timestamps: entry.timestamps, previews: entry.previews ?? [], frameSetting: entry.frameSetting } : {}),
      ignoredTags: [...(entry.ignoredTags ?? [])], partition: entry.partition ?? 'auto'
    })) };
}

function importedRecord(item) {
  if (item.result) return item;
  const result = { ...item, tags: item.originalSuggestions ?? [], uncertain: item.uncertain ?? [],
    uncertainScores: item.uncertainScores ?? undefined, createdAt: item.analysisCreatedAt };
  return { filename: item.filename, sha256: item.sha256, tags: item.tags,
    candidateTags: item.candidateTags ?? [...new Set([...item.tags, ...result.tags.map(row => row.tag), ...result.uncertain])],
    reviewed: item.reviewed === true, originalSuggestionsKnown: item.originalSuggestionsKnown !== false,
    tagSources: item.tagSources, result, updatedAt: item.editedAt };
}

function renamedVariants(value){
 if(value==null)return value;
 const checked=validateVariants(value),result={};
 for(const [name,rule] of Object.entries(checked)){
  const tagRules={};
  for(const [tag,override] of Object.entries(rule.tagRules)){
   const key=canonical(tag),previous=tagRules[key];
   // Never silently pick one of two conflicting rules after a rename.
   if(previous&&(previous.threshold!==override.threshold||previous.coverage!==override.coverage))throw Error('review.invalidRules');
   tagRules[key]=override;
  }
  result[name]={...rule,tagRules};
 }
 return result;
}
export function restoreDraft(input, currentTags, mapping) {
  if (!input || !Array.isArray(input.entries) || input.version !== 1 || input.entries.length > 1000) throw Error('review.invalidSession');
  const variants=renamedVariants(input.variants);
  if(input.excludedTags !== undefined && (!Array.isArray(input.excludedTags) || input.excludedTags.length>303 || input.excludedTags.some(tag=>!tagName(tag))))throw Error('review.invalidSession');
  const excludedTags=input.excludedTags === undefined ? undefined : [...new Set(input.excludedTags.map(canonical))];
  const allowed = [...new Set([...currentTags,...(excludedTags??[]),...Object.values(variants??{}).flatMap(rule=>Object.keys(rule.tagRules)), ...input.entries.flatMap(entry => {
    const r = entry?.record;
    return [ ...(r?.tags ?? []), ...(r?.candidateTags ?? []), ...(r?.result?.tags ?? []).map(row => row.tag), ...(r?.result?.uncertain ?? []), ...(entry?.ignoredTags ?? []) ];
  }).map(canonical)])];
  if (allowed.some(tag => !tagName(tag))) throw Error('review.invalidSession');
  const entries = input.entries.map(saved => {
    if (!saved?.file || typeof saved.file.name !== 'string' || !saved.file.name || saved.file.name.length > 240 || !Number.isFinite(saved.file.size) || saved.file.size < 0 || !Number.isFinite(saved.file.lastModified)) throw Error('review.invalidSession');
    const entry = { file: { name:saved.file.name, size:saved.file.size, lastModified:saved.file.lastModified }, selected: new Map(), tagSources: {}, reviewed: false, ignoredTags: new Set(), partition: saved.partition ?? 'auto' };
    if (!['auto','development','holdout'].includes(entry.partition)) throw Error('review.invalidSession');
    if (!Array.isArray(saved.ignoredTags) || saved.ignoredTags.length > allowed.length || saved.ignoredTags.some(tag => !tagName(tag))) throw Error('review.invalidSession');
    entry.ignoredTags = new Set(saved.ignoredTags.map(canonical));
    if(saved.knownHash != null && !/^[a-f0-9]{64}$/.test(saved.knownHash))throw Error('review.invalidSession');
    entry.knownHash=saved.knownHash;
    if (!saved.record) return entry;
    // Canonicalize copied metadata without rewriting the imported file.
    const source = structuredClone(saved.record);
    source.tags = source.tags.map(canonical); source.candidateTags = source.candidateTags.map(canonical);
    source.result.tags = source.result.tags.map(row => ({ ...row, tag: canonical(row.tag) }));
    source.result.uncertain = source.result.uncertain.map(canonical);
    if (source.result.uncertainScores) source.result.uncertainScores = source.result.uncertainScores.map(row => ({ ...row, tag: canonical(row.tag) }));
    if (source.tagSources) source.tagSources = Object.fromEntries(Object.entries(source.tagSources).map(([tag, value]) => [canonical(tag), value]));
    const record = validateRecord(source, allowed);
    if(entry.knownHash && entry.knownHash!==record.sha256)throw Error('review.invalidSession');
    const scores = saved.scores?.map(row => Array.from(row));
    const config = { threshold: .5, coverage: .5, excludedTags: [] };
    reviewExport({ comparisonRules: config, videos: [{ sha256: record.sha256, modelScores: scores, timestamps: saved.timestamps }] },
      [{ sha256: record.sha256, sampledFrames: record.result.sampledFrames, durationSeconds: record.result.durationSeconds }], mapping, allowed);
    Object.assign(entry, { result: record.result, selected: new Map([...new Set([...record.candidateTags,...record.tags])].map(tag => [tag, record.tags.includes(tag)])),
      tagSources: record.tagSources ?? {}, reviewed: record.reviewed, originalSuggestionsKnown: record.originalSuggestionsKnown,
      updatedAt: record.updatedAt, scores: scores.map(row => Float32Array.from(row)), timestamps: saved.timestamps, frameSetting: saved.frameSetting });
    if (saved.previews != null && (!Array.isArray(saved.previews) || saved.previews.length > 48 || saved.previews.some(url => typeof url !== 'string' || url.length > 1000000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(url)))) throw Error('review.invalidSession');
    entry.previews = saved.previews ?? [];
    return entry;
  });
  // A content hash always belongs to a single partition, including duplicate imports.
  const partitions = new Map();
  for (const entry of entries) if (entry.result) {
    const previous = partitions.get(entry.result.sha256);
    if (previous && previous !== reviewPartition(entry)) throw Error('review.conflictingSplit');
    partitions.set(entry.result.sha256, reviewPartition(entry));
  }
  return { entries, excludedTags, variants: validateVariants(variants, allowed), frames: ['auto','4','6','8','12','16','24','32','48'].includes(String(input.frames)) ? String(input.frames) : 'auto',
    tagSort: ['tag','score','frames'].includes(input.tagSort?.key) && ['ascending','descending'].includes(input.tagSort?.direction) ? {key:input.tagSort.key,direction:input.tagSort.direction} : {key:'score',direction:'descending'},
    candidateMinimum: Number.isFinite(input.candidateMinimum) && input.candidateMinimum >= 0 && input.candidateMinimum <= 100 ? input.candidateMinimum : 20,
    language: ['de','en'].includes(input.language) ? input.language : undefined, savedAt: input.savedAt };
}

export function importReview(input, currentTags, mapping) {
  // Offline reports summarize a session but cannot restore its raw evidence.
  if (input && !input.items && !input.entries && Number.isInteger(input.reviewed) && Number.isInteger(input.unreviewed)) throw Error('review.reportNotSession');
  if (input?.version === 1 && Array.isArray(input.entries)) return restoreDraft(input, currentTags, mapping);
  if (input?.source !== 'cake-tagger-review' || !Array.isArray(input.items) || input.items.length > 1000) throw Error('review.invalidSession');
  const entries = input.items.map(item => {
    const record = importedRecord(item);
    return { file: { name: item.filename, size: 0, lastModified: 0 }, record, scores: item.evaluation?.modelScores,
      timestamps: item.evaluation?.timestamps, ignoredTags: item.evaluation?.ignoredTags ?? [], partition: item.evaluation?.partition ?? 'auto',
      frameSetting: item.samplingMode === 'auto' ? 'auto' : String(item.sampledFrames) };
  });
  return restoreDraft({ version: 1, entries, variants: input.evaluation?.variants, excludedTags: input.evaluation?.comparisonRules?.excludedTags, frames: 'auto' }, currentTags, mapping);
}

export function openReviewStore(factory = globalThis.indexedDB) {
  let database, videoDatabase;
  const open = () => database ??= new Promise((resolve, reject) => {
    if (!factory) return reject(Error('review.storageFailed'));
    const request = factory.open(REVIEW_DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sessions');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error('review.storageFailed'));
  });
  // Keep video storage separate so existing annotation databases need no upgrade.
  const openVideos = () => videoDatabase ??= new Promise((resolve,reject)=>{
    if(!factory)return reject(Error('review.videoCacheFailed'));
    const request=factory.open(REVIEW_DATABASE+'-videos',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('videos');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(Error('review.videoCacheFailed'));
  });
  const transaction = async (mode, action, video = false) => {
    const db = await (video ? openVideos() : open());
    return new Promise((resolve, reject) => {
      const name=video?'videos':'sessions';
      const tx = db.transaction(name, mode), request = action(tx.objectStore(name));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(tx.error ?? Error('review.storageFailed'));
    });
  };
  return { load: () => transaction('readonly', store => store.get('draft')),
    save: draft => transaction('readwrite', store => store.put(draft, 'draft')),
    loadVideo: hash => transaction('readonly', store => store.get(hash), true),
    saveVideo: (hash,file) => transaction('readwrite', store => store.put(file,hash), true),
    // Clear the optional cache first: failure must leave the annotation backup intact.
    clear: async () => {await transaction('readwrite', store => store.clear(),true);await transaction('readwrite', store => store.delete('draft'));} };
}
