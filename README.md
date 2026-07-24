# Little Light

A lightweight companion app for [Destiny 2](https://www.bungie.net/7/en/Destiny/NewLight): look up any Guardian by Bungie Name, or sign in with Bungie.net to see your own characters. Built with Angular and the [Bungie.net API](https://bungie-net.github.io/), deployed as a static site on GitHub Pages — no backend required.

**Live:** <https://mliang1604.github.io/little-light/>

## Features

- **Player search** — find any player by full Bungie Name (`Guardian#1234`), cross-save aware
- **Character overview** — class, race, Power level, emblem, and hours played per character
- **Sign in with Bungie.net** — OAuth (public client) to view your own profile; if your Bungie profile has multiple Destiny 2 platform accounts (no cross save), a header switcher swaps between them
- **Inventory** — DIM-style view of your characters' equipped/carried weapons and armor plus the vault, in aligned bucket bands with Power levels, gear-tier pips, and rarity borders. Each character shows their Postmaster (engram slots and lost items) at the top. Click any item for a detail popover with its stats and perks/mods. Item names and icons come from Bungie's manifest, downloaded once and cached in IndexedDB per game version.
- **Endgame Analysis roll filtering** — weapons are scored against the community "Destiny 2: Endgame Analysis" spreadsheet: tiles show the sheet tier and a ★ when your roll has the recommended perks available in distinct columns (god roll), the item popover shows tier/rank/source/notes with recommended perks ringed, and a filter bar (text + chips for tier, match quality, type, element, slot, gear tier, source) hides everything else. A **Shopping** page renders the sheet's farm list with owned/satisfied checks against your inventory.

## Stack

Angular 21 (standalone components, signals, zoneless) · TypeScript · no runtime dependencies beyond Angular. The browser talks to `www.bungie.net/Platform` directly.

## Setup

### 1. Register Bungie applications

Create applications at <https://www.bungie.net/en/Application>. Each Bungie app has exactly one Redirect URL, so register **two** — one for local dev, one for production:

| Field | Local dev app | Production app |
| --- | --- | --- |
| Application Status | Active | Active |
| Website | `https://localhost:4200/` | `https://mliang1604.github.io/little-light/` |
| OAuth Client Type | **Public** | **Public** |
| Redirect URL | `https://localhost:4200/auth/callback` | `https://mliang1604.github.io/little-light/auth/callback` |
| Scope | ✅ Read your Destiny 2 information (Vault, Inventory, and Vendors) — leave the rest unchecked | same |
| Origin Header | `https://localhost:4200` | `https://mliang1604.github.io` |

Notes:

- **Public** client type is correct for a static site — Confidential issues a client secret, which cannot be kept secret in browser-delivered JS. Public clients get 1-hour access tokens and no refresh token, so users re-authenticate when the token expires.
- The basic "read profile information" grant is always included with sign-in. The single Destiny 2 read scope covers characters and (later) vault/inventory features. Add write scopes like *Move or equip gear* only when a feature actually needs them.

### 2. Configure the environments

Fill in the API key and OAuth client id from each registered app:

- [src/environments/environment.development.ts](src/environments/environment.development.ts) — dev app credentials (used by `ng serve`)
- [src/environments/environment.ts](src/environments/environment.ts) — production app credentials (used by `ng build`)

Bungie API keys and public-client ids are not secrets (they ship in the JS bundle and are locked to the registered Origin Header), so committing them is fine.

### 3. Run it

```bash
npm install
npm start          # https://localhost:4200 — accept the self-signed certificate once
npm run start:http # http variant — UI only; Bungie rejects its Origin (error 2107)
```

Bungie rejects any request whose `Origin` doesn't exactly match the registered `https://localhost:4200` (`OriginHeaderDoesNotMatchKey`), and OAuth redirect URLs must be `https` — so the https dev server is the default.

## Endgame Analysis data

The roll recommendations ship as [public/endgame-analysis.json](public/endgame-analysis.json), generated from the community spreadsheet. To refresh after the sheet updates:

```bash
npm run sheet:convert -- "path/to/Destiny 2_ Endgame Analysis.xlsx"
```

(The path defaults to `C:\Users\mlian\Downloads\Destiny 2_ Endgame Analysis.xlsx`.) Check the printed per-tab counts, then commit the regenerated JSON through a PR. The converter reads the 20 live weapon tabs plus the Shopping List, maps columns by their header names, and splits newline-separated option cells.

## Deployment

Every push to `main` deploys to GitHub Pages via [.github/workflows/deploy.yml](.github/workflows/deploy.yml): it builds with `--base-href /little-light/`, copies `index.html` to `404.html` as an SPA fallback (which also keeps the `/auth/callback` route working on Pages), and publishes `dist/little-light/browser`.

One-time repo setting: **Settings → Pages → Source: GitHub Actions**.

## License

TBD
