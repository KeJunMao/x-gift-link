export const DEFAULT_PROXY = { mode: "browser", scheme: "http", host: "127.0.0.1", port: 7890, username: "" };
export function validateProxy(value) {
 const p = { ...DEFAULT_PROXY, ...value };
 if (!["browser", "custom"].includes(p.mode) || !["http", "https", "socks5"].includes(p.scheme)) throw new Error("代理类型无效。");
 p.host = String(p.host || "").trim().toLowerCase(); p.port = Number(p.port); p.username = String(p.username || "").trim();
 if (p.mode === "custom" && (!/^(?:[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?|\[[a-f0-9:]+\])$/.test(p.host) || !Number.isInteger(p.port) || p.port < 1 || p.port > 65535)) throw new Error("代理地址或端口无效。");
 if (p.mode === "custom" && p.scheme === "socks5" && p.username) throw new Error("SOCKS5 不支持密码认证，请用本地代理。");
 return { mode: p.mode, scheme: p.scheme, host: p.host, port: p.port, username: p.username };
}
export function pacFor(p) {
 const prefix = { http: "PROXY", https: "HTTPS", socks5: "SOCKS5" }[p.scheme];
 return 'function FindProxyForURL(url, host) { if (host === "x.com") return ' + JSON.stringify(prefix + " " + p.host + ":" + p.port) + '; return "DIRECT"; }';
}
const PROBE_ALARM = "proxy-probe-restore";
export class ProxyManager {
 constructor(api) { this.api = api; this.saving = false; this.attempts = new Set(); }
 async settings() { return validateProxy((await this.api.storage.local.get("proxyV3")).proxyV3 || DEFAULT_PROXY); }
 async info() {
  const settings = await this.settings(), { proxyPassword } = await this.api.storage.session.get("proxyPassword");
  const effective = await this.api.proxy.settings.get({ incognito: false });
  return { settings, hasPassword: Boolean(proxyPassword), active: settings.mode === "custom" && effective.levelOfControl === "controlled_by_this_extension" && effective.value?.pacScript?.data === pacFor(settings) };
 }
 async save(value, password) {
  if (this.saving) throw new Error("正在保存代理。");
  this.saving = true;
  try {
   const settings = validateProxy(value), previous = await this.settings();
   if (settings.scheme === "socks5" && password) throw new Error("SOCKS5 不支持密码认证。");
   const stored = await this.api.storage.session.get("proxyPassword");
   const same = previous.scheme === settings.scheme && previous.host === settings.host && previous.port === settings.port && previous.username === settings.username;
   const secret = password !== undefined ? String(password) : same ? stored.proxyPassword || "" : "";
   if (settings.mode === "custom" && settings.username && !secret) throw new Error("请输入代理密码。");
   const effective = await this.api.proxy.settings.get({ incognito: false });
   if (settings.mode === "custom") {
    if (["controlled_by_other_extensions", "not_controllable"].includes(effective.levelOfControl)) throw new Error("代理由其他扩展或系统策略控制。");
    await this.api.storage.session.set({ proxyPassword: secret });
    await this.api.storage.local.set({ proxyV3: settings });
    try {
     await this.api.proxy.settings.set({ value: { mode: "pac_script", pacScript: { data: pacFor(settings), mandatory: true } }, scope: "regular" });
     const result = await this.api.proxy.settings.get({ incognito: false });
     if (result.levelOfControl !== "controlled_by_this_extension" || result.value?.pacScript?.data !== pacFor(settings)) throw new Error("代理未生效。");
    } catch (error) {
     if (previous.mode === "custom" && effective.levelOfControl === "controlled_by_this_extension") {
      await this.api.proxy.settings.set({ value: effective.value, scope: "regular" });
     } else {
      const current = await this.api.proxy.settings.get({ incognito: false });
      if (current.levelOfControl === "controlled_by_this_extension") await this.api.proxy.settings.clear({ scope: "regular" });
     }
     await this.api.storage.local.set({ proxyV3: previous });
     await this.api.storage.session.set({ proxyPassword: stored.proxyPassword || "" });
     throw error;
    }
   } else {
    if (effective.levelOfControl === "controlled_by_this_extension") await this.api.proxy.settings.clear({ scope: "regular" });
    await this.api.storage.local.set({ proxyV3: settings });
    await this.api.storage.session.remove("proxyPassword");
   }
   this.attempts.clear(); await this.api.storage.local.remove("networkV2");
   return this.info();
  } finally { this.saving = false; }
 }
 async requireActive() {
  const info = await this.info();
  if (info.settings.mode === "custom" && !info.active) throw new Error("自定义代理未启用，请保存代理设置。");
  if (info.settings.mode === "custom" && info.settings.username && !info.hasPassword) throw new Error("请重新填写代理密码。");
 }
 async beginProbe(value, password) {
  const settings = validateProxy(value), previous = await this.settings();
  const stored = await this.api.storage.session.get("proxyPassword");
  const same = previous.scheme === settings.scheme && previous.host === settings.host && previous.port === settings.port && previous.username === settings.username;
  const secret = password !== undefined ? String(password) : same ? stored.proxyPassword || "" : "";
  if (settings.mode === "custom" && settings.scheme === "socks5" && (settings.username || secret)) throw new Error("SOCKS5 不支持密码认证。");
  if (settings.mode === "custom" && settings.username && !secret) throw new Error("请输入代理密码。");
  const before = await this.api.proxy.settings.get({ incognito: false });
  if (settings.mode === "custom" && ["controlled_by_other_extensions", "not_controllable"].includes(before.levelOfControl)) throw new Error("代理被其他扩展控制。");
  const expires = Date.now() + 60000;
  await this.api.storage.local.set({ proxyProbeRestore: { before: { value: before.value, levelOfControl: before.levelOfControl }, expires } });
  await this.api.alarms.create(PROBE_ALARM, { when: expires });
  await this.api.storage.session.set({ proxyProbeAuth: { settings, password: secret, expires } });
  this.attempts.clear();
  try {
   if (settings.mode === "custom") {
    await this.api.proxy.settings.set({ value: { mode: "pac_script", pacScript: { data: pacFor(settings), mandatory: true } }, scope: "regular" });
    const applied = await this.api.proxy.settings.get({ incognito: false });
    if (applied.levelOfControl !== "controlled_by_this_extension" || applied.value?.pacScript?.data !== pacFor(settings)) throw new Error("代理未生效。");
   } else if (before.levelOfControl === "controlled_by_this_extension") {
    await this.api.proxy.settings.clear({ scope: "regular" });
   }
   return settings;
  } catch (error) { await this.restoreProbe(); throw error; }
 }
 async restoreProbe() {
  const { proxyProbeRestore: lease } = await this.api.storage.local.get("proxyProbeRestore");
  if (!lease) { await this.api.storage.session.remove("proxyProbeAuth"); return; }
  const current = await this.api.proxy.settings.get({ incognito: false });
  if (!["controlled_by_other_extensions", "not_controllable"].includes(current.levelOfControl)) {
   if (lease.before.levelOfControl === "controlled_by_this_extension") {
    await this.api.proxy.settings.set({ value: lease.before.value, scope: "regular" });
   } else if (current.levelOfControl === "controlled_by_this_extension") {
    await this.api.proxy.settings.clear({ scope: "regular" });
   }
  }
  await this.api.storage.local.remove("proxyProbeRestore");
  await this.api.storage.session.remove("proxyProbeAuth");
  await this.api.alarms.clear(PROBE_ALARM);
  this.attempts.clear();
 }
 async recoverProbe() {
  const { proxyProbeRestore: lease, proxyTestV3: result } = await this.api.storage.local.get(["proxyProbeRestore", "proxyTestV3"]);
  if (lease) await this.restoreProbe();
  if (result?.phase === "testing") await this.api.storage.local.set({ proxyTestV3: { ...result, phase: "error", error: "测试中断" } });
 }
 async auth(details) {
  if (!details.isProxy || this.attempts.has(details.requestId)) return {};
  const { proxyProbeAuth: probe, proxyPassword } = await this.api.storage.session.get(["proxyProbeAuth", "proxyPassword"]);
  const testing = probe && probe.expires > Date.now();
  const p = testing ? probe.settings : await this.settings();
  if (p.mode !== "custom" || !["http", "https"].includes(p.scheme) || !p.username) return {};
  const peer = String(details.challenger?.host || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (peer !== p.host.replace(/^\[|\]$/g, "") || details.challenger?.port !== p.port) return {};
  const effective = await this.api.proxy.settings.get({ incognito: false });
  if (effective.levelOfControl !== "controlled_by_this_extension" || effective.value?.pacScript?.data !== pacFor(p)) return {};
  const secret = testing ? probe.password : proxyPassword;
  if (!secret) return { cancel: true };
  this.attempts.add(details.requestId);
  while (this.attempts.size > 256) this.attempts.delete(this.attempts.values().next().value);
  return { authCredentials: { username: p.username, password: secret } };
 }
 complete(id) { this.attempts.delete(id); }
}
