import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { ROOT, RELEASE_FILES } from "./release-files.js";

// Standard ZIP using Node built-ins. Fixed timestamps make it reproducible;
// the allowlist keeps local data out of release artifacts.
const crcTable = Array.from({ length: 256 }, (_, value) => {
 for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
 return value >>> 0;
});
function crc32(data) {
 let crc = 0xffffffff;
 for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255];
 return (crc ^ 0xffffffff) >>> 0;
}
const { version } = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Invalid extension version");
const localParts = [], centralParts = [];
let offset = 0;
for (const file of RELEASE_FILES) {
 const name = Buffer.from(file, "utf8");
 const data = readFileSync(join(ROOT, file));
 const compressed = deflateRawSync(data, { level: 9 });
 const crc = crc32(data);
 const header = Buffer.alloc(30);
 header.writeUInt32LE(0x04034b50, 0);
 header.writeUInt16LE(20, 4); // Minimum ZIP version 2.0.
 header.writeUInt16LE(0x0800, 6); // UTF-8 filenames.
 header.writeUInt16LE(8, 8); // Deflate.
 header.writeUInt16LE(33, 12); // DOS date 1980-01-01; time 00:00.
 header.writeUInt32LE(crc, 14);
 header.writeUInt32LE(compressed.length, 18);
 header.writeUInt32LE(data.length, 22);
 header.writeUInt16LE(name.length, 26);
 localParts.push(header, name, compressed);

 const central = Buffer.alloc(46);
 central.writeUInt32LE(0x02014b50, 0);
 central.writeUInt16LE(20, 4);
 central.writeUInt16LE(20, 6);
 central.writeUInt16LE(0x0800, 8);
 central.writeUInt16LE(8, 10);
 central.writeUInt16LE(33, 14);
 central.writeUInt32LE(crc, 16);
 central.writeUInt32LE(compressed.length, 20);
 central.writeUInt32LE(data.length, 24);
 central.writeUInt16LE(name.length, 28);
 central.writeUInt32LE(offset, 42);
 centralParts.push(central, name);
 offset += header.length + name.length + compressed.length;
}
const central = Buffer.concat(centralParts);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(RELEASE_FILES.length, 8);
end.writeUInt16LE(RELEASE_FILES.length, 10);
end.writeUInt32LE(central.length, 12);
end.writeUInt32LE(offset, 16);
const archive = Buffer.concat([...localParts, central, end]);
const output = join(ROOT, "dist", "x-gift-link-" + version + ".zip");
mkdirSync(join(ROOT, "dist"), { recursive: true });
writeFileSync(output, archive);
console.log("Created " + output + " (" + RELEASE_FILES.length + " files, " + archive.length + " bytes)");
