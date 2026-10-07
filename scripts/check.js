import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, posix } from "node:path";
import { ROOT, RELEASE_FILES } from "./release-files.js";

const read = file => readFileSync(join(ROOT, file), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const pkg = JSON.parse(read("package.json"));
assert.equal(manifest.manifest_version, 3, "Expected Manifest V3");
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.equal(pkg.version, manifest.version, "package.json and manifest.json versions must match");
assert.equal(pkg.license, "MIT");
assert.equal(manifest.background.type, "module");
assert.deepEqual(manifest.host_permissions, ["https://x.com/*"]);
assert.deepEqual([...manifest.permissions].sort(), [
 "storage", "cookies", "scripting", "proxy", "webRequest", "webRequestAuthProvider", "alarms"
].sort(), "Update the permission review and privacy docs when permissions change");
for (const file of RELEASE_FILES) {
 assert.ok(statSync(join(ROOT, file)).isFile(), "Missing release file: " + file);
}
const references = [manifest.background.service_worker, manifest.action.default_popup,
 ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)];
for (const file of references) assert.ok(RELEASE_FILES.includes(file), "Manifest file omitted from ZIP: " + file);
const html = read(manifest.action.default_popup);
for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
 assert.ok(RELEASE_FILES.includes(match[1]), "Popup resource omitted from ZIP: " + match[1]);
}
let scripts = 0;
for (const directory of ["", "scripts", "tests"]) {
 for (const entry of readdirSync(join(ROOT, directory))) {
  if (!entry.endsWith(".js")) continue;
  const file = join(directory, entry);
  execFileSync(process.execPath, ["--check", join(ROOT, file)], { stdio: "pipe" });
  scripts++;
  if (!RELEASE_FILES.includes(file)) continue;
  for (const match of read(file).matchAll(/\bfrom\s+["'](\.[^"']+)["']/g)) {
   const dependency = posix.normalize(posix.join(dirname(file).replaceAll("\\", "/"), match[1]));
   assert.ok(RELEASE_FILES.includes(dependency), "Module omitted from ZIP: " + dependency);
  }
 }
}
// Catch broken local documentation links before publishing a standalone repo.
let documents = 0;
for (const directory of ["", "docs"]) {
 for (const entry of readdirSync(join(ROOT, directory))) {
  if (!entry.endsWith(".md")) continue;
  const file = join(directory, entry);
  for (const match of read(file).matchAll(/\]\(([^)]+)\)|href="([^"]+)"|src="([^"]+)"/g)) {
   const target = (match[1] || match[2] || match[3]).split("#")[0];
   if (!target || /^[a-z]+:/i.test(target)) continue;
   assert.ok(statSync(join(ROOT, dirname(file), target)).isFile(), "Broken link in " + file + ": " + target);
  }
  documents++;
 }
}
console.log("Checked Manifest V3, " + scripts + " scripts, " + documents + " documents and " + RELEASE_FILES.length + " release files.");
