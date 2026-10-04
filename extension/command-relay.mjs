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
   if(message?.type !== 'ack')return;
   const job=upload.pending.get(message.id);if(!job)return;
   upload.pending.delete(message.id);clearTimeout(job.timer);
   job.resolve(message.accepted === true ? {accepted:true} : failure());
  });
  port.onDisconnect.addListener(()=>{
   if(upload.port!==port)return;
   for(const job of upload.pending.values()){clearTimeout(job.timer);job.resolve(failure());}
   upload.pending.clear();uploads.delete(key(tab,channel));
  });
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
