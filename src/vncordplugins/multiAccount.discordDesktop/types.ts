/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface AccountInfo {
    id: string;
    label: string;
    username: string;
    globalName: string | null;
    discriminator: string;
    addedAt: number;
    lastUsed: number;
}

export interface PendingJoin {
    channelId: string;
}

export type NativeResult<T> = { success: true; value: T } | { success: false; error: string };
