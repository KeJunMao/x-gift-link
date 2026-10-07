import { Controller } from "./controller.js";
const controller = new Controller(chrome), ready = controller.init();
ready.catch(() => {});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
 const url = sender.url?.split("?")[0].split("#")[0];
 if (sender.id !== chrome.runtime.id || url !== chrome.runtime.getURL("app.html")) return false;
 ready.then(() => controller.dispatch(message)).then(data => respond({ ok: true, data }), error => respond({ ok: false, error: error.message }));
 return true;
});

chrome.webRequest.onAuthRequired.addListener((details, callback) => {
 ready.then(() => controller.proxy.auth(details)).then(callback, () => callback({ cancel: true }));
}, { urls: ["https://x.com/*"] }, ["asyncBlocking"]);
const done = details => controller.proxy.complete(details.requestId);
chrome.webRequest.onCompleted.addListener(done, { urls: ["https://x.com/*"] });
chrome.webRequest.onErrorOccurred.addListener(done, { urls: ["https://x.com/*"] });

chrome.alarms.onAlarm.addListener(alarm => {
 if (alarm.name === "proxy-probe-restore") ready.then(() => controller.proxy.recoverProbe()).catch(() => {});
});
