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

// Metadata can match even after a file's bytes change. Only a content hash may
// carry previous predictions and corrections into the current selection.
export function reconcileHashedFile(entry, previous) {
 const existing=previous.find(old=>(old.sha256??old.result?.sha256)===entry.sha256);
 if(existing)return {...existing,file:entry.file,index:entry.index};
 if(entry.result&&entry.result.sha256!==entry.sha256)return {file:entry.file,index:entry.index,sha256:entry.sha256,hasFile:true,state:'analysis.waiting',selected:new Map()};
 return entry;
}
