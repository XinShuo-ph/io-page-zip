// Champion definitions with traits, stats, and costs
// Inspired by TFT / 金铲铲之战 champion system

const TRAITS = {
  warrior: { name: 'Warrior', icon: '⚔️', bonuses: { 2: { attack: 15 }, 3: { attack: 30 } } },
  mage: { name: 'Mage', icon: '🔮', bonuses: { 2: { spellPower: 30 }, 3: { spellPower: 60 } } },
  ranger: { name: 'Ranger', icon: '🏹', bonuses: { 2: { attackSpeed: 0.3 }, 3: { attackSpeed: 0.6 } } },
  tank: { name: 'Tank', icon: '🛡️', bonuses: { 2: { armor: 30 }, 3: { armor: 60 } } },
  assassin: { name: 'Assassin', icon: '🗡️', bonuses: { 2: { critChance: 0.3 }, 3: { critChance: 0.6 } } },
  mystic: { name: 'Mystic', icon: '✨', bonuses: { 2: { magicResist: 30 }, 3: { magicResist: 60 } } },
  dragon: { name: 'Dragon', icon: '🐉', bonuses: { 2: { attack: 20, hp: 200 } } },
  demon: { name: 'Demon', icon: '👹', bonuses: { 2: { spellPower: 20, attack: 10 } } },
};

const CHAMPION_POOL = [
  // Cost 1 champions (most common)
  { name: 'Swordsman', cost: 1, traits: ['warrior'], hp: 500, attack: 50, attackSpeed: 0.7, range: 1, emoji: '🗡️', ability: 'Slash', abilityDmg: 100 },
  { name: 'Apprentice', cost: 1, traits: ['mage'], hp: 400, attack: 30, attackSpeed: 0.6, range: 3, emoji: '📕', ability: 'Fireball', abilityDmg: 150 },
  { name: 'Scout', cost: 1, traits: ['ranger'], hp: 420, attack: 45, attackSpeed: 0.8, range: 3, emoji: '🏹', ability: 'Quick Shot', abilityDmg: 80 },
  { name: 'Guard', cost: 1, traits: ['tank'], hp: 700, attack: 35, attackSpeed: 0.5, range: 1, emoji: '🛡️', ability: 'Shield Bash', abilityDmg: 60 },
  { name: 'Thief', cost: 1, traits: ['assassin'], hp: 400, attack: 55, attackSpeed: 0.8, range: 1, emoji: '🥷', ability: 'Backstab', abilityDmg: 120 },

  // Cost 2 champions
  { name: 'Knight', cost: 2, traits: ['warrior', 'tank'], hp: 650, attack: 55, attackSpeed: 0.65, range: 1, emoji: '⚔️', ability: 'Charge', abilityDmg: 150 },
  { name: 'Wizard', cost: 2, traits: ['mage', 'mystic'], hp: 450, attack: 35, attackSpeed: 0.65, range: 3, emoji: '🧙', ability: 'Lightning', abilityDmg: 200 },
  { name: 'Hunter', cost: 2, traits: ['ranger', 'assassin'], hp: 480, attack: 60, attackSpeed: 0.85, range: 3, emoji: '🎯', ability: 'Pierce Shot', abilityDmg: 130 },
  { name: 'Paladin', cost: 2, traits: ['tank', 'mystic'], hp: 750, attack: 40, attackSpeed: 0.5, range: 1, emoji: '🤺', ability: 'Holy Light', abilityDmg: 80 },
  { name: 'Shadow', cost: 2, traits: ['assassin', 'demon'], hp: 430, attack: 65, attackSpeed: 0.9, range: 1, emoji: '👤', ability: 'Shadow Strike', abilityDmg: 180 },

  // Cost 3 champions
  { name: 'Warlord', cost: 3, traits: ['warrior', 'demon'], hp: 800, attack: 70, attackSpeed: 0.7, range: 1, emoji: '👑', ability: 'War Cry', abilityDmg: 220 },
  { name: 'Archmage', cost: 3, traits: ['mage', 'dragon'], hp: 550, attack: 45, attackSpeed: 0.6, range: 3, emoji: '🔥', ability: 'Meteor', abilityDmg: 350 },
  { name: 'Sniper', cost: 3, traits: ['ranger'], hp: 500, attack: 80, attackSpeed: 0.75, range: 4, emoji: '🔫', ability: 'Headshot', abilityDmg: 250 },
  { name: 'Golem', cost: 3, traits: ['tank', 'warrior'], hp: 1000, attack: 45, attackSpeed: 0.4, range: 1, emoji: '🪨', ability: 'Earthquake', abilityDmg: 150 },

  // Cost 4 champions (rare)
  { name: 'Dragon Knight', cost: 4, traits: ['dragon', 'warrior'], hp: 900, attack: 85, attackSpeed: 0.75, range: 1, emoji: '🐲', ability: 'Dragon Breath', abilityDmg: 400 },
  { name: 'Demon Lord', cost: 4, traits: ['demon', 'mage'], hp: 700, attack: 60, attackSpeed: 0.7, range: 3, emoji: '😈', ability: 'Hellfire', abilityDmg: 500 },
];

// Number of each champion in the shared pool
const POOL_SIZES = { 1: 10, 2: 8, 3: 6, 4: 4 };

// Shop odds by player level
const SHOP_ODDS = {
  1: [100, 0, 0, 0],
  2: [100, 0, 0, 0],
  3: [75, 25, 0, 0],
  4: [55, 30, 15, 0],
  5: [40, 35, 20, 5],
  6: [25, 35, 30, 10],
  7: [15, 25, 35, 25],
};

// Star-up multipliers
const STAR_MULTIPLIERS = {
  1: 1,
  2: 1.8,
  3: 3.2,
};

module.exports = { TRAITS, CHAMPION_POOL, POOL_SIZES, SHOP_ODDS, STAR_MULTIPLIERS };
