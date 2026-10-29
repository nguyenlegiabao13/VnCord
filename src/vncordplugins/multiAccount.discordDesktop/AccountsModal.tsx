/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./style.css";

import { Button } from "@components/Button";
import { Paragraph } from "@components/Paragraph";
import { classNameFactory } from "@utils/css";
import { PluginNative } from "@utils/types";
import { chooseFile } from "@utils/web";
import type { RenderModalProps } from "@vencord/discord-types";
import { IconUtils, Modal, openModal, TextInput, useEffect, UserStore, useState, useStateFromStores } from "@webpack/common";
import type { KeyboardEvent } from "react";

import type { AccountInfo } from "./types";

export const Native = VencordNative.pluginHelpers.MultiAccount as PluginNative<typeof import("./native")>;

const cl = classNameFactory("vc-multi-account-");

export interface AccountHandlers {
    onAdd(token: string): Promise<void>;
    onRemove(account: AccountInfo): Promise<void>;
    onSwitch(account: AccountInfo): Promise<void>;
    onOpenWindow(account: AccountInfo): Promise<void>;
    onOpenAll(): Promise<void>;
    onCopyToken(account: AccountInfo): Promise<void>;
    onRename(account: AccountInfo, label: string): Promise<void>;
    onExport(password: string): Promise<void>;
    onImport(password: string, file: string): Promise<void>;
}

function avatarUrl(account: AccountInfo): string {
    const user = UserStore.getUser(account.id);
    return user
        ? IconUtils.getUserAvatarURL(user, false, 64)
        : IconUtils.getDefaultAvatarURL(account.id, account.discriminator);
}

function AccountRow({ account, index, active, handlers, refresh }: {
    account: AccountInfo;
    index: number;
    active: boolean;
    handlers: AccountHandlers;
    refresh: () => Promise<void>;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(account.label);

    const run = async (action: (target: AccountInfo) => Promise<void>) => {
        await action(account);
        await refresh();
    };

    const save = async () => {
        await handlers.onRename(account, draft);
        setEditing(false);
        await refresh();
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter") void save();
        if (event.key === "Escape") setEditing(false);
    };

    return (
        <div className={cl("row")}>
            <img className={cl("avatar")} src={avatarUrl(account)} alt="" />
            <div className={cl("text")}>
                {editing ? (
                    <div className={cl("rename")}>
                        <TextInput
                            value={draft}
                            onChange={setDraft}
                            placeholder={account.username}
                            maxLength={40}
                            onKeyDown={onKeyDown}
                        />
                        <Button size="xs" onClick={() => void save()}>Save</Button>
                        <Button size="xs" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
                    </div>
                ) : (
                    <>
                        <div className={cl("name")}>{account.label || account.globalName || account.username}</div>
                        <div className={cl("tag")}>@{account.username}{account.discriminator !== "0" ? `#${account.discriminator}` : ""}</div>
                    </>
                )}
            </div>
            {active && <div className={cl("badge")}>Signed in</div>}
            {index < 9 && <span className={cl("hotkey")}>Ctrl+Alt+{index + 1}</span>}
            <div className={cl("actions")}>
                <Button size="xs" onClick={() => void run(handlers.onSwitch)}>Switch</Button>
                <Button size="xs" variant="secondary" onClick={() => void run(handlers.onOpenWindow)}>New window</Button>
                <Button size="xs" variant="secondary" onClick={() => void run(handlers.onCopyToken)}>Copy token</Button>
                <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => {
                        setDraft(account.label);
                        setEditing(true);
                    }}
                >
                    Rename
                </Button>
                <Button size="xs" variant="dangerSecondary" onClick={() => void run(handlers.onRemove)}>Remove</Button>
            </div>
        </div>
    );
}

function AccountsModal({ onClose, transitionState, handlers }: RenderModalProps & { handlers: AccountHandlers }) {
    const [accounts, setAccounts] = useState<AccountInfo[]>([]);
    const [token, setToken] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const currentUserId = useStateFromStores([UserStore], () => UserStore.getCurrentUser()?.id);

    const refresh = async () => {
        const res = await Native.listAccounts();
        if (res.success) setAccounts(res.value);
    };

    useEffect(() => {
        void refresh();
    }, []);

    const add = async () => {
        if (!token.trim()) return;
        setBusy(true);
        await handlers.onAdd(token.trim());
        setBusy(false);
        setToken("");
        await refresh();
    };

    const exportBackup = async () => {
        setBusy(true);
        await handlers.onExport(password);
        setBusy(false);
    };

    const importBackup = async () => {
        const file = await chooseFile("application/json,.json");
        if (!file) return;

        const text = await file.text();
        setBusy(true);
        await handlers.onImport(password, text);
        setBusy(false);
        await refresh();
    };

    const passwordValid = password.length >= 6;

    return (
        <Modal size="lg" onClose={onClose} title="Account manager" transitionState={transitionState}>
            <div className={cl("root")}>
                <div className={cl("add")}>
                    <TextInput
                        value={token}
                        onChange={setToken}
                        placeholder="Paste a token"
                        maxLength={512}
                    />
                    <Button size="small" disabled={busy || !token.trim()} onClick={() => void add()}>
                        Add account
                    </Button>
                    <Button
                        size="small"
                        variant="secondary"
                        disabled={busy || accounts.length === 0}
                        onClick={() => void handlers.onOpenAll()}
                    >
                        Open all
                    </Button>
                </div>
                {accounts.length === 0
                    ? <Paragraph>No accounts yet. Paste a token above to add your first one.</Paragraph>
                    : (
                        <div className={cl("list")}>
                            {accounts.map((account, index) => (
                                <AccountRow
                                    key={account.id}
                                    account={account}
                                    index={index}
                                    active={account.id === currentUserId}
                                    handlers={handlers}
                                    refresh={refresh}
                                />
                            ))}
                        </div>
                    )}
                <div className={cl("backup")}>
                    <TextInput
                        type="password"
                        value={password}
                        onChange={setPassword}
                        placeholder="Backup password (at least 6 characters)"
                        maxLength={128}
                    />
                    <Button
                        size="small"
                        disabled={busy || accounts.length === 0 || !passwordValid}
                        onClick={() => void exportBackup()}
                    >
                        Export
                    </Button>
                    <Button
                        size="small"
                        variant="secondary"
                        disabled={busy || !passwordValid}
                        onClick={() => void importBackup()}
                    >
                        Import
                    </Button>
                </div>
                <Paragraph className={cl("note")}>
                    Backups hold every account token, locked with this password. Keep the file somewhere safe.
                </Paragraph>
            </div>
        </Modal>
    );
}

export function openAccountsModal(handlers: AccountHandlers) {
    return openModal(props => <AccountsModal {...props} handlers={handlers} />);
}
