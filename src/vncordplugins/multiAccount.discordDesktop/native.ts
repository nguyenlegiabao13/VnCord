/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { DATA_DIR } from "@main/utils/constants";
import { IpcEvents } from "@shared/IpcEvents";
import { VENCORD_USER_AGENT } from "@shared/vencordUserAgent";
import { Logger } from "@utils/Logger";
import { spawn } from "child_process";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { app, BrowserWindow, clipboard, ipcMain, type IpcMainInvokeEvent, net, safeStorage } from "electron";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, resolve, sep } from "path";

import type { AccountInfo, NativeResult, PendingJoin } from "./types";

const logger = new Logger("MultiAccount");

const API_HOSTS = ["discord.com", "canary.discord.com", "ptb.discord.com"] as const;
const DISCORD_ORIGINS = ["https://discord.com", "https://canary.discord.com", "https://ptb.discord.com"] as const;
const ACCOUNTS_FILE = process.env.VNCORD_ACCOUNTS_FILE ?? join(DATA_DIR, "accounts.json");
const INSTANCES_DIR = join(dirname(ACCOUNTS_FILE), "instances");
const TOKEN_MAX_LENGTH = 512;
const LABEL_MAX_LENGTH = 40;
const PASSWORD_MIN_LENGTH = 6;
const BACKUP_MAX_LENGTH = 2_000_000;
const BACKUP_FORMAT = "vncord-accounts";
const BACKUP_VERSION = 1;
const CHANNEL_ID_PATTERN = /^\d{17,20}$/;

interface StoredAccount {
    info: AccountInfo;
    token: string;
}

interface BackupPayload {
    version: typeof BACKUP_VERSION;
    accounts: StoredAccount[];
}

interface DiscordUser {
    id: string;
    username: string;
    globalName: string | null;
    discriminator: string;
}

const profileDir = process.env.VNCORD_PROFILE_DIR;
if (profileDir) {
    mkdirSync(profileDir, { recursive: true });
    app.setPath("userData", profileDir);
}

function normalizePath(path: string): string {
    const full = resolve(path);
    return process.platform === "win32" ? full.toLowerCase() : full;
}

const joinChannelId = process.env.VNCORD_JOIN_CHANNEL_ID;
let pendingJoin: PendingJoin | null = joinChannelId && CHANNEL_ID_PATTERN.test(joinChannelId)
    ? { channelId: joinChannelId }
    : null;

function isAccountInfo(value: unknown): value is AccountInfo {
    if (typeof value !== "object" || value === null) return false;
    const info = value as Record<string, unknown>;
    return typeof info.id === "string"
        && typeof info.label === "string"
        && typeof info.username === "string"
        && (typeof info.globalName === "string" || info.globalName === null)
        && typeof info.discriminator === "string"
        && typeof info.addedAt === "number"
        && typeof info.lastUsed === "number";
}

function isStoredAccount(value: unknown): value is StoredAccount {
    if (typeof value !== "object" || value === null) return false;
    const stored = value as Record<string, unknown>;
    return typeof stored.token === "string" && isAccountInfo(stored.info);
}

function readAccounts(): StoredAccount[] {
    try {
        const parsed: unknown = JSON.parse(readFileSync(ACCOUNTS_FILE, "utf-8"));
        if (typeof parsed !== "object" || parsed === null) return [];
        const { accounts } = (parsed as { accounts?: unknown });
        if (!Array.isArray(accounts)) return [];
        return accounts.filter(isStoredAccount);
    } catch {
        return [];
    }
}

function writeAccounts(accounts: StoredAccount[]) {
    mkdirSync(dirname(ACCOUNTS_FILE), { recursive: true });
    writeFileSync(ACCOUNTS_FILE, JSON.stringify({ version: 1, accounts }), "utf-8");
}

function encryptToken(token: string): NativeResult<string> {
    if (!safeStorage.isEncryptionAvailable())
        return { success: false, error: "This system cannot store tokens securely." };

    return { success: true, value: safeStorage.encryptString(token).toString("base64") };
}

function decryptToken(data: string): NativeResult<string> {
    if (!safeStorage.isEncryptionAvailable())
        return { success: false, error: "This system cannot read stored tokens." };

    try {
        return { success: true, value: safeStorage.decryptString(Buffer.from(data, "base64")) };
    } catch {
        return { success: false, error: "The stored token could not be decrypted." };
    }
}

function parseUser(value: unknown): DiscordUser | null {
    if (typeof value !== "object" || value === null) return null;
    const user = value as Record<string, unknown>;
    if (typeof user.id !== "string" || typeof user.username !== "string") return null;

    return {
        id: user.id,
        username: user.username,
        globalName: typeof user.global_name === "string" ? user.global_name : null,
        discriminator: typeof user.discriminator === "string" ? user.discriminator : "0",
    };
}

async function fetchUser(token: string): Promise<NativeResult<DiscordUser>> {
    for (const host of API_HOSTS) {
        let res: Response;
        try {
            res = await net.fetch(`https://${host}/api/v10/users/@me`, {
                headers: { Authorization: token, "User-Agent": VENCORD_USER_AGENT },
            });
        } catch {
            return { success: false, error: "Could not reach Discord." };
        }

        if (res.status === 401) continue;
        if (!res.ok) return { success: false, error: `Discord answered with status ${res.status}.` };

        const body: unknown = await res.json();
        const user = parseUser(body);
        if (!user) return { success: false, error: "Discord sent back an unexpected response." };
        return { success: true, value: user };
    }

    return { success: false, error: "Discord rejected that token." };
}

function findDiscordWindow(): BrowserWindow | undefined {
    return BrowserWindow.getAllWindows().find(win =>
        DISCORD_ORIGINS.some(origin => win.webContents.getURL().startsWith(origin)),
    );
}

async function applyToken(win: BrowserWindow, token: string): Promise<boolean> {
    const stored = JSON.stringify(token);
    try {
        const current: unknown = await win.webContents.executeJavaScript("localStorage.getItem(\"token\")");
        if (current === stored) return true;
        await win.webContents.executeJavaScript(`localStorage.setItem("token", ${JSON.stringify(stored)})`);
    } catch {
        return false;
    }

    win.webContents.reload();
    return true;
}

async function autoLogin(win: BrowserWindow, accountId: string) {
    if (tokenDelivered.has(win.webContents.id)) return;

    if (!isIsolatedInstance()) {
        logger.error("This instance did not get its own profile, so the token was not applied.");
        return;
    }

    const account = readAccounts().find(stored => stored.info.id === accountId);
    if (!account) return;

    const token = decryptToken(account.token);
    if (!token.success) {
        logger.error("Could not decrypt the token for", accountId);
        return;
    }

    await applyToken(win, token.value);
}

function isIsolatedInstance(): boolean {
    if (!profileDir) return false;

    const root = normalizePath(profileDir);
    const current = normalizePath(app.getPath("userData"));
    return current === root || current.startsWith(root.endsWith(sep) ? root : root + sep);
}

const tokenDelivered = new Set<number>();
const childAccountId = process.env.VNCORD_ACCOUNT_ID;
if (childAccountId) {
    const childWindows = new Set<number>();
    let childToken: { value: string } | undefined;

    function getChildToken(): string | null {
        if (childToken) return childToken.value;

        const account = readAccounts().find(stored => stored.info.id === childAccountId);
        if (!account) return null;

        const token = decryptToken(account.token);
        if (!token.success) {
            logger.error("Could not decrypt the token for", childAccountId, token.error);
            return null;
        }

        childToken = { value: token.value };
        return childToken.value;
    }

    ipcMain.on(IpcEvents.VNCORD_ACCOUNT_TOKEN, event => {
        const token = isIsolatedInstance() && childWindows.has(event.sender.id) ? getChildToken() : null;
        event.returnValue = token;
        if (token) tokenDelivered.add(event.sender.id);
    });

    app.on("browser-window-created", (_event, win) => {
        childWindows.add(win.webContents.id);
        let attempted = false;
        win.webContents.on("dom-ready", () => {
            if (attempted) return;
            attempted = true;
            void autoLogin(win, childAccountId);
        });
    });
}

function readJsonObject(file: string): Record<string, unknown> | null {
    try {
        const parsed: unknown = JSON.parse(readFileSync(file, "utf-8"));
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
        return parsed as Record<string, unknown>;
    } catch {
        return null;
    }
}

function shareStorageKey(profile: string) {
    const osCrypt = readJsonObject(join(app.getPath("userData"), "Local State"))?.os_crypt;
    if (typeof osCrypt !== "object" || osCrypt === null || !("encrypted_key" in osCrypt)) return;

    for (const dir of [profile, join(profile, "discord")]) {
        const file = join(dir, "Local State");
        const state = readJsonObject(file) ?? {};
        state.os_crypt = osCrypt;
        mkdirSync(dir, { recursive: true });
        writeFileSync(file, JSON.stringify(state), "utf-8");
    }
}

export async function listAccounts(_: IpcMainInvokeEvent): Promise<NativeResult<AccountInfo[]>> {
    return { success: true, value: readAccounts().map(stored => stored.info) };
}

export async function addAccount(_: IpcMainInvokeEvent, token: string, label?: string): Promise<NativeResult<AccountInfo>> {
    const trimmed = typeof token === "string" ? token.trim() : "";
    if (!trimmed) return { success: false, error: "Paste a token first." };
    if (trimmed.length > TOKEN_MAX_LENGTH) return { success: false, error: "That token does not look right." };

    const user = await fetchUser(trimmed);
    if (!user.success) return user;

    const encrypted = encryptToken(trimmed);
    if (!encrypted.success) return encrypted;

    const accounts = readAccounts();
    const info: AccountInfo = {
        id: user.value.id,
        label: (typeof label === "string" && label.trim()) || user.value.username,
        username: user.value.username,
        globalName: user.value.globalName,
        discriminator: user.value.discriminator,
        addedAt: Date.now(),
        lastUsed: Date.now(),
    };

    const existing = accounts.find(stored => stored.info.id === info.id);
    if (existing) {
        info.addedAt = existing.info.addedAt;
        existing.info = info;
        existing.token = encrypted.value;
    } else {
        accounts.push({ info, token: encrypted.value });
    }
    writeAccounts(accounts);

    return { success: true, value: info };
}

export async function updateAccountLabel(_: IpcMainInvokeEvent, id: string, label: string): Promise<NativeResult<AccountInfo>> {
    const accounts = readAccounts();
    const account = accounts.find(stored => stored.info.id === id);
    if (!account) return { success: false, error: "That account is not in the list." };

    const trimmed = typeof label === "string" ? label.trim().replace(/\s+/g, " ") : "";
    if (trimmed.length > LABEL_MAX_LENGTH) return { success: false, error: "That name is too long." };

    account.info.label = trimmed || account.info.username;
    writeAccounts(accounts);
    return { success: true, value: account.info };
}

export async function removeAccount(_: IpcMainInvokeEvent, id: string): Promise<NativeResult<null>> {
    const accounts = readAccounts();
    const next = accounts.filter(stored => stored.info.id !== id);
    if (next.length === accounts.length) return { success: false, error: "That account is not in the list." };

    writeAccounts(next);
    return { success: true, value: null };
}

export async function switchAccount(_: IpcMainInvokeEvent, id: string): Promise<NativeResult<null>> {
    const accounts = readAccounts();
    const account = accounts.find(stored => stored.info.id === id);
    if (!account) return { success: false, error: "That account is not in the list." };

    const token = decryptToken(account.token);
    if (!token.success) return token;

    const win = findDiscordWindow();
    if (!win) return { success: false, error: "Could not find the Discord window." };

    if (!await applyToken(win, token.value))
        return { success: false, error: "Could not write the token into the client." };

    account.info.lastUsed = Date.now();
    writeAccounts(accounts);
    return { success: true, value: null };
}

export async function openAccountWindow(_: IpcMainInvokeEvent, id: string, joinChannelId?: string): Promise<NativeResult<null>> {
    const accounts = readAccounts();
    const account = accounts.find(stored => stored.info.id === id);
    if (!account) return { success: false, error: "That account is not in the list." };

    const instanceDir = join(INSTANCES_DIR, account.info.id);
    const profile = join(instanceDir, "profile");
    const vncordDir = join(instanceDir, "vncord-data");
    const discordDir = join(instanceDir, "discord-data");
    for (const dir of [profile, vncordDir, discordDir]) mkdirSync(dir, { recursive: true });
    shareStorageKey(profile);

    const parentSettings = join(DATA_DIR, "settings");
    if (existsSync(parentSettings)) cpSync(parentSettings, join(vncordDir, "settings"), { recursive: true });

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        DISCORD_USER_DATA_DIR: profile,
        VNCORD_PROFILE_DIR: profile,
        VNCORD_DATA_DIR: discordDir,
        VNCORD_USER_DATA_DIR: vncordDir,
        VNCORD_ACCOUNTS_FILE: ACCOUNTS_FILE,
        VNCORD_ACCOUNT_ID: account.info.id,
    };
    if (typeof joinChannelId === "string" && CHANNEL_ID_PATTERN.test(joinChannelId))
        env.VNCORD_JOIN_CHANNEL_ID = joinChannelId;

    try {
        const child = spawn(process.execPath, [`--user-data-dir=${profile}`], {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
            env,
        });
        child.unref();
    } catch {
        return { success: false, error: "Could not start another Discord instance." };
    }

    logger.info("Opened a separate instance for", account.info.username);
    account.info.lastUsed = Date.now();
    writeAccounts(accounts);
    return { success: true, value: null };
}

export async function copyAccountToken(_: IpcMainInvokeEvent, id: string): Promise<NativeResult<null>> {
    const account = readAccounts().find(stored => stored.info.id === id);
    if (!account) return { success: false, error: "That account is not in the list." };

    const token = decryptToken(account.token);
    if (!token.success) return token;

    clipboard.writeText(token.value);
    return { success: true, value: null };
}
function isBackupFile(value: unknown): value is { data: string; } {
    if (typeof value !== "object" || value === null) return false;
    const file = value as Record<string, unknown>;
    return file.format === BACKUP_FORMAT && file.version === BACKUP_VERSION && typeof file.data === "string";
}

function isBackupPayload(value: unknown): value is BackupPayload {
    if (typeof value !== "object" || value === null) return false;
    const payload = value as Record<string, unknown>;
    if (payload.version !== BACKUP_VERSION || !Array.isArray(payload.accounts) || payload.accounts.length > 100) return false;

    return payload.accounts.every(stored =>
        isStoredAccount(stored)
        && stored.token.length > 0 && stored.token.length <= TOKEN_MAX_LENGTH
        && stored.info.label.length <= LABEL_MAX_LENGTH
        && stored.info.username.length <= LABEL_MAX_LENGTH
    );
}

function checkPassword(password: unknown): string | null {
    if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH)
        return "Use a password with at least 6 characters.";

    return null;
}

export async function exportAccounts(_: IpcMainInvokeEvent, password: string): Promise<NativeResult<string>> {
    const passwordError = checkPassword(password);
    if (passwordError) return { success: false, error: passwordError };

    const accounts = readAccounts();
    if (accounts.length === 0) return { success: false, error: "There are no accounts to export." };

    const payload: BackupPayload = { version: BACKUP_VERSION, accounts: [] };
    for (const stored of accounts) {
        const token = decryptToken(stored.token);
        if (!token.success) return token;
        payload.accounts.push({ info: stored.info, token: token.value });
    }

    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", scryptSync(password, salt, 32), iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
    const data = Buffer.concat([salt, iv, cipher.getAuthTag(), body]).toString("base64");

    return { success: true, value: JSON.stringify({ format: BACKUP_FORMAT, version: BACKUP_VERSION, data }) };
}

export async function importAccounts(_: IpcMainInvokeEvent, password: string, file: string): Promise<NativeResult<number>> {
    const passwordError = checkPassword(password);
    if (passwordError) return { success: false, error: passwordError };
    if (typeof file !== "string" || file.length === 0 || file.length > BACKUP_MAX_LENGTH)
        return { success: false, error: "That file could not be read." };

    let backup: unknown;
    try {
        backup = JSON.parse(file);
    } catch {
        return { success: false, error: "That file is not a VnCord account backup." };
    }
    if (!isBackupFile(backup)) return { success: false, error: "That file is not a VnCord account backup." };

    const data = Buffer.from(backup.data, "base64");
    if (data.length <= 44) return { success: false, error: "That backup is damaged." };

    let plain: string;
    try {
        const decipher = createDecipheriv("aes-256-gcm", scryptSync(password, data.subarray(0, 16), 32), data.subarray(16, 28));
        decipher.setAuthTag(data.subarray(28, 44));
        plain = Buffer.concat([decipher.update(data.subarray(44)), decipher.final()]).toString("utf8");
    } catch {
        return { success: false, error: "Wrong password or damaged backup." };
    }

    let payload: unknown;
    try {
        payload = JSON.parse(plain);
    } catch {
        return { success: false, error: "That backup is damaged." };
    }
    if (!isBackupPayload(payload)) return { success: false, error: "That backup is damaged." };

    const accounts = readAccounts();
    let imported = 0;
    for (const stored of payload.accounts) {
        const token = encryptToken(stored.token);
        if (!token.success) return token;

        const existing = accounts.find(account => account.info.id === stored.info.id);
        if (existing) {
            existing.info = { ...stored.info, addedAt: existing.info.addedAt };
            existing.token = token.value;
        } else {
            accounts.push({ info: stored.info, token: token.value });
        }
        imported++;
    }

    writeAccounts(accounts);
    return { success: true, value: imported };
}

export async function setPendingJoin(_: IpcMainInvokeEvent, channelId: string): Promise<NativeResult<null>> {
    if (typeof channelId !== "string" || !CHANNEL_ID_PATTERN.test(channelId))
        return { success: false, error: "That channel id does not look right." };

    pendingJoin = { channelId };
    return { success: true, value: null };
}

export async function getPendingJoin(_: IpcMainInvokeEvent): Promise<NativeResult<PendingJoin | null>> {
    return { success: true, value: pendingJoin };
}

export async function clearPendingJoin(_: IpcMainInvokeEvent): Promise<NativeResult<null>> {
    pendingJoin = null;
    return { success: true, value: null };
}
