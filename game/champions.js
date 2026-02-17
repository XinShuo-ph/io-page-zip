// 棋子定义：羁绊、属性、费用
// 灵感来自 金铲铲之战 / TFT

const TRAITS = {
  warrior: { name: '战士', icon: '⚔️', bonuses: { 2: { attack: 15 }, 3: { attack: 30 } } },
  mage: { name: '法师', icon: '🔮', bonuses: { 2: { spellPower: 30 }, 3: { spellPower: 60 } } },
  ranger: { name: '游侠', icon: '🏹', bonuses: { 2: { attackSpeed: 0.3 }, 3: { attackSpeed: 0.6 } } },
  tank: { name: '重装', icon: '🛡️', bonuses: { 2: { armor: 30 }, 3: { armor: 60 } } },
  assassin: { name: '刺客', icon: '🗡️', bonuses: { 2: { critChance: 0.3 }, 3: { critChance: 0.6 } } },
  mystic: { name: '秘术', icon: '✨', bonuses: { 2: { magicResist: 30 }, 3: { magicResist: 60 } } },
  dragon: { name: '龙族', icon: '🐉', bonuses: { 2: { attack: 20, hp: 200 } } },
  demon: { name: '恶魔', icon: '👹', bonuses: { 2: { spellPower: 20, attack: 10 } } },
};

const CHAMPION_POOL = [
  // 1费棋子（最常见）
  { name: '剑士', cost: 1, traits: ['warrior'], hp: 500, attack: 50, attackSpeed: 0.7, range: 1, emoji: '🗡️', ability: '斩击', abilityDmg: 100 },
  { name: '学徒', cost: 1, traits: ['mage'], hp: 400, attack: 30, attackSpeed: 0.6, range: 3, emoji: '📕', ability: '火球术', abilityDmg: 150 },
  { name: '斥候', cost: 1, traits: ['ranger'], hp: 420, attack: 45, attackSpeed: 0.8, range: 3, emoji: '🏹', ability: '速射', abilityDmg: 80 },
  { name: '守卫', cost: 1, traits: ['tank'], hp: 700, attack: 35, attackSpeed: 0.5, range: 1, emoji: '🛡️', ability: '盾击', abilityDmg: 60 },
  { name: '盗贼', cost: 1, traits: ['assassin'], hp: 400, attack: 55, attackSpeed: 0.8, range: 1, emoji: '🥷', ability: '背刺', abilityDmg: 120 },

  // 2费棋子
  { name: '骑士', cost: 2, traits: ['warrior', 'tank'], hp: 650, attack: 55, attackSpeed: 0.65, range: 1, emoji: '⚔️', ability: '冲锋', abilityDmg: 150 },
  { name: '巫师', cost: 2, traits: ['mage', 'mystic'], hp: 450, attack: 35, attackSpeed: 0.65, range: 3, emoji: '🧙', ability: '闪电', abilityDmg: 200 },
  { name: '猎人', cost: 2, traits: ['ranger', 'assassin'], hp: 480, attack: 60, attackSpeed: 0.85, range: 3, emoji: '🎯', ability: '穿刺箭', abilityDmg: 130 },
  { name: '圣骑', cost: 2, traits: ['tank', 'mystic'], hp: 750, attack: 40, attackSpeed: 0.5, range: 1, emoji: '🤺', ability: '圣光', abilityDmg: 80 },
  { name: '暗影', cost: 2, traits: ['assassin', 'demon'], hp: 430, attack: 65, attackSpeed: 0.9, range: 1, emoji: '👤', ability: '暗影打击', abilityDmg: 180 },

  // 3费棋子
  { name: '战神', cost: 3, traits: ['warrior', 'demon'], hp: 800, attack: 70, attackSpeed: 0.7, range: 1, emoji: '👑', ability: '战吼', abilityDmg: 220 },
  { name: '大法师', cost: 3, traits: ['mage', 'dragon'], hp: 550, attack: 45, attackSpeed: 0.6, range: 3, emoji: '🔥', ability: '陨石术', abilityDmg: 350 },
  { name: '狙击手', cost: 3, traits: ['ranger'], hp: 500, attack: 80, attackSpeed: 0.75, range: 4, emoji: '🔫', ability: '爆头', abilityDmg: 250 },
  { name: '石像', cost: 3, traits: ['tank', 'warrior'], hp: 1000, attack: 45, attackSpeed: 0.4, range: 1, emoji: '🪨', ability: '地震', abilityDmg: 150 },

  // 4费棋子（稀有）
  { name: '龙骑士', cost: 4, traits: ['dragon', 'warrior'], hp: 900, attack: 85, attackSpeed: 0.75, range: 1, emoji: '🐲', ability: '龙息', abilityDmg: 400 },
  { name: '魔王', cost: 4, traits: ['demon', 'mage'], hp: 700, attack: 60, attackSpeed: 0.7, range: 3, emoji: '😈', ability: '地狱火', abilityDmg: 500 },
];

// 共享卡池中每个棋子的数量
const POOL_SIZES = { 1: 10, 2: 8, 3: 6, 4: 4 };

// 各等级商店出棋概率
const SHOP_ODDS = {
  1: [100, 0, 0, 0],
  2: [100, 0, 0, 0],
  3: [75, 25, 0, 0],
  4: [55, 30, 15, 0],
  5: [40, 35, 20, 5],
  6: [25, 35, 30, 10],
  7: [15, 25, 35, 25],
};

// 升星属性倍率
const STAR_MULTIPLIERS = {
  1: 1,
  2: 1.8,
  3: 3.2,
};

module.exports = { TRAITS, CHAMPION_POOL, POOL_SIZES, SHOP_ODDS, STAR_MULTIPLIERS };
