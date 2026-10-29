/* One-off helper: rasterize assets logo into PNGs for icon.ico generation. */
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SVG = readFileSync(join("D:/VnCord Project/VnCord ( Website )", "assets", "logo.svg"), "utf-8");
const OUT_DIR = join(ROOT, "scripts", "VnCordCli", "png");
mkdirSync(OUT_DIR, { recursive: true });

const SIZES = [16, 32, 48, 64, 128, 256];

const browser = await puppeteer.launch({
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    args: ["--no-sandbox", "--disable-gpu"]
});
const page = await browser.newPage();
await page.setContent(`<body style="margin:0"><div id="host" style="width:256px;height:256px">${SVG.replace("<svg ", '<svg width="256" height="256" ')}</div></body>`);
await page.waitForSelector("svg");

const el = await page.$("#host");
for (const size of SIZES) {
    await page.setViewport({ width: size, height: size });
    await page.evaluate(s => {
        const svg = document.querySelector("svg");
        svg.setAttribute("width", s);
        svg.setAttribute("height", s);
        const host = document.getElementById("host");
        host.style.width = s + "px";
        host.style.height = s + "px";
    }, size);
    await new Promise(r => setTimeout(r, 100));
    const buf = await el.screenshot({ omitBackground: true });
    writeFileSync(join(OUT_DIR, `${size}.png`), buf);
    console.log("rendered", size);
}
await browser.close();
console.log("done");
