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

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '64kb' }));
app.use(rateLimit({ windowMs: 60 * 1000, max: 180 }));

let users;
let redis;

function verifyTelegramInitData(initData) {
  if (!botToken || !initData) return process.env.NODE_ENV !== 'production';
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

async function auth(req, res, next) {
  const initData = req.header('x-telegram-init-data');
  if (!verifyTelegramInitData(initData)) {
    res.status(401).json({ error: 'Invalid Telegram session' });
    return;
  }

  const params = new URLSearchParams(initData || '');
  const telegramUser = JSON.parse(params.get('user') || '{"id":"demo","username":"demo"}');
  req.telegramUser = telegramUser;
  next();
}

function defaultUser(telegramUser) {
  return {
    telegramId: String(telegramUser.id),
    username: telegramUser.username || telegramUser.first_name || 'CockroachCEO',
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

app.post('/login', async (req, res) => {
  const { telegramId, username } = req.body;

  if (!telegramId) {
    res.status(400).json({ error: 'telegramId is required' });
    return;
  }

  const now = new Date();
  const user = await users.findOneAndUpdate(
    { telegramId: String(telegramId) },
    {
      $setOnInsert: {
        ...defaultUser({ id: telegramId, username }),
        coins: 1000,
        createdAt: now,
      },
      $set: {
        username: username || 'CockroachCEO',
        updatedAt: now,
      },
    },
    {
      upsert: true,
      returnDocument: 'after',
    },
  );

  res.json(user);
});

app.get('/api/session', auth, async (req, res) => {
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
});

app.get('/api/leaderboard', auth, async (req, res) => {
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
});

app.post('/api/tap', auth, async (req, res) => {
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
});

app.post('/api/buildings/:buildingId/upgrade', auth, async (req, res) => {
  const user = await getUser(req.telegramUser);
  const currentLevel = user.buildings?.[req.params.buildingId] || 0;
  const cost = getBuildingCost(req.params.buildingId, currentLevel);
  if (user.coins < cost) {
    res.status(409).json({ error: 'Not enough Cockroach Coin', cost });
    return;
  }

  await users.updateOne(
    { _id: new ObjectId(user._id) },
    {
      $inc: { coins: -cost, [`buildings.${req.params.buildingId}`]: 1 },
      $set: { lastSeenAt: new Date(), updatedAt: new Date() },
    },
  );
  res.json({ ok: true, cost, nextLevel: currentLevel + 1 });
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
