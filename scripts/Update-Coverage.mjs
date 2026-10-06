import fs from 'node:fs';
import { readTags, excluded } from '../src/shared/tag-policy.mjs';

const root = new URL('../', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
const tags = readTags(read('model/tags.txt'));
const mapping = JSON.parse(read('model/mapping.json'));
const labels = read('model/top_tags.txt').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
for (const [tag, indices] of Object.entries(mapping)) {
  if (!tags.includes(tag) || !indices.length || new Set(indices).size !== indices.length || indices.some(i => !Number.isInteger(i) || !labels[i])) throw Error(`Invalid mapping: ${tag}`);
}
// Explicit unresolved cases make taxonomy additions require a fresh mapping audit.
const reasons = new Map();
function group(names, reason) { for (const tag of names.split('|')) reasons.set(tag, reason); }
group('vertical|horizontal|hd|sd|no sound|long video|featured|welcome|ai-tagged-bare|ai-needs-review', 'Website metadata; not inferred from sampled images.');
group('teen|milf|gilf|asian|latina|ebony|interracial|russian|german|trans|gay|lesbian|femboy|sissy|tomboy', 'Age, identity or relationship category; excluded by policy.');
group('incest|forced|blackmail|freeuse|taboo|cuck|used|degrading', 'Narrative or consent context; excluded by policy.');
group('hairy', 'Mapped, but excluded by default following recognition mismatches.');
group('watermark', 'Excluded by default; no suitable model label.');
group('tease|amateur|rough|alternative|sloppy|egirl|dirty talk|edging|pet play|maledom', 'Requires context or a category distinction absent from the model vocabulary.');
group('ass shake|twerking|tit drop|slow motion', 'Requires motion or timing evidence; no suitable model label.');
group('compilation|pmv', 'Editing or media-type category; no reliable equivalent model label.');
group('fisting|side fuck|cum on pussy|chastity cage|gagging|pillow humping|rimming|gloryhole|ball sucking|held down|strap on|ball fondling|pegging', 'No suitable label in the pinned model vocabulary.');
group('clothed|sfw|shaved|no face', 'Cannot be inferred from the absence of nudity, hair or face detections.');
group('thick', 'Body category is broader than the available thick-thigh label.');
group('caption', 'Text or speech-bubble detection does not establish a caption.');
group('stockings', 'Available legwear labels do not distinguish stockings from other garments.');
group('oiled', 'Wet appearance does not establish applied oil.');
group('hair pull', 'The hair-pulled-back label describes a hairstyle, not pulling.');
group('fuck machine', 'Generic machinery does not establish this device.');
group('solo male', 'Needs a joint subject-count and subject-category rule; individual labels are insufficient.');
group('cum on self', 'Generic body-location labels do not identify who the recipient is.');
group('dyed hair', 'Hair color or multiple colors do not establish dye rather than a wig.');
group('cum on feet|cum on thighs', 'Generic body-location labels do not establish this location.');
group('gym', 'Gym clothing does not establish the setting.');
group('clown', 'Character-name labels are not a generic clown category.');
group('hijab', 'Generic kerchief labels do not establish this garment.');
group('scissoring', 'The available tribadism label is broader than this specific action.');
group('animated', 'Anime content; the anime_coloring label describes shading style rather than a general anime-content category.');
const scopes = {
  public: 'Public nudity only; other public scenes are not covered.',
  'changing room': 'Locker rooms only; other changing rooms are not covered.',
  'tit shake': 'Visual bouncing-breast label; sampled images do not track motion.',
  dance: 'Visual dancing label; sampled images do not track motion.'
};
const supported = tags.filter(tag => mapping[tag]?.length && !excluded.has(tag));
const manualOnly = tags.filter(tag => !supported.includes(tag));
const entries = tags.map(tag => {
  const automatic = supported.includes(tag);
  if (!automatic && !reasons.has(tag)) throw Error(`Missing audit reason: ${tag}`);
  return { tag, status: automatic ? 'automatic' : excluded.has(tag) ? 'default-excluded' : 'manual', labels: (mapping[tag] ?? []).map(i => labels[i]), ...(automatic ? scopes[tag] ? { scope: scopes[tag] } : {} : { reason: reasons.get(tag) }) };
});
const coverage = { supportedCount: supported.length, totalCount: tags.length, supported, manualOnly, entries };
fs.writeFileSync(new URL('model/coverage.json', root), JSON.stringify(coverage, null, 2) + '\n');
const escape = text => text.replaceAll('|', '\\|');
const report = `# Tag coverage\n\nUnder default settings, ${supported.length} of ${tags.length} tags have an automatic model mapping. Every taxonomy entry is audited below. Coverage describes available signals, not recognition accuracy or calibrated probability. User exclusions further reduce automatic coverage.\n\nMappings combine explicit aliases and concrete subtypes. They do not infer a tag from the absence of another detection. Temporal support thresholds remain unchanged. Snapshot labels for motion still require review.\n\n## Automatic mappings\n\n| Website tag | Pinned model labels | Scope limitation |\n| --- | --- | --- |\n${entries.filter(e => e.status === 'automatic').map(e => `| ${escape(e.tag)} | ${e.labels.map(x => '`' + escape(x) + '`').join(', ')} | ${e.scope ?? ''} |`).join('\n')}\n\n## Manual or excluded under default settings\n\n| Website tag | Status | Reason |\n| --- | --- | --- |\n${entries.filter(e => e.status !== 'automatic').map(e => `| ${escape(e.tag)} | ${e.status} | ${e.reason} |`).join('\n')}\n\nRemoving the default exclusion for \`hairy\` enables its existing mapping. Removing \`watermark\` does not create a model signal. Manual website entry remains available for all tags.\n\n## Regenerate\n\nRun \`runtime/node.exe scripts/Update-Coverage.mjs\` after changing the taxonomy, mapping or policy. The generator rejects invalid indices, duplicate indices and unresolved tags without an audit reason. The label vocabulary is the pinned \`model/top_tags.txt\`.\n`;
fs.writeFileSync(new URL('docs/TAG_COVERAGE.md', root), report);
console.log(`${supported.length}/${tags.length} automatic; ${manualOnly.length} manual or excluded.`);
