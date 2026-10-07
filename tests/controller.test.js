import test from "node:test";
import assert from "node:assert/strict";
import { Controller } from "../controller.js";
import { PRODUCTS } from "../core.js";
import { quoteData, identityData } from "./fixtures.js";
function fixture(options = {}) {
 const local = {}, calls = []; let route = { mode: "system" }, country = "US", created = 0, quoteCalls = 0;
 const clone = structuredClone;
 const api = {
  storage: { local: {
   async setAccessLevel() {},
   async get(keys) { const names = typeof keys === "string" ? [keys] : keys; return clone(Object.fromEntries(names.filter(k => Object.hasOwn(local,k)).map(k=>[k,local[k]]))); },
   async set(value) { Object.assign(local, clone(value)); }, async remove(key) { delete local[key]; }
  }, session: {
   async get() { return {}; }, async set() {}, async remove() {}
  }},
  proxy: { settings: { async get() { return { value: clone(route), levelOfControl: "controllable_by_this_extension" }; }, async clear() { route={mode:"system"}; } } },
  cookies: { async get({name}) { return options.loggedOut ? null : {value: name+"_secret"}; } },
  tabs: { async query() { return [{id:1,active:true}]; } },
  scripting: { async executeScript({func,args}) {
   if (func.name === "pageNetwork") return [{result:{country,source:"x.com appMetadata.country"}}];
   const r=args[0]; calls.push(r.operation);
   if (r.operation==="PremiumGiftingQuery") return [{result:{ok:true,data:identityData("someone", !options.ineligible)}}];
   if (r.operation==="useSubscriptionProductDetailsByRestIdQuery") {
    quoteCalls++;
    if (options.quoteFailure) return [{result:{ok:false,error:"报价请求失败"}}];
    const product=PRODUCTS.find(p=>p.product===r.variables.stripeId);
    const major=options.changePrice && quoteCalls>2 ? 99 : product.months*5;
    return [{result:{ok:true,data:quoteData(product.months,"Usd",major)}}];
   }
   created++;
   if (options.unknown) throw new Error("lost response");
   return [{result:{ok:true,data:{data:{onetimepurchase_gift:{session_id:"cs_live_Test",session_url:"https://checkout.stripe.com/c/pay/cs_live_Test",session_status:"Unpaid"}}}}}];
  }}
 };
 const c=new Controller(api,()=>200000);
 return {c,local,calls,created:()=>created,setRoute:v=>{route=v;},setCountry:v=>{country=v;}};
}
async function account(f) { await f.c.init(); await f.c.check("@Someone"); await f.c.task; }
async function select(f) { await account(f); await f.c.select(PRODUCTS[1].product); }
async function create(f) { await select(f); await f.c.create(); await f.c.task; }
test("step order cannot skip account and quotes", async () => {
 const f=fixture(); await f.c.init();
 await assert.rejects(f.c.quotes(),/检查/); await assert.rejects(f.c.select(PRODUCTS[0].product),/报价/);
 await assert.rejects(f.c.create(),/选择/); assert.equal(f.created(),0);
});
test("account check retrieves country and live quotes without creating an order", async () => {
 const f=fixture(); await account(f);
 assert.equal(f.local.flowV2.phase,"selection"); assert.equal(f.local.networkV2.country,"US");
 assert.deepEqual(f.calls,["PremiumGiftingQuery","useSubscriptionProductDetailsByRestIdQuery","useSubscriptionProductDetailsByRestIdQuery"]); assert.equal(f.created(),0);
 assert.equal(JSON.stringify(f.local).includes("_secret"),false);
});
test("real quotes are fetched before selecting a duration, with no order creation", async () => {
 const f=fixture(); await select(f);
 assert.equal(f.local.flowV2.phase,"confirm"); assert.equal(f.local.flowV2.selected.currency,"USD");
 assert.equal(f.local.flowV2.selected.micro,30000000); assert.equal(f.created(),0);
});
test("creates one order after refreshing recipient and quote, then reuses the receipt", async () => {
 const f=fixture(); await create(f);
 assert.equal(f.local.flowV2.phase,"result"); assert.equal(f.created(),1);
 assert.equal(f.calls.filter(x=>x==="PremiumGiftingQuery").length,2);
 await f.c.reset(); await f.c.check("someone"); await f.c.task; await f.c.quotes(); await f.c.task;
 await f.c.select(PRODUCTS[1].product);
 assert.equal(f.local.flowV2.phase,"result"); assert.equal(f.local.flowV2.reused,true); assert.equal(f.created(),1);
});
test("live price changes require user selection again and never create", async () => {
 const f=fixture({changePrice:true}); await create(f);
 assert.equal(f.local.flowV2.phase,"selection"); assert.equal(f.created(),0);
 assert.match(f.local.flowV2.error,/报价已更新/);
 assert.equal(f.local.flowV2.quotes.find(p=>p.months===6).micro,99000000);
});
test("proxy config or X exit country changes stop before mutation", async () => {
 for(const kind of ["route","country"]) {
  const f=fixture(); await select(f);
  if(kind==="route") f.setRoute({mode:"direct"}); else f.setCountry("BD");
  await f.c.create(); await f.c.task; assert.equal(f.created(),0); assert.match(f.local.flowV2.error,/变化/);
 }
});
test("unavailable quotes display no fabricated price or options", async () => {
 const f=fixture({quoteFailure:true}); await account(f); await f.c.quotes(); await f.c.task;
 assert.equal(f.local.flowV2.phase,"checked"); assert.deepEqual(f.local.flowV2.quotes,[]); assert.equal(f.created(),0);
});
test("missing login and ineligible recipients stop the flow", async () => {
 for(const option of [{loggedOut:true},{ineligible:true}]) {
  const f=fixture(option); await account(f); assert.equal(f.local.flowV2.phase,"account"); assert.equal(f.created(),0);
 }
});
test("lost creation response persists unknown receipt and blocks replay", async () => {
 const f=fixture({unknown:true}); await create(f);
 assert.equal(f.local.flowV2.blocked,true); assert.equal(f.created(),1);
 await assert.rejects(f.c.create(),/核对/); assert.equal(f.created(),1);
 await assert.rejects(f.c.archive(false),/确认/);
 await f.c.archive(true); assert.equal(f.local.flowV2.phase,"checked"); assert.equal(f.local.history[0].status,"unknown");
});
test("concurrent step actions are serialized", async () => {
 const f=fixture(); await f.c.init(); const first=f.c.check("someone");
 await assert.rejects(f.c.check("someone"),/等待/); await first; await f.c.task;
 assert.equal(f.calls.length,3);
});
test("startup recovers interrupted creation without issuing a mutation", async () => {
 const f=fixture(); f.local.flowV2={phase:"creating",username:"someone"};
 await f.c.init(); assert.equal(f.local.flowV2.phase,"confirm"); assert.equal(f.created(),0);
});
test("unknown country remains unknown", async () => {
 const f=fixture(); f.setCountry(null); await account(f);
 assert.equal(f.local.networkV2.country,null); assert.equal(f.local.networkV2.source,"x.com appMetadata.country");
});
