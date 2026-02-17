const { TRAITS, CHAMPION_POOL, POOL_SIZES, SHOP_ODDS, STAR_MULTIPLIERS } = require('./champions');

class GameEngine {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = new Map();       // socketId -> playerData
    this.playerSlots = new Map();   // slotIndex (0|1) -> { socketId, name, connected }
    this.phase = 'waiting'; // waiting, preparation, battle
    this.round = 0;
    this.phaseTimer = 30;
    this.championPool = this.initializePool();
  }

  initializePool() {
    const pool = [];
    for (const champ of CHAMPION_POOL) {
      const count = POOL_SIZES[champ.cost];
      for (let i = 0; i < count; i++) {
        pool.push({ ...champ });
      }
    }
    return this.shuffle(pool);
  }

  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  addPlayer(id, name) {
    const slotIndex = this.playerSlots.size;
    this.playerSlots.set(slotIndex, { socketId: id, name, connected: true });
    this.players.set(id, {
      id,
      name,
      slotIndex,
      hp: 100,
      gold: 0,
      level: 1,
      xp: 0,
      xpToLevel: 2,
      bench: Array(9).fill(null),
      board: this.createEmptyBoard(),
      shop: [],
      ready: false,
      streak: 0,
      lastResult: null,
    });
  }

  createEmptyBoard() {
    const board = [];
    for (let r = 0; r < 4; r++) {
      board.push(Array(7).fill(null));
    }
    return board;
  }

  // Find a player's slot by name (for rejoin)
  findSlotByName(name) {
    for (const [idx, slot] of this.playerSlots) {
      if (slot.name === name) return idx;
    }
    return -1;
  }

  // Rejoin: replace old socketId with new one, preserve all game state
  rejoinPlayer(oldSocketId, newSocketId) {
    const playerData = this.players.get(oldSocketId);
    if (!playerData) return false;

    // Move data to new key
    this.players.delete(oldSocketId);
    playerData.id = newSocketId;
    this.players.set(newSocketId, playerData);

    // Update slot
    for (const [idx, slot] of this.playerSlots) {
      if (slot.socketId === oldSocketId) {
        slot.socketId = newSocketId;
        slot.connected = true;
        break;
      }
    }
    return true;
  }

  markDisconnected(socketId) {
    for (const [idx, slot] of this.playerSlots) {
      if (slot.socketId === socketId) {
        slot.connected = false;
        break;
      }
    }
  }

  markConnected(socketId) {
    for (const [idx, slot] of this.playerSlots) {
      if (slot.socketId === socketId) {
        slot.connected = true;
        break;
      }
    }
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (p) {
      for (const [idx, slot] of this.playerSlots) {
        if (slot.socketId === id) {
          this.playerSlots.delete(idx);
          break;
        }
      }
    }
    this.players.delete(id);
  }

  getConnectedPlayerCount() {
    let count = 0;
    for (const [, slot] of this.playerSlots) {
      if (slot.connected) count++;
    }
    return count;
  }

  getTotalPlayerCount() {
    return this.playerSlots.size;
  }

  startGame() {
    this.phase = 'preparation';
    this.round = 1;
    this.phaseTimer = 35;

    for (const [, player] of this.players) {
      player.gold = 5;
      player.level = 1;
      player.xp = 0;
      player.xpToLevel = 2;
      this.rollShop(player);
    }
  }

  rollShop(player) {
    const shop = [];
    const odds = SHOP_ODDS[Math.min(player.level, 7)];

    for (let i = 0; i < 5; i++) {
      const roll = Math.random() * 100;
      let cumulative = 0;
      let selectedCost = 1;

      for (let c = 0; c < odds.length; c++) {
        cumulative += odds[c];
        if (roll < cumulative) {
          selectedCost = c + 1;
          break;
        }
      }

      const candidates = this.championPool.filter(ch => ch.cost === selectedCost);
      if (candidates.length > 0) {
        const idx = Math.floor(Math.random() * candidates.length);
        shop.push({ ...candidates[idx], stars: 1, uid: this.genUID() });
      } else {
        const any = this.championPool[Math.floor(Math.random() * this.championPool.length)];
        shop.push({ ...any, stars: 1, uid: this.genUID() });
      }
    }

    player.shop = shop;
  }

  genUID() {
    return Math.random().toString(36).substring(2, 10);
  }

  buyChampion(playerId, shopIndex) {
    const player = this.players.get(playerId);
    if (!player || this.phase !== 'preparation') return { success: false, message: '当前不在备战阶段' };

    const champ = player.shop[shopIndex];
    if (!champ) return { success: false, message: '无效的商店位置' };
    if (player.gold < champ.cost) return { success: false, message: '金币不足' };

    const benchIdx = player.bench.findIndex(s => s === null);
    if (benchIdx === -1) return { success: false, message: '备战席已满' };

    player.gold -= champ.cost;
    player.bench[benchIdx] = { ...champ };
    player.shop[shopIndex] = null;

    const poolIdx = this.championPool.findIndex(c => c.name === champ.name);
    if (poolIdx !== -1) this.championPool.splice(poolIdx, 1);

    this.checkStarUp(player);

    return { success: true };
  }

  checkStarUp(player) {
    const allChamps = [];
    player.bench.forEach((c, i) => { if (c) allChamps.push({ champ: c, location: 'bench', index: i }); });
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 7; c++) {
        if (player.board[r][c]) allChamps.push({ champ: player.board[r][c], location: 'board', row: r, col: c });
      }
    }

    const groups = {};
    for (const entry of allChamps) {
      const key = `${entry.champ.name}_${entry.champ.stars}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    }

    for (const [key, entries] of Object.entries(groups)) {
      if (entries.length >= 3 && entries[0].champ.stars < 3) {
        const keep = entries[0];
        keep.champ.stars += 1;

        const baseDef = CHAMPION_POOL.find(c => c.name === keep.champ.name);
        if (baseDef) {
          const mult = STAR_MULTIPLIERS[keep.champ.stars];
          keep.champ.hp = Math.round(baseDef.hp * mult);
          keep.champ.attack = Math.round(baseDef.attack * mult);
          keep.champ.abilityDmg = Math.round(baseDef.abilityDmg * mult);
        }

        if (keep.location === 'bench') {
          player.bench[keep.index] = keep.champ;
        } else {
          player.board[keep.row][keep.col] = keep.champ;
        }

        for (let i = 1; i < 3; i++) {
          const rem = entries[i];
          if (rem.location === 'bench') {
            player.bench[rem.index] = null;
          } else {
            player.board[rem.row][rem.col] = null;
          }
        }

        this.checkStarUp(player);
        return;
      }
    }
  }

  sellChampion(playerId, from, index) {
    const player = this.players.get(playerId);
    if (!player) return { success: false, message: '玩家未找到' };

    let champ;
    if (from === 'bench') {
      champ = player.bench[index];
      if (!champ) return { success: false, message: '该位置没有棋子' };
      player.bench[index] = null;
    } else {
      return { success: false, message: '无效操作' };
    }

    const refund = champ.cost * (champ.stars === 1 ? 1 : champ.stars === 2 ? 3 : 9);
    player.gold += refund;

    const baseDef = CHAMPION_POOL.find(c => c.name === champ.name);
    if (baseDef) {
      const count = champ.stars === 1 ? 1 : champ.stars === 2 ? 3 : 9;
      for (let i = 0; i < count; i++) {
        this.championPool.push({ ...baseDef });
      }
    }

    return { success: true };
  }

  placeChampion(playerId, benchIndex, boardRow, boardCol) {
    const player = this.players.get(playerId);
    if (!player) return { success: false, message: '玩家未找到' };
    if (this.phase !== 'preparation') return { success: false, message: '当前不在备战阶段' };

    if (boardRow < 0 || boardRow > 3 || boardCol < 0 || boardCol > 6)
      return { success: false, message: '无效的棋盘位置' };

    const champ = player.bench[benchIndex];
    if (!champ) return { success: false, message: '备战席上没有棋子' };

    const boardCount = this.getBoardChampionCount(player);

    if (player.board[boardRow][boardCol]) {
      const existing = player.board[boardRow][boardCol];
      player.board[boardRow][boardCol] = champ;
      player.bench[benchIndex] = existing;
      return { success: true };
    }

    if (boardCount >= player.level) {
      return { success: false, message: `棋盘已满，等级${player.level}最多上${player.level}个棋子` };
    }

    player.board[boardRow][boardCol] = champ;
    player.bench[benchIndex] = null;

    return { success: true };
  }

  moveChampion(playerId, fromRow, fromCol, toRow, toCol) {
    const player = this.players.get(playerId);
    if (!player) return { success: false, message: '玩家未找到' };
    if (this.phase !== 'preparation') return { success: false, message: '当前不在备战阶段' };

    if (toRow < 0 || toRow > 3 || toCol < 0 || toCol > 6)
      return { success: false, message: '无效位置' };

    const champ = player.board[fromRow][fromCol];
    if (!champ) return { success: false, message: '该位置没有棋子' };

    const target = player.board[toRow][toCol];
    player.board[toRow][toCol] = champ;
    player.board[fromRow][fromCol] = target;

    return { success: true };
  }

  returnToBench(playerId, boardRow, boardCol) {
    const player = this.players.get(playerId);
    if (!player) return { success: false, message: '玩家未找到' };

    const champ = player.board[boardRow][boardCol];
    if (!champ) return { success: false, message: '该位置没有棋子' };

    const benchIdx = player.bench.findIndex(s => s === null);
    if (benchIdx === -1) return { success: false, message: '备战席已满' };

    player.bench[benchIdx] = champ;
    player.board[boardRow][boardCol] = null;

    return { success: true };
  }

  refreshShop(playerId) {
    const player = this.players.get(playerId);
    if (!player) return { success: false, message: '玩家未找到' };
    if (player.gold < 2) return { success: false, message: '刷新需要2金币' };

    player.gold -= 2;
    this.rollShop(player);
    return { success: true };
  }

  buyXP(playerId) {
    const player = this.players.get(playerId);
    if (!player) return { success: false, message: '玩家未找到' };
    if (player.gold < 4) return { success: false, message: '买经验需要4金币' };
    if (player.level >= 7) return { success: false, message: '已达到最高等级' };

    player.gold -= 4;
    player.xp += 4;

    while (player.xp >= player.xpToLevel && player.level < 7) {
      player.xp -= player.xpToLevel;
      player.level++;
      player.xpToLevel = this.getXPToLevel(player.level);
    }

    return { success: true };
  }

  getXPToLevel(level) {
    const table = { 1: 2, 2: 2, 3: 6, 4: 10, 5: 20, 6: 36, 7: 999 };
    return table[level] || 999;
  }

  getBoardChampionCount(player) {
    let count = 0;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 7; c++) {
        if (player.board[r][c]) count++;
      }
    }
    return count;
  }

  playerReady(playerId) {
    const player = this.players.get(playerId);
    if (player) player.ready = true;
  }

  allPlayersReady() {
    for (const [, player] of this.players) {
      if (!player.ready) return false;
    }
    return this.players.size === 2;
  }

  getActiveTraits(player) {
    const traitCounts = {};
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 7; c++) {
        const ch = player.board[r][c];
        if (ch) {
          for (const t of ch.traits) {
            traitCounts[t] = (traitCounts[t] || 0) + 1;
          }
        }
      }
    }

    const active = [];
    for (const [trait, count] of Object.entries(traitCounts)) {
      const def = TRAITS[trait];
      if (!def) continue;

      let activeTier = null;
      const thresholds = Object.keys(def.bonuses).map(Number).sort((a, b) => b - a);
      for (const threshold of thresholds) {
        if (count >= threshold) {
          activeTier = threshold;
          break;
        }
      }

      if (activeTier !== null) {
        active.push({
          trait,
          name: def.name,
          icon: def.icon,
          count,
          threshold: activeTier,
          bonuses: def.bonuses[activeTier],
        });
      }
    }

    return active;
  }

  applyTraitBonuses(units, player) {
    const activeTraits = this.getActiveTraits(player);
    for (const unit of units) {
      for (const traitInfo of activeTraits) {
        if (unit.traits.includes(traitInfo.trait)) {
          const b = traitInfo.bonuses;
          if (b.attack) unit.attack += b.attack;
          if (b.hp) unit.currentHp += b.hp;
          if (b.spellPower) unit.abilityDmg += b.spellPower;
          if (b.armor) unit.armor = (unit.armor || 0) + b.armor;
          if (b.magicResist) unit.magicResist = (unit.magicResist || 0) + b.magicResist;
          if (b.attackSpeed) unit.attackSpeed += b.attackSpeed;
          if (b.critChance) unit.critChance = (unit.critChance || 0) + b.critChance;
        }
      }
    }
    return units;
  }

  simulateBattle() {
    const playerIds = [...this.players.keys()];
    const p1 = this.players.get(playerIds[0]);
    const p2 = this.players.get(playerIds[1]);

    let team1 = this.createBattleUnits(p1, 'team1');
    let team2 = this.createBattleUnits(p2, 'team2');

    for (const u of team2) {
      u.row = 3 - u.row + 4;
    }

    team1 = this.applyTraitBonuses(team1, p1);
    team2 = this.applyTraitBonuses(team2, p2);

    const log = [];
    let tick = 0;
    const maxTicks = 50;

    while (team1.some(u => u.currentHp > 0) && team2.some(u => u.currentHp > 0) && tick < maxTicks) {
      const allUnits = [...team1, ...team2].filter(u => u.currentHp > 0);

      for (const unit of allUnits) {
        if (unit.currentHp <= 0) continue;

        unit.attackCooldown -= 1;
        unit.manaCurrent += 5;

        if (unit.attackCooldown <= 0) {
          const enemies = (unit.team === 'team1' ? team2 : team1).filter(e => e.currentHp > 0);
          if (enemies.length === 0) break;

          const target = enemies.reduce((nearest, e) => {
            const d = Math.abs(e.row - unit.row) + Math.abs(e.col - unit.col);
            return d < nearest.dist ? { enemy: e, dist: d } : nearest;
          }, { enemy: enemies[0], dist: Infinity }).enemy;

          const dist = Math.abs(target.row - unit.row) + Math.abs(target.col - unit.col);

          if (dist <= unit.range) {
            let dmg = unit.attack;
            const isCrit = Math.random() < (unit.critChance || 0);
            if (isCrit) dmg = Math.round(dmg * 1.5);

            const armor = target.armor || 0;
            dmg = Math.max(1, Math.round(dmg * (100 / (100 + armor))));

            target.currentHp -= dmg;
            unit.attackCooldown = Math.round(10 / unit.attackSpeed);

            log.push({
              tick, type: isCrit ? 'crit' : 'attack',
              attacker: { name: unit.name, team: unit.team, row: unit.row, col: unit.col, emoji: unit.emoji },
              target: { name: target.name, team: target.team, row: target.row, col: target.col, emoji: target.emoji },
              damage: dmg, targetHp: Math.max(0, target.currentHp), targetMaxHp: target.maxHp,
            });

            if (target.currentHp <= 0) {
              log.push({ tick, type: 'death', unit: { name: target.name, team: target.team, emoji: target.emoji } });
            }

            if (unit.manaCurrent >= 100 && unit.abilityDmg > 0) {
              let abilityDmg = unit.abilityDmg;
              const mr = target.magicResist || 0;
              abilityDmg = Math.max(1, Math.round(abilityDmg * (100 / (100 + mr))));

              target.currentHp -= abilityDmg;
              unit.manaCurrent = 0;

              log.push({
                tick, type: 'ability',
                attacker: { name: unit.name, team: unit.team, emoji: unit.emoji, ability: unit.ability },
                target: { name: target.name, team: target.team, emoji: target.emoji },
                damage: abilityDmg, targetHp: Math.max(0, target.currentHp), targetMaxHp: target.maxHp,
              });

              if (target.currentHp <= 0) {
                log.push({ tick, type: 'death', unit: { name: target.name, team: target.team, emoji: target.emoji } });
              }
            }
          } else {
            if (Math.abs(target.row - unit.row) > Math.abs(target.col - unit.col)) {
              unit.row += target.row > unit.row ? 1 : -1;
            } else {
              unit.col += target.col > unit.col ? 1 : -1;
            }
            unit.attackCooldown = 3;
            log.push({ tick, type: 'move', unit: { name: unit.name, team: unit.team, emoji: unit.emoji }, to: { row: unit.row, col: unit.col } });
          }
        }
      }
      tick++;
    }

    const team1Alive = team1.filter(u => u.currentHp > 0);
    const team2Alive = team2.filter(u => u.currentHp > 0);

    let winner, loser, winnerUnitsLeft;
    if (team1Alive.length > team2Alive.length) {
      winner = playerIds[0]; loser = playerIds[1]; winnerUnitsLeft = team1Alive.length;
    } else if (team2Alive.length > team1Alive.length) {
      winner = playerIds[1]; loser = playerIds[0]; winnerUnitsLeft = team2Alive.length;
    } else {
      const hp1 = team1Alive.reduce((s, u) => s + u.currentHp, 0);
      const hp2 = team2Alive.reduce((s, u) => s + u.currentHp, 0);
      if (hp1 >= hp2) {
        winner = playerIds[0]; loser = playerIds[1]; winnerUnitsLeft = team1Alive.length;
      } else {
        winner = playerIds[1]; loser = playerIds[0]; winnerUnitsLeft = team2Alive.length;
      }
    }

    return { log, winner, loser, winnerUnitsLeft };
  }

  createBattleUnits(player, teamId) {
    const units = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 7; c++) {
        const ch = player.board[r][c];
        if (ch) {
          units.push({
            ...ch, team: teamId, row: r, col: c,
            currentHp: ch.hp, maxHp: ch.hp,
            attackCooldown: Math.round(10 / ch.attackSpeed),
            manaCurrent: 0, armor: 0, magicResist: 0, critChance: 0,
          });
        }
      }
    }
    return units;
  }

  applyBattleResult(result) {
    const winner = this.players.get(result.winner);
    const loser = this.players.get(result.loser);
    if (!winner || !loser) return;

    const damage = Math.max(2, this.round + result.winnerUnitsLeft);
    loser.hp = Math.max(0, loser.hp - damage);

    winner.lastResult = 'win';
    loser.lastResult = 'loss';
    if (winner.streak > 0) winner.streak++; else winner.streak = 1;
    if (loser.streak < 0) loser.streak--; else loser.streak = -1;
  }

  checkGameOver() {
    for (const [id, player] of this.players) {
      if (player.hp <= 0) {
        const otherPlayer = [...this.players.values()].find(p => p.id !== id);
        return {
          winner: otherPlayer ? otherPlayer.id : null,
          winnerName: otherPlayer ? otherPlayer.name : 'Unknown',
          loser: id, loserName: player.name,
        };
      }
    }
    return null;
  }

  startNewRound() {
    this.round++;
    this.phase = 'preparation';
    this.phaseTimer = 30;

    for (const [, player] of this.players) {
      const interest = Math.min(5, Math.floor(player.gold / 10));
      const streakBonus = Math.min(3, Math.abs(player.streak));
      player.gold += 5 + interest + streakBonus;

      player.xp += 2;
      while (player.xp >= player.xpToLevel && player.level < 7) {
        player.xp -= player.xpToLevel;
        player.level++;
        player.xpToLevel = this.getXPToLevel(player.level);
      }

      player.ready = false;
      this.rollShop(player);
    }
  }

  getStateForPlayer(playerId) {
    const player = this.players.get(playerId);
    if (!player) return null;

    const opponent = [...this.players.values()].find(p => p.id !== playerId);

    return {
      playerId,
      roomCode: this.roomCode,
      phase: this.phase,
      round: this.round,
      timer: this.phaseTimer,
      player: {
        name: player.name,
        hp: player.hp,
        gold: player.gold,
        level: player.level,
        xp: player.xp,
        xpToLevel: player.xpToLevel,
        bench: player.bench,
        board: player.board,
        shop: player.shop,
        streak: player.streak,
        maxUnits: player.level,
        boardCount: this.getBoardChampionCount(player),
        activeTraits: this.getActiveTraits(player),
      },
      opponent: opponent ? {
        name: opponent.name,
        hp: opponent.hp,
        level: opponent.level,
        boardCount: this.getBoardChampionCount(opponent),
        board: opponent.board,
      } : null,
    };
  }
}

module.exports = GameEngine;
