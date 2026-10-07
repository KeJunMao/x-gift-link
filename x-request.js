// Functions are serialized into an existing X tab. Only allowlisted metadata is returned.
export async function pageNetwork(options = {}) {
 if (!options.background && location.origin !== "https://x.com") return { country: null, source: null, reachable: false, error: "X 页面不可用" };
 const parseAssignment = (html, marker) => {
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const equal = html.indexOf("=", start + marker.length);
  if (equal < 0 || equal - start > marker.length + 8) return null;
  let p = equal + 1;
  while (/\s/.test(html[p] || "") && p < html.length) p++;
  if (html[p] !== "{") return null;
  const begin = p; let depth = 0, quoted = false, escaped = false;
  for (; p < html.length; p++) {
   const char = html[p];
   if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; }
   else { if (char === '"') quoted = true; else if (char === "{") depth++; else if (char === "}" && --depth === 0) { try { return JSON.parse(html.slice(begin, p + 1)); } catch { return null; } } }
  }
  return null;
 };
 const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
 try {
  // Fresh same-host request: a third-party IP checker might use a different proxy route.
  const response = await fetch("https://x.com/?xgift_region=" + Date.now(), { credentials: options.background ? "omit" : "include", cache: "no-store", signal: controller.signal });
  if (new URL(response.url).origin !== "https://x.com") return { country: null, source: null, reachable: false, error: "响应无效" };
  if (!response.ok) return { country: null, source: null, reachable: true, http: response.status, error: "HTTP " + response.status };
  const html = await response.text();
  if (html.length > 6 * 1024 * 1024) return { country: null, source: null, reachable: true, http: response.status };
  const fresh = parseAssignment(html, "window.__INITIAL_DATA__");
  const legacy = fresh ? null : parseAssignment(html, "window.__INITIAL_STATE__");
  const country = fresh?.appMetadata?.country || legacy?.session?.country;
  return /^[A-Za-z]{2}$/.test(country || "") ?
   { country: country.toUpperCase(), source: fresh ? "x.com appMetadata.country" : "x.com session.country", reachable: true, http: response.status } :
   { country: null, source: null, reachable: true, http: response.status };
 } catch (error) { return { country: null, source: null, reachable: false, error: error.name === "AbortError" ? "连接超时" : "连接失败" }; }
 finally { clearTimeout(timer); }
}
export async function pageRequest(input) {
 if (location.origin !== "https://x.com") return { ok: false, error: "X 页面已关闭或离开 x.com，请重新打开。" };
 const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
 try {
  const base = "https://x.com/i/api/graphql/" + input.id + "/" + input.operation;
  const mutation = input.operation === "useOneTimePurchaseGiftMutation";
  const query = new URLSearchParams({ variables: JSON.stringify(input.variables) });
  if (input.operation === "useSubscriptionProductDetailsByRestIdQuery") query.set("features", '{"subscriptions_marketing_page_fetch_promotions":true}');
  const response = await fetch(mutation ? base : base + "?" + query, {
   method: mutation ? "POST" : "GET", credentials: "include", redirect: "error", cache: "no-store",
   referrer: "https://x.com/" + input.username + "/gift-premium",
   headers: { Authorization: input.bearer, "X-Csrf-Token": input.csrf, "X-Twitter-Auth-Type": "OAuth2Session",
    "X-Twitter-Active-User": "yes", "X-Twitter-Client-Language": "en", "Content-Type": "application/json" },
   body: mutation ? JSON.stringify({ variables: input.variables, queryId: input.id }) : undefined,
   signal: controller.signal
  });
  if (!response.ok) return { ok: false, error: "X 请求失败（HTTP " + response.status + "）。请在 X 页面检查登录状态或网络。" };
  const text = await response.text();
  if (text.length > 2 * 1024 * 1024) return { ok: false, error: "X 返回的数据过大。" };
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, error: "请在 X 页面完成验证后重试。" }; }
  if (data.errors?.length) return { ok: false, error: "X 拒绝了这次请求，请在 X 页面核对账号状态。" };
  return { ok: true, data };
 } catch (e) {
  return { ok: false, error: e.name === "AbortError" ? "X 请求超时，请检查浏览器的网络出口。" : "X 请求中断，请检查网络并保持 X 页面打开。" };
 } finally { clearTimeout(timer); }
}
