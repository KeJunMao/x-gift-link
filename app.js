import { priceText, countryText, sessionURL } from "./core.js";
const $ = id => document.getElementById(id);
const phases = { account: 1, checking: 1, checked: 2, quoting: 2, selection: 2, confirm: 3, creating: 3, result: 3 };
let state, chosen = "", error = "", refreshing = false, polling = false, pending = false, initialized = false, proxyTouched = true;
async function send(type, data = {}) {
 if (!globalThis.chrome?.runtime?.sendMessage) throw new Error("请从插件图标打开。");
 const reply = await chrome.runtime.sendMessage({ type, ...data });
 if (!reply?.ok) throw new Error(reply?.error || "插件未响应。");
 return reply.data;
}
function showError(text) { error = text; $("message").textContent = text; $("message").hidden = false; }
function plans(quotes) {
 const signature = JSON.stringify(quotes || []);
 if ($("plans").dataset.quotes === signature) return;
 $("plans").dataset.quotes = signature; $("plans").replaceChildren();
 if (!quotes?.some(q => q.product === chosen)) chosen = "";
 for (const q of quotes || []) {
  const label = document.createElement("label"); label.className = "plan";
  const input = document.createElement("input"); input.type = "radio"; input.name = "duration"; input.value = q.product; input.checked = chosen === q.product;
  const duration = document.createElement("span"); duration.className = "duration";
  const dot = document.createElement("i"); dot.className = "radio-dot"; dot.setAttribute("aria-hidden", "true");
  duration.append(dot, document.createTextNode(q.months + " 个月"));
  const price = document.createElement("span"); price.className = "price"; price.textContent = priceText(q);
  label.append(input, duration, price); $("plans").append(label);
  input.addEventListener("change", () => { chosen = q.product; selection(); });
 }
 selection();
}
function selection() {
 document.querySelectorAll(".plan").forEach(label => label.classList.toggle("selected", label.querySelector("input").checked));
 $("continue").disabled = !chosen || pending || state?.busy;
}
function render(next) {
 const previousUser = state?.flow.username; state = next;
 const f = next.flow, step = phases[f.phase] || 1, busy = next.busy || ["checking", "quoting", "creating"].includes(f.phase);
 const titles = { account: "X 账号", checking: "检查中…", checked: "选择时长", quoting: "读取报价…", selection: "选择时长", confirm: "确认", creating: "创建中…", result: "链接已生成" };
 $("title").textContent = titles[f.phase] || titles.account;
 document.querySelectorAll(".steps span").forEach(node => { const n = Number(node.dataset.step); node.classList.toggle("current", n === step); node.classList.toggle("complete", n < step); });
 $("country").textContent = refreshing || next.proxyTest?.phase === "testing" ? "读取中" : countryText(next.network?.country);
 $("network-dot").classList.toggle("known", Boolean(next.network?.country));
 $("country").title = next.network?.source ? next.network.country + " · " + new Date(next.network.checkedAt).toLocaleTimeString("zh-CN") : "X 未返回国家";
 $("open-x").textContent = next.loggedIn ? "X ↗" : "登录 ↗";
 $("account-form").hidden = step !== 1;
 if (!initialized || (previousUser && !f.username)) { $("username").value = f.username || ""; initialized = true; }
 $("username").disabled = busy || pending;
 $("check-account").disabled = busy || pending;
 $("check-account").firstChild.textContent = f.phase === "checking" ? "检查中 " : "检查 ";
 $("account-summary").hidden = !f.recipient || step === 1;
 $("account-name").textContent = f.recipient ? "@" + f.recipient.username : "";
 $("change-account").disabled = busy || pending;
 $("duration-section").hidden = step !== 2;
 $("reading").hidden = f.phase !== "quoting";
 plans(f.quotes);
 $("continue").hidden = f.phase === "quoting" || !f.quotes?.length;
 $("requote").hidden = f.phase === "quoting";
 $("requote").textContent = f.quotes?.length ? "刷新报价" : "重试";
 $("requote").disabled = busy || pending;
 $("confirm-section").hidden = !["confirm", "creating"].includes(f.phase);
 $("confirm-months").textContent = f.selected ? f.selected.months + " 个月" : "";
 $("confirm-price").textContent = priceText(f.selected);
 $("create-link").disabled = busy || pending || f.blocked;
 $("create-link").firstChild.textContent = f.phase === "creating" ? "创建中 " : "创建链接 ";
 $("result-section").hidden = f.phase !== "result";
 if (f.phase === "result" && f.record) {
  $("result-months").textContent = f.record.quote.months + " 个月"; $("result-price").textContent = priceText(f.record.quote);
  $("checkout-url").value = f.record.url || "";
  $("checkout-url").title = "创建于 " + new Date(f.record.created).toLocaleString("zh-CN");
 }
 const text = error || f.error || f.warning || "";
 $("message").hidden = !text; $("message").textContent = text;
 $("archive").hidden = !(f.blocked || (f.phase === "result" && f.record)); $("archive").disabled = busy || pending;
 $("back").hidden = step === 1 || f.phase === "result"; $("back").disabled = busy || pending;
 $("proxy-toggle").disabled = busy || pending;
 $("refresh-network").disabled = busy || refreshing || pending;
 $("proxy-save").disabled = busy || pending;
 $("proxy-test").disabled = busy || pending;
 $("proxy-test").textContent = next.proxyTest?.phase === "testing" ? "测试中" : "测试";
 $("proxy-panel").querySelectorAll("input,select").forEach(field => { field.disabled = busy || pending; });
 renderProbe(next.proxyTest);
 $("proxy-status").textContent = next.proxy?.settings.mode === "custom" ? next.proxy.active ? "已启用" : "未启用" : "";
 selection();
}
async function refresh() {
 if (polling) return;
 polling = true;
 try { render(await send("STATE")); } catch (e) { showError(e.message); }
 finally { polling = false; }
}
async function act(type, data = {}) {
 if (pending) return;
 pending = true; error = "";
 if (type === "RESET") initialized = false;
 if (state) render(state);
 try {
  const result = await send(type, data);
  if (result.flow) {
   render(result);
   if (type === "ARCHIVE" && result.flow.phase === "checked") { await send("QUOTES"); await refresh(); }
  } else await refresh();
 } catch (e) { showError(e.message); }
 finally { pending = false; if (state) render(state); }
}
function proxyVisibility() {
 $("proxy-fields").hidden = $("proxy-mode").value !== "custom";
 const socks = $("proxy-scheme").value === "socks5";
 $("proxy-auth").hidden = socks;
 if (socks) { $("proxy-user").value = ""; $("proxy-password").value = ""; }
}
function fillProxy() {
 const info = state.proxy, p = info.settings;
 $("proxy-mode").value = p.mode; $("proxy-scheme").value = p.scheme;
 $("proxy-host").value = p.host; $("proxy-port").value = p.port;
 $("proxy-user").value = p.username; $("proxy-password").value = "";
 $("proxy-password").placeholder = info.hasPassword ? "已保存" : "密码";
 $("proxy-password").removeAttribute("title");
 $("proxy-error").hidden = true; proxyVisibility();
 proxyTouched = !state.proxyTest?.settings || state.proxyTest.credentialOverride || JSON.stringify(readProxy()) !== JSON.stringify(state.proxyTest.settings);
 renderProbe(state.proxyTest);
}
function readProxy() {
 return { mode: $("proxy-mode").value, scheme: $("proxy-scheme").value, host: $("proxy-host").value.trim().toLowerCase(), port: Number($("proxy-port").value), username: $("proxy-user").value.trim() };
}
function renderProbe(result) {
 const view = $("proxy-test-result");
 view.hidden = !result || (proxyTouched && result.phase !== "testing");
 if (view.hidden) return;
 view.classList.toggle("error", result.phase === "error");
 if (result.phase === "testing") { view.textContent = "测试中…"; return; }
 if (result.phase === "error") { view.textContent = result.error || "连接失败"; return; }
 const time = result.elapsed >= 1000 ? (result.elapsed / 1000).toFixed(1) + " s" : result.elapsed + " ms";
 view.textContent = "成功 · " + countryText(result.country) + " · " + time;
}
$("proxy-panel").addEventListener("input", () => { proxyTouched = true; $("proxy-test-result").hidden = true; });
$("proxy-panel").addEventListener("change", () => { proxyTouched = true; $("proxy-test-result").hidden = true; });
$("proxy-test").addEventListener("click", async () => {
 if (pending || state?.busy) return;
 pending = true; proxyTouched = false; $("proxy-error").hidden = true;
 render(state);
 try {
  await send("TEST_PROXY", { settings: readProxy(), password: $("proxy-password").value || undefined });
  await refresh();
 } catch (e) { $("proxy-error").textContent = e.message; $("proxy-error").hidden = false; }
 finally { pending = false; if (state) render(state); }
});
$("proxy-toggle").addEventListener("click", () => {
 const open = $("proxy-panel").hidden;
 if (open && state) fillProxy();
 $("proxy-panel").hidden = !open; $("proxy-toggle").setAttribute("aria-expanded", String(open));
});
$("proxy-mode").addEventListener("change", proxyVisibility);
$("proxy-scheme").addEventListener("change", proxyVisibility);
$("proxy-panel").addEventListener("submit", async event => {
 event.preventDefault(); if (pending || state.busy) return;
 pending = true; error = ""; render(state); $("proxy-error").hidden = true;
 try {
  const settings = readProxy();
  const password = $("proxy-password").value || undefined;
  const next = await send("PROXY", { settings, password });
  chosen = ""; render(next); $("proxy-panel").hidden = true; $("proxy-toggle").setAttribute("aria-expanded", "false");
 } catch (e) { $("proxy-error").textContent = e.message; $("proxy-error").hidden = false; }
 finally { pending = false; render(state); }
});
$("account-form").addEventListener("submit", event => { event.preventDefault(); act("CHECK", { username: $("username").value }); });
$("requote").addEventListener("click", () => { chosen = ""; act("QUOTES"); });
$("continue").addEventListener("click", () => act("SELECT", { product: chosen }));
$("create-link").addEventListener("click", () => act("CREATE"));
$("back").addEventListener("click", () => act("BACK"));
$("change-account").addEventListener("click", () => { chosen = ""; act("RESET"); });
$("start-over").addEventListener("click", () => { chosen = ""; act("RESET"); });
$("open-x").addEventListener("click", () => chrome.tabs.create({ url: "https://x.com/" }));
$("refresh-network").addEventListener("click", () => refreshNetwork());
$("copy").addEventListener("click", async () => {
 try { await navigator.clipboard.writeText($("checkout-url").value); $("copy").textContent = "已复制"; setTimeout(() => { $("copy").textContent = "复制"; }, 1200); }
 catch { $("checkout-url").select(); showError("请手动复制。"); }
});
$("open-checkout").addEventListener("click", () => { const r = state?.flow.record; if (r && sessionURL(r.url, r.sessionId)) chrome.tabs.create({ url: r.url }); });
$("archive").addEventListener("click", () => {
 if (!confirm("确认已核对旧订单？旧链接可能仍有效。")) return;
 chosen = ""; act("ARCHIVE", { acknowledged: true });
});
async function refreshNetwork() {
 if (refreshing || state?.busy) return;
 refreshing = true; if (state) render(state);
 const previous = state?.network?.checkedAt;
 try {
  await send("NETWORK");
  for (let i = 0; i < 18; i++) {
   await new Promise(resolve => setTimeout(resolve, 1000));
   const next = await send("STATE"); render(next);
   if (next.network?.checkedAt !== previous) break;
  }
 } catch (e) { showError(e.message); }
 finally { refreshing = false; if (state) render(state); }
}
async function boot() {
 try {
  render(await send("STATE"));
  chrome.storage.onChanged.addListener((changes, area) => { if (area === "local" && (changes.flowV2 || changes.networkV2 || changes.proxyV3 || changes.proxyTestV3)) refresh(); });
  setInterval(() => { if (state?.busy || ["checking", "quoting", "creating"].includes(state?.flow.phase)) refresh(); }, 800);
  if (state.flow.phase === "checked" && !state.flow.error) act("QUOTES");
  else refreshNetwork();
 } catch (e) { showError(e.message); $("country").textContent = "未知"; $("check-account").disabled = true; }
}
boot();
