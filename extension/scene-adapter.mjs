import { samplingPlan } from '../src/client/sampling.mjs';
import { messageError } from '../src/shared/messages.mjs';
import { isTrustedEvent } from '../src/shared/trusted-event.mjs';

const norm = text => String(text).replace(/^#/, '').trim().toLowerCase();
const visible = node => node?.isConnected && !node.closest('[hidden],[aria-hidden="true"]') && node.getClientRects().length > 0;
export function activeScene(doc) {
  if ([...doc.querySelectorAll('.adm-shell')].some(visible)) return null;
  const route = doc.defaultView.location.pathname + doc.defaultView.location.hash;
  if (/(?:^|[\/#?=&-])(admin|maintainer|moderation|mod)(?:$|[\/#?=&-])/i.test(route)) return null;
  const cards = [...doc.querySelectorAll('#stok-feed .stok-card.is-active[data-scene-id]')].filter(visible);
  if (cards.length !== 1 || cards[0].closest('.stok-mod,.stok-mod-panel,.stok-modpanel')) return null;
  const card = cards[0], video = card.querySelector('video'), id = card.dataset.sceneId;
  return /^[1-9][0-9]{0,9}$/.test(id || '') && video && visible(video) ? {card,video,id} : null;
}
export function sameScene(doc, scene) {
  const current = activeScene(doc);
  return current?.card === scene.card && current.video === scene.video && current.id === scene.id;
}
export function sceneTags(doc) {
  const panel = [...doc.querySelectorAll('.stok-tv-panel')].find(visible);
  return new Set([...panel?.querySelectorAll('.stok-tv-name,.stok-tv-pendtag') || []].map(node => norm(node.textContent)));
}
function eventWait(video, name, action, signal) {
  return new Promise((resolve,reject) => {
    const cleanup = () => { clearTimeout(timer); video.removeEventListener(name,done); video.removeEventListener('error',failed); signal?.removeEventListener('abort',aborted); };
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(messageError('error.videoDecode')); };
    const aborted = () => { cleanup(); reject(new DOMException('analysis.cancelled','AbortError')); };
    const timer = setTimeout(() => { cleanup(); reject(messageError('error.videoTimeout')); },20000);
    video.addEventListener(name,done); video.addEventListener('error',failed); signal?.addEventListener('abort',aborted,{once:true});
    if (signal?.aborted) return aborted();
    try { action(); } catch (error) { cleanup(); reject(error); }
  });
}
async function seek(video, time, signal) {
  if (Math.abs(video.currentTime-time) < .01 && video.readyState >= 2 && !video.seeking) return;
  await eventWait(video,'seeked',() => { video.currentTime=time; },signal);
}
export async function sampleScene(doc, scene, setting, signal, frameReady) {
  const video=scene.video, originalTime=video.currentTime, wasPaused=video.paused;
  const plan=samplingPlan(video.duration,setting), canvas=doc.createElement('canvas');
  canvas.width=canvas.height=448;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if (!context) throw messageError('error.videoDecode');
  const interaction=new AbortController();
  const activeSignal=AbortSignal.any([signal,interaction.signal]);
  const interrupt=event=>{if(isTrustedEvent(event))interaction.abort();};
  video.addEventListener('pointerdown',interrupt);video.addEventListener('keydown',interrupt);
  video.pause();
  try {
    for (let index=0; index<plan.count; index++) {
      activeSignal.throwIfAborted();
      if (!sameScene(doc,scene)) throw messageError('scene.changed');
      await seek(video,plan.timestamps[index],activeSignal);
      if (!sameScene(doc,scene)) throw messageError('scene.changed');
      const edge=Math.max(video.videoWidth,video.videoHeight);
      if (!edge) throw messageError('error.videoDecode');
      // Match upload preprocessing, including its intermediate 640px resize.
      const intermediate=doc.createElement('canvas'), ratio=Math.min(1,640/edge);
      intermediate.width=Math.max(1,Math.round(video.videoWidth*ratio));
      intermediate.height=Math.max(1,Math.round(video.videoHeight*ratio));
      intermediate.getContext('2d').drawImage(video,0,0,intermediate.width,intermediate.height);
      const padded=Math.max(intermediate.width,intermediate.height), modelScale=448/padded;
      context.fillStyle='#fff'; context.fillRect(0,0,448,448);
      context.imageSmoothingEnabled=true; context.imageSmoothingQuality='high';
      context.drawImage(intermediate,Math.floor((padded-intermediate.width)/2)*modelScale,
        Math.floor((padded-intermediate.height)/2)*modelScale,intermediate.width*modelScale,intermediate.height*modelScale);
      let data;
      try { data=context.getImageData(0,0,448,448).data; }
      catch { throw messageError('scene.crossOrigin'); }
      await frameReady(data,index,plan.count);
    }
    return plan;
  } finally {
    video.removeEventListener('pointerdown',interrupt);video.removeEventListener('keydown',interrupt);
    if (!interaction.signal.aborted && sameScene(doc,scene)) {
      try { await seek(video,originalTime,AbortSignal.timeout(3000)); } catch {}
      if (!wasPaused && sameScene(doc,scene)) await video.play().catch(() => {});
    }
  }
}
export function encodeFrame(frame) {
  if (!(frame instanceof Uint8ClampedArray) || frame.length!==802816) throw messageError('error.invalidModelInputImage');
  let binary='';
  for (let offset=0;offset<frame.length;offset+=8192) binary+=String.fromCharCode(...frame.subarray(offset,offset+8192));
  return btoa(binary);
}
export function openSceneTags(doc,scene) {
  if (!sameScene(doc,scene)) throw messageError('scene.changed');
  if ([...doc.querySelectorAll('.stok-tv-suginput')].filter(visible).some(node=>node.value.trim())) throw messageError('scene.inputBusy');
  const open=scene.card.querySelector('button.stok-tags');
  if (!open) throw messageError('scene.unavailable');
  open.click();
  if (!sameScene(doc,scene)) throw messageError('scene.changed');
  const panels=[...doc.querySelectorAll('.stok-tv-panel')].filter(visible);
  if (panels.length!==1) throw messageError('scene.unavailable');
  return panels[0];
}
export async function addSceneTag(doc, scene, tag, signal, {timeout=10000,poll=50}={}) {
  let clicked=false, input, touched=false, edited=false;
  const guard=() => { signal?.throwIfAborted(); if (!sameScene(doc,scene) || (input && !input.isConnected) || edited) throw messageError('scene.changed'); };
  guard(); const panel=openSceneTags(doc,scene); input=panel.querySelector('.stok-tv-suginput');
  if (!input || input.value.trim()) throw messageError('scene.inputBusy');
  const contains=(selector)=>[...panel.querySelectorAll(selector)].some(node=>norm(node.textContent)===norm(tag));
  if (contains('.stok-tv-name')) return {status:'added'};
  if (contains('.stok-tv-pendtag')) return {status:'pending'};
  const changed=event=>{ if (event.isTrusted) edited=true; };
  const setValue=value=>{
    Object.getOwnPropertyDescriptor(doc.defaultView.HTMLInputElement.prototype,'value').set.call(input,value);
    input.dispatchEvent(new doc.defaultView.Event('input',{bubbles:true}));
  };
  input.addEventListener('input',changed);
  try {
    setValue(tag); touched=true;
    const waitFor=async predicate=>{
      const until=Date.now()+timeout;
      while (Date.now()<until) { guard(); const value=predicate(); if(value)return value; await new Promise(resolve=>setTimeout(resolve,poll)); }
      throw messageError(clicked?'scene.unconfirmed':'scene.unavailable');
    };
    const option=await waitFor(()=>{
      const matches=[...panel.querySelectorAll('button.stok-tv-sugopt')].filter(node=>norm(node.querySelector('span')?.textContent)===norm(tag));
      return matches.length===1 ? matches[0] : null;
    });
    guard(); clicked=true; option.click();
    return await waitFor(()=>contains('.stok-tv-name')?{status:'added'}:contains('.stok-tv-pendtag')?{status:'pending'}:null);
  } catch (error) {
    if (clicked) { const uncertain=messageError('scene.unconfirmed'); uncertain.submitted=true; throw uncertain; }
    throw error;
  } finally {
    input.removeEventListener('input',changed);
    if (touched && !edited && sameScene(doc,scene) && input.isConnected && input.value===tag) setValue('');
  }
}
