const MAX_OFFLINE_HOURS = 8;

const buildingCatalog = {
  'tea-stall-rig': { baseCost: 120, baseIncome: 85 },
  'broken-laptop-farm': { baseCost: 380, baseIncome: 240 },
  'whatsapp-trading': { baseCost: 920, baseIncome: 610 },
  'sewer-gpu': { baseCost: 2200, baseIncome: 1550 },
  'meme-basement': { baseCost: 5100, baseIncome: 3600 },
  'underground-exchange': { baseCost: 14500, baseIncome: 11200 },
  'meme-factory': { baseCost: 44000, baseIncome: 28600 },
  'influencer-agency': { baseCost: 118000, baseIncome: 78500 },
  'ai-trading-lab': { baseCost: 380000, baseIncome: 280000 },
  'cockroach-tower': { baseCost: 1250000, baseIncome: 960000 },
};

function getBuildingCost(buildingId, level) {
  const building = buildingCatalog[buildingId];
  if (!building) throw new Error('Unknown building');
  return Math.floor(building.baseCost * Math.pow(1.22, level));
}

function getBuildingIncome(buildingId, level) {
  const building = buildingCatalog[buildingId];
  if (!building || level <= 0) return 0;
  return building.baseIncome * Math.pow(1.18, level - 1) * level;
}

function getProfitPerHour(user) {
  const passiveMultiplier = user.multipliers?.passive || 1;
  return Object.entries(user.buildings || {}).reduce((sum, [buildingId, level]) => {
    return sum + getBuildingIncome(buildingId, level);
  }, 0) * passiveMultiplier;
}

function calculateOfflineReward(user, now = Date.now()) {
  const lastSeen = user.lastSeenAt ? new Date(user.lastSeenAt).getTime() : now;
  const elapsedHours = Math.min(Math.max(0, now - lastSeen) / 3600000, MAX_OFFLINE_HOURS);
  const offlineMultiplier = user.multipliers?.offline || 1;
  return {
    elapsedHours,
    coins: Math.floor(getProfitPerHour(user) * elapsedHours * offlineMultiplier),
  };
}

function applyTap(user, serverCombo = 0) {
  const tapPower = user.tapPower || 12;
  const multiplier = user.multipliers?.tap || 1;
  const comboMultiplier = 1 + Math.min(serverCombo, 40) / 20;
  return Math.floor(tapPower * multiplier * comboMultiplier);
}

module.exports = {
  MAX_OFFLINE_HOURS,
  applyTap,
  calculateOfflineReward,
  getBuildingCost,
  getBuildingIncome,
  getProfitPerHour,
};
