// Each upload content script grants its own tab/channel before its bridge connects.
// Commands then use that exact port, without broadcasting to extension frames.
export function createCommandRelay(runtime, {timeoutMs = 5000, now = Date.now} = {}) {
 const uploads = new Map(); let serial = 0;
 const failure = () => ({error:'error.uploadConnection'});
 const key = (tab,channel) => tab + ':' + channel;
 function register(tab,channel) {
  if (!Number.isInteger(tab) || tab <= 0 || !/^[a-f0-9]{32}$/.test(channel || '') || channel.length !== 32) return failure();
  for (const [id,upload] of uploads) if (!upload.port && upload.expires < now()) uploads.delete(id);
  const id=key(tab,channel);
  if (!uploads.has(id)) {
   if (uploads.size >= 256) return failure();
   uploads.set(id,{tab,channel,expires:now()+60000,pending:new Map()});
  }
  // Only the owning content script can renew a grant after background suspension.
  uploads.get(id).expires=now()+60000;
  return {registered:true};
 }
 function attach(port) {
  const sender=port.sender, prefix=runtime.getURL('extension/bridge.html');
  let url;try{url=new URL(sender?.url);}catch{return port.disconnect();}
  if (sender.id !== runtime.id || !(sender.url === prefix || sender.url.startsWith(prefix+'?'))) return port.disconnect();
  const tab=Number(url.searchParams.get('target')),channel=url.searchParams.get('channel');
  const upload=uploads.get(key(tab,channel));
  if (!upload || upload.expires < now() || port.name !== 'cake-tagger:upload:'+channel
    || (sender.tab?.id != null && sender.tab.id !== tab) || upload.port) return port.disconnect();
  upload.port=port;
  port.onMessage.addListener(message=>{
   if(message?.type==='ping' && Number.isSafeInteger(message.id)) {
    port.postMessage({type:'pong',id:message.id});return;
   }
   if(message?.type !== 'ack')return;
   const job=upload.pending.get(message.id);if(!job)return;
   upload.pending.delete(message.id);clearTimeout(job.timer);
   job.resolve(message.accepted === true ? {accepted:true} : failure());
  });
  port.onDisconnect.addListener(()=>{
   if(upload.port!==port)return;
   for(const job of upload.pending.values()){clearTimeout(job.timer);job.resolve(failure());}
   upload.pending.clear();upload.port=undefined;
  });
  port.postMessage({type:'connected'});
 }
 function send(tab,channel,command) {
  const upload=uploads.get(key(tab,channel));if(!upload?.port)return Promise.resolve(failure());
  return new Promise(resolve=>{
   const id=++serial, timer=setTimeout(()=>{upload.pending.delete(id);resolve(failure());},timeoutMs);
   upload.pending.set(id,{resolve,timer});
   try{upload.port.postMessage({type:'command',id,command});}
   catch{clearTimeout(timer);upload.pending.delete(id);resolve(failure());}
  });
 }
 return {register,attach,send};
}

// Probe the receiver before sending an action. Reconnect only the transport;
// never reload the processing frame or replay an action with an unknown outcome.
export function createBridgeConnection(runtime, channel, onCommand, {timeoutMs=1500}={}) {
 let port, checking, serial=0;
 const pending=new Map();
 function settle(id,ok) {
  const job=pending.get(id);if(!job)return;
  pending.delete(id);clearTimeout(job.timer);job.resolve(ok);
 }
 function wait(id,send) {
  return new Promise(resolve=>{
   pending.set(id,{resolve,timer:setTimeout(()=>settle(id,false),timeoutMs)});
   try{send();}catch{settle(id,false);}
  });
 }
 function close(current) {
  if(port!==current)return;
  port=undefined;
  for(const id of [...pending.keys()])settle(id,false);
  try{current.disconnect();}catch{}
 }
 async function check() {
  if(port) {
   const current=port,id=++serial;
   if(await wait(id,()=>current.postMessage({type:'ping',id})))return true;
   close(current);
  }
  let current;
  try{current=runtime.connect({name:'cake-tagger:upload:'+channel});}catch{return false;}
  port=current;
  const connected=wait(0,()=>{});
  current.onMessage.addListener(message=>{
   if(port!==current)return;
   if(message?.type==='connected'){settle(0,true);return;}
   if(message?.type==='pong'){settle(message.id,true);return;}
   if(message?.type!=='command' || !Number.isSafeInteger(message.id))return;
   onCommand(message.command);
   current.postMessage({type:'ack',id:message.id,accepted:true});
  });
  current.onDisconnect.addListener(()=>close(current));
  if(await connected)return true;
  close(current);return false;
 }
 return {ensure(){return checking ||= check().finally(()=>{checking=undefined;});}};
}
