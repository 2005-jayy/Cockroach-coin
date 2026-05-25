import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FaBolt,
  FaChartLine,
  FaCoins,
  FaCrown,
  FaExchangeAlt,
  FaFlask,
  FaGem,
  FaGift,
  FaHome,
  FaMicrochip,
  FaShareAlt,
  FaSkull,
  FaStore,
  FaTrophy,
  FaUsers,
} from 'react-icons/fa';
import { useMonetagRewardAd } from './hooks/useMonetagRewardAd';
import {
  buildings,
  dailyRewards,
  events,
  leaderboard,
  marketUpgrades,
  researchTracks,
} from './data/gameData';

const STORAGE_KEY = 'cockroach-coin-save-v1';
const MAX_OFFLINE_HOURS = 8;
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';
const MONETAG_ZONE_ID = process.env.REACT_APP_MONETAG_ZONE_ID || '11056935';
const MONETAG_SDK_SRC = process.env.REACT_APP_MONETAG_SDK_SRC || 'https://libtl.com/sdk.js';

const defaultState = {
  coins: 1250,
  gems: 18,
  mutationPoints: 0,
  level: 1,
  xp: 18,
  stability: 92,
  combo: 0,
  tapPower: 12,
  referrals: 3,
  streakDay: 4,
  lastDailyClaimDate: '',
  lastSeen: Date.now(),
  premium: false,
  buildings: Object.fromEntries(buildings.map((building) => [building.id, building.startLevel])),
  upgrades: Object.fromEntries(marketUpgrades.map((upgrade) => [upgrade.id, upgrade.startLevel])),
  research: Object.fromEntries(researchTracks.map((track) => [track.id, track.startLevel])),
};

function compactNumber(value) {
  return Intl.NumberFormat('en-IN', {
    notation: value >= 100000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 100000 ? 1 : 0,
  }).format(Math.floor(value));
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTelegramUser() {
  const tg = window.Telegram?.WebApp;
  const user = tg?.initDataUnsafe?.user;
  if (user) console.log(user);
  return {
    id: user?.id || 'demo-ceo',
    username: user?.username || user?.first_name || 'DelhiDegen',
    avatar: user?.photo_url || '',
    platform: tg?.platform || 'browser',
  };
}

function readSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaultState, ...JSON.parse(raw) } : defaultState;
  } catch (error) {
    return defaultState;
  }
}

function getUpgradeLevel(state, id) {
  return state.upgrades[id] || 0;
}

function getResearchLevel(state, id) {
  return state.research[id] || 0;
}

function getMultipliers(state) {
  const marketing = 1 + getUpgradeLevel(state, 'meme-marketing') * 0.18;
  const mutation = 1 + getUpgradeLevel(state, 'mutation-lab') * 0.14 + getResearchLevel(state, 'toxic-mutation') * 0.1;
  const mining = 1 + getUpgradeLevel(state, 'sewer-mining') * 0.2 + getResearchLevel(state, 'gpu-efficiency') * 0.08;
  const ai = 1 + getUpgradeLevel(state, 'ai-trading') * 0.32 + getResearchLevel(state, 'ai-automation') * 0.2;
  const viral = 1 + getResearchLevel(state, 'viral-memes') * 0.12;
  const premium = state.premium ? 1.25 : 1;
  return {
    tap: marketing * viral * premium,
    passive: mutation * mining * ai * premium,
    offline: (1 + getUpgradeLevel(state, 'sewer-mining') * 0.16 + getResearchLevel(state, 'blockchain-speed') * 0.06) * premium,
    referral: 1 + getUpgradeLevel(state, 'telegram-army') * 0.2,
  };
}

function buildingIncome(building, level) {
  if (level <= 0) return 0;
  return building.baseIncome * Math.pow(1.18, level - 1) * level;
}

function buildingCost(building, level) {
  return building.baseCost * Math.pow(1.22, level);
}

function upgradeCost(item, level) {
  return item.baseCost * Math.pow(1.34, level);
}

function researchCost(track, level) {
  return track.baseCost * Math.pow(1.42, level);
}

function getProfitPerHour(state) {
  const base = buildings.reduce((sum, building) => {
    return sum + buildingIncome(building, state.buildings[building.id] || 0);
  }, 0);
  return base * getMultipliers(state).passive;
}

function createPopup(text, type = 'coin') {
  return {
    id: `${Date.now()}-${Math.random()}`,
    text,
    type,
    x: 35 + Math.random() * 30,
    y: 28 + Math.random() * 28,
  };
}

function getInitData() {
  return window.Telegram?.WebApp?.initData || '';
}

async function loginTelegramUser(user) {
  if (!API_BASE_URL || !user?.id) return null;

  const response = await fetch(`${API_BASE_URL}/login`, {
    method: 'POST',
    headers: { 'x-telegram-init-data': getInitData() },
  });

  if (!response.ok) throw new Error('Login request failed');
  return response.json();
}

function getRankedLeaderboard(baseLeaderboard, player, state) {
  const currentPlayerEntry = {
    name: player.username || 'You',
    title: `Level ${state.level} Meme CEO`,
    coins: state.coins,
    currentPlayer: true,
  };

  const entries = [
    ...baseLeaderboard.filter((entry) => !entry.currentPlayer && entry.name !== currentPlayerEntry.name),
    currentPlayerEntry,
  ].sort((a, b) => b.coins - a.coins);

  return entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [state, setState] = useState(readSavedState);
  const [player, setPlayer] = useState({ username: 'DelhiDegen', avatar: '' });
  const [popups, setPopups] = useState([]);
  const [activeEvent, setActiveEvent] = useState(events[0]);
  const [offlineReward, setOfflineReward] = useState(null);
  const [toast, setToast] = useState('WhatsApp uncles are quietly accumulating.');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [leaderboardEntries, setLeaderboardEntries] = useState(leaderboard);
  const comboTimer = useRef(null);

  const multipliers = useMemo(() => getMultipliers(state), [state]);
  const profitPerHour = useMemo(() => getProfitPerHour(state) * activeEvent.multiplier, [activeEvent.multiplier, state]);
  const tapValue = Math.round(state.tapPower * multipliers.tap * (1 + Math.min(state.combo, 40) / 20) * activeEvent.tapBoost);
  const rankedLeaderboard = useMemo(() => getRankedLeaderboard(leaderboardEntries, player, state), [leaderboardEntries, player, state]);
  const rewardAd = useMonetagRewardAd({
    zoneId: MONETAG_ZONE_ID,
    sdkSrc: MONETAG_SDK_SRC,
    userId: player.id,
    onReward: grantAdReward,
    onError: (error) => {
      const message = error?.message || error?.description || 'Ad unavailable right now';
      setToast(message);
    },
  });

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready?.();
    tg?.expand?.();
    tg?.setHeaderColor?.('#050807');
    tg?.setBackgroundColor?.('#050807');
    const telegramUser = tg?.initDataUnsafe?.user;
    setPlayer(getTelegramUser());

    loginTelegramUser(telegramUser).catch(() => {
      setToast('Telegram login sync failed. Local save is still active.');
    });
  }, []);

  useEffect(() => {
    const now = Date.now();
    const elapsedMs = Math.max(0, now - (state.lastSeen || now));
    const elapsedHours = Math.min(elapsedMs / 3600000, MAX_OFFLINE_HOURS);
    if (elapsedHours > 0.02) {
      const earned = Math.floor(getProfitPerHour(state) * elapsedHours * getMultipliers(state).offline);
      if (earned > 0) {
        setState((current) => ({ ...current, coins: current.coins + earned, lastSeen: now }));
        setOfflineReward({ earned, hours: elapsedHours });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, lastSeen: Date.now() }));
  }, [state]);

  useEffect(() => {
    const incomeTick = setInterval(() => {
      setState((current) => ({
        ...current,
        coins: current.coins + profitPerHour / 3600,
        stability: Math.min(100, current.stability + 0.02),
      }));
    }, 1000);
    return () => clearInterval(incomeTick);
  }, [profitPerHour]);

  useEffect(() => {
    const eventTick = setInterval(() => {
      const nextEvent = events[Math.floor(Math.random() * events.length)];
      setActiveEvent(nextEvent);
      setToast(nextEvent.notification);
    }, 36000);
    return () => clearInterval(eventTick);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = setTimeout(() => setToast(''), 5200);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    let ignore = false;

    async function loadLeaderboard() {
      if (!API_BASE_URL) {
        setLeaderboardEntries(leaderboard);
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/api/leaderboard`, {
          headers: { 'x-telegram-init-data': getInitData() },
        });
        if (!response.ok) throw new Error('Leaderboard request failed');
        const data = await response.json();
        if (!ignore) setLeaderboardEntries(data.leaderboard || leaderboard);
      } catch (error) {
        if (!ignore) setLeaderboardEntries(leaderboard);
      }
    }

    loadLeaderboard();
    const interval = setInterval(loadLeaderboard, 20000);
    return () => {
      ignore = true;
      clearInterval(interval);
    };
  }, []);

  function addPopup(text, type) {
    const popup = createPopup(text, type);
    setPopups((items) => [...items.slice(-12), popup]);
    setTimeout(() => setPopups((items) => items.filter((item) => item.id !== popup.id)), 950);
  }

  function grantAdReward() {
    const bonusCoins = Math.max(250, Math.floor(profitPerHour / 2));
    setState((current) => ({
      ...current,
      gems: current.gems + 3,
      coins: current.coins + bonusCoins,
    }));
    addPopup(`+${compactNumber(bonusCoins)}`, 'coin');
    setToast('Reward ad complete: +3 gems and emergency liquidity added.');
  }

  function vibrate(pattern = 'light') {
    const haptic = window.Telegram?.WebApp?.HapticFeedback;
    if (haptic) {
      haptic.impactOccurred(pattern);
    } else if (navigator.vibrate) {
      navigator.vibrate(pattern === 'heavy' ? 35 : 12);
    }
  }

  function handleTap() {
    setState((current) => ({
      ...current,
      coins: current.coins + tapValue,
      xp: current.xp + 1,
      combo: Math.min(50, current.combo + 1),
      stability: Math.max(8, current.stability - 0.05),
      level: current.xp > current.level * 75 ? current.level + 1 : current.level,
    }));
    addPopup(`+${compactNumber(tapValue)}`, 'coin');
    vibrate(state.combo > 14 ? 'heavy' : 'light');
    if (comboTimer.current) clearTimeout(comboTimer.current);
    comboTimer.current = setTimeout(() => {
      setState((current) => ({ ...current, combo: Math.max(0, current.combo - 8) }));
    }, 650);
  }

  function buyBuilding(id) {
    const building = buildings.find((item) => item.id === id);
    const level = state.buildings[id] || 0;
    const cost = Math.floor(buildingCost(building, level));
    if (state.coins < cost) {
      setToast('Not enough Cockroach Coin. Tap harder, CEO.');
      return;
    }
    setState((current) => ({
      ...current,
      coins: current.coins - cost,
      buildings: { ...current.buildings, [id]: level + 1 },
      xp: current.xp + 8,
    }));
    addPopup('UPGRADE', 'upgrade');
    setToast(`${building.name} upgraded. Colony cashflow is crawling upward.`);
    vibrate('heavy');
  }

  function buyUpgrade(id) {
    const upgrade = marketUpgrades.find((item) => item.id === id);
    const level = state.upgrades[id] || 0;
    const cost = Math.floor(upgradeCost(upgrade, level));
    if (state.coins < cost) {
      setToast('Treasury says no. Need more green candles.');
      return;
    }
    setState((current) => ({
      ...current,
      coins: current.coins - cost,
      upgrades: { ...current.upgrades, [id]: level + 1 },
      gems: current.gems + (level % 4 === 3 ? 1 : 0),
    }));
    addPopup(`${upgrade.rarity}`, 'upgrade');
  }

  function runResearch(id) {
    const track = researchTracks.find((item) => item.id === id);
    const level = state.research[id] || 0;
    const cost = Math.floor(researchCost(track, level));
    if (state.coins < cost) {
      setToast('Research lab needs funding, not vibes.');
      return;
    }
    setState((current) => ({
      ...current,
      coins: current.coins - cost,
      mutationPoints: current.mutationPoints + 1,
      research: { ...current.research, [id]: level + 1 },
    }));
    addPopup('+1 MP', 'mutation');
  }

  function claimDailyReward(day) {
    const today = getLocalDateKey();
    if (state.lastDailyClaimDate === today) {
      setToast('Daily reward already claimed. Come back tomorrow.');
      return;
    }

    const reward = dailyRewards[day - 1];
    setState((current) => ({
      ...current,
      coins: current.coins + reward.coins,
      gems: current.gems + reward.gems,
      mutationPoints: current.mutationPoints + reward.mutationPoints,
      streakDay: Math.min(7, day + 1),
      lastDailyClaimDate: today,
    }));
    setToast(day === 7 ? 'Legendary mutation chest opened.' : 'Daily reward claimed.');
  }

  function shareEmpire() {
    const text = `I am building a ${compactNumber(profitPerHour)}/hr Cockroach Coin empire. Survived every crash.`;
    const tg = window.Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(`https://t.me/share/url?url=https://t.me/CockroachCoinBot&text=${encodeURIComponent(text)}`);
    } else if (navigator.share) {
      navigator.share({ title: 'Cockroach Coin', text });
    } else {
      navigator.clipboard?.writeText(text);
      setToast('Share text copied. Send it before the bull run ends.');
    }
  }

  const tabs = [
    { id: 'home', label: 'Home', icon: FaHome },
    { id: 'market', label: 'Market', icon: FaStore },
    { id: 'mine', label: 'Mine', icon: FaMicrochip },
    { id: 'wallet', label: 'Wallet', icon: FaExchangeAlt },
    { id: 'friends', label: 'Friends', icon: FaUsers },
    { id: 'events', label: 'Events', icon: FaBolt },
  ];

  return (
    <div className="min-h-screen overflow-hidden bg-[#050807] text-zinc-100">
      <div className="fixed inset-0 roach-grid opacity-60" />
      <div className="fixed inset-0 pointer-events-none toxic-fog" />
      <main className="relative mx-auto flex min-h-screen w-full max-w-md flex-col pb-24">
        <TopBar
          player={player}
          level={state.level}
          coins={state.coins}
          gems={state.gems}
          mutationPoints={state.mutationPoints}
          profitPerHour={profitPerHour}
          stability={state.stability}
          soundEnabled={soundEnabled}
          onToggleSound={() => setSoundEnabled((value) => !value)}
        />

        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <HomeScreen
              key="home"
              state={state}
              activeEvent={activeEvent}
              tapValue={tapValue}
              profitPerHour={profitPerHour}
              popups={popups}
              onTap={handleTap}
              onShare={shareEmpire}
              onClaimDaily={claimDailyReward}
              dailyClaimed={state.lastDailyClaimDate === getLocalDateKey()}
            />
          )}
          {activeTab === 'market' && (
            <MarketScreen key="market" state={state} upgrades={marketUpgrades} onBuy={buyUpgrade} />
          )}
          {activeTab === 'mine' && (
            <MineScreen key="mine" state={state} profitPerHour={profitPerHour} onBuyBuilding={buyBuilding} onResearch={runResearch} />
          )}
          {activeTab === 'wallet' && (
            <WalletScreen key="wallet" state={state} />
          )}
          {activeTab === 'friends' && (
            <FriendsScreen
              key="friends"
              player={player}
              state={state}
              multiplier={multipliers.referral}
              entries={rankedLeaderboard}
              onShare={shareEmpire}
            />
          )}
          {activeTab === 'events' && (
            <EventsScreen
              key="events"
              activeEvent={activeEvent}
              adsReady={rewardAd.loaded}
              adsConfigured={Boolean(MONETAG_ZONE_ID)}
              onWatchAd={rewardAd.showAd}
            />
          )}
        </AnimatePresence>

        <BottomNav tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      </main>

      <AnimatePresence>
        {offlineReward && (
          <OfflineModal reward={offlineReward} onClose={() => setOfflineReward(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            className="fixed left-1/2 top-4 z-50 w-[calc(100%-28px)] max-w-md -translate-x-1/2 rounded-2xl border border-lime-300/30 bg-black/[.85] px-4 py-3 text-sm font-semibold text-lime-100 shadow-[0_0_30px_rgba(57,255,20,.28)] backdrop-blur"
            initial={{ opacity: 0, y: -18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TopBar({ player, level, coins, gems, mutationPoints, profitPerHour, stability, soundEnabled, onToggleSound }) {
  return (
    <header className="sticky top-0 z-30 border-b border-lime-300/10 bg-black/[.65] px-4 pb-3 pt-3 backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-lime-300/30 bg-lime-300/10 text-xl shadow-[0_0_20px_rgba(57,255,20,.25)]">
            {player.avatar ? <img alt="" className="h-full w-full object-cover" src={player.avatar} /> : 'CC'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-white">@{player.username}</p>
            <p className="text-xs font-bold text-lime-300">Level {level} Meme CEO</p>
          </div>
        </div>
        <button
          aria-label="Toggle sound"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-yellow-300/30 bg-yellow-300/10 text-yellow-200"
          onClick={onToggleSound}
        >
          {soundEnabled ? <FaBolt /> : <FaSkull />}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Metric icon={FaCoins} label="Balance" value={compactNumber(coins)} tone="gold" />
        <Metric icon={FaGem} label="Gems" value={compactNumber(gems)} tone="green" />
        <Metric icon={FaFlask} label="Mutation" value={compactNumber(mutationPoints)} tone="blue" />
      </div>
      <div className="mt-3 rounded-xl border border-white/10 bg-white/[.04] p-2">
        <div className="mb-1 flex justify-between text-[11px] font-black uppercase tracking-[.18em] text-zinc-400">
          <span>Profit/hr {compactNumber(profitPerHour)}</span>
          <span>Stability {Math.round(stability)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-lime-300 via-yellow-300 to-emerald-400"
            animate={{ width: `${Math.max(4, Math.min(100, stability))}%` }}
          />
        </div>
      </div>
    </header>
  );
}

function Metric({ icon: Icon, label, value, tone }) {
  const tones = {
    gold: 'text-yellow-200 border-yellow-300/20 bg-yellow-300/10',
    green: 'text-lime-200 border-lime-300/20 bg-lime-300/10',
    blue: 'text-cyan-200 border-cyan-300/20 bg-cyan-300/10',
  };
  return (
    <div className={`rounded-xl border px-2 py-2 ${tones[tone]}`}>
      <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider opacity-80">
        <Icon /> {label}
      </div>
      <div className="mt-1 text-sm font-black">{value}</div>
    </div>
  );
}

function Screen({ children }) {
  return (
    <motion.section
      className="flex-1 px-4 py-4"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.22 }}
    >
      {children}
    </motion.section>
  );
}

function HomeScreen({ state, activeEvent, tapValue, profitPerHour, popups, onTap, onShare, onClaimDaily, dailyClaimed }) {
  return (
    <Screen>
      <div className="mb-3 flex items-center justify-between rounded-2xl border border-red-300/25 bg-red-500/10 px-3 py-2 shadow-[0_0_24px_rgba(239,68,68,.16)]">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.2em] text-red-200">Live Event</p>
          <p className="text-sm font-black text-white">{activeEvent.name}</p>
        </div>
        <div className="rounded-full bg-lime-300 px-3 py-1 text-xs font-black text-black">{activeEvent.badge}</div>
      </div>

      <div className="relative grid min-h-[360px] place-items-center overflow-hidden rounded-[28px] border border-lime-300/15 bg-[radial-gradient(circle_at_center,rgba(57,255,20,.18),rgba(0,0,0,.1)_45%,rgba(0,0,0,.55))]">
        <div className="absolute inset-0 money-rain opacity-70" />
        <div className="absolute left-5 top-5 rounded-full border border-yellow-200/25 bg-yellow-300/10 px-3 py-1 text-xs font-black text-yellow-100">
          Tap +{compactNumber(tapValue)}
        </div>
        <div className="absolute right-5 top-5 rounded-full border border-lime-200/25 bg-lime-300/10 px-3 py-1 text-xs font-black text-lime-100">
          Combo x{(1 + Math.min(state.combo, 40) / 20).toFixed(1)}
        </div>
        <button aria-label="Tap cockroach mascot" className="relative z-10 touch-manipulation" onClick={onTap}>
          <CockroachMascot combo={state.combo} />
        </button>
        {popups.map((popup) => (
          <motion.div
            key={popup.id}
            className={`pointer-events-none absolute z-20 text-xl font-black ${popup.type === 'coin' ? 'text-yellow-200' : popup.type === 'mutation' ? 'text-cyan-200' : 'text-lime-200'}`}
            style={{ left: `${popup.x}%`, top: `${popup.y}%` }}
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: -70, scale: 1.15 }}
            exit={{ opacity: 0 }}
          >
            {popup.text}
          </motion.div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <ActionButton
          icon={FaGift}
          label={dailyClaimed ? 'Reward Claimed' : `Day ${state.streakDay} Reward`}
          onClick={() => onClaimDaily(state.streakDay)}
          disabled={dailyClaimed}
        />
        <ActionButton icon={FaShareAlt} label="Share Empire" onClick={onShare} />
      </div>

      <div className="mt-4 rounded-2xl border border-lime-300/15 bg-white/[.05] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-black text-white">Colony Pulse</h2>
          <span className="text-xs font-black text-lime-300">{compactNumber(profitPerHour / 60)}/min</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <MiniStat label="Tap power" value={compactNumber(state.tapPower)} />
          <MiniStat label="Referrals" value={compactNumber(state.referrals)} />
          <MiniStat label="Offline" value="8h cap" />
        </div>
      </div>
    </Screen>
  );
}

function CockroachMascot({ combo }) {
  const legPairs = [
    ['left-[49px] top-[85px] w-24 -rotate-[22deg]', 'right-[49px] top-[85px] w-24 rotate-[22deg]'],
    ['left-[35px] top-[126px] w-[104px] -rotate-[6deg]', 'right-[35px] top-[126px] w-[104px] rotate-[6deg]'],
    ['left-[47px] top-[169px] w-24 -rotate-[31deg]', 'right-[47px] top-[169px] w-24 rotate-[31deg]'],
  ];

  return (
    <motion.div
      className="relative h-64 w-64"
      animate={{ y: [0, -8, 0], rotate: combo > 12 ? [-1, 1, -1] : [0, 0, 0] }}
      transition={{ repeat: Infinity, duration: combo > 12 ? 0.42 : 1.8 }}
      whileTap={{ scale: 0.92 }}
    >
      <div className="absolute inset-5 rounded-full bg-lime-300/20 blur-3xl" />
      <div className="roach-antenna absolute left-[93px] top-1 h-24 w-1 origin-bottom -rotate-[34deg] rounded-full bg-gradient-to-t from-[#2b1306] via-[#8a4f1e] to-[#e7b45c]" />
      <div className="roach-antenna roach-antenna-right absolute right-[93px] top-1 h-24 w-1 origin-bottom rotate-[34deg] rounded-full bg-gradient-to-t from-[#2b1306] via-[#8a4f1e] to-[#e7b45c]" />
      <div className="absolute left-1/2 top-9 h-24 w-[104px] -translate-x-1/2 rounded-[48%_48%_42%_42%] border border-[#2a1207] bg-[radial-gradient(circle_at_50%_20%,#d89a44,#5b2b12_58%,#160b05)] shadow-[inset_0_-14px_24px_rgba(0,0,0,.46)]" />
      <div className="absolute left-[101px] top-[62px] h-4 w-5 rounded-full bg-[#090604] shadow-[0_0_8px_rgba(255,215,0,.25)]" />
      <div className="absolute right-[101px] top-[62px] h-4 w-5 rounded-full bg-[#090604] shadow-[0_0_8px_rgba(255,215,0,.25)]" />

      {legPairs.map(([leftClass, rightClass], index) => (
        <React.Fragment key={leftClass}>
          <div className={`roach-leg absolute h-2 origin-right rounded-full bg-gradient-to-l from-[#120905] to-[#6e3918] ${index === 1 ? 'roach-leg-delay' : ''} ${leftClass}`} />
          <div className={`roach-leg absolute h-2 origin-left rounded-full bg-gradient-to-r from-[#120905] to-[#6e3918] ${index !== 1 ? 'roach-leg-delay' : ''} ${rightClass}`} />
        </React.Fragment>
      ))}

      <div className="absolute left-1/2 top-[64px] h-[166px] w-[132px] -translate-x-1/2 rounded-[50%_50%_42%_42%] border-2 border-[#2a1207] bg-[linear-gradient(90deg,#2b1408_0%,#9f6128_14%,#5c2c13_50%,#9f6128_86%,#241006_100%)] shadow-[0_0_55px_rgba(57,255,20,.34),inset_0_-32px_28px_rgba(0,0,0,.48)]" />
      <div className="absolute left-1/2 top-[72px] h-[150px] w-[2px] -translate-x-1/2 rounded-full bg-[#1b0c05]/80" />
      {[91, 112, 135, 158, 181, 202].map((top, index) => (
        <div
          key={top}
          className="absolute left-1/2 h-[3px] -translate-x-1/2 rounded-full bg-[#251006]/65"
          style={{ top, width: `${116 - Math.abs(index - 2) * 8}px` }}
        />
      ))}
      <div className="absolute left-[81px] top-[78px] h-[128px] w-12 -rotate-6 rounded-[60%_34%_46%_40%] border border-[#e0a64b]/25 bg-gradient-to-b from-[#f1c16a]/24 via-[#6d3518]/18 to-transparent" />
      <div className="absolute right-[81px] top-[78px] h-[128px] w-12 rotate-6 rounded-[34%_60%_40%_46%] border border-[#e0a64b]/25 bg-gradient-to-b from-[#f1c16a]/24 via-[#6d3518]/18 to-transparent" />
      <div className="absolute left-1/2 top-[214px] h-10 w-[86px] -translate-x-1/2 rounded-b-[40px] bg-gradient-to-b from-[#46200d] to-[#0d0704]" />
      <div className="absolute left-[105px] top-[229px] h-8 w-1 -rotate-[28deg] rounded-full bg-[#6e3918]" />
      <div className="absolute right-[105px] top-[229px] h-8 w-1 rotate-[28deg] rounded-full bg-[#6e3918]" />
      <div className="absolute left-1/2 top-[142px] grid h-12 w-12 -translate-x-1/2 place-items-center rounded-full border-4 border-yellow-300 bg-black text-xs font-black text-yellow-200 shadow-[0_0_18px_rgba(255,215,0,.48)]">
        CC
      </div>
    </motion.div>
  );
}

function ActionButton({ icon: Icon, label, onClick, disabled = false }) {
  return (
    <motion.button
      className={`flex h-14 items-center justify-center gap-2 rounded-2xl border px-3 text-sm font-black shadow-[0_0_22px_rgba(57,255,20,.12)] ${disabled ? 'border-zinc-700 bg-zinc-900/70 text-zinc-500' : 'border-lime-300/25 bg-lime-300/10 text-lime-100'}`}
      onClick={onClick}
      disabled={disabled}
      whileTap={{ scale: 0.96 }}
    >
      <Icon /> {label}
    </motion.button>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-xl bg-black/[.35] p-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value}</p>
    </div>
  );
}

function MarketScreen({ state, upgrades, onBuy }) {
  return (
    <Screen>
      <SectionTitle icon={FaChartLine} title="Market Control" subtitle="Pump virality, referrals, and crash survival." />
      <div className="space-y-3">
        {upgrades.map((upgrade) => {
          const UpgradeIcon = upgrade.icon;
          const level = state.upgrades[upgrade.id] || 0;
          const cost = Math.floor(upgradeCost(upgrade, level));
          return (
            <motion.button
              key={upgrade.id}
              className="w-full rounded-2xl border border-white/10 bg-white/[.055] p-4 text-left shadow-[0_0_28px_rgba(57,255,20,.08)]"
              whileTap={{ scale: 0.985 }}
              onClick={() => onBuy(upgrade.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="mb-2 inline-flex rounded-full border border-lime-300/25 bg-lime-300/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-lime-200">
                    {upgrade.rarity}
                  </div>
                  <h3 className="text-base font-black text-white">{upgrade.name}</h3>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">{upgrade.description}</p>
                </div>
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-yellow-300/10 text-xl text-yellow-200">
                  <UpgradeIcon />
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="text-xs font-black text-zinc-400">Lv {level}</span>
                <span className="text-sm font-black text-yellow-200">{compactNumber(cost)} CC</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/50">
                <div className="h-full rounded-full bg-gradient-to-r from-lime-300 to-yellow-300" style={{ width: `${Math.min(100, (level % 10) * 10 + 12)}%` }} />
              </div>
            </motion.button>
          );
        })}
      </div>
    </Screen>
  );
}

function MineScreen({ state, profitPerHour, onBuyBuilding, onResearch }) {
  return (
    <Screen>
      <SectionTitle icon={FaMicrochip} title="Underground Empire" subtitle={`${compactNumber(profitPerHour)} CC per hour across all colonies.`} />
      <div className="space-y-3">
        {buildings.map((building) => {
          const level = state.buildings[building.id] || 0;
          const cost = Math.floor(buildingCost(building, level));
          const income = buildingIncome(building, level);
          return (
            <motion.button
              key={building.id}
              className="flex w-full items-center gap-3 rounded-2xl border border-lime-300/[.12] bg-black/[.35] p-3 text-left"
              onClick={() => onBuyBuilding(building.id)}
              whileTap={{ scale: 0.985 }}
            >
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-lime-300/25 to-yellow-300/10 text-2xl">
                {building.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-sm font-black text-white">{building.name}</h3>
                <p className="text-xs text-zinc-400">Lv {level} • {compactNumber(income)}/hr</p>
                <p className="mt-1 text-xs font-black text-yellow-200">Upgrade {compactNumber(cost)} CC</p>
              </div>
              <FaCoins className="shrink-0 text-lime-300" />
            </motion.button>
          );
        })}
      </div>

      <SectionTitle icon={FaFlask} title="Research Tree" subtitle="Strategy-game upgrades for long-term dominance." compact />
      <div className="grid grid-cols-2 gap-3">
        {researchTracks.map((track) => {
          const TrackIcon = track.icon;
          const level = state.research[track.id] || 0;
          const cost = Math.floor(researchCost(track, level));
          return (
            <motion.button
              key={track.id}
              className="rounded-2xl border border-cyan-300/15 bg-cyan-300/5 p-3 text-left"
              onClick={() => onResearch(track.id)}
              whileTap={{ scale: 0.96 }}
            >
              <TrackIcon className="mb-3 text-cyan-200" />
              <h3 className="text-sm font-black text-white">{track.name}</h3>
              <p className="mt-1 text-xs text-zinc-500">Lv {level} • {compactNumber(cost)} CC</p>
            </motion.button>
          );
        })}
      </div>
    </Screen>
  );
}

function FriendsScreen({ player, state, multiplier, entries, onShare }) {
  const playerRank = entries.find((entry) => entry.currentPlayer)?.rank || '?';

  return (
    <Screen>
      <SectionTitle icon={FaUsers} title="Telegram Army" subtitle="Invite degens, unlock gems, climb referral boards." />
      <div className="rounded-2xl border border-lime-300/15 bg-lime-300/[.08] p-4">
        <p className="text-xs font-black uppercase tracking-[.2em] text-lime-300">Your referral link</p>
        <p className="mt-2 break-all rounded-xl bg-black/[.40] p-3 text-sm font-bold text-white">
          https://t.me/CockroachCoinBot/app?startapp={player.id || 'demo-ceo'}
        </p>
        <button className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-lime-300 text-sm font-black text-black" onClick={onShare}>
          <FaShareAlt /> Invite on Telegram
        </button>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <MiniStat label="Invites" value={state.referrals} />
        <MiniStat label="Boost" value={`${multiplier.toFixed(1)}x`} />
        <MiniStat label="Rank" value={`#${playerRank}`} />
      </div>
      <SectionTitle icon={FaTrophy} title="Leaderboard" subtitle="Live whale rankings." compact />
      <div className="space-y-2">
        {entries.slice(0, 8).map((entry) => (
          <div
            key={`${entry.name}-${entry.rank}`}
            className={`flex items-center gap-3 rounded-2xl border p-3 ${entry.currentPlayer ? 'border-lime-300/35 bg-lime-300/[.10]' : 'border-white/10 bg-white/[.045]'}`}
          >
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-yellow-300/15 text-sm font-black text-yellow-200">#{entry.rank}</div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-white">{entry.name}</p>
              <p className="text-xs text-zinc-500">{entry.title}</p>
            </div>
            <p className="text-sm font-black text-lime-300">{compactNumber(entry.coins)}</p>
          </div>
        ))}
      </div>
    </Screen>
  );
}

function EventsScreen({ activeEvent, adsReady, adsConfigured, onWatchAd }) {
  return (
    <Screen>
      <SectionTitle icon={FaBolt} title="Crash Control" subtitle="Dynamic events, monetization boosts, and siren moments." />
      <div className="rounded-3xl border border-red-300/25 bg-red-500/10 p-5 shadow-[0_0_40px_rgba(239,68,68,.15)]">
        <p className="text-[10px] font-black uppercase tracking-[.28em] text-red-200">Active Global Event</p>
        <h2 className="mt-3 text-2xl font-black text-white">{activeEvent.name}</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-300">{activeEvent.description}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <MiniStat label="Income" value={`${activeEvent.multiplier}x`} />
          <MiniStat label="Tap" value={`${activeEvent.tapBoost}x`} />
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-4">
        <div className="flex items-center gap-3">
          <FaCrown className="text-yellow-200" />
          <div>
            <h3 className="text-sm font-black text-white">Premium Membership</h3>
            <p className="text-xs text-zinc-400">25% faster empire growth, exclusive hoodie skins, extra daily rewards.</p>
          </div>
        </div>
      </div>
      <button
        className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-lime-300/30 bg-lime-300 text-sm font-black text-black disabled:border-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-500"
        onClick={onWatchAd}
        disabled={!adsConfigured}
      >
        <FaGift /> {adsReady ? 'Watch Reward Ad' : adsConfigured ? 'Loading Ad' : 'Add Monetag Zone ID'}
      </button>
    </Screen>
  );
}

function WalletScreen({ state }) {
  const estimatedToken = state.gems / 100;

  return (
    <Screen>
      <SectionTitle icon={FaExchangeAlt} title="Crypto Wallet" subtitle="Gem-to-token conversion is being prepared for launch." />
      <div className="rounded-3xl border border-yellow-300/25 bg-yellow-300/10 p-5 shadow-[0_0_34px_rgba(255,216,77,.12)]">
        <p className="text-[10px] font-black uppercase tracking-[.28em] text-yellow-200">Coming Soon</p>
        <h2 className="mt-3 text-2xl font-black text-white">$ROACH Converter</h2>
        <p className="mt-2 text-sm leading-6 text-zinc-300">
          Gems earned from reward ads will become the premium bridge into Cockroach Coin token rewards after wallet verification goes live.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <MiniStat label="Your gems" value={compactNumber(state.gems)} />
          <MiniStat label="Est. $ROACH" value={estimatedToken.toFixed(2)} />
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-lime-300/15 bg-lime-300/[.07] p-4">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-lime-300 text-black">
            <FaGem />
          </div>
          <div>
            <h3 className="text-sm font-black text-white">Save gems from ads</h3>
            <p className="mt-1 text-xs leading-5 text-zinc-400">
              Reward ads give gems now. When conversion opens, gems will be used for token claims, boost passes, and limited colony skins.
            </p>
          </div>
        </div>
      </div>

      <button
        className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-900/80 text-sm font-black text-zinc-500"
        disabled
      >
        <FaExchangeAlt /> Conversion Opens Soon
      </button>
    </Screen>
  );
}

function SectionTitle({ icon: Icon, title, subtitle, compact = false }) {
  return (
    <div className={compact ? 'mb-3 mt-6' : 'mb-4'}>
      <div className="flex items-center gap-2 text-lime-300">
        <Icon />
        <h1 className="text-lg font-black text-white">{title}</h1>
      </div>
      <p className="mt-1 text-sm leading-5 text-zinc-400">{subtitle}</p>
    </div>
  );
}

function BottomNav({ tabs, activeTab, onChange }) {
  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-lime-300/10 bg-black/[.80] px-3 pb-3 pt-2 backdrop-blur-xl">
      <div className="grid grid-cols-6 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              className={`relative flex h-14 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-black ${active ? 'text-black' : 'text-zinc-500'}`}
              onClick={() => onChange(tab.id)}
            >
              {active && <motion.div layoutId="active-tab" className="absolute inset-0 rounded-2xl bg-lime-300 shadow-[0_0_22px_rgba(57,255,20,.42)]" />}
              <Icon className="relative z-10 text-base" />
              <span className="relative z-10">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function OfflineModal({ reward, onClose }) {
  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/[.75] p-5 backdrop-blur" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        className="w-full max-w-sm rounded-3xl border border-lime-300/25 bg-[#08100b] p-6 text-center shadow-[0_0_50px_rgba(57,255,20,.25)]"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
      >
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-lime-300 text-3xl text-black shadow-[0_0_30px_rgba(57,255,20,.5)]">CC</div>
        <h2 className="mt-4 text-2xl font-black text-white">Your colony survived.</h2>
        <p className="mt-2 text-sm text-zinc-400">While you were away for {reward.hours.toFixed(1)}h, the empire kept crawling through the crash.</p>
        <p className="mt-4 text-3xl font-black text-yellow-200">+{compactNumber(reward.earned)}</p>
        <button className="mt-5 h-12 w-full rounded-2xl bg-lime-300 font-black text-black" onClick={onClose}>Collect</button>
      </motion.div>
    </motion.div>
  );
}

export default App;
