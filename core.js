// Public X gifting identifiers; amounts and currencies are always read live.
export const PRODUCTS = [
 { months: 3, product: "prod_TJXJtpzqCpI36N" },
 { months: 6, product: "prod_TJXKKNJwZJIhCM" }
];
export const OPERATIONS = { identity: "kn8hCE6bHstQV2MtfYDTKg", quote: "Se1Bp6zcNnuXYXRecV2qLA", create: "GqTVJ4S1526tLkxj69xIZw" };
export const BEARER = "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
export function username(value) {
 const user = String(value || "").trim().replace(/^@/, "").toLowerCase();
 if (!/^[a-z0-9_]{1,15}$/.test(user)) throw new Error("请输入有效的 X 用户名。");
 return user;
}
export function identityFrom(data, user) {
 const r = data?.data?.user?.result;
 const screen = r?.core?.screen_name || r?.legacy?.screen_name;
 if (!r?.rest_id) throw new Error("没有找到这个 X 账号。");
 if (String(screen).toLowerCase() !== user || !/^\d+$/.test(r.rest_id)) throw new Error("无法确认目标账号，请重试。");
 if (r.premium_gifting_eligible !== true) throw new Error("这个账号目前不能接收 Premium 礼品。");
 return { id: r.rest_id, username: screen, name: r.core?.name || r.legacy?.name || "" };
}
export function quoteFrom(data, product) {
 const r = data?.data?.web_subscription_product_details_by_rest_id;
 if (r?.rest_id !== product.product || r.prices?.length !== 1) throw new Error(product.months + " 个月套餐暂时无法获取报价。");
 const p = r.prices[0], currency = String(p.currency_code || "").toUpperCase(), micro = p.amount_local_micro;
 if (p.price_type !== "OneTime" || !/^[A-Z]{3}$/.test(currency) || !Number.isSafeInteger(micro) || micro <= 0) throw new Error("X 返回的报价无效，请重试。");
 const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
 const minor = micro / (10 ** (6 - digits));
 if (!Number.isSafeInteger(minor)) throw new Error("X 返回的金额精度无法确认。");
 return { ...product, currency, micro, amount: minor, digits };
}
export function priceText(plan) {
 if (!plan) return "";
 return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 0, maximumFractionDigits: plan.digits }).format(plan.micro / 1000000) + " " + plan.currency;
}
export function sameQuote(a, b) {
 return a.product === b.product && a.months === b.months && a.currency === b.currency && a.micro === b.micro;
}
export function sessionURL(link, id) {
 try {
  const u = new URL(link);
  return /^cs_live_[A-Za-z0-9]+$/.test(id) && u.protocol === "https:" && u.host === "checkout.stripe.com" && !u.username && !u.password && !u.search && /^\/[a-zA-Z]\/pay\//.test(u.pathname) && u.pathname.slice(2) === "/pay/" + id;
 } catch { return false; }
}
export function sessionFrom(data) {
 const s = data?.data?.onetimepurchase_gift;
 if (s?.session_status !== "Unpaid" || !sessionURL(s.session_url, s.session_id)) throw new Error("X 没有返回有效的未付款链接，请先核对原订单。");
 return { sessionId: s.session_id, url: s.session_url };
}
export function countryText(country) {
 if (!/^[A-Z]{2}$/.test(country || "")) return "未知";
 try { return new Intl.DisplayNames(["zh-CN"], { type: "region" }).of(country); }
 catch { return country; }
}
