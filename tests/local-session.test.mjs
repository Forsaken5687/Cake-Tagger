import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalSession} from '../local-session.mjs';

for(const stale of ['', 'a'.repeat(48)]) test('local session connects automatically with '+(stale ? 'a stale token':'no token'),async()=>{
 let saved=stale, handshakes=0, calls=0;
 const current='b'.repeat(48), session=createLocalSession({address:{hash:'',pathname:'/',search:''},navigation:{},storage:{getItem:()=>saved,setItem:(key,value)=>{saved=value;}},fetcher:async(url,options)=>{
  if(url==='/api/connect'){handshakes++;assert.equal(options.headers['X-Cake-Tagger-Client'],'local');return Response.json({token:current});}
  calls++;return new Response('',{status:options.headers.Authorization==='Bearer '+current ? 200:401});
 }});
 assert.equal((await session.request('/api/settings')).status,200);assert.equal(handshakes,1);assert.equal(saved,current);assert.equal(calls,stale ? 2:1);
});

test('concurrent local requests share a handshake and do not replay processing failures',async()=>{
 let handshakes=0, calls=0;
 const session=createLocalSession({address:{hash:'',pathname:'/',search:''},navigation:{},storage:{getItem:()=>'',setItem(){}},fetcher:async(url)=>{
  if(url==='/api/connect'){handshakes++;await new Promise(resolve=>setTimeout(resolve,5));return Response.json({token:'b'.repeat(48)});}
  calls++;return new Response('',{status:500});
 }});
 const responses=await Promise.all([session.request('/api/infer',{method:'POST'}),session.request('/api/settings')]);
 assert.equal(handshakes,1);assert.equal(calls,2);assert(responses.every(response=>response.status===500));
});

test('a rejected replacement token is retried only once',async()=>{
 let calls=0;
 const session=createLocalSession({address:{hash:'#'+'a'.repeat(48),pathname:'/',search:''},navigation:{replaceState(){}},storage:{getItem:()=>'',setItem(){}},fetcher:async url=>{
  if(url==='/api/connect')return Response.json({token:'b'.repeat(48)});
  calls++;return new Response('',{status:401});
 }});
 assert.equal((await session.request('/api/stop',{method:'POST'})).status,401);assert.equal(calls,2);
});
