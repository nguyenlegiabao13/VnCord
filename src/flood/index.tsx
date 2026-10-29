/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addChatBarButton, ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { useForceUpdater } from "@utils/react";
import { IconProps } from "@utils/types";
import { useEffect } from "@webpack/common";

import { openFloodPanel } from "./FloodPanelModal";
import { getSentCount, isFloodRunning, subscribeFlood } from "./state";

const FloodIcon = ({ width = 24, height = 24, className }: IconProps) => (
    <svg width={width} height={height} className={className} viewBox="0 0 24 24" aria-hidden="true">
        <path
            fill="currentColor"
            fillRule="evenodd"
            d="M5 4h14a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 0 1-2.5 2.5h-9l-4 3.2V16H5a2.5 2.5 0 0 1-2.5-2.5v-7A2.5 2.5 0 0 1 5 4Zm1.8 6a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0Zm4 0a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0Zm4 0a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0Z"
        />
    </svg>
);

const FloodChatButton: ChatBarButtonFactory = ({ isAnyChat }) => {
    const forceUpdate = useForceUpdater();
    useEffect(() => subscribeFlood(forceUpdate), [forceUpdate]);

    if (!isAnyChat) return null;

    const running = isFloodRunning();
    return (
        <ChatBarButton
            tooltip={running ? `Flood Panel (${getSentCount()} sent)` : "Flood Panel"}
            onClick={openFloodPanel}
        >
            <FloodIcon width={24} height={24} />
        </ChatBarButton>
    );
};

addChatBarButton("vc-flood-panel", FloodChatButton, FloodIcon);
