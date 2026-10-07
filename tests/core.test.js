import test from "node:test";
import assert from "node:assert/strict";
import { PRODUCTS, username, identityFrom, quoteFrom, priceText, sameQuote, sessionURL } from "../core.js";
import { quoteData, identityData } from "./fixtures.js";
test("normalizes usernames and rejects URL or injection", () => {
 assert.equal(username(" @Someone "), "someone");
 for (const v of ["", "https://x.com/user", "a/b", 'x";return']) assert.throws(() => username(v));
});
test("only accepts matching recipient with gift eligibility", () => {
 assert.equal(identityFrom(identityData(), "someone").id, "12345");
 assert.throws(() => identityFrom(identityData("other"), "someone"));
 assert.throws(() => identityFrom(identityData("someone", false), "someone"));
});
test("live prices have no BDT default or configured fixed amount", () => {
 const usd = quoteFrom(quoteData(3, "Usd", 17.5), PRODUCTS[0]);
 assert.equal(usd.currency, "USD"); assert.equal(usd.amount, 1750); assert.equal(priceText(usd), "17.5 USD");
 const bdt = quoteFrom(quoteData(3, "Bdt", 420), PRODUCTS[0]);
 assert.equal(bdt.amount, 42000); assert.equal(priceText(bdt), "420 BDT"); assert.equal(sameQuote(usd, bdt), false);
});
test("currency precision follows zero-decimal and three-decimal currencies", () => {
 const jpy = quoteFrom(quoteData(3, "Jpy", 1250), PRODUCTS[0]); assert.equal(jpy.amount, 1250); assert.equal(jpy.digits, 0);
 const bhd = quoteFrom(quoteData(3, "Bhd", 1.234), PRODUCTS[0]); assert.equal(bhd.amount, 1234); assert.equal(bhd.digits, 3);
});
test("rejects malformed or recurring live product quotes", () => {
 const data = quoteData(3); data.data.web_subscription_product_details_by_rest_id.prices[0].price_type = "Recurring";
 assert.throws(() => quoteFrom(data, PRODUCTS[0]));
 assert.throws(() => quoteFrom(quoteData(3), PRODUCTS[1]));
});
test("checkout must bind a live session to the official Stripe host", () => {
 assert.equal(sessionURL("https://checkout.stripe.com/c/pay/cs_live_Test", "cs_live_Test"), true);
 for (const url of ["http://checkout.stripe.com/c/pay/cs_live_Test", "https://checkout.stripe.com.evil/c/pay/cs_live_Test", "https://checkout.stripe.com/c/pay/cs_live_Other", "https://checkout.stripe.com/c/pay/cs_live_Test?redirect=evil"]) assert.equal(sessionURL(url, "cs_live_Test"), false);
});
