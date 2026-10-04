import test from 'node:test';
import assert from 'node:assert/strict';
import {isTrustedEvent} from '../trusted-event.mjs';
test('native event brand accepts a different constructor realm and rejects forged events',()=>{
 const branded=new WeakSet();const prototype={composedPath(){if(!branded.has(this))throw TypeError('Illegal invocation');return [];}};
 class PageEvent{};class ContentEvent{};
 const real=new ContentEvent();branded.add(real);real.isTrusted=true;
 assert.equal(real instanceof PageEvent,false);assert(isTrustedEvent(real,prototype));
 assert(!isTrustedEvent({isTrusted:true},prototype));real.isTrusted=false;assert(!isTrustedEvent(real,prototype));
 assert(!isTrustedEvent(null,prototype));
});
test('actual synthetic DOM events remain untrusted',()=>{
 assert(!isTrustedEvent(new Event('click')));assert(!isTrustedEvent({isTrusted:true}));
});
