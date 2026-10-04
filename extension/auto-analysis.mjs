// Keep only the newest upload selection while preparation or analysis is busy.
export function createUploadAutoAnalysis({ busy, enabled, prepare, analyze }) {
  let pending, processing = false, previous = new Set(), generation = 0;
  const added = new Set();
  const key = file => `${file.name}\u0000${file.size}\u0000${file.lastModified}`;
  async function drain() {
    if (processing || busy()) return;
    processing = true;
    try {
      while (pending && !busy()) {
        const files = pending; pending = undefined;
        for (const file of files) if (!previous.has(key(file))) added.add(key(file));
        previous = new Set(files.map(key));
        const startedGeneration = generation;
        const entries = await prepare(files);
        if (startedGeneration !== generation) { added.clear(); continue; }
        if (pending) continue;
        const targets = entries.filter(entry => added.has(key(entry.file)) && !entry.result && !entry.error);
        added.clear();
        if (enabled() && targets.length && !busy()) await analyze(targets);
      }
    } finally { processing = false; }
  }
  return {
    receive(files) { pending = [...files]; return drain(); },
    // Cancel queued autostart as well as the active batch. A later new file can start normally.
    cancel() {
      generation++; added.clear();
      // Synchronize the latest selection after cancellation, without restarting it.
      if (pending) previous = new Set(pending.map(key));
    },
    drain
  };
}
