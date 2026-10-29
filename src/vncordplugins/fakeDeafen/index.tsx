/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { HeaderBarButton } from "@api/HeaderBar";
import { VnCordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import { MediaEngineStore, useStateFromStores } from "@webpack/common";

let fakeMute = false;
let fakeDeaf = false;
let origIsSelfMute: typeof MediaEngineStore.isSelfMute;
let origIsSelfDeaf: typeof MediaEngineStore.isSelfDeaf;

function setFake(mute: boolean, deaf: boolean) {
    fakeMute = mute;
    fakeDeaf = deaf;
    // every UI surface reading MediaEngineStore re-renders with the fake state
    MediaEngineStore.emitChange();
}

const MIC_PATH = "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.93V21a1 1 0 1 0 2 0v-3.07A7 7 0 0 0 19 11Z";
const HEADPHONES_PATH = "M12 3a9 9 0 0 0-9 9v5a3 3 0 0 0 3 3h1a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5.06A7 7 0 0 1 18.94 12H17a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h1a3 3 0 0 0 3-3v-5a9 9 0 0 0-9-9Z";

function FakeStateIcon({ base, active, width = 18, height = 18 }: { base: string; active: boolean; width?: number; height?: number; }) {
    return (
        <svg width={width} height={height} viewBox="0 0 24 24" style={{ color: active ? "var(--status-danger)" : "currentColor" }}>
            <path d={base} fill="currentColor" />
            {active && (
                <path
                    d="M4 3.3 20.7 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                />
            )}
        </svg>
    );
}

function FakeMuteIcon({ width, height }: { width?: number; height?: number; }) {
    return <FakeStateIcon base={MIC_PATH} active={fakeMute} width={width} height={height} />;
}

function FakeDeafenIcon({ width, height }: { width?: number; height?: number; }) {
    return <FakeStateIcon base={HEADPHONES_PATH} active={fakeDeaf} width={width} height={height} />;
}

function FakeButtons() {
    const state = useStateFromStores([MediaEngineStore], () => `${fakeMute}-${fakeDeaf}`);
    const [mute, deaf] = state.split("-").map(value => value === "true");

    return (
        <>
            <HeaderBarButton
                icon={FakeMuteIcon}
                tooltip={mute ? "Fake Mute: On" : "Fake Mute"}
                onClick={() => setFake(!fakeMute, fakeDeaf)}
                selected={mute}
            />
            <HeaderBarButton
                icon={FakeDeafenIcon}
                tooltip={deaf ? "Fake Deafen: On" : "Fake Deafen"}
                onClick={() => setFake(fakeMute, !fakeDeaf)}
                selected={deaf}
            />
        </>
    );
}

export default definePlugin({
    name: "FakeDeafen",
    description: "Adds fake mute and deafen buttons next to the inbox. Your microphone and audio keep working, only the reported voice state changes.",
    authors: [VnCordDevs.KrystalSkull],
    tags: ["Utility", "Voice"],
    dependencies: ["HeaderBarAPI"],

    start() {
        origIsSelfMute = MediaEngineStore.isSelfMute;
        origIsSelfDeaf = MediaEngineStore.isSelfDeaf;

        MediaEngineStore.isSelfMute = (...args) => fakeMute || origIsSelfMute.apply(MediaEngineStore, args);
        MediaEngineStore.isSelfDeaf = (...args) => fakeDeaf || origIsSelfDeaf.apply(MediaEngineStore, args);

        MediaEngineStore.emitChange();
    },

    stop() {
        if (origIsSelfMute) MediaEngineStore.isSelfMute = origIsSelfMute;
        if (origIsSelfDeaf) MediaEngineStore.isSelfDeaf = origIsSelfDeaf;
        fakeMute = false;
        fakeDeaf = false;
        MediaEngineStore.emitChange();
    },

    headerBarButton: {
        icon: FakeDeafenIcon,
        priority: 1336,
        render: () => <FakeButtons />
    }
});
