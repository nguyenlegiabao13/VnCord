# VnCord

A personal fork of [Equicord](https://github.com/Equicord/Equicord), which is itself a fork of [Vencord](https://github.com/Vendicated/Vencord), rebranded as VnCord.

## What is this

VnCord keeps everything from Equicord, including its 300+ plugins, with the branding changed to VnCord. The included plugins can be found on the [Equicord plugin list](https://equicord.org/plugins).

## Building from source

[Git](https://git-scm.com/download) and [Node.js 22+](https://nodejs.dev/en/) are required. Enable pnpm:

```shell
npm i -g pnpm
```

Install dependencies:

```shell
pnpm install --frozen-lockfile
```

Build:

```shell
pnpm build
```

Inject into your Discord desktop client:

```shell
pnpm inject
```

To uninstall, run:

```shell
pnpm uninject
```

### Web / browser extension

Build the web version:

```shell
pnpm buildWeb
```

Then locate the appropriate ZIP file in the `dist` directory and follow your browser's guide for installing custom extensions, if supported.

## Syncing with upstream

The `upstream` remote points to Equicord. To pull in new patches and plugins:

```shell
git fetch upstream
git merge upstream/main
```

The `origin` remote is currently a placeholder pointing to Equicord. If you publish your own repository, update it:

```shell
git remote set-url origin https://github.com/<you>/VnCord.git
```

## Credits

Thank you to [Vendicated](https://github.com/Vendicated) for creating [Vencord](https://github.com/Vendicated/Vencord), and to the [Equicord](https://github.com/Equicord/Equicord) team and [Suncord](https://github.com/verticalsync/Suncord) by [verticalsync](https://github.com/verticalsync) for everything this fork builds on.

## Disclaimer

Discord is a trademark of Discord Inc., and solely mentioned for the sake of descriptivity.
Mentioning it does not imply any affiliation with or endorsement by Discord Inc.

Using client mods violates Discord's terms of service. Use at your own risk.
