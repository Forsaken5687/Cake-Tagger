import test from 'node:test';
import assert from 'node:assert/strict';
import {createCommandRelay} from '../extension/command-relay.mjs';
const channel='a'.repeat(32),runtime={id:'own',getURL:path=>'moz-extension://own/'+path};
function port(tab=42,override={}) {
 const listeners={},sent=[];
 const p={name:'cake-tagger:upload:'+channel,sender:{id:'own',url:runtime.getURL('extension/bridge.html')+'?target='+tab+'&channel='+channel,tab:{id:tab}},
 onMessage:{addListener:fn=>{listeners.message=fn;}},onDisconnect:{addListener:fn=>{listeners.disconnect=fn;}},
 postMessage:m=>sent.push(m),disconnect(){this.disconnected=true;},...override};
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
