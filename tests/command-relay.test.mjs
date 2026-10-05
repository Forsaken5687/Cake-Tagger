import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommandRelay,createBridgeConnection} from '../extension/command-relay.mjs';
const channel='a'.repeat(32),runtime={id:'own',getURL:path=>'moz-extension://own/'+path};
function port(tab=42,override={}) {
 const listeners={},sent=[];
 const p={name:'cake-tagger:upload:'+channel,sender:{id:'own',url:runtime.getURL('extension/bridge.html')+'?target='+tab+'&channel='+channel,tab:{id:tab}},
 onMessage:{addListener:fn=>{listeners.message=fn;}},onDisconnect:{addListener:fn=>{listeners.disconnect=fn;}},
 postMessage:m=>{if(m.type!=='connected')sent.push(m);},disconnect(){this.disconnected=true;},...override};
 return {p,listeners,sent};
}
test('dedicated command ports require a content-script grant and isolate tabs',async()=>{
 const relay=createCommandRelay(runtime),unregistered=port();relay.attach(unregistered.p);assert(unregistered.p.disconnected);
 assert(relay.register(42,channel).registered);const connected=port();relay.attach(connected.p);
 const result=relay.send(42,channel,{action:'export'});assert.equal(connected.sent[0].command.action,'export');
 connected.listeners.message({type:'ack',id:connected.sent[0].id,accepted:true});assert((await result).accepted);
 assert((await relay.send(43,channel,{action:'quit'})).error);
 const other=port(43);relay.attach(other.p);assert(other.p.disconnected);
 const forged=port(42,{sender:{id:'other',url:runtime.getURL('extension/bridge.html')}});relay.attach(forged.p);assert(forged.p.disconnected);
});
test('Firefox bridge ports can lack tab metadata but cannot invent a tab/channel grant',async()=>{
 const relay=createCommandRelay(runtime);relay.register(42,channel);
 const connected=port();delete connected.p.sender.tab;relay.attach(connected.p);
 const result=relay.send(42,channel,{action:'cancel'});connected.listeners.message({type:'ack',id:connected.sent[0].id,accepted:true});assert((await result).accepted);
 const wrong=port(43);delete wrong.p.sender.tab;relay.attach(wrong.p);assert(wrong.p.disconnected);
});
test('disconnects and missing acknowledgements reject pending commands; registrations expire',async()=>{
 let now=0;const relay=createCommandRelay(runtime,{timeoutMs:5,now:()=>now});relay.register(42,channel);
 const connected=port();relay.attach(connected.p);
 const pending=relay.send(42,channel,{action:'export'});connected.listeners.disconnect();assert((await pending).error);
 assert((await relay.send(42,channel,{action:'export'})).error);
 relay.register(42,channel);const silent=port();relay.attach(silent.p);assert((await relay.send(42,channel,{action:'export'})).error);
 relay.register(43,channel);now=60001;const expired=port(43);relay.attach(expired.p);assert(expired.p.disconnected);
});

function linkedConnection({timeoutMs=30}={}) {
 let relay=createCommandRelay(runtime),opened=0,current,dropPong=false;
 const bridgeRuntime={connect(){
  opened++;
  const serverMessage=[],clientMessage=[],disconnected=[];
  let closed=false;
  const client={postMessage:m=>{if(closed)throw Error('closed');queueMicrotask(()=>serverMessage.forEach(fn=>fn(m)));},
   onMessage:{addListener:fn=>clientMessage.push(fn)},onDisconnect:{addListener:fn=>disconnected.push(fn)},
   disconnect(){if(closed)return;closed=true;disconnected.forEach(fn=>fn());}};
  const server={name:'cake-tagger:upload:'+channel,sender:port().p.sender,
   onMessage:{addListener:fn=>serverMessage.push(fn)},onDisconnect:{addListener:fn=>disconnected.push(fn)},
   postMessage:m=>{if(m.type==='pong' && dropPong){dropPong=false;return;}queueMicrotask(()=>clientMessage.forEach(fn=>fn(m)));},disconnect:()=>client.disconnect()};
  current=client;queueMicrotask(()=>relay.attach(server));return client;
 }};
 const commands=[],connection=createBridgeConnection(bridgeRuntime,channel,command=>commands.push(command),{timeoutMs});
 return {connection,commands,get opened(){return opened;},get relay(){return relay;},
  dropNextPong(){dropPong=true;},disconnect:()=>current.disconnect(),restart(){current.disconnect();relay=createCommandRelay(runtime);}};
}

test('idle connections are probed and recover after disconnect without replaying actions',async()=>{
 const fixture=linkedConnection();fixture.relay.register(42,channel);
 assert(await fixture.connection.ensure());
 assert(await fixture.connection.ensure());assert.equal(fixture.opened,1);
 assert((await fixture.relay.send(42,channel,{action:'apply'})).accepted);
 fixture.disconnect();fixture.relay.register(42,channel);
 assert(await fixture.connection.ensure());assert.equal(fixture.opened,2);
 assert((await fixture.relay.send(42,channel,{action:'apply'})).accepted);
 assert.deepEqual(fixture.commands,[{action:'apply'},{action:'apply'}]);
 fixture.restart();fixture.relay.register(42,channel);
 assert(await fixture.connection.ensure());
 assert((await fixture.relay.send(42,channel,{action:'export'})).accepted);
 assert.equal(fixture.commands.length,3);
});

test('content grants renew after a minute, but expired unrenewed grants cannot reconnect',async()=>{
 let now=0;const relay=createCommandRelay(runtime,{now:()=>now});relay.register(42,channel);
 const original=port();relay.attach(original.p);now=120000;original.listeners.disconnect();
 const rejected=port();relay.attach(rejected.p);assert(rejected.p.disconnected);
 assert(relay.register(42,channel).registered);
 const recovered=port();relay.attach(recovered.p);assert(!recovered.p.disconnected);
 const result=relay.send(42,channel,{action:'apply'});
 recovered.listeners.message({type:'ack',id:recovered.sent[0].id,accepted:true});assert((await result).accepted);
});

test('unacknowledged connection recovery fails promptly and concurrent checks share one attempt',async()=>{
 let opens=0;
 const runtime={connect(){opens++;return {onMessage:{addListener(){}},onDisconnect:{addListener(){}},disconnect(){},postMessage(){}};}};
 const connection=createBridgeConnection(runtime,channel,()=>assert.fail('No action should execute'),{timeoutMs:5});
 const first=connection.ensure(),second=connection.ensure();assert.equal(first,second);
 assert.equal(await first,false);assert.equal(opens,1);
});

test('a stale port with no disconnect notification is replaced before Apply executes',async()=>{
 const fixture=linkedConnection();fixture.relay.register(42,channel);
 assert(await fixture.connection.ensure());fixture.dropNextPong();
 fixture.relay.register(42,channel);
 assert(await fixture.connection.ensure());assert.equal(fixture.opened,2);
 assert((await fixture.relay.send(42,channel,{action:'apply'})).accepted);
 assert.deepEqual(fixture.commands,[{action:'apply'}]);
});
