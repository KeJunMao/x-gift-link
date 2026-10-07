import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
// Explicit allowlist: never include docs, tests, credentials or browser profiles.
export const RELEASE_FILES = [
 "manifest.json", "app.html", "app.css", "app.js", "background.js",
 "controller.js", "core.js", "proxy.js", "x-request.js", "LICENSE",
 "icons/16.png", "icons/32.png", "icons/48.png", "icons/128.png"
];
