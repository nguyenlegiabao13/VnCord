/*
 * Assembles scripts/VnCordCli/icon.ico from the PNGs in png/.
 * PNG-in-ICO format, valid since Windows Vista. Every size is embedded so
 * Windows never has to upscale a larger frame (which blurs small icons).
 *
 * Run after scripts/makeIconPngs.mjs:
 *   node scripts/VnCordCli/buildIco.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));

const sizes = readdirSync(join(HERE, "png"))
    .filter(f => f.endsWith(".png"))
    .map(f => parseInt(f, 10))
    .sort((a, b) => a - b);

if (!sizes.length) {
    console.error("No PNGs found in png/. Run scripts/makeIconPngs.mjs first.");
    process.exit(1);
}

const images = sizes.map(size => ({
    size,
    data: readFileSync(join(HERE, "png", `${size}.png`))
}));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);          // reserved
header.writeUInt16LE(1, 2);          // type: icon
header.writeUInt16LE(images.length, 4);

const entries = Buffer.alloc(images.length * 16);
let offset = header.length + entries.length;
images.forEach((img, i) => {
    const entry = entries.subarray(i * 16, i * 16 + 16);
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 0);  // width (0 = 256)
    entry.writeUInt8(img.size >= 256 ? 0 : img.size, 1);  // height
    entry.writeUInt8(0, 2);          // palette colors
    entry.writeUInt8(0, 3);          // reserved
    entry.writeUInt16LE(1, 4);       // color planes
    entry.writeUInt16LE(32, 6);      // bits per pixel
    entry.writeUInt32LE(img.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += img.data.length;
});

const ico = Buffer.concat([header, entries, ...images.map(img => img.data)]);
writeFileSync(join(HERE, "icon.ico"), ico);
console.log(`icon.ico written: ${images.length} sizes (${sizes.join(", ")})`);
