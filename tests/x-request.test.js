import test from "node:test";
import assert from "node:assert/strict";
import {pageNetwork,pageRequest} from "../x-request.js";
async function mocked(html, work) {
 const priorFetch=globalThis.fetch, priorLocation=globalThis.location;
 try {
  globalThis.location={origin:"https://x.com"};
  globalThis.fetch=async(url,options)=>({ok:true,status:200,url:"https://x.com/",async text(){return html;}});
  await work();
 } finally {globalThis.fetch=priorFetch;globalThis.location=priorLocation;}
}
test("X country is read from a fresh same-host response, not account country", async () => {
 const html='<script>window.__INITIAL_DATA__={"appMetadata":{"country":"BD"},"settings":{"country_code":"us"}};</script>';
 await mocked(html,async()=>{assert.deepEqual(await pageNetwork(),{country:"BD",source:"x.com appMetadata.country",reachable:true,http:200});});
});
test("legacy session country is supported without using remote account settings", async () => {
 await mocked('<script>window.__INITIAL_STATE__={"session":{"country":"JP"},"settings":{"remote":{"country_code":"us"}}};</script>',
  async()=>{assert.equal((await pageNetwork()).country,"JP");});
});
test("unknown or missing X country is never inferred from currency or account", async () => {
 await mocked('<script>window.__INITIAL_DATA__={"appMetadata":{},"settings":{"country_code":"us"},"currency":"BDT"};</script>',
  async()=>{assert.deepEqual(await pageNetwork(),{country:null,source:null,reachable:true,http:200});});
});
test("initial data JSON parser handles escaped strings and nested braces", async () => {
 const json=JSON.stringify({appMetadata:{country:"HK"},text:'a " } slash \\ b',nested:{value:1}});
 await mocked('<script>window.__INITIAL_DATA__ = '+json+';</script>',async()=>{assert.equal((await pageNetwork()).country,"HK");});
});
test("X mutation sends one POST with browser cookies, never retries a lost response", async () => {
 const originalFetch=globalThis.fetch,originalLocation=globalThis.location; let calls=0;
 try {
  globalThis.location={origin:"https://x.com"};
  globalThis.fetch=async(url,options)=>{
   calls++;assert.equal(options.method,"POST");assert.equal(options.credentials,"include");assert.equal(options.redirect,"error");
   assert.deepEqual(JSON.parse(options.body),{variables:{gift_recipient:"123"},queryId:"test"});
   throw new Error("lost");
  };
  const result=await pageRequest({username:"someone",csrf:"csrf",bearer:"Bearer test",operation:"useOneTimePurchaseGiftMutation",id:"test",variables:{gift_recipient:"123"}});
  assert.equal(result.ok,false);assert.equal(calls,1);
 } finally {globalThis.fetch=originalFetch;globalThis.location=originalLocation;}
});
