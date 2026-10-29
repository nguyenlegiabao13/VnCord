/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { VnCordDevs } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import definePlugin from "@utils/types";
import { ChannelStore, FluxDispatcher, MessageStore, Parser, UserStore } from "@webpack/common";

import { getIgnoredChannels, getIgnoredGuilds, getIgnoredUsers, settings } from "./settings";
import { MessageWithContent } from "./types";
import { clearCache, getCached, hasFailed, isInProgress, translate } from "./utils/translate";

const cl = classNameFactory("mt-");
const translatedMessages = new Map<string, string>();

function TranslateIcon({ height = 20, width = 20, className }: { height?: number; width?: number; className?: string; }) {
    return (
        <svg viewBox="0 96 960 960" height={height} width={width} className={className}>
            <path fill="currentColor" d="m475 976 181-480h82l186 480h-87l-41-126H604l-47 126h-82Zm151-196h142l-70-194h-2l-70 194Zm-466 76-55-55 204-204q-38-44-67.5-88.5T190 416h87q17 33 37.5 62.5T361 539q45-47 75-97.5T487 336H40v-80h280v-80h80v80h280v80H567q-22 69-58.5 135.5T419 598l98 99-30 81-127-122-200 200Z" />
        </svg>
    );
}

function shouldTranslate(message: MessageWithContent): boolean {
    if (!message.content || typeof message.content !== "string") return false;
    if (hasFailed(message.id, message.content)) return false;

    if (settings.store.skipOwnMessages) {
        const currentUserId = UserStore.getCurrentUser()?.id;
        if (currentUserId && message.author?.id === currentUserId) return false;
    }

    if (settings.store.skipBotMessages && message.author?.bot) return false;

    if (message.author && getIgnoredUsers().has(message.author.id)) return false;
    if (message.channel_id && getIgnoredChannels().has(message.channel_id)) return false;

    const guildId = message.channel_id ? ChannelStore.getChannel(message.channel_id)?.guild_id : null;
    if (guildId && getIgnoredGuilds().has(guildId)) return false;

    return true;
}

function triggerReRender(message: MessageWithContent) {
    const current = MessageStore.getMessage(message.channel_id, message.id);
    if (!current) return;

    FluxDispatcher.dispatch({
        type: "MESSAGE_UPDATE",
        message: current,
    });
}

export default definePlugin({
    name: "MessageTranslate",
    description: "Auto translate messages to your language with caching, per-channel toggles, and more options.",
    tags: ["Chat", "Utility"],
    authors: [VnCordDevs.creations],
    settings,

    patches: [
        {
            find: '.CUSTOM_GIFT?""',
            replacement: [
                {
                    match: /childrenMessageContent:(\i),/g,
                    replace: "childrenMessageContent:$self.wrapContent($1,arguments[0].message.id,arguments[0].message.channel_id),",
                },
                {
                    match: /\i\.memo\(function\((\i)\)\{(?=let \i,\i)/,
                    replace: "$&$1.message=$self.transformMessage($1?.message);",
                },
            ],
        },
    ],

    transformMessage(message: MessageWithContent): MessageWithContent {
        if (!settings.store.autoTranslate || !shouldTranslate(message)) {
            translatedMessages.delete(message.id);
            return message;
        }

        const cached = getCached(message.id);
        if (cached) {
            if (message.content === cached.translated) {
                translatedMessages.set(message.id, cached.sourceLang);
                return message;
            }
            if (cached.original !== message.content) {
                clearCache(message.id);
                translatedMessages.delete(message.id);
                return message;
            }
            translatedMessages.set(message.id, cached.sourceLang);

            return settings.store.showOriginal !== "trans-in-subtext"
                ? Object.assign(Object.create(Object.getPrototypeOf(message)), message, {
                    content: cached.translated,
                })
                : message;
        }

        translatedMessages.delete(message.id);
        if (!isInProgress(message.id)) {
            translate(message.id, message.content).then(result => {
                if (result) triggerReRender(message);
            });
        }

        return message;
    },

    wrapContent(content, messageId, channelId) {
        const sourceLang = translatedMessages.get(messageId);
        const cached = getCached(messageId);
        if (!sourceLang || !cached) return content;

        const indicatorElement = settings.store.showIndicator && (
            <div className={cl("indicator")}>translated from {sourceLang}</div>
        );

        switch (settings.store.showOriginal) {
            case "trans-in-subtext":
                return (
                    <>
                        {content}
                        <div className={cl("subtext")}>
                            <TranslateIcon height={16} width={16} className={cl("icon")} />{Parser.parse(cached.translated, true, { channelId, messageId })}
                        </div>
                        {indicatorElement}
                    </>
                );
            case "orig-in-subtext":
                return (
                    <>
                        {content}
                        <div className={cl("subtext")}>
                            {Parser.parse(cached.original, true, { channelId, messageId })}
                        </div>
                        {indicatorElement}
                    </>
                );
            case "no-orig":
            default:
                return (
                    <>
                        {content}
                        {indicatorElement}
                    </>
                );
        }
    }
});
