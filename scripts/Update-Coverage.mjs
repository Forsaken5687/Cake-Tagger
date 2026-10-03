import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readTags, excluded } from '../tag-policy.mjs';

const root = new URL('../', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
const tags = readTags(read('tags.txt'));
const mapping = JSON.parse(read('mapping.json'));
const labels = read('model/top_tags.txt').replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);
for (const [tag, indices] of Object.entries(mapping)) {
  if (!tags.includes(tag) || !indices.length || indices.some(i => !Number.isInteger(i) || !labels[i])) throw Error(`Invalid mapping: ${tag}`);
}
const supported = tags.filter(tag => mapping[tag]?.length && !excluded.has(tag));
const manualOnly = tags.filter(tag => !supported.includes(tag));
const coverage = { supportedCount: supported.length, totalCount: tags.length, supported, manualOnly };
fs.writeFileSync(new URL('model/coverage.json', root), JSON.stringify(coverage, null, 2) + '\n');
const report = `# Tag-Abdeckung\n\n${supported.length} von ${tags.length} Tags haben eine automatische Modellzuordnung. Das beschreibt die Abdeckung, nicht die Erkennungsgenauigkeit.\n\n## Nur manuell\n\nDiese Tags haben entweder keine ausreichend passende Modellzuordnung oder sind bewusst von automatischen Vorschlägen ausgeschlossen. Alle bleiben manuell auswählbar.\n\n${manualOnly.map(tag => `- ${tag}`).join('\n')}\n\n\`hairy\` und \`watermark\` sind wegen wiederholter Fehlzuordnungen von automatischen und unsicheren Treffern ausgeschlossen. Kontext- und Identitätsangaben sowie technische Tags der Upload-Seite werden ebenfalls nicht aus Bildern abgeleitet.\n\n## Aktualisieren\n\nNach Änderungen an der Tagliste, Zuordnung oder Ausschlusspolitik: \`runtime/node.exe scripts/Update-Coverage.mjs\`.\n`;
fs.writeFileSync(new URL('docs/TAG_COVERAGE.md', root), report);
console.log(`${supported.length}/${tags.length} automatic; ${manualOnly.length} manual. Report: ${fileURLToPath(new URL('docs/TAG_COVERAGE.md', root))}`);
