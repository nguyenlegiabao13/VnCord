/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/*
 * VnCordCli core — native installer logic for VnCord.
 *
 * Patches Discord desktop installs by renaming their app.asar to _app.asar
 * and dropping an app/ folder shim whose index.js requires our built
 * dist/desktop/patcher.js (the same layout applyHostPatch.ts expects at
 * runtime). No external installer binary is downloaded.
 *
 * The GUI (scripts/VnCordCli/VnCordCli.exe) drives this script through:
 *   --status-json                 print [{ channel, version, resources, status }]
 *   --install  [--target <path>]  patch every install, or just the target
 *   --uninstall [--target <path>]
 *   --repair   [--target <path>]
 * Flag mode stays headless so `pnpm inject` keeps working from scripts.
 */

import "./checkNodeVersion.js";

import { execFileSync } from "child_process";
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "fs";
import { basename, dirname, join } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

const sleep = ms => new Promise(r => setTimeout(r, ms));

const BASE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(BASE_DIR, "dist", "desktop");
const PATCHER = join(DIST_DIR, "patcher.js");

const SHIM_MARKER = "// VnCord installer stub";
const SHIM_PACKAGE = JSON.stringify({ name: "discord", main: "index.js" });

/* ---------- install discovery ---------- */

function listVersionDirs(channelDir) {
    let entries;
    try {
        entries = readdirSync(channelDir);
    } catch {
        return [];
    }
    return entries
        .filter(name => name.startsWith("app-"))
        .map(name => join(channelDir, name, "resources"))
        .filter(resources => existsSync(join(resources, "app.asar")) || existsSync(join(resources, "_app.asar")));
}

function findWin32Installs() {
    const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
    const installs = [];
    for (const channel of ["Discord", "DiscordPTB", "DiscordCanary"]) {
        installs.push(...listVersionDirs(join(localAppData, channel)).map(resources => ({ channel, resources })));
    }
    return installs;
}

function findDarwinInstalls() {
    const installs = [];
    for (const app of ["Discord.app", "Discord PTB.app", "Discord Canary.app"]) {
        const resources = join("/Applications", app, "Contents", "Resources");
        if (existsSync(join(resources, "app.asar")) || existsSync(join(resources, "_app.asar"))) {
            installs.push({ channel: app.replace(".app", ""), resources });
        }
    }
    return installs;
}

function findLinuxInstalls() {
    const installs = [];
    const candidates = [
        "/usr/lib/discord",
        "/opt/Discord",
        "/opt/discord",
        "/opt/DiscordPTB",
        "/opt/discord-ptb",
        "/opt/DiscordCanary",
        "/opt/discord-canary",
        join(homedir(), ".var/app/com.discordapp.Discord/current/active/files/discord")
    ];
    for (const base of candidates) {
        const resources = join(base, "resources");
        if (existsSync(join(resources, "app.asar")) || existsSync(join(resources, "_app.asar"))) {
            installs.push({ channel: basename(base), resources });
        }
    }
    return installs;
}

function findInstalls() {
    switch (process.platform) {
        case "win32": return findWin32Installs();
        case "darwin": return findDarwinInstalls();
        case "linux": return findLinuxInstalls();
        default:
            console.error("Unsupported platform: " + process.platform);
            process.exit(1);
    }
}

/* ---------- patch logic (mirrors src/main/applyHostPatch.ts) ---------- */

const isPatched = resources => existsSync(join(resources, "_app.asar"));

function writeShim(resources) {
    const appDir = join(resources, "app");
    mkdirSync(appDir, { recursive: true });
    writeFileSync(join(appDir, "package.json"), SHIM_PACKAGE);
    writeFileSync(join(appDir, "index.js"), `${SHIM_MARKER}\nrequire(${JSON.stringify(PATCHER)});\n`);
}

// locate the shim's index.js across both layouts: the installer writes
// resources/app/, an older runtime bug wrote resources/app.asar/ (a folder).
function shimIndexPath(resources) {
    const appIndex = join(resources, "app", "index.js");
    if (existsSync(appIndex)) return appIndex;
    const legacy = join(resources, "app.asar");
    if (existsSync(join(legacy, "index.js"))) {
        try {
            if (lstatSync(legacy).isDirectory()) return join(legacy, "index.js");
        } catch { /* unreadable — treat as absent */ }
    }
    return null;
}

// legacy runtime layout left `app.asar` as a folder instead of `app/`.
function hasLegacyShimDir(resources) {
    const legacy = join(resources, "app.asar");
    if (!existsSync(join(legacy, "index.js"))) return false;
    try {
        return lstatSync(legacy).isDirectory();
    } catch {
        return false;
    }
}

/**
 * heal installs contaminated by other installers: when `_app.asar` holds
 * the full vanilla Discord asar while `app.asar` is a tiny foreign stub
 * (e.g. OpenAsar left by an old Equicord install), the stub would error on
 * launch if our app/ shim is ever removed. restore vanilla, then fall
 * through to the normal folder-shim patch.
 */
function healForeignStub(resources) {
    const app = join(resources, "app.asar");
    const appBackup = join(resources, "_app.asar");
    if (!existsSync(app) || !existsSync(appBackup)) return false;
    try {
        if (lstatSync(app).isDirectory()) return false; // our legacy layout, not a foreign stub
    } catch {
        return false;
    }
    let appSize = 0;
    let backupSize = 0;
    try {
        appSize = statSync(app).size;
        backupSize = statSync(appBackup).size;
    } catch {
        return false;
    }
    if (appSize >= 100_000 || backupSize <= appSize) return false;

    renameSync(appBackup, app);     // vanilla Discord restored
    renameSync(app, appBackup);     // re-apply our patched layout
    return true;
}

function inject(resources) {
    if (isPatched(resources)) {
        const healed = healForeignStub(resources);
        if (hasLegacyShimDir(resources)) rmSync(join(resources, "app.asar"), { recursive: true, force: true });
        writeShim(resources);
        return healed ? "updated (removed foreign asar stub)" : "updated";
    }
    const app = join(resources, "app.asar");
    if (!existsSync(app)) return "skipped (no app.asar)";
    try {
        if (lstatSync(app).isDirectory()) return "skipped (app.asar is a folder)";
    } catch {
        return "skipped";
    }
    renameSync(app, join(resources, "_app.asar"));
    writeShim(resources);
    return "patched";
}

function isOurShim(resources) {
    const index = shimIndexPath(resources);
    if (!index) return true; // no shim — nothing foreign to preserve
    try {
        const text = readFileSync(index, "utf-8");
        return text.includes(SHIM_MARKER) || text.includes("patcher.js");
    } catch {
        return true;
    }
}

function uninject(resources) {
    if (!isPatched(resources)) return "not patched";
    if (!isOurShim(resources)) return "kept (shim is not VnCord's)";
    rmSync(join(resources, "app"), { recursive: true, force: true });
    if (hasLegacyShimDir(resources)) rmSync(join(resources, "app.asar"), { recursive: true, force: true });
    renameSync(join(resources, "_app.asar"), join(resources, "app.asar"));
    return "uninstalled";
}

const ACTIONS = {
    install: inject,
    uninstall: uninject,
    repair(resources) {
        const undone = uninject(resources);
        // leave another mod's shim alone, otherwise always end patched
        if (undone.startsWith("kept")) return undone;
        return inject(resources);
    }
};

function statusOf(resources) {
    if (!isPatched(resources)) return "vanilla";
    if (!shimIndexPath(resources)) return "broken patch";
    return isOurShim(resources) ? "VnCord" : "other mod";
}

function versionOf(resources) {
    return basename(dirname(resources));
}

/* ---------- running-discord handling (win32) ---------- */

const CHANNEL_EXE = {
    Discord: "Discord.exe",
    DiscordPTB: "DiscordPTB.exe",
    DiscordCanary: "DiscordCanary.exe"
};

function isExeRunning(exe) {
    try {
        const out = execFileSync("tasklist", ["/FI", `IMAGENAME eq ${exe}`, "/NH"], { encoding: "utf8" });
        return out.toLowerCase().includes(exe.toLowerCase());
    } catch {
        return false;
    }
}

/**
 * close a running Discord install so its files are not locked during
 * patching. graceful close first, force kill after a short grace period.
 * returns true when a running instance was found (and closed).
 */
async function closeRunningDiscord(channel) {
    if (process.platform !== "win32") return false;
    const exe = CHANNEL_EXE[channel];
    if (!exe || !isExeRunning(exe)) return false;

    console.log(`  [${channel}] is running — closing it to patch safely...`);
    try {
        execFileSync("taskkill", ["/IM", exe], { stdio: "ignore" });
    } catch { /* already exited */ }
    for (let i = 0; i < 10 && isExeRunning(exe); i++) await sleep(500);
    if (isExeRunning(exe)) {
        try {
            execFileSync("taskkill", ["/F", "/IM", exe], { stdio: "ignore" });
        } catch { /* died between checks */ }
        await sleep(500);
    }
    return true;
}

/* ---------- install-time host optimisation ---------- */

const CHANNEL_USER_DATA = {
    Discord: "discord",
    DiscordPTB: "discordptb",
    DiscordCanary: "discordcanary"
};

// Electron/Chromium caches Discord rebuilds on demand — safe to delete.
const CACHE_DIRS = ["Cache", "Code Cache", "GPUCache", "DawnCache", "DawnGraphiteCache", "DawnWebGPUCache"];

/**
 * speed up boot and lighten the client: skip the slow host-update check on
 * startup and clear rebuildable caches so the first sessions start clean.
 */
function optimizeHost(channel) {
    if (process.platform !== "win32") return "skipped (unsupported platform)";
    const channelDir = CHANNEL_USER_DATA[channel];
    const userData = process.env.APPDATA && channelDir ? join(process.env.APPDATA, channelDir) : null;
    if (!userData || !existsSync(userData)) return "skipped (no user data found)";

    const settingsFile = join(userData, "settings.json");
    let hostSettings = {};
    try {
        hostSettings = JSON.parse(readFileSync(settingsFile, "utf8"));
    } catch { /* fresh or missing file — Discord creates it */ }

    let skipUpdateChanged = false;
    if (hostSettings.SKIP_HOST_UPDATE !== true) {
        hostSettings.SKIP_HOST_UPDATE = true;
        writeFileSync(settingsFile, JSON.stringify(hostSettings, null, 2));
        skipUpdateChanged = true;
    }

    let cleared = 0;
    for (const dir of CACHE_DIRS) {
        const path = join(userData, dir);
        if (existsSync(path)) {
            rmSync(path, { recursive: true, force: true });
            cleared++;
        }
    }

    return `host update check ${skipUpdateChanged ? "now skipped (was slowing startup)" : "already skipped"}, cleared ${cleared} cache folder(s)`;
}

function applyAction(action, installs) {
    return (async () => {
        const handler = ACTIONS[action];
        let failed = 0;
        for (const { channel, resources } of installs) {
            try {
                await closeRunningDiscord(channel);
                const result = handler(resources);
                console.log(`  [${channel}] ${resources}\n        -> ${result}`);
                if (action !== "uninstall") {
                    console.log(`        -> optimized: ${optimizeHost(channel)}`);
                }
            } catch (err) {
                failed++;
                console.error(`  [${channel}] ${resources}\n        -> FAILED: ${err?.message ?? err}`);
            }
        }
        return failed;
    })();
}

/* ---------- cli entry ---------- */

const USAGE = `
VnCordCli - installer core for the VnCord Discord client mod

Usage:
  node scripts/runInstaller.mjs -- --status-json              list installs as JSON (GUI uses this)
  node scripts/runInstaller.mjs -- --install [--target <resources path>] [--channel <name>]
  node scripts/runInstaller.mjs -- --uninstall [--target <resources path>] [--channel <name>]
  node scripts/runInstaller.mjs -- --repair [--target <resources path>] [--channel <name>]

With no filter every install is patched. --target pins one install,
--channel narrows to one channel (Discord, DiscordPTB, DiscordCanary).
`;

const argStart = process.argv.indexOf("--");
const args = argStart === -1 ? [] : process.argv.slice(argStart + 1);
const action = args[0]?.replace(/^--/, "");

if (action === "status-json") {
    const installs = findInstalls().map(({ channel, resources }) => ({
        channel,
        version: versionOf(resources),
        resources,
        status: statusOf(resources)
    }));
    process.stdout.write(JSON.stringify(installs));
    process.exit(0);
}

if (!ACTIONS[action]) {
    console.log(USAGE);
    process.exit(args.length ? 1 : 0);
}

if (action !== "uninstall" && !existsSync(PATCHER)) {
    console.error("dist/desktop/patcher.js not found. Build first: pnpm build");
    process.exit(1);
}

const targetArgs = [];
const channelFilters = [];
for (let i = 1; i < args.length; i++) {
    if (args[i] === "--target") {
        const value = args[++i];
        if (!value) {
            console.error("--target requires a resources path");
            process.exit(1);
        }
        targetArgs.push(value);
    } else if (args[i] === "--channel") {
        const value = args[++i];
        if (!value) {
            console.error("--channel requires a channel name (Discord, DiscordPTB, DiscordCanary)");
            process.exit(1);
        }
        channelFilters.push(value.toLowerCase());
    } else {
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
}

const allInstalls = findInstalls();
let installs = allInstalls;
if (targetArgs.length) {
    installs = targetArgs.map(resources => {
        const known = allInstalls.find(i => i.resources === resources);
        const channel = known?.channel
            ?? basename(dirname(dirname(resources)))
            ?? "Discord";
        return { channel, resources };
    });
    const known = new Set(allInstalls.map(i => i.resources));
    for (const t of targetArgs) {
        if (!known.has(t)) {
            console.error(`Unknown install: ${t}`);
            process.exit(1);
        }
    }
}
if (channelFilters.length) {
    installs = installs.filter(i => channelFilters.includes(i.channel.toLowerCase()));
}

if (!installs.length) {
    console.error("No matching Discord installations found. Is Discord desktop installed?");
    process.exit(1);
}

console.log(`VnCordCli ${action}\n`);

const failed = await applyAction(action, installs);
console.log(failed
    ? `\nDone with ${failed} failure(s).`
    : `\nAll done. Restart Discord to ${action === "uninstall" ? "return to vanilla" : "load VnCord"}.`
);
process.exit(failed ? 1 : 0);
