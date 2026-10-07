import { PRODUCTS } from "../core.js";
export function quoteData(months, currency = "Usd", major = months * 5) {
 return { data: { web_subscription_product_details_by_rest_id: { rest_id: PRODUCTS.find(p => p.months === months).product,
  prices: [{ price_type: "OneTime", currency_code: currency, amount_local_micro: major * 1000000 }] } } };
}
export function identityData(user = "someone", eligible = true) {
 return { data: { user: { result: { rest_id: "12345", core: { screen_name: user }, premium_gifting_eligible: eligible } } } };
}
