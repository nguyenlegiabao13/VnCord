/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { BaseText } from "@components/BaseText";
import { OptionType } from "@utils/types";
import { useEffect, UserStore, useState } from "@webpack/common";

const settings = definePluginSettings({
    fetchProfileBadges: {
        type: OptionType.BOOLEAN,
        description: "Fetch users' full profile badges (same list as their profile popout: server boosting, Nitro, Active Developer, ...). Profiles are cached by Discord, so each user is only fetched once.",
        default: true
    },
    showVnCordDonor: {
        type: OptionType.BOOLEAN,
        description: "Enable to show VnCord Donor badges in chat.",
        hidden: true,
        default: true
    },
    VnCordDonorPosition: {
        type: OptionType.NUMBER,
        description: "The position of the VnCord Donor badges.",
        hidden: true,
        default: 0
    },
    showVnCordContributor: {
        type: OptionType.BOOLEAN,
        description: "Enable to show VnCord Contributor badges in chat.",
        hidden: true,
        default: true
    },
    VnCordContributorPosition: {
        type: OptionType.NUMBER,
        description: "The position of the VnCord Contributor badge.",
        hidden: true,
        default: 1
    },
    showVencordDonor: {
        type: OptionType.BOOLEAN,
        description: "Enable to show Vencord donor badges in chat.",
        hidden: true,
        default: true
    },
    VencordDonorPosition: {
        type: OptionType.NUMBER,
        description: "The position of the Vencord Donor badges.",
        hidden: true,
        default: 4
    },
    showVencordContributor: {
        type: OptionType.BOOLEAN,
        description: "Enable to show Vencord contributor badges in chat.",
        hidden: true,
        default: true
    },
    VencordContributorPosition: {
        type: OptionType.NUMBER,
        description: "The position of the Vencord Contributor badge.",
        hidden: true,
        default: 5
    },
    showDiscordProfile: {
        type: OptionType.BOOLEAN,
        description: "Enable to show Discord profile badges in chat.",
        hidden: true,
        default: true
    },
    DiscordProfilePosition: {
        type: OptionType.NUMBER,
        description: "The position of the Discord profile badges.",
        hidden: true,
        default: 6
    },
    showDiscordNitro: {
        type: OptionType.BOOLEAN,
        description: "Enable to show Discord Nitro badges in chat.",
        hidden: true,
        default: true
    },
    DiscordNitroPosition: {
        type: OptionType.NUMBER,
        description: "The position of the Discord Nitro badge. Only used when the user's full profile badges are unavailable.",
        hidden: true,
        default: 7
    },
    badgeSettings: {
        type: OptionType.COMPONENT,
        description: "Setup badge layout and visibility",
        component: () => <BadgeSettings />
    }
});

export default settings;

type BadgeKey = "VnCordDonor" | "VnCordContributer" | "VencordDonor" | "VencordContributer" | "DiscordProfile" | "DiscordNitro";

const SETTERS: Record<BadgeKey, [show: (v: boolean) => void, position: (v: number) => void]> = {
    VnCordDonor: [
        v => (settings.store.showVnCordDonor = v),
        v => (settings.store.VnCordDonorPosition = v)
    ],
    VnCordContributer: [
        v => (settings.store.showVnCordContributor = v),
        v => (settings.store.VnCordContributorPosition = v)
    ],
    VencordDonor: [
        v => (settings.store.showVencordDonor = v),
        v => (settings.store.VencordDonorPosition = v)
    ],
    VencordContributer: [
        v => (settings.store.showVencordContributor = v),
        v => (settings.store.VencordContributorPosition = v)
    ],
    DiscordProfile: [
        v => (settings.store.showDiscordProfile = v),
        v => (settings.store.DiscordProfilePosition = v)
    ],
    DiscordNitro: [
        v => (settings.store.showDiscordNitro = v),
        v => (settings.store.DiscordNitroPosition = v)
    ]
};

const BadgeSettings = () => {
    const [images, setImages] = useState([
        { src: "https://vncord.pages.dev/api/badge/donor.webp", shown: settings.store.showVnCordDonor, title: "VnCord donor badges", key: "VnCordDonor" as BadgeKey, position: settings.store.VnCordDonorPosition },
        { src: "https://vncord.pages.dev/assets/favicon.png", shown: settings.store.showVnCordContributor, title: "VnCord contributor badge", key: "VnCordContributer" as BadgeKey, position: settings.store.VnCordContributorPosition },
        { src: "https://cdn.discordapp.com/emojis/1026533070955872337.png", shown: settings.store.showVencordDonor, title: "Vencord donor badges", key: "VencordDonor" as BadgeKey, position: settings.store.VencordDonorPosition },
        { src: "https://cdn.discordapp.com/emojis/1092089799109775453.png", shown: settings.store.showVencordContributor, title: "Vencord contributor badge", key: "VencordContributer" as BadgeKey, position: settings.store.VencordContributorPosition },
        { src: "https://cdn.discordapp.com/badge-icons/bf01d1073931f921909045f3a39fd264.png", shown: settings.store.showDiscordProfile, title: "Discord profile badges (the full list from their profile: HypeSquad, Staff, Server Boosting, ...)", key: "DiscordProfile" as BadgeKey, position: settings.store.DiscordProfilePosition },
        { src: "https://cdn.discordapp.com/badge-icons/2ba85e8026a8614b640c2837bcdfe21b.png", shown: settings.store.showDiscordNitro, title: "Nitro badge (fallback while the full profile badges are unavailable)", key: "DiscordNitro" as BadgeKey, position: settings.store.DiscordNitroPosition }
    ]);

    useEffect(() => {
        images.forEach(image => {
            const [setShow, setPosition] = SETTERS[image.key];
            setShow(image.shown);
            setPosition(image.position);
        });
    }, [images]);

    const handleDragStart = (e: any, index: number) => {
        if (!images[index].shown) {
            e.preventDefault();
        } else {
            e.dataTransfer.setData("index", index);
        }
    };

    const handleDragOver = e => {
        e.preventDefault();
    };

    const handleDrop = (e: any, dropIndex: number) => {
        const dragIndex = e.dataTransfer.getData("index");
        const newImages = [...images];
        const draggedImage = newImages[dragIndex];

        newImages.splice(dragIndex, 1);
        newImages.splice(dropIndex, 0, draggedImage);

        newImages.forEach((image, index) => {
            image.position = index;
        });

        setImages(newImages);
    };

    const toggleDisable = (index: number) => {
        const newImages = [...images];
        newImages[index].shown = !newImages[index].shown;
        setImages(newImages);
    };

    return (
        <>
            <BaseText>Drag the badges to reorder them, you can click to enable/disable a specific badge type.</BaseText>
            <BaseText>Discord profile badges show the user's full profile list when Fetch profile badges is enabled.</BaseText>
            <div className="vc-sbic-badge-settings">
                <img className="vc-sbic-settings-avatar" src={UserStore.getCurrentUser().getAvatarURL()}></img>
                <BaseText className="vc-sbic-settings-username">{(UserStore.getCurrentUser() as any).globalName}</BaseText>
                {images
                    .sort((a, b) => a.position - b.position)
                    .map((image, index) => (
                        <div
                            key={image.key}
                            className={`vc-sbic-image-container ${!image.shown ? "vc-sbic-disabled" : ""}`}
                            onDragOver={e => handleDragOver(e)}
                            onDrop={e => handleDrop(e, index)}
                            onClick={() => toggleDisable(index)}
                        >
                            <img
                                src={image.src}
                                draggable={image.shown}
                                onDragStart={e => handleDragStart(e, index)}
                                title={image.title}
                            />
                        </div>
                    ))
                }
            </div>
        </>
    );
};
