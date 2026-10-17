import { errorMessage } from '../src/shared/messages.mjs';
import { createNativeClient } from '../src/client/native-client.mjs';
import { samplingPlan } from '../src/client/sampling.mjs';
import { getSettings, nativeRequest } from './server-connection.mjs';

const FRAME_BYTES = 802816, ENCODED_BYTES = 1070424;
export function createSceneService(browser, { settings = () => getSettings(browser), makeClient = () => createNativeClient({fetcher: nativeRequest}), clock = globalThis } = {}) {
  const jobs = new Map();
  const owner = sender => sender.id === browser.runtime.id && sender.frameId === 0 && Number.isInteger(sender.tab?.id)
    && sender.url?.startsWith('https://cake.ski/') ? `${sender.tab.id}:${sender.documentId || ''}` : null;
  function remove(key, job) {
    clock.clearTimeout(job.timer); job.client?.stop(); job.frames.length = 0;
    if (jobs.get(key) === job) jobs.delete(key);
  }
  function renew(key, job) {
    clock.clearTimeout(job.timer);
    job.timer = clock.setTimeout(() => remove(key, job), 60000);
  }
  async function handle(message, sender) {
    const key = owner(sender);
    if (!key) return {error:'error.sitePermission'};
    if (message.type === 'cake-tagger:scene-start') {
      if (jobs.has(key) || jobs.size >= 2) return {error:'scene.busy'};
      const job = {id:crypto.randomUUID(),frames:[],client:null,running:false};
      jobs.set(key, job); renew(key, job);
      try {
        job.settings = (await settings()).settings;
        if (jobs.get(key) !== job) throw Error('scene.expired');
        job.count = samplingPlan(message.duration, job.settings.frames).count;
        return {job:job.id,settings:job.settings,count:job.count};
      } catch (error) { remove(key, job); return {error:errorMessage(error)}; }
    }
    const job = jobs.get(key);
    if (!job || job.id !== message.job) return {error:'scene.expired'};
    if (message.type === 'cake-tagger:scene-cancel') { remove(key, job); return {cancelled:true}; }
    if (message.type === 'cake-tagger:scene-frame') {
      if (job.running || message.index !== job.frames.length || job.frames.length >= job.count
        || typeof message.data !== 'string' || message.data.length !== ENCODED_BYTES || !/^[A-Za-z0-9+/]+={0,2}$/.test(message.data)) {
        remove(key, job); return {error:'error.invalidModelInputImage'};
      }
      try {
        const binary = atob(message.data);
        if (binary.length !== FRAME_BYTES) throw Error();
        job.frames.push(Uint8ClampedArray.from(binary, char => char.charCodeAt(0)));
        renew(key, job); return {received:job.frames.length};
      } catch { remove(key, job); return {error:'error.invalidModelInputImage'}; }
    }
    if (message.type !== 'cake-tagger:scene-finish' || job.running || job.frames.length !== job.count) return {error:'error.invalidModelInputImage'};
    job.running = true; clock.clearTimeout(job.timer);
    job.timer = clock.setTimeout(() => remove(key, job), 600000);
    try {
      job.client = makeClient();
      const s = job.settings;
      const result = await job.client.infer(job.frames, s.parallelism, {raw:false,excludedTags:s.excludedTags,
        suggestionThreshold:s.suggestionThreshold,suggestionLimit:s.suggestionLimit,uncertainLimit:s.showUncertain ? s.uncertainLimit : 0});
      return jobs.get(key) === job ? {analysis:result.analysis,count:job.count} : {error:'scene.expired'};
    } catch (error) { return {error:errorMessage(error)}; }
    finally { remove(key, job); }
  }
  return {handle, closeTab(tabId) { for (const [key,job] of jobs) if (key.startsWith(tabId+':')) remove(key,job); }};
}
