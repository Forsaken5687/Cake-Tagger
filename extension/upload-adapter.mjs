import { message, messageError } from '../messages.mjs';
const ids = new WeakMap();
let nextId = 0;
const normalize = text => String(text).replace(/^#/, '').trim().toLowerCase();

export function chooseTarget(targets, filename) {
  // Never guess by card order when a filename is missing or ambiguous.
  const matches = targets.filter(target => target.filename === filename);
  if (matches.length !== 1) throw messageError(matches.length ? 'error.duplicateFilename' : 'error.missingUpload');
  return matches[0];
}

export function planTags(requested, present, excluded, allowed) {
  if (!Array.isArray(requested) || requested.length > 258 || requested.some(t => typeof t !== 'string' || !allowed.has(t))) throw messageError('error.invalidTagSelection');
  const existing = new Set(present.map(normalize)), blocked = new Set(excluded.map(normalize));
  const add = [], skipped = [];
  for (const tag of new Set(requested)) {
    if (existing.has(normalize(tag)) || blocked.has(normalize(tag))) skipped.push(tag);
    else { add.push(tag); existing.add(normalize(tag)); }
  }
  return { add, skipped };
}

function pillNames(node) {
  return Array.from(node?.querySelectorAll('.stok-pill') || [], pill => pill.querySelector('span')?.textContent?.replace(/^#/, '').trim()).filter(Boolean);
}

function visible(node) {
  return node.isConnected && !node.closest('[hidden]') && node.getClientRects().length > 0;
}

function target(root, filename, input, inherited = [], excluded = []) {
  if (!input || !filename) return null;
  if (!ids.has(root)) ids.set(root, String(++nextId));
  return { id: ids.get(root), filename, root, input, tags: [...pillNames(input.closest('.stok-pillfield')), ...inherited], excluded };
}

export function inspectUploads(doc) {
  const result = [];
  for (const bulk of doc.querySelectorAll('.stok-bulk')) {
    if (!visible(bulk)) continue;
    const globalInput = bulk.querySelector('input[placeholder="tags for ALL files…"],input[placeholder="pick tags for ALL files…"]');
    const globalTags = pillNames(globalInput?.closest('.stok-pillfield'));
    for (const card of bulk.querySelectorAll('.stok-bulk-card:not(.is-done)')) {
      if (!visible(card)) continue;
      const input = card.querySelector('input[placeholder="add tags for this file…"]');
      const inherited = Array.from(card.querySelector('.stok-bulk-inh')?.querySelectorAll('.stok-bulk-inhpill') || [], pill => pill.querySelector('span')?.textContent?.replace(/^#/, '').trim()).filter(Boolean);
      const own = pillNames(input?.closest('.stok-pillfield'));
      const effective = new Set([...inherited, ...own].map(normalize));
      const excluded = globalTags.filter(tag => !effective.has(normalize(tag)));
      const row = target(card, card.querySelector('.stok-bulk-name')?.textContent, input, inherited, excluded);
      if (row) result.push(row);
    }
  }
  for (const single of doc.querySelectorAll('.stok-up')) {
    if (!visible(single)) continue;
    const drop = single.querySelector('.stok-up-drop.has-file');
    if (!drop || single.querySelector('.stok-up-preview.is-strip')) continue;
    const filename = drop.textContent.split(' · tap to add more')[0].trim();
    const input = single.querySelector('input[placeholder="type a tag, press Enter…"],input[placeholder="search & pick existing tags…"]');
    const row = target(single, filename, input);
    if (row) result.push(row);
  }
  return result;
}

export async function appendTags(doc, filename, tags, allowed) {
  // Re-check the live form for every tag so removed cards and user edits stop transfer.
  const initial = chooseTarget(inspectUploads(doc), filename);
  if (initial.input.value.trim()) throw messageError('error.unfinishedTag');
  const plan = planTags(tags, initial.tags, initial.excluded, allowed), added = [];
  for (const tag of plan.add) {
    const current = chooseTarget(inspectUploads(doc), filename);
    if (current.id !== initial.id || !visible(current.input)) throw messageError('error.uploadChanged');
    if (!planTags([tag], current.tags, current.excluded, allowed).add.length) continue;
    const input = current.input, view = doc.defaultView;
    if (input.value.trim()) throw messageError('error.tagInputChanged');
    input.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const setter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value').set;
    setter.call(input, tag);
    input.dispatchEvent(new view.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    const started = Date.now();
    while (!pillNames(input.closest('.stok-pillfield')).some(name => normalize(name) === normalize(tag))) {
      if (Date.now() - started > 4000 || !visible(input)) return { added, skipped: plan.skipped, error: message('error.tagRejected', { tag }) };
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    added.push(tag);
  }
  return { added, skipped: plan.skipped };
}
