import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readTags, excluded } from '../src/shared/tag-policy.mjs';

const root = new URL('../', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
const tags = readTags(read('model/tags.txt'));
const mapping = JSON.parse(read('model/mapping.json'));
const labels = read('model/top_tags.txt').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
for (const [tag, indices] of Object.entries(mapping)) {
  if (!tags.includes(tag) || !indices.length || indices.some(i => !Number.isInteger(i) || !labels[i])) throw Error(`Invalid mapping: ${tag}`);
}
const supported = tags.filter(tag => mapping[tag]?.length && !excluded.has(tag));
const manualOnly = tags.filter(tag => !supported.includes(tag));
const coverage = { supportedCount: supported.length, totalCount: tags.length, supported, manualOnly };
fs.writeFileSync(new URL('model/coverage.json', root), JSON.stringify(coverage, null, 2) + '\n');
const report = `# Tag coverage\n\nUnder default settings, ${supported.length} of ${tags.length} tags have an automatic model mapping. This describes coverage, not recognition accuracy.\n\n## Manual-only under default settings\n\nThese tags either lack a suitable mapping or are deliberately excluded from automatic suggestions. All remain available for manual selection.\n\n${manualOnly.map(tag => `- ${tag}`).join('\n')}\n\n\`hairy\` and \`watermark\` are excluded by default because of repeated mismatches. These two exclusions can be removed in Settings; additional custom exclusions reduce automatic coverage. Context-dependent and identity-related categories, and technical tags assigned by the website, are not inferred from images.\n\n## Regenerate\n\nAfter changing the taxonomy, mapping or exclusion policy, run \`runtime/node.exe scripts/Update-Coverage.mjs\`.\n`;
fs.writeFileSync(new URL('docs/TAG_COVERAGE.md', root), report);
console.log(`${supported.length}/${tags.length} automatic; ${manualOnly.length} manual. Report: ${fileURLToPath(new URL('docs/TAG_COVERAGE.md', root))}`);
