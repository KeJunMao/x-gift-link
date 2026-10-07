import { PRODUCTS, OPERATIONS, BEARER, username, identityFrom, quoteFrom, sameQuote, sessionFrom, sessionURL } from "./core.js";
import { pageRequest, pageNetwork } from "./x-request.js";
import { ProxyManager } from "./proxy.js";
const BUSY = new Set(["checking", "quoting", "creating"]);
const initial = () => ({ phase: "account", username: "", error: "" });
export class Controller {
 constructor(api, now = () => Date.now()) { this.api = api; this.now = now; this.running = false; this.task = null; this.networkTask = null; this.proxy = new ProxyManager(api); }
 async init() {
  await this.api.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await this.proxy.recoverProbe();
  // Recover obsolete temporary proxy ownership; explicit settings are persistent.
  const { lease, flowV2 } = await this.api.storage.local.get(["lease", "flowV2"]);
  if (lease) {
   const p = await this.api.proxy.settings.get({ incognito: false });
   if (p.levelOfControl === "controlled_by_this_extension") await this.api.proxy.settings.clear({ scope: "regular" });
   await this.api.storage.local.remove("lease");
  }
  if (BUSY.has(flowV2?.phase)) {
   await this.save({ ...flowV2, phase: flowV2.phase === "checking" ? "account" : flowV2.phase === "quoting" ? "checked" : "confirm",
    error: "上次操作中断，请重试。" });
  }
 }
 async getFlow() { return (await this.api.storage.local.get("flowV2")).flowV2 || initial(); }
 async save(flow) { await this.api.storage.local.set({ flowV2: { ...flow, updated: this.now() } }); }
 async login() {
  const [auth, csrf] = await Promise.all([
   this.api.cookies.get({ url: "https://x.com/", name: "auth_token" }),
   this.api.cookies.get({ url: "https://x.com/", name: "ct0" })
  ]);
  return Boolean(auth?.value && csrf?.value);
 }
 async state() {
  const [flow, local, login, tabs] = await Promise.all([
   this.getFlow(), this.api.storage.local.get(["networkV2", "proxyTestV3"]), this.login(), this.api.tabs.query({ url: "https://x.com/*" })
  ]);
  const proxy = await this.proxy.info();
  return { flow, network: local.networkV2 || null, loggedIn: login, hasXTab: tabs.some(t => !t.incognito), proxy, proxyTest: local.proxyTestV3 || null, busy: this.running || this.proxy.saving };
 }
 async xTab(allowCreate = true) {
  const tabs = await this.api.tabs.query({ url: "https://x.com/*" });
  const tab = tabs.find(t => t.active && !t.incognito) || tabs.find(t => !t.incognito);
  if (tab) return tab.id;
  if (!allowCreate) return null;
  const created = await this.api.tabs.create({ url: "https://x.com/", active: false });
  for (let i = 0; i < 30; i++) {
   const current = await this.api.tabs.get(created.id);
   if (current.status === "complete") return current.id;
   await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error("X 尚未加载，请重试。");
 }
 async xCall(tabId, user, operation, variables) {
  const key = operation === "PremiumGiftingQuery" ? "identity" : operation === "useSubscriptionProductDetailsByRestIdQuery" ? "quote" : "create";
  const csrf = (await this.api.cookies.get({ url: "https://x.com/", name: "ct0" }))?.value;
  if (!csrf) throw new Error("请先在这个浏览器登录 X。");
  const results = await this.api.scripting.executeScript({ target: { tabId }, world: "MAIN", func: pageRequest,
   args: [{ username: user, csrf, bearer: BEARER, operation, id: OPERATIONS[key], variables }] });
  const result = results[0]?.result;
  if (!result?.ok) throw new Error(result?.error || "X 页面请求被中断，请重试。");
  return result.data;
 }
 async network(tabId) {
  const signature = await this.route();
  let result = { country: null, source: null };
  try { result = (await this.api.scripting.executeScript({ target: { tabId }, world: "MAIN", func: pageNetwork }))[0]?.result || result; } catch {}
  if (signature !== await this.route()) result = { country: null, source: null };
  const value = { country: /^[A-Z]{2}$/.test(result.country || "") ? result.country : null, source: result.source || null, checkedAt: this.now() };
  await this.api.storage.local.set({ networkV2: value }); return value;
 }
 async refreshNetwork() {
  if (this.networkTask) return this.networkTask;
  this.networkTask = (async () => {
   const tab = await this.xTab(false);
   if (tab === null) {
    const value = { country: null, source: null, checkedAt: this.now() };
    await this.api.storage.local.set({ networkV2: value }); return value;
   }
   return this.network(tab);
  })().finally(() => { this.networkTask = null; });
  return this.networkTask;
 }
 async route() { return JSON.stringify((await this.api.proxy.settings.get({ incognito: false })).value); }
 async requireRoute(expected) { if (await this.route() !== expected) throw new Error("代理已变化，请刷新报价。"); }
 requireCountry(before, after) {
  if (before?.country && after?.country && before.country !== after.country) throw new Error("出口国家已变化，请刷新报价。");
 }
 async begin(action, resume) {
  if (this.running || this.proxy.saving) throw new Error("请等待当前操作完成。");
  this.running = true;
  this.task = (async () => {
   try { await action(); }
   catch (error) {
    const flow = await this.getFlow();
    await this.save({ ...flow, phase: BUSY.has(flow.phase) ? resume : flow.phase, error: error.message || "操作失败，请重试。" });
   } finally { this.running = false; }
  })();
  this.task.catch(() => {}); return { accepted: true };
 }
 async check(value) {
  const user = username(value);
  return this.begin(async () => {
   const flow = { ...initial(), phase: "checking", username: user };
   await this.save(flow);
   if (!(await this.login())) throw new Error("请先登录 X。");
   await this.proxy.requireActive();
   const tab = await this.xTab();
   const signature = await this.route();
   const network = await this.network(tab);
   const recipient = identityFrom(await this.xCall(tab, user, "PremiumGiftingQuery", { screenName: user }), user);
   await this.requireRoute(signature);
   const checked = { ...flow, phase: "checked", recipient, network, route: signature };
   try { await this.loadQuotes(checked, tab); }
   catch (error) { await this.save({ ...checked, phase: "checked", quotes: [], error: error.message }); }
  }, "account");
 }
 async loadQuotes(flow, tab) {
  await this.proxy.requireActive();
  await this.save({ ...flow, phase: "quoting", error: "", quotes: [], selected: null, record: null });
  tab ??= await this.xTab();
  const signature = await this.route(), network = await this.network(tab);
  const outcomes = await Promise.allSettled(PRODUCTS.map(async product => quoteFrom(
   await this.xCall(tab, flow.username, "useSubscriptionProductDetailsByRestIdQuery", { stripeId: product.product }), product)));
  await this.requireRoute(signature);
  const quotes = outcomes.filter(r => r.status === "fulfilled").map(r => ({ ...r.value, quotedAt: this.now() }));
  if (!quotes.length) throw new Error("报价获取失败，请重试。");
  await this.save({ ...flow, phase: "selection", quotes, selected: null, record: null, route: signature, network, error: "",
   warning: quotes.length < PRODUCTS.length ? "部分时长暂不可用。" : "" });
 }
 async quotes() {
  const flow = await this.getFlow();
  if (!flow.recipient || !["checked", "selection", "confirm"].includes(flow.phase)) throw new Error("请先检查账号。");
  return this.begin(() => this.loadQuotes(flow), "checked");
 }
 async saveProxy(settings, password) {
  if (this.running || this.proxy.saving) throw new Error("请等待当前操作完成。");
  this.running = true;
  try {
   await this.proxy.save(settings, password);
   const flow = await this.getFlow();
   await this.save({ ...initial(), username: flow.username });
  } finally { this.running = false; }
  this.refreshNetwork().catch(() => {});
  return this.state();
 }
 async testProxy(settings, password) {
  if (this.running || this.proxy.saving) throw new Error("请等待当前操作完成。");
  this.running = true;
  this.task = (async () => {
   let result = { phase: "testing", started: this.now(), credentialOverride: password !== undefined };
   try {
    await this.api.storage.local.set({ proxyTestV3: result });
    const candidate = await this.proxy.beginProbe(settings, password);
    const signature = await this.route(), start = this.now();
    const response = await pageNetwork({ background: true });
    const elapsed = Math.max(0, this.now() - start);
    await this.requireRoute(signature);
    result = { ...result, settings: candidate, phase: response.reachable && response.http === 200 ? "done" : "error",
     country: response.country || null, http: response.http || null, elapsed, error: response.error || "" };
   } catch (error) {
    result = { ...result, phase: "error", error: error.message || "连接失败" };
   } finally {
    try { await this.proxy.restoreProbe(); }
    catch { result = { ...result, phase: "error", error: "代理恢复失败" }; }
    try { await this.api.storage.local.set({ proxyTestV3: result }); }
    finally { this.running = false; }
   }
  })();
  this.task.catch(() => {});
  return { accepted: true };
 }
 async select(productId) {
  if (this.running || this.proxy.saving) throw new Error("请等待当前操作完成。");
  const flow = await this.getFlow();
  if (flow.phase !== "selection") throw new Error("请先获取真实报价。");
  const selected = flow.quotes?.find(p => p.product === productId);
  if (!selected) throw new Error("请选择已获取报价的套餐。");
  const prior = await this.existing(flow.recipient.id, flow.username, selected);
  if (prior) {
   if (prior.record.status === "unknown") {
    await this.save({ ...flow, selected, record: prior.record, phase: "confirm", blocked: true, error: "旧订单结果不明，请核对。" });
   } else {
    await this.save({ ...flow, selected: prior.record.quote, record: prior.record, phase: "result", reused: true, error: "" });
   }
  } else await this.save({ ...flow, selected, phase: "confirm", record: null, blocked: false, reused: false, error: "" });
  return this.state();
 }
 async existing(recipient, user, quote) {
  const { ordersV2 = {}, orders = {} } = await this.api.storage.local.get(["ordersV2", "orders"]);
  const key = recipient + ":" + quote.product;
  if (ordersV2[key]) return { record: ordersV2[key], key, legacy: false };
  // Preserve old receipts/unknown reservations, so an upgrade cannot bypass them.
  const legacyKey = user + ":" + quote.months, old = orders[legacyKey];
  if (!old || (old.recipient && old.recipient !== recipient) || old.plan?.product !== quote.product) return null;
  const currency = old.plan.currency.toUpperCase();
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
  const oldQuote = { months: old.plan.months, product: old.plan.product, currency,
   amount: old.plan.amount, digits, micro: old.plan.amount * (10 ** (6 - digits)) };
  return { key: legacyKey, legacy: true, record: { ...old, quote: oldQuote, recipient } };
 }
 async saveOrder(record) {
  const { ordersV2 = {} } = await this.api.storage.local.get("ordersV2");
  ordersV2[record.recipient + ":" + record.quote.product] = record;
  await this.api.storage.local.set({ ordersV2 });
 }
 async create() {
  const flow = await this.getFlow();
  if (flow.phase !== "confirm" || !flow.selected || !flow.recipient) throw new Error("请先选择赠送时长。");
  if (flow.blocked) throw new Error("请先核对上一次订单。");
  return this.begin(async () => {
   await this.save({ ...flow, phase: "creating", error: "" });
   const prior = await this.existing(flow.recipient.id, flow.username, flow.selected);
   if (prior) {
    if (prior.record.status === "unknown") {
     await this.save({ ...flow, phase: "confirm", record: prior.record, blocked: true, error: "旧订单结果不明，请核对。" }); return;
    }
    await this.save({ ...flow, phase: "result", selected: prior.record.quote, record: prior.record, reused: true, error: "" }); return;
   }
   await this.requireRoute(flow.route);
   await this.proxy.requireActive();
   const tab = await this.xTab(), network = await this.network(tab);
   this.requireCountry(flow.network, network);
   const recipient = identityFrom(await this.xCall(tab, flow.username, "PremiumGiftingQuery", { screenName: flow.username }), flow.username);
   if (recipient.id !== flow.recipient.id) throw new Error("账号已变化，请重新检查。");
   const fresh = quoteFrom(await this.xCall(tab, flow.username, "useSubscriptionProductDetailsByRestIdQuery", { stripeId: flow.selected.product }), flow.selected);
   await this.requireRoute(flow.route);
   if (!sameQuote(fresh, flow.selected)) {
    const quotes = flow.quotes.map(q => q.product === fresh.product ? { ...fresh, quotedAt: this.now() } : q);
    await this.save({ ...flow, phase: "selection", quotes, selected: null, error: "报价已更新，请重新选择。", network }); return;
   }
   const { lastCreation = 0 } = await this.api.storage.local.get("lastCreation");
   if (this.now() - lastCreation < 15000) throw new Error("请稍候 15 秒再创建。");
   const record = { username: flow.username, recipient: recipient.id, quote: fresh, status: "unknown", created: this.now() };
   await this.saveOrder(record);
   await this.api.storage.local.set({ lastCreation: this.now() });
   await this.save({ ...flow, phase: "creating", record, network });
   try {
    const data = await this.xCall(tab, flow.username, "useOneTimePurchaseGiftMutation", {
     external_product_id: fresh.product, gift_recipient: recipient.id,
     cancel_url: "https://x.com/" + flow.username + "/gift-premium",
     success_url: "https://x.com/" + flow.username + "/gift-premium/success"
    });
    Object.assign(record, sessionFrom(data), { status: "created" });
    await this.saveOrder(record);
    await this.save({ ...flow, phase: "result", selected: fresh, record, network, error: "", reused: false });
   } catch {
    await this.save({ ...flow, phase: "confirm", record, blocked: true, network, error: "创建结果不明，请核对原订单。" });
   }
  }, "confirm");
 }
 async archive(acknowledged) {
  if (this.running || this.proxy.saving) throw new Error("请等待当前操作完成。");
  if (acknowledged !== true) throw new Error("请先确认已核对旧订单。");
  const flow = await this.getFlow();
  if (!flow.recipient || !flow.selected) throw new Error("没有可归档的订单。");
  const prior = await this.existing(flow.recipient.id, flow.username, flow.selected);
  if (!prior) throw new Error("没有找到原订单。");
  const { ordersV2 = {}, orders = {}, history = [] } = await this.api.storage.local.get(["ordersV2", "orders", "history"]);
  if (prior.legacy) delete orders[prior.key]; else delete ordersV2[prior.key];
  history.unshift({ ...prior.record, archivedAt: this.now() });
  await this.api.storage.local.set({ ordersV2, orders, history: history.slice(0, 100) });
  await this.save({ ...flow, phase: "checked", quotes: [], selected: null, record: null, blocked: false, error: "" });
  return this.state();
 }
 async reset() {
  if (this.running || this.proxy.saving) throw new Error("请等待当前操作完成。");
  await this.save(initial()); return this.state();
 }
 async back() {
  if (this.running || this.proxy.saving) throw new Error("请等待当前操作完成。");
  const flow = await this.getFlow();
  if (flow.phase === "confirm") await this.save({ ...flow, phase: "selection", error: "", selected: null, record: null });
  else if (["checked", "selection"].includes(flow.phase)) return this.reset();
  else return this.reset();
  return this.state();
 }
 async dispatch(m) {
  switch (m.type) {
   case "STATE": return this.state();
   case "PROXY": return this.saveProxy(m.settings, m.password);
   case "TEST_PROXY": return this.testProxy(m.settings, m.password);
   case "NETWORK": if (this.running) return { accepted: false }; this.refreshNetwork().catch(() => {}); return { accepted: true };
   case "CHECK": return this.check(m.username);
   case "QUOTES": return this.quotes();
   case "SELECT": return this.select(m.product);
   case "CREATE": return this.create();
   case "BACK": return this.back();
   case "RESET": return this.reset();
   case "ARCHIVE": return this.archive(m.acknowledged);
   default: throw new Error("未知操作。");
  }
 }
}
