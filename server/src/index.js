const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { MongoClient, ObjectId } = require('mongodb');
const { createClient } = require('redis');
const {
  applyTap,
  calculateOfflineReward,
  getBuildingCost,
  getProfitPerHour,
} = require('./economy');

const app = express();
const port = process.env.PORT || 8080;
const botToken = process.env.BOT_TOKEN || '';
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/cockroach-coin';
const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const isProduction = process.env.NODE_ENV === 'production';
const frontendOrigins = process.env.FRONTEND_ORIGIN
  ?.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.enable('trust proxy');
app.use(helmet());
app.use((req, res, next) => {
  const forwardedProto = req.header('x-forwarded-proto');
  if (isProduction && forwardedProto && forwardedProto !== 'https') {
    res.redirect(308, `https://${req.header('host')}${req.originalUrl}`);
    return;
  }
  next();
});
app.use(cors({
  origin: frontendOrigins?.length ? frontendOrigins : !isProduction,
}));
app.use(express.json({ limit: '64kb' }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 180 }));

let users;
let redis;

function verifyTelegramInitData(initData) {
  if (!botToken || !initData) return !isProduction;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculated = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  const expected = Buffer.from(calculated, 'hex');
  const received = Buffer.from(hash || '', 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function parseTelegramUser(initData) {
  if (!initData && !isProduction) return { id: 'demo', username: 'demo' };

  const params = new URLSearchParams(initData || '');
  const rawUser = params.get('user');
  if (!rawUser) return null;

  try {
    const user = JSON.parse(rawUser);
    if (!user || !['number', 'string'].includes(typeof user.id)) return null;
    return user;
  } catch (error) {
    return null;
  }
}

function cleanUsername(value) {
  return String(value || 'CockroachCEO').trim().slice(0, 32) || 'CockroachCEO';
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function auth(req, res, next) {
  const initData = req.header('x-telegram-init-data');
  if (!verifyTelegramInitData(initData)) {
    res.status(401).json({ error: 'Invalid Telegram session' });
    return;
  }

  const telegramUser = parseTelegramUser(initData);
  if (!telegramUser) {
    res.status(400).json({ error: 'Invalid Telegram user payload' });
    return;
  }

  req.telegramUser = telegramUser;
  next();
}

function defaultUser(telegramUser) {
  return {
    telegramId: String(telegramUser.id),
    username: cleanUsername(telegramUser.username || telegramUser.first_name),
    coins: 1250,
    gems: 18,
    mutationPoints: 0,
    tapPower: 12,
    buildings: { 'tea-stall-rig': 1, 'broken-laptop-farm': 1 },
    upgrades: { 'meme-marketing': 1 },
    research: {},
    referrals: [],
    stats: { taps: 0, adsWatched: 0, crashesSurvived: 0 },
    multipliers: { tap: 1.18, passive: 1, offline: 1 },
    lastSeenAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

async function getUser(telegramUser) {
  const telegramId = String(telegramUser.id);
  const existing = await users.findOne({ telegramId });
  if (existing) return existing;

  const user = defaultUser(telegramUser);
  const result = await users.insertOne(user);
  return { ...user, _id: result.insertedId };
}

app.get('/health', (req, res) => {
  res.json({ ok: true, name: 'cockroach-coin-api' });
});

app.post('/login', auth, asyncHandler(async (req, res) => {
  const { id, username, first_name: firstName } = req.telegramUser;
  const now = new Date();
  const user = await users.findOneAndUpdate(
    { telegramId: String(id) },
    {
      $setOnInsert: {
        ...defaultUser({ id, username, first_name: firstName }),
        coins: 1000,
        createdAt: now,
      },
      $set: {
        username: cleanUsername(username || firstName),
        updatedAt: now,
      },
    },
    {
      upsert: true,
      returnDocument: 'after',
    },
  );

  res.json(user);
}));

app.get('/api/session', auth, asyncHandler(async (req, res) => {
  const user = await getUser(req.telegramUser);
  const reward = calculateOfflineReward(user);
  const nextUser = {
    ...user,
    coins: user.coins + reward.coins,
    lastSeenAt: new Date(),
    updatedAt: new Date(),
  };
  await users.updateOne({ _id: new ObjectId(user._id) }, { $set: nextUser });
  res.json({ user: nextUser, offlineReward: reward, profitPerHour: getProfitPerHour(nextUser) });
}));

app.get('/api/leaderboard', auth, asyncHandler(async (req, res) => {
  const user = await getUser(req.telegramUser);
  const topUsers = await users
    .find(
      {},
      {
        projection: {
          _id: 0,
          telegramId: 1,
          username: 1,
          coins: 1,
          level: 1,
          stats: 1,
        },
      },
    )
    .sort({ coins: -1, updatedAt: -1 })
    .limit(50)
    .toArray();
  const betterPlayers = await users.countDocuments({ coins: { $gt: user.coins } });
  const leaderboard = topUsers.map((entry) => ({
    name: entry.username || 'CockroachCEO',
    title: entry.telegramId === user.telegramId ? 'Your live colony' : `Level ${entry.level || 1} Meme CEO`,
    coins: Math.floor(entry.coins || 0),
    currentPlayer: entry.telegramId === user.telegramId,
  }));

  if (!leaderboard.some((entry) => entry.currentPlayer)) {
    leaderboard.push({
      name: user.username || 'CockroachCEO',
      title: 'Your live colony',
      coins: Math.floor(user.coins || 0),
      currentPlayer: true,
    });
  }

  res.json({ leaderboard, playerRank: betterPlayers + 1 });
}));

app.post('/api/tap', auth, asyncHandler(async (req, res) => {
  const user = await getUser(req.telegramUser);
  const comboKey = `combo:${user.telegramId}`;
  const combo = Number(await redis.get(comboKey)) || 0;
  const earned = applyTap(user, combo);
  await redis.set(comboKey, Math.min(combo + 1, 50), { EX: 2 });
  await users.updateOne(
    { _id: new ObjectId(user._id) },
    {
      $inc: { coins: earned, 'stats.taps': 1 },
      $set: { lastSeenAt: new Date(), updatedAt: new Date() },
    },
  );
  res.json({ earned, combo: Math.min(combo + 1, 50) });
}));

app.post('/api/buildings/:buildingId/upgrade', auth, asyncHandler(async (req, res) => {
  const { buildingId } = req.params;
  if (!/^[a-z0-9-]+$/.test(buildingId)) {
    res.status(400).json({ error: 'Invalid building id' });
    return;
  }

  const user = await getUser(req.telegramUser);
  const currentLevel = user.buildings?.[buildingId] || 0;
  let cost;
  try {
    cost = getBuildingCost(buildingId, currentLevel);
  } catch (error) {
    res.status(404).json({ error: 'Unknown building' });
    return;
  }

  if (user.coins < cost) {
    res.status(409).json({ error: 'Not enough Cockroach Coin', cost });
    return;
  }

  await users.updateOne(
    { _id: new ObjectId(user._id) },
    {
      $inc: { coins: -cost, [`buildings.${buildingId}`]: 1 },
      $set: { lastSeenAt: new Date(), updatedAt: new Date() },
    },
  );
  res.json({ ok: true, cost, nextLevel: currentLevel + 1 });
}));

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  const mongo = new MongoClient(mongoUri);
  await mongo.connect();
  users = mongo.db().collection('users');
  await users.createIndex({ telegramId: 1 }, { unique: true });

  redis = createClient({ url: redisUrl });
  await redis.connect();

  app.listen(port, () => {
    console.log(`Cockroach Coin API listening on ${port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
