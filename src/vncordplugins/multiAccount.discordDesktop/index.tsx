/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { UserAreaButton, UserAreaRenderProps } from "@api/UserArea";
import { VnCordDevs } from "@utils/constants";
import { Logger } from "@utils/Logger";
import { sleep } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";
import { saveFile } from "@utils/web";
import { ChannelActions, ChannelRouter, ChannelStore, SelectedChannelStore, showToast, UserStore } from "@webpack/common";

import { Native, openAccountsModal } from "./AccountsModal";
import type { AccountInfo } from "./types";

const logger = new Logger("MultiAccount");

const settings = definePluginSettings({
    joinVoiceOnSwitch: {
        type: OptionType.BOOLEAN,
        description: "Join the voice channel you are in after switching to another account.",
        default: true,
    },
    quickSwitch: {
        type: OptionType.BOOLEAN,
        description: "Press Ctrl+Alt+1 to 9 to switch to the matching account in the list.",
        default: true,
    },
});

async function joinVoiceChannel(channelId: string): Promise<boolean> {
    try {
        ChannelRouter.transitionToChannel(channelId);
    } catch (err) {
        logger.error("Could not open the voice channel", err);
        return false;
    }

    for (let attempt = 0; attempt < 15; attempt++) {
        if (ChannelStore.getChannel(channelId)) {
            ChannelActions.selectVoiceChannel(channelId);
            return true;
        }
        await sleep(1000);
    }

    return false;
}

async function handlePendingJoin() {
    const res = await Native.getPendingJoin();
    if (!res.success || !res.value) return;
    if (!UserStore.getCurrentUser()) return;

    if (!await joinVoiceChannel(res.value.channelId)) return;

    await Native.clearPendingJoin();
    showToast({ text: "Joined the voice channel." });
}

async function addAccount(token: string) {
    const res = await Native.addAccount(token);
    if (!res.success) {
        showToast({ text: res.error, variant: "critical" });
        return;
    }
    showToast({ text: `Added ${res.value.username}.` });
}

async function removeAccount(account: AccountInfo) {
    const res = await Native.removeAccount(account.id);
    if (!res.success) {
        showToast({ text: res.error, variant: "critical" });
        return;
    }
    showToast({ text: `Removed ${account.label}.` });
}

async function switchToAccount(account: AccountInfo) {
    const voiceChannelId = SelectedChannelStore.getVoiceChannelId();
    if (voiceChannelId && settings.store.joinVoiceOnSwitch) {
        await Native.setPendingJoin(voiceChannelId);
    }

    const res = await Native.switchAccount(account.id);
    if (!res.success) {
        showToast({ text: res.error, variant: "critical" });
        return;
    }
    showToast({ text: `Switched to ${account.label}.` });
}

async function openAccountWindow(account: AccountInfo) {
    const res = await Native.openAccountWindow(account.id, SelectedChannelStore.getVoiceChannelId());
    if (!res.success) {
        showToast({ text: res.error, variant: "critical" });
        return;
    }
    showToast({ text: `Opened ${account.label} in a separate window.` });
}

async function openAllWindows() {
    const res = await Native.listAccounts();
    if (!res.success) {
        showToast({ text: res.error, variant: "critical" });
        return;
    }

    const voiceChannelId = SelectedChannelStore.getVoiceChannelId();
    for (const account of res.value) {
        const opened = await Native.openAccountWindow(account.id, voiceChannelId);
        if (!opened.success) {
            showToast({ text: opened.error, variant: "critical" });
            return;
        }
    }

    showToast({ text: "Opened every account in its own window." });
}

async function copyToken(account: AccountInfo) {
    const res = await Native.copyAccountToken(account.id);
    if (!res.success) {
        showToast({ text: res.error, variant: "critical" });
        return;
    }
    showToast({ text: "Token copied to the clipboard." });
}

async function renameAccount(account: AccountInfo, label: string) {
    const res = await Native.updateAccountLabel(account.id, label);
    if (!res.success) {
        showToast({ text: res.error, variant: "critical" });
        return;
    }
    showToast({ text: `Saved ${res.value.label}.` });
}

async function exportAccounts(password: string) {
    const res = await Native.exportAccounts(password);
    if (!res.success) {
        showToast({ text: res.error, variant: "critical" });
        return;
    }
    saveFile(new File([res.value], "vncord-accounts-backup.json", { type: "application/json" }));
    showToast({ text: "Encrypted backup saved." });
}

async function importAccounts(password: string, file: string) {
    const res = await Native.importAccounts(password, file);
    if (!res.success) {
        showToast({ text: res.error, variant: "critical" });
        return;
    }
    showToast({ text: `Imported ${res.value} account${res.value === 1 ? "" : "s"}.` });
}

let switching = false;

async function quickSwitch(slot: number) {
    if (switching) return;
    switching = true;

    try {
        const res = await Native.listAccounts();
        if (!res.success) {
            showToast({ text: res.error, variant: "critical" });
            return;
        }

        const account = res.value[slot - 1];
        if (!account) return;

        if (UserStore.getCurrentUser()?.id === account.id) {
            showToast({ text: `Already using ${account.label}.` });
            return;
        }

        await switchToAccount(account);
    } finally {
        switching = false;
    }
}

function onKeydown(event: KeyboardEvent) {
    if (!settings.store.quickSwitch || !event.ctrlKey || !event.altKey || event.shiftKey || event.metaKey) return;

    const match = /^Digit([1-9])$/.exec(event.code);
    if (!match) return;

    event.preventDefault();
    event.stopPropagation();
    void quickSwitch(Number(match[1]));
}

function openManager() {
    openAccountsModal({
        onAdd: addAccount,
        onRemove: removeAccount,
        onSwitch: switchToAccount,
        onOpenWindow: openAccountWindow,
        onOpenAll: openAllWindows,
        onCopyToken: copyToken,
        onRename: renameAccount,
        onExport: exportAccounts,
        onImport: importAccounts,
    });
}

function AccountsIcon({ className }: { className?: string }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className={className}>
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
    );
}

function AccountsButton({ iconForeground, hideTooltips, nameplate }: UserAreaRenderProps) {
    return (
        <UserAreaButton
            onClick={openManager}
            role="button"
            tooltipText={hideTooltips ? undefined : "Accounts"}
            icon={<AccountsIcon className={iconForeground} />}
            plated={nameplate != null}
        />
    );
}

export default definePlugin({
    name: "MultiAccount",
    description: "Keep several Discord accounts signed in at once, switch between them and let any of them join a voice channel.",
    authors: [VnCordDevs.KrystalSkull],
    tags: ["Utility", "Voice"],
    dependencies: ["UserAreaAPI", "CommandsAPI"],
    enabledByDefault: true,
    settings,

    userAreaButton: {
        icon: AccountsIcon,
        render: AccountsButton,
    },

    commands: [
        {
            name: "accounts",
            description: "Open the account manager.",
            execute() {
                openManager();
            },
        },
    ],

    flux: {
        CONNECTION_OPEN() {
            void handlePendingJoin().catch(err => logger.error("Could not join the pending voice channel", err));
        },
    },

    start() {
        document.addEventListener("keydown", onKeydown, true);
        void handlePendingJoin().catch(err => logger.error("Could not join the pending voice channel", err));
    },

    stop() {
        document.removeEventListener("keydown", onKeydown, true);
    },
});
