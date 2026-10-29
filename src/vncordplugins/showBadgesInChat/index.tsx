/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import badges from "@plugins/_api/badges";
import { Devs, VnCordDevs } from "@utils/constants";
import { fetchUserProfile } from "@utils/discord";
import { isPluginDev, isVnCordPluginDev } from "@utils/misc";
import definePlugin from "@utils/types";
import { User } from "@vencord/discord-types";
import { findComponentByCodeLazy, findCssClassesLazy } from "@webpack";
import { useEffect, UserProfileStore,useStateFromStores } from "@webpack/common";

import settings from "./settings";

const { roleIcon } = findCssClassesLazy("roleIcon", "separator");
const RoleIconComponent = findComponentByCodeLazy("#{intl::ROLE_ICON_ALT_TEXT}");

/**
 * [flagBit, name, badgeIconHash] — fallback list used until (or unless) the
 * user's full profile badges are available.
 */
const discordBadges: readonly (readonly [number, string, string])[] = Object.freeze([
    [0, "Discord Staff", "5e74e9b61934fc1f67c65515d1f7e60d"],
    [1, "Partnered Server Owner", "3f9748e53446a137a052f3454e2de41e"],
    [2, "HypeSquad Events", "bf01d1073931f921909045f3a39fd264"],
    [3, "Discord Bug Hunter", "2717692c7dca7289b35297368a940dd0"],
    [6, "HypeSquad Bravery", "8a88d63823d8a71cd5e390baa45efa02"],
    [7, "HypeSquad Brilliance", "011940fd013da3f7fb926e4a1cd2e618"],
    [8, "HypeSquad Balance", "3aa41de486fa12454c3761e8e223442e"],
    [9, "Early Supporter", "7060786766c9c840eb3019e725d2b358"],
    [14, "Discord Bug Hunter", "848f79194d4be5ff5f81505cbd0ce1e6"],
    [17, "Early Verified Bot Developer", "6df5892e0f35b051f8b61eace34f4967"],
    [18, "Moderator Programs Alumni", "fee1624003e2fee35cb398e125dc479b"],
    [22, "Active Developer", "6bdc4ad27cb0b5feb4e927f7a45f994c"]
]);

const badgeIcon = (hash: string) => `https://cdn.discordapp.com/badge-icons/${hash}.png`;

function Badge({ name, src }: { name: string; src: string; }) {
    return <RoleIconComponent className={roleIcon} name={name} size={20} src={src} />;
}

/** Profiles already requested this session; avoids refetch spam for busy channels. */
const requestedProfiles = new Set<string>();

/**
 * The user's real profile badge list — the same array the profile popout
 * renders, so it includes everything: Server Boosting, Nitro, Active
 * Developer, quest badges and anything Discord adds later.
 */
function useProfileBadges(author: User) {
    const badges = useStateFromStores(
        [UserProfileStore],
        () => UserProfileStore.getUserProfile(author.id)?.badges,
        [author.id]
    );

    useEffect(() => {
        if (!settings.store.fetchProfileBadges || badges || requestedProfiles.has(author.id)) return;
        requestedProfiles.add(author.id);
        fetchUserProfile(author.id).catch(() => requestedProfiles.delete(author.id));
    }, [author.id, badges]);

    return badges;
}

function DonorBadges({ author, order, get }: { author: User; order: number; get: (id: string) => { description: string; iconSrc: string; }[]; }) {
    const donor = get(author.id);
    if (!donor?.length) return null;
    return (
        <span style={{ order }}>
            {donor.map(d => (
                <Badge key={d.iconSrc} name={d.description} src={d.iconSrc} />
            ))}
        </span>
    );
}

function ContributorBadge({ author, order, name, src }: { author: User; order: number; name: string; src: string; }) {
    const isDev = name.startsWith("VnCord") ? isVnCordPluginDev(author.id) : isPluginDev(author.id);
    if (!isDev) return null;
    return (
        <span style={{ order }}>
            <Badge name={name} src={src} />
        </span>
    );
}

function DiscordProfileBadges({ author, order, profileBadges }: { author: User; order: number; profileBadges?: { id: string; description: string; icon: string; }[]; }) {
    // full profile badges are the canonical list — identical to the profile popout
    const entries = profileBadges?.length
        ? profileBadges.map(b => ({ key: b.id, name: b.description, src: badgeIcon(b.icon) }))
        : discordBadges
            .filter(b => (author.flags || author.publicFlags) & (1 << b[0]))
            .map(b => ({ key: b[2], name: b[1], src: badgeIcon(b[2]) }));

    if (!entries.length) return null;
    return (
        <span style={{ order }}>
            {entries.map(e => (
                <Badge key={e.key} name={e.name} src={e.src} />
            ))}
        </span>
    );
}

function NitroBadge({ author, order }: { author: User; order: number; }) {
    // with a fetched profile, the Nitro badge is already part of the profile list
    if ((author.premiumType ?? 0) === 0) return null;
    const name = "Discord Nitro" + (author.premiumType === 3 ? " Basic" : author.premiumType === 1 ? " Classic" : "");
    return (
        <span style={{ order }}>
            <Badge name={name} src={badgeIcon("2ba85e8026a8614b640c2837bcdfe21b")} />
        </span>
    );
}

function ChatBadges({ author }: { author: User; }) {
    const profileBadges = useProfileBadges(author);
    const s = settings.store;
    const hasFullProfile = (profileBadges?.length ?? 0) > 0;

    return (
        <span className="vc-sbic-badge-row">
            {s.showVnCordDonor && <DonorBadges author={author} order={s.VnCordDonorPosition} get={badges.getVnCordDonorBadges} />}
            {s.showVnCordContributor && <ContributorBadge author={author} order={s.VnCordContributorPosition} name="VnCord Contributor" src="https://vncord.pages.dev/assets/favicon.png" />}
            {s.showVencordDonor && <DonorBadges author={author} order={s.VencordDonorPosition} get={badges.getDonorBadges} />}
            {s.showVencordContributor && <ContributorBadge author={author} order={s.VencordContributorPosition} name="Vencord Contributor" src="https://cdn.discordapp.com/emojis/1092089799109775453.png" />}
            {s.showDiscordProfile && <DiscordProfileBadges author={author} order={s.DiscordProfilePosition} profileBadges={profileBadges} />}
            {s.showDiscordNitro && !hasFullProfile && <NitroBadge author={author} order={s.DiscordNitroPosition} />}
        </span>
    );
}

export default definePlugin({
    name: "ShowBadgesInChat",
    authors: [Devs.Inbestigator, VnCordDevs.KrystalSkull],
    description: "Shows the message author's badges beside their name in chat, including their full profile badge list (server boosting, Nitro, Active Developer and more).",
    dependencies: ["MessageDecorationsAPI"],
    tags: ["Appearance", "Chat"],
    settings,
    renderMessageDecoration(props) {
        return props.message?.author ? <ChatBadges author={props.message.author} /> : null;
    }
});
