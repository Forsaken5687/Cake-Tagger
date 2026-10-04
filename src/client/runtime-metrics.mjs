// performance.memory is Chromium-specific and excludes worker/WASM allocations.
// Do not report it as total model memory or infer free RAM from deviceMemory.
export function memorySnapshot({ performance, navigator } = globalThis) {
  const positive = value => Number.isFinite(value) && value >= 0 ? value : null;
  const heap = performance?.memory;
  return { reportedDeviceMemoryGB: positive(navigator?.deviceMemory),
    pageJsHeapUsedBytes: positive(heap?.usedJSHeapSize),
    pageJsHeapTotalBytes: positive(heap?.totalJSHeapSize),
    pageJsHeapLimitBytes: positive(heap?.jsHeapSizeLimit),
    scope: heap ? 'page-js-heap' : 'unavailable' };
}
