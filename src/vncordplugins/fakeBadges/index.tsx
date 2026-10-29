/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BadgePosition, ProfileBadge } from "@api/Badges";
import { VnCordDevs } from "@utils/constants";
import definePlugin from "@utils/types";
import type { ProfileBadge as DiscordProfileBadge } from "@vencord/discord-types";
import { UserProfileStore, UserStore } from "@webpack/common";

import { DISCORD_BADGES, DiscordBadge } from "./badges";
import { getTier, isHidden, settings } from "./settings";
import managedStyle from "./style.css?managed";

type StoredProfileBadge = DiscordProfileBadge & { simple_icon_url?: string; };

function isOwned(badge: DiscordBadge, userId: string) {
    const real: StoredProfileBadge[] = UserProfileStore.getUserProfile(userId)?.badges ?? [];
    return real.some(b => b.icon === badge.iconHash || b.simple_icon_url === badge.simpleIcon);
}

function getFakeBadges(userId: string): ProfileBadge[] {
    const badges: ProfileBadge[] = [];

    for (const badge of DISCORD_BADGES) {
        // Skip badges the account really has so the profile does not show the same icon twice
        if (isHidden(badge.id) || isOwned(badge, userId)) continue;

        const tier = getTier(badge);

        badges.push({
            id: `vncord-fake-badge-${badge.id}`,
            description: badge.name,
            name: badge.name,
            detail: badge.description,
            infoLabel: "Discord",
            rarity: badge.rarity,
            iconSrc: tier?.icon ?? badge.icon,
            largeIconSrc: tier?.largeIcon ?? badge.largeIcon,
            position: BadgePosition.START,
        });
    }

    return badges;
}

const FakeBadgesGroup: ProfileBadge = {
    id: "vncord-fake-badges",
    description: "Fake Badges",
    shouldShow: ({ userId }) => userId === UserStore.getCurrentUser()?.id,
    getBadges: ({ userId }) => getFakeBadges(userId),
};

export default definePlugin({
    name: "FakeBadges",
    description: "Show any Discord badge on your own profile. Only visible to you.",
    tags: ["Appearance", "Customisation"],
    authors: [VnCordDevs.creations],
    dependencies: ["BadgeAPI"],
    managedStyle,
    settings,
    userProfileBadges: [FakeBadgesGroup],
});
