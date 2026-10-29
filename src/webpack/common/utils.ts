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

import * as t from "@vencord/discord-types";
import { _resolveReady, filters, findByCodeLazy, findByPropsLazy, findLazy, mapMangledModuleLazy, waitFor } from "@webpack";
import type * as TSPattern from "ts-pattern";

export let FluxDispatcher: t.FluxDispatcher;
waitFor(["dispatch", "subscribe"], m => {
    FluxDispatcher = m;
    // Importing this directly causes all webpack commons to be imported, which can easily cause circular dependencies.
    // For this reason, use a non import access here.
    Vencord.Api.PluginManager.subscribeAllPluginsFluxEvents(m);

    const cb = () => {
        m.unsubscribe("CONNECTION_OPEN", cb);
        _resolveReady();
    };
    m.subscribe("CONNECTION_OPEN", cb);
});

export let ComponentDispatch: any;
waitFor(["dispatchToLastSubscribed"], m => ComponentDispatch = m);

export const Constants: t.Constants = mapMangledModuleLazy('ME:"/users/@me"', {
    Endpoints: filters.byProps("USER", "ME"),
    UserFlags: filters.byProps("STAFF", "SPAMMER"),
    FriendsSections: m => m.PENDING === "PENDING" && m.ADD_FRIEND
});

export const RestAPI: t.RestAPI = findLazy(m => typeof m === "object" && m.del && m.put);
export const moment: typeof import("moment") = findByPropsLazy("parseTwoDigitYear");

export const useDrag = findByCodeLazy("useDrag::spec.begin was deprecated");
// you cant make a better finder i love that they remove display names sm
export const useDrop = findByCodeLazy(".disconnectDropTarget()", ".dropTargetOptions=");

export const { match, P }: { match: typeof TSPattern["match"], P: typeof TSPattern["P"]; } = mapMangledModuleLazy("@ts-pattern/matcher", {
    match: filters.byCode("return new"),
    P: filters.byProps("when")
});

function isEqual(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;

    if (a instanceof Date || b instanceof Date)
        return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();

    if (a instanceof RegExp || b instanceof RegExp)
        return a instanceof RegExp && b instanceof RegExp && a.source === b.source && a.flags === b.flags;

    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++)
            if (!isEqual(a[i], b[i])) return false;
        return true;
    }

    if (a instanceof Map || b instanceof Map) {
        if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) return false;
        for (const [key, value] of a) {
            if (!b.has(key) || !isEqual(value, b.get(key))) return false;
        }
        return true;
    }

    if (a instanceof Set || b instanceof Set) {
        if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) return false;
        const valuesA = Array.from(a.values());
        const valuesB = Array.from(b.values());
        for (let i = 0; i < valuesA.length; i++)
            if (!isEqual(valuesA[i], valuesB[i])) return false;
        return true;
    }

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;

    const recordA = a as Record<string, unknown>;
    const recordB = b as Record<string, unknown>;
    for (const key of keysA) {
        if (!Object.prototype.hasOwnProperty.call(recordB, key)) return false;
        if (!isEqual(recordA[key], recordB[key])) return false;
    }
    return true;
}

function clamp(num: number, min: number, max: number): number {
    return Math.min(Math.max(num, min), max);
}

function throttle<A extends unknown[]>(fn: (...args: A) => void, wait: number): ((...args: A) => void) & { cancel(): void } {
    let lastArgs: A | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let lastCall = 0;

    const invoke = (args: A) => {
        lastCall = Date.now();
        fn(...args);
    };

    return Object.assign(
        (...args: A) => {
            const remaining = wait - (Date.now() - lastCall);

            if (remaining <= 0) {
                invoke(args);
                return;
            }

            lastArgs = args;
            if (timeout === null) {
                timeout = setTimeout(() => {
                    timeout = null;
                    const pending = lastArgs;
                    lastArgs = null;
                    if (pending !== null) invoke(pending);
                }, remaining);
            }
        },
        {
            cancel: () => {
                if (timeout !== null) {
                    clearTimeout(timeout);
                    timeout = null;
                }
                lastArgs = null;
            }
        }
    );
}

export const lodash = { isEqual, clamp, throttle };

export const i18n = mapMangledModuleLazy(['defaultLocale:"en-US"', /initialLocale:\i/], {
    t: m => m?.[Symbol.toStringTag] === "IntlMessagesProxy",
    intl: m => m != null && Object.getPrototypeOf(m)?.withFormatters != null
}, true);

export let SnowflakeUtils: t.SnowflakeUtils;
waitFor(["fromTimestamp", "extractTimestamp"], m => SnowflakeUtils = m);

export let Parser: t.Parser;
waitFor("parseTopic", m => Parser = m);
export let Alerts: t.Alerts;
waitFor(["show", "close"], m => Alerts = m);

export const showToast: t.showToast = findByCodeLazy(".currentToastMap.has(");

export const UserUtils = {
    getUser: findByCodeLazy(".USER(")
};

export const UploadManager = findByPropsLazy("clearAll", "addFile");
export const UploadHandler = {
    promptToUpload: findByCodeLazy("Unexpected mismatch between files and file metadata") as (files: File[], channel: t.Channel, draftType: Number) => Promise<void>
};

export const ApplicationAssetUtils = mapMangledModuleLazy("getAssetImage: size must === [", {
    fetchAssetIds: filters.byCode('.startsWith("http:")', ".dispatch({"),
    getAssetFromImageURL: filters.byCode("].serialize(", ":null"),
    getAssetImage: filters.byCode("getAssetImage: size must === ["),
    getAssets: filters.byCode(".assets")
});

export const NavigationRouter: t.NavigationRouter = mapMangledModuleLazy("transitionTo - Transitioning to", {
    transitionTo: filters.byCode("transitionTo -"),
    transitionToGuild: filters.byCode("transitionToGuild -"),
    back: filters.byCode("goBack()"),
    forward: filters.byCode("goForward()"),
});
export const ChannelRouter: t.ChannelRouter = mapMangledModuleLazy('"Thread must have a parent ID."', {
    transitionToChannel: filters.byCode(".openTextInVoiceIfVoiceChannel"),
    transitionToThread: filters.byCode('"Thread must have a parent ID."')
});

export const SettingsRouter: t.SettingsRouter = mapMangledModuleLazy('type:"USER_SETTINGS_MODAL_OPEN"', {
    openUserSettings: filters.byCode('type:"USER_SETTINGS_MODAL_OPEN"')
});

export const PermissionsBits: t.PermissionsBits = findLazy(m => typeof m.ADMINISTRATOR === "bigint");

export const { zustandCreate } = mapMangledModuleLazy(["useSyncExternalStoreWithSelector:", "Object.assign"], {
    zustandCreate: filters.byCode(/=>(\i)\?\i\(\1/)
});

export const { zustandPersist } = mapMangledModuleLazy(".onRehydrateStorage)?", {
    zustandPersist: filters.byCode(/(\(\i,\i\))=>.+?\i\1/)
});

export const MessageActions = findByPropsLazy("editMessage", "sendMessage");
export const MessageCache = findByPropsLazy("clearCache", "_channelMessages");
export const openUserProfileModal: t.OpenUserProfileModal = findByCodeLazy('type:"USER_PROFILE_MODAL_OPEN"');
export const InviteActions = findByPropsLazy("resolveInvite");
export const ChannelActionCreators = findByPropsLazy("openPrivateChannel");

export const VoiceActions = findByPropsLazy("toggleSelfMute");
export const GuildActions = findByPropsLazy("setServerMute", "setServerDeaf");
export const ChannelActions = findByPropsLazy("selectChannel", "selectVoiceChannel");
export const DraftActions = findByPropsLazy("saveDraft", "changeDraft");
export const PinActions = findByPropsLazy("pinMessage", "unpinMessage");

export const IconUtils: t.IconUtils = findByPropsLazy("getGuildBannerURL", "getUserAvatarURL");

export const ColorUtils = mapMangledModuleLazy("Invalid hex color format", {
    rgbToHex: filters.byCode(".toString(16).slice(1)"),
    hexToRgba: filters.byCode("`rgba(${"),
    hexToRgb: filters.byCode(".rgb();return"),
    rgbToHsl: filters.byCode("saturation:", "lightness:"),
    mixColors: filters.byCode(".substring(1,3),16)"),
    hexWithAlpha: filters.byCode("Invalid hex color format"),
    getDominantColor: filters.byCode("hex:", "hsv:"),
    generatePalette: filters.byCode("360/("),
});

export const ImageUtils = mapMangledModuleLazy("Input data is not a valid image.", {
    extractColors: filters.byCode('"number"==typeof'),
    fileToDataURL: filters.byCode("Result must be a string"),
    dataURLToBlob: filters.byCode("new Uint8Array("),
    dataURLToFile: filters.byCode("new File(["),
    fitDimensions: filters.byCode("minWidth:", "minHeight:"),
    loadImage: filters.byCode('addEventListener("load"'),
    isAnimatedPNG: filters.byCode("File is not a PNG"),
    base64Size: filters.byCode("Input data is not a valid image."),
});

export const ReadStateUtils = mapMangledModuleLazy('type:"ENABLE_AUTOMATIC_ACK",', {
    ackChannel: filters.byCode(".isForumLikeChannel(")
});

export const ExpressionPickerStore: t.ExpressionPickerStore = mapMangledModuleLazy("expression-picker-last-active-view", {
    openExpressionPicker: filters.byCode(/setState\({activeView:(?:(?!null)\i),activeViewType:/),
    closeExpressionPicker: filters.byCode("setState({activeView:null"),
    toggleMultiExpressionPicker: filters.byCode(".EMOJI,"),
    toggleExpressionPicker: filters.byCode(/\i\.activeView===\i&&\i\.activeViewType===\i&&/),
    setExpressionPickerView: filters.byCode(/setState\({activeView:\i,lastActiveView:/),
    setSearchQuery: filters.byCode("searchQuery:"),
    useExpressionPickerStore: filters.byCode(/\(\i,\i=\i\)=>/)
});

export const PopoutActions: t.PopoutActions = mapMangledModuleLazy('type:"POPOUT_WINDOW_OPEN"', {
    open: filters.byCode('type:"POPOUT_WINDOW_OPEN"'),
    close: filters.byCode('type:"POPOUT_WINDOW_CLOSE"'),
    setAlwaysOnTop: filters.byCode('type:"POPOUT_WINDOW_SET_ALWAYS_ON_TOP"'),
});

export const UsernameUtils: t.UsernameUtils = findByPropsLazy("useName", "getGlobalName");
export const DisplayProfileUtils: t.DisplayProfileUtils = mapMangledModuleLazy(/=\i\.getUserProfile\(\i\),\i=\i\.getGuildMemberProfile\(/, {
    getDisplayProfile: filters.byCode(".getGuildMemberProfile("),
    useDisplayProfile: filters.byCode(/\[\i\.\i,\i\.\i],\(\)=>/)
});

export const DateUtils: t.DateUtils = mapMangledModuleLazy("millisecondsInUnit:", {
    calendarFormat: filters.byCode('<-1?"sameElse":'),
    dateFormat: filters.byCode('<2?"nextDay":"sameElse";'),
    isSameDay: filters.byCode(/Math\.abs\(\i-\i\)/),
    diffAsUnits: filters.byCode("days:0", "millisecondsInUnit")
});

export const MessageTypeSets: t.MessageTypeSets = findByPropsLazy("REPLYABLE", "FORWARDABLE");

export const fetchApplicationsRPC = findByCodeLazy('"Invalid Origin"', ".application");

export const CloudUploader = findLazy(m => m.prototype?.trackUploadFinished) as typeof t.CloudUpload;

export const URLUtils: t.URLUtils = findByPropsLazy("URL_REGEX", "makeUrl", "isDiscordUrl");
export const Humanize: t.Humanize = findByPropsLazy("filesize", "relativeTime", "ordinal");
export const EmojiUtils: t.EmojiUtils = findByPropsLazy("getEmojiColors", "getURL");
