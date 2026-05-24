# Cockroach Coin

Cockroach Coin is a Telegram Mini App game inspired by tap-to-earn and idle economy loops, redesigned as a dark neon Indian meme crypto empire simulator.

## What Is Implemented

- Mobile-first React game shell with five animated tabs: Home, Market, Mine, Friends, Events.
- Telegram Mini App integration hooks for `WebApp.ready`, fullscreen expansion, haptics, Telegram user identity, and share links.
- Animated cockroach mascot, tap combo meter, coin popups, money rain, neon fog, and bottom navigation transitions.
- Passive income, offline earning collection, exponential building costs, market upgrades, research tracks, daily rewards, events, referrals, leaderboard, reward-ad simulation, and premium offer surfaces.
- Server-side economy scaffold with Express, MongoDB, Redis, Telegram initData verification, tap intents, offline rewards, and authoritative building upgrades.
- Bot entry point updated to launch the Cockroach Coin web app.

## Local Frontend

```bash
npm install
npm start
```

The current workspace does not include Node.js/npm, so these commands must be run in an environment with Node installed.

## Local API

```bash
MONGODB_URI=mongodb://127.0.0.1:27017/cockroach-coin \
REDIS_URL=redis://127.0.0.1:6379 \
BOT_TOKEN=your_telegram_bot_token \
npm run start-api
```

## Bot

```bash
BOT_TOKEN=your_telegram_bot_token \
WEB_APP_URL=https://your-mini-app-url.example \
npm run start-bot
```

## Anti-Cheat Contract

The production API must own all coin deltas. The client should send intent only:

- `POST /api/tap`
- `POST /api/buildings/:buildingId/upgrade`
- `GET /api/session`

The server verifies Telegram `initData`, calculates tap rewards, caps offline earnings, stores combo timing in Redis, and persists balances in MongoDB.
