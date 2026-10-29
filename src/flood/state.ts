/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { sendMessage } from "@utils/discord";
import { Logger } from "@utils/Logger";
import { SelectedChannelStore } from "@webpack/common";

const logger = new Logger("Flood");

export const DEFAULT_PHRASES = [
    "VnCord flood!",
    "flood flood flood",
    "spam spam spam",
    "beep boop",
    "one more message"
];

export const DELAY_PRESETS = [0, 100, 250, 500, 1000, 2000, 5000, 10000];

export type FloodSource = "default" | "custom";

let source: FloodSource = "default";
let customPhrases: string[] = [];
let delayMs = 0;
let running = false;
let sentCount = 0;
let phraseIndex = 0;
let targetChannelId: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<() => void>();

function notify() {
    for (const listener of listeners) listener();
}

export function subscribeFlood(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function getSource(): FloodSource {
    return source;
}

export function getPhrases(): string[] {
    return source === "custom" ? customPhrases : DEFAULT_PHRASES;
}

export function getDelay(): number {
    return delayMs;
}

export function isFloodRunning(): boolean {
    return running;
}

export function getSentCount(): number {
    return sentCount;
}

export function setSource(next: FloodSource): void {
    source = next;
    notify();
}

export function setCustomPhrases(phrases: string[]): void {
    customPhrases = phrases;
    source = "custom";
    notify();
}

export function setDelay(ms: number): void {
    delayMs = Math.max(0, Math.floor(ms));
    notify();
}

function tick() {
    const phrases = getPhrases();
    if (targetChannelId === null || phrases.length === 0) {
        stopFlood();
        return;
    }

    const content = phrases[phraseIndex % phrases.length];
    phraseIndex++;
    Promise.resolve(sendMessage(targetChannelId, { content }))
        .catch(err => logger.error("Failed to send flood message", err));

    sentCount++;
    notify();
    timer = setTimeout(tick, delayMs);
}

export function startFlood(): void {
    if (running || getPhrases().length === 0) return;

    const channelId = SelectedChannelStore.getChannelId();
    if (!channelId) return;

    targetChannelId = channelId;
    phraseIndex = 0;
    sentCount = 0;
    running = true;
    notify();
    tick();
}

export function stopFlood(): void {
    if (timer !== null) {
        clearTimeout(timer);
        timer = null;
    }

    if (!running) return;

    running = false;
    targetChannelId = null;
    notify();
}
