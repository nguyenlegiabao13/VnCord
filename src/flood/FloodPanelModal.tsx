/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./flood.css";

import { Button } from "@components/Button";
import { Divider } from "@components/Divider";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { classNameFactory } from "@utils/css";
import { openModal } from "@utils/modal";
import { useForceUpdater } from "@utils/react";
import { RenderModalProps } from "@vencord/discord-types";
import { Modal, Select, TextArea, TextInput, useEffect, useRef, useState } from "@webpack/common";

import {
    DELAY_PRESETS,
    getDelay,
    getPhrases,
    getSentCount,
    getSource,
    isFloodRunning,
    setCustomPhrases,
    setDelay,
    setSource,
    startFlood,
    stopFlood,
    subscribeFlood
} from "./state";

const cl = classNameFactory("vc-flood-");

function formatDelay(ms: number): string {
    return ms < 1000 ? `${ms}ms` : `${ms / 1000}s`;
}

function parsePhrases(text: string): string[] {
    return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function PhraseEditorModal({ transitionState, onClose }: RenderModalProps) {
    const [text, setText] = useState(getPhrases().join("\n"));

    return (
        <Modal
            transitionState={transitionState}
            onClose={onClose}
            size="md"
            title="Edit phrases"
            actions={[
                {
                    text: "Cancel",
                    variant: "secondary",
                    onClick: onClose
                },
                {
                    text: "Save",
                    variant: "primary",
                    onClick: () => {
                        setCustomPhrases(parsePhrases(text));
                        onClose();
                    }
                },
            ]}
        >
            <TextArea
                className={cl("editor")}
                value={text}
                onChange={setText}
                autosize={true}
            />
            <Paragraph className={cl("muted")}>One phrase per line</Paragraph>
        </Modal>
    );
}

function openPhraseEditor() {
    openModal(props => <PhraseEditorModal {...props} />);
}

function FloodPanelModal({ transitionState, onClose }: RenderModalProps) {
    const forceUpdate = useForceUpdater();
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => subscribeFlood(forceUpdate), [forceUpdate]);

    const phrases = getPhrases();
    const running = isFloodRunning();
    const delay = getDelay();
    const hasCustomDelay = !DELAY_PRESETS.includes(delay);

    const loadTxtFile = async (files: FileList | null) => {
        const file = files?.[0];
        if (!file) return;

        const lines = parsePhrases(await file.text());
        if (lines.length > 0) setCustomPhrases(lines);
    };

    return (
        <Modal
            transitionState={transitionState}
            onClose={onClose}
            size="sm"
            title="Flood Panel"
            actions={[
                {
                    text: "Close",
                    variant: "secondary",
                    onClick: onClose
                },
                {
                    text: "Stop flood",
                    variant: "critical-primary",
                    disabled: !running,
                    onClick: stopFlood
                },
            ]}
        >
            <Heading tag="h5">Messages source</Heading>
            <Paragraph className={cl("muted")}>
                {getSource() === "custom" ? "Custom" : "Default"} ({phrases.length} phrases)
            </Paragraph>
            <div className={cl("row")}>
                <Button variant="primary" size="small" onClick={() => fileInputRef.current?.click()}>
                    Load .txt file
                </Button>
                <Button variant="secondary" size="small" onClick={openPhraseEditor}>
                    Edit phrases
                </Button>
                <Button variant="secondary" size="small" onClick={() => setSource("default")}>
                    Default
                </Button>
            </div>
            <input
                ref={fileInputRef}
                type="file"
                accept=".txt,text/plain"
                className={cl("file-input")}
                onChange={e => {
                    void loadTxtFile(e.target.files);
                    e.target.value = "";
                }}
            />

            <Divider className={cl("divider")} />

            <Heading tag="h5">Delay between messages</Heading>
            <div className={cl("row")}>
                <Select
                    className={cl("select")}
                    options={[
                        ...DELAY_PRESETS.map(value => ({ label: formatDelay(value), value })),
                        ...(hasCustomDelay ? [{ label: "Custom", value: -1 }] : [])
                    ]}
                    isSelected={value => hasCustomDelay ? value === -1 : value === delay}
                    select={value => {
                        if (value !== -1) setDelay(value);
                    }}
                    serialize={value => formatDelay(value === -1 ? delay : value)}
                    closeOnSelect={true}
                />
                <TextInput
                    className={cl("delay-input")}
                    value={String(delay)}
                    onChange={value => setDelay(Number.parseInt(value, 10) || 0)}
                />
                <Paragraph className={cl("muted")}>ms</Paragraph>
            </div>

            <Button
                variant="primary"
                className={cl("start")}
                disabled={running || phrases.length === 0}
                onClick={startFlood}
            >
                Normal flood
            </Button>
            {running && (
                <Paragraph className={cl("muted")}>Sent {getSentCount()} messages</Paragraph>
            )}
        </Modal>
    );
}

export function openFloodPanel() {
    openModal(props => <FloodPanelModal {...props} />);
}
