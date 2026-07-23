# Little Light

A lightweight companion app for [Destiny 2](https://www.bungie.net/7/en/Destiny/NewLight): look up any Guardian by Bungie Name, or sign in with Bungie.net to see your own characters. Built with Angular and the [Bungie.net API](https://bungie-net.github.io/), deployed as a static site on GitHub Pages — no backend required.

**Live:** <https://mliang1604.github.io/little-light/>

## Features

- **Player search** — find any player by full Bungie Name (`Guardian#1234`), cross-save aware
- **Character overview** — class, race, Power level, emblem, and hours played per character
- **Sign in with Bungie.net** — OAuth (public client) to view your own profile

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
npm start          # http://localhost:4200 — player search works
npm run start:ssl  # https://localhost:4200 — required to test OAuth sign-in
```

Bungie requires an `https` redirect URL, so use `start:ssl` (accept the self-signed-certificate warning once) when testing sign-in locally.

## Deployment

Every push to `main` deploys to GitHub Pages via [.github/workflows/deploy.yml](.github/workflows/deploy.yml): it builds with `--base-href /little-light/`, copies `index.html` to `404.html` as an SPA fallback (which also keeps the `/auth/callback` route working on Pages), and publishes `dist/little-light/browser`.

One-time repo setting: **Settings → Pages → Source: GitHub Actions**.

## License

TBD
