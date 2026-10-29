/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { classNameFactory } from "@utils/css";
import { OptionType } from "@utils/types";

import { BadgeTier, DISCORD_BADGES, DiscordBadge } from "./badges";

const cl = classNameFactory("vc-fake-badges-");

const EMPTY_HIDDEN: Record<string, boolean> = {};
const EMPTY_TIERS: Record<string, string> = {};

export const settings = definePluginSettings({
    hidden: {
        type: OptionType.CUSTOM,
        description: "Badges hidden from the picker",
        default: EMPTY_HIDDEN,
        hidden: true,
    },
    tiers: {
        type: OptionType.CUSTOM,
        description: "Tier selected for each badge",
        default: EMPTY_TIERS,
        hidden: true,
    },
    picker: {
        type: OptionType.COMPONENT,
        description: "Pick the badges to show on your profile",
        component: BadgePicker,
    },
});

const KEYS = ["hidden", "tiers"] as ("hidden" | "tiers")[];

export function isHidden(id: number) {
    return !!settings.store.hidden[id];
}

export function getTier(badge: DiscordBadge): BadgeTier | undefined {
    const selected = settings.store.tiers[badge.id];
    return badge.tiers?.find(t => t.key === selected) ?? badge.tiers?.at(-1);
}

function BadgePicker() {
    const { hidden, tiers } = settings.use(KEYS);

    function toggle(id: number) {
        settings.store.hidden = { ...hidden, [id]: !hidden[id] };
    }

    function setTier(id: number, key: string) {
        settings.store.tiers = { ...tiers, [id]: key };
    }

    function hideAll() {
        settings.store.hidden = Object.fromEntries(DISCORD_BADGES.map(b => [b.id, true]));
    }

    return (
        <div className={cl("picker")}>
            <div className={cl("actions")}>
                <Button size="small" onClick={() => settings.store.hidden = {}}>Show all</Button>
                <Button size="small" variant="dangerSecondary" onClick={hideAll}>Hide all</Button>
            </div>
            <span className={cl("note")}>
                Badges you already own are displayed by Discord and skipped here, so the same icon never shows twice.
            </span>
            <div className={cl("grid")}>
                {DISCORD_BADGES.map(badge => {
                    const isOn = !hidden[badge.id];
                    const tier = getTier(badge);

                    return (
                        <div key={badge.id} className={cl("tile", { active: isOn })}>
                            <button
                                type="button"
                                className={cl("toggle")}
                                aria-pressed={isOn}
                                title={badge.description}
                                onClick={() => toggle(badge.id)}
                            >
                                <img className={cl("icon")} src={tier?.icon ?? badge.icon} alt="" />
                                <span className={cl("name")}>{badge.name}</span>
                            </button>
                            {badge.tiers && isOn && (
                                <select
                                    className={cl("tier")}
                                    value={tier?.key}
                                    onChange={e => setTier(badge.id, e.target.value)}
                                >
                                    {badge.tiers.map(t => (
                                        <option key={t.key} value={t.key}>{t.label}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
