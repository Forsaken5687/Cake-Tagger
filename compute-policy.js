// Shared by module pages and classic inference workers. Browser capability APIs
// are hints, not measurements of free RAM or guaranteed processing throughput.
globalThis.cakeTaggerComputePolicy = Object.freeze(function ({ isolated = false, cores = 2, memoryGB, parallelism = 'auto' } = {}) {
  parallelism = ['auto', '1', '2', '4', '6', '8'].includes(String(parallelism)) ? String(parallelism) : 'auto';
  const cpuLimit = Math.max(1, Math.min(8, Math.floor((Number.isFinite(cores) && cores > 0 ? cores : 2) / 2)));
  const requested = ['1', '2', '4', '6', '8'].includes(String(parallelism)) ? Number(parallelism) : 8;
  const memoryLimit = Number.isFinite(memoryGB) && memoryGB > 0
    ? memoryGB <= 2 ? 1 : memoryGB <= 4 ? 2 : 8
    : parallelism === 'auto' ? 4 : 8;
  return isolated
    ? { workers: 1, threads: Math.min(cpuLimit, requested) }
    : { workers: Math.min(cpuLimit, requested, memoryLimit), threads: 1 };
});
