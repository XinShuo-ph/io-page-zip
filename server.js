const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GameEngine = require('./game/engine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 30000,
  pingInterval: 10000,
  transports: ['polling', 'websocket'],
  allowUpgrades: true,
});

app.use(express.static(path.join(__dirname, 'public')));

const games = new Map();            // roomCode -> GameEngine
const playerToGame = new Map();     // socketId -> roomCode
const disconnectTimers = new Map(); // socketId -> { timer, roomCode }

const ROOM_EXPIRY = 5 * 60 * 1000; // 5 minutes grace period

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Debug / status endpoint
app.get('/api/status', (req, res) => {
  const roomList = [];
  for (const [code, engine] of games) {
    const slots = [];
    for (const [idx, slot] of engine.playerSlots) {
      slots.push({ slot: idx, name: slot.name, connected: slot.connected });
    }
    roomList.push({ code, slots, phase: engine.phase, round: engine.round });
  }
  res.json({ ok: true, rooms: roomList, totalConnections: io.engine.clientsCount });
});

// Check if a room exists (for client to verify before rejoin)
app.get('/api/room/:code', (req, res) => {
  const code = (req.params.code || '').toUpperCase();
  const engine = games.get(code);
  if (!engine) {
    return res.json({ exists: false });
  }
  const slots = [];
  for (const [idx, slot] of engine.playerSlots) {
    slots.push({ slot: idx, name: slot.name, connected: slot.connected });
  }
  res.json({ exists: true, phase: engine.phase, round: engine.round, slots });
});

io.on('connection', (socket) => {
  console.log(`[连接] ${socket.id} (transport: ${socket.conn.transport.name})`);

  socket.conn.on('upgrade', (transport) => {
    console.log(`[升级] ${socket.id} -> ${transport.name}`);
  });

  // === CREATE GAME ===
  socket.on('create_game', (playerName) => {
    const roomCode = generateRoomCode();
    const engine = new GameEngine(roomCode);
    engine.addPlayer(socket.id, playerName || '玩家1');
    games.set(roomCode, engine);
    playerToGame.set(socket.id, roomCode);
    socket.join(roomCode);
    socket.emit('game_created', { roomCode, playerId: socket.id });
    console.log(`[创建] 房间 ${roomCode} 由 "${playerName}" 创建 (${socket.id})`);
  });

  // === JOIN GAME ===
  socket.on('join_game', ({ roomCode, playerName }) => {
    roomCode = (roomCode || '').toUpperCase().trim();
    console.log(`[加入] "${playerName}" (${socket.id}) 尝试加入房间 ${roomCode}`);

    const engine = games.get(roomCode);
    if (!engine) {
      console.log(`[错误] 房间 ${roomCode} 不存在. 当前: [${[...games.keys()].join(', ')}]`);
      socket.emit('error_msg', '房间不存在，请检查房间号');
      return;
    }
    if (engine.players.size >= 2) {
      console.log(`[错误] 房间 ${roomCode} 已满 (${engine.players.size} 玩家)`);
      socket.emit('error_msg', '房间已满');
      return;
    }

    // Cancel any pending disconnect cleanup for existing players
    for (const [sid, info] of disconnectTimers) {
      if (info.roomCode === roomCode) {
        clearTimeout(info.timer);
        disconnectTimers.delete(sid);
        console.log(`[恢复] 取消 ${sid} 的清理计时器 (房间 ${roomCode})`);
      }
    }

    engine.addPlayer(socket.id, playerName || '玩家2');
    playerToGame.set(socket.id, roomCode);
    socket.join(roomCode);
    socket.emit('game_joined', { roomCode, playerId: socket.id });
    console.log(`[加入] "${playerName}" 成功加入 ${roomCode} (玩家: ${engine.players.size})`);

    if (engine.players.size === 2 && engine.phase === 'waiting') {
      engine.startGame();
      console.log(`[开始] 房间 ${roomCode} 游戏开始!`);
      io.to(roomCode).emit('game_started');
      for (const [pid] of engine.players) {
        io.to(pid).emit('game_state', engine.getStateForPlayer(pid));
      }
      io.to(roomCode).emit('phase_change', { phase: engine.phase, round: engine.round, timer: engine.phaseTimer });
    }
  });

  // === REJOIN GAME (page refresh / reconnect) ===
  socket.on('rejoin_game', ({ roomCode, playerName }) => {
    roomCode = (roomCode || '').toUpperCase().trim();
    console.log(`[重连] "${playerName}" (${socket.id}) 尝试重连房间 ${roomCode}`);

    const engine = games.get(roomCode);
    if (!engine) {
      console.log(`[重连失败] 房间 ${roomCode} 不存在`);
      socket.emit('rejoin_failed', '房间已过期，请重新创建');
      return;
    }

    // Find the player's slot by name
    const slotIndex = engine.findSlotByName(playerName);
    if (slotIndex < 0) {
      console.log(`[重连失败] 房间 ${roomCode} 没有名为 "${playerName}" 的玩家`);
      socket.emit('rejoin_failed', '找不到你的游戏记录');
      return;
    }

    const slot = engine.playerSlots.get(slotIndex);
    const oldSocketId = slot.socketId;

    // Cancel any pending disconnect timer for the old socket
    if (disconnectTimers.has(oldSocketId)) {
      clearTimeout(disconnectTimers.get(oldSocketId).timer);
      disconnectTimers.delete(oldSocketId);
      console.log(`[重连] 取消 ${oldSocketId} 的清理计时器`);
    }

    // Clean up old mapping
    playerToGame.delete(oldSocketId);

    // Rejoin: swap socket ID, preserve all game state
    engine.rejoinPlayer(oldSocketId, socket.id);
    playerToGame.set(socket.id, roomCode);
    socket.join(roomCode);

    console.log(`[重连成功] "${playerName}" 已重连到房间 ${roomCode} (新ID: ${socket.id})`);

    // Send full game state
    const state = engine.getStateForPlayer(socket.id);
    if (state) {
      socket.emit('rejoin_success', { roomCode });
      socket.emit('game_state', state);
      socket.emit('phase_change', { phase: engine.phase, round: engine.round, timer: engine.phaseTimer });
    } else {
      socket.emit('rejoin_failed', '游戏状态异常');
    }
  });

  // === GAME ACTIONS ===
  socket.on('buy_champion', (shopIndex) => {
    const roomCode = playerToGame.get(socket.id);
    if (!roomCode) return;
    const engine = games.get(roomCode);
    if (!engine) return;
    const result = engine.buyChampion(socket.id, shopIndex);
    if (result.success) {
      socket.emit('game_state', engine.getStateForPlayer(socket.id));
    } else {
      socket.emit('error_msg', result.message);
    }
  });

  socket.on('sell_champion', ({ from, index }) => {
    const roomCode = playerToGame.get(socket.id);
    if (!roomCode) return;
    const engine = games.get(roomCode);
    if (!engine) return;
    const result = engine.sellChampion(socket.id, from, index);
    if (result.success) {
      socket.emit('game_state', engine.getStateForPlayer(socket.id));
    } else {
      socket.emit('error_msg', result.message);
    }
  });

  socket.on('place_champion', ({ benchIndex, boardRow, boardCol }) => {
    const roomCode = playerToGame.get(socket.id);
    if (!roomCode) return;
    const engine = games.get(roomCode);
    if (!engine) return;
    const result = engine.placeChampion(socket.id, benchIndex, boardRow, boardCol);
    if (result.success) {
      socket.emit('game_state', engine.getStateForPlayer(socket.id));
    } else {
      socket.emit('error_msg', result.message);
    }
  });

  socket.on('move_champion', ({ fromRow, fromCol, toRow, toCol }) => {
    const roomCode = playerToGame.get(socket.id);
    if (!roomCode) return;
    const engine = games.get(roomCode);
    if (!engine) return;
    const result = engine.moveChampion(socket.id, fromRow, fromCol, toRow, toCol);
    if (result.success) {
      socket.emit('game_state', engine.getStateForPlayer(socket.id));
    } else {
      socket.emit('error_msg', result.message);
    }
  });

  socket.on('return_to_bench', ({ boardRow, boardCol }) => {
    const roomCode = playerToGame.get(socket.id);
    if (!roomCode) return;
    const engine = games.get(roomCode);
    if (!engine) return;
    const result = engine.returnToBench(socket.id, boardRow, boardCol);
    if (result.success) {
      socket.emit('game_state', engine.getStateForPlayer(socket.id));
    } else {
      socket.emit('error_msg', result.message);
    }
  });

  socket.on('refresh_shop', () => {
    const roomCode = playerToGame.get(socket.id);
    if (!roomCode) return;
    const engine = games.get(roomCode);
    if (!engine) return;
    const result = engine.refreshShop(socket.id);
    if (result.success) {
      socket.emit('game_state', engine.getStateForPlayer(socket.id));
    } else {
      socket.emit('error_msg', result.message);
    }
  });

  socket.on('buy_xp', () => {
    const roomCode = playerToGame.get(socket.id);
    if (!roomCode) return;
    const engine = games.get(roomCode);
    if (!engine) return;
    const result = engine.buyXP(socket.id);
    if (result.success) {
      socket.emit('game_state', engine.getStateForPlayer(socket.id));
    } else {
      socket.emit('error_msg', result.message);
    }
  });

  socket.on('leave_game', () => {
    const roomCode = playerToGame.get(socket.id);
    if (!roomCode) return;
    const engine = games.get(roomCode);
    if (!engine) return;
    console.log(`[离开] ${socket.id} 主动离开房间 ${roomCode}`);
    engine.removePlayer(socket.id);
    io.to(roomCode).emit('player_left', socket.id);
    playerToGame.delete(socket.id);
    socket.leave(roomCode);
    if (engine.players.size === 0 && engine.getTotalPlayerCount() === 0) {
      games.delete(roomCode);
      console.log(`[删除] 房间 ${roomCode} 已删除`);
    }
  });

  // === DISCONNECT (with grace period) ===
  socket.on('disconnect', (reason) => {
    console.log(`[断开] ${socket.id} 原因: ${reason}`);
    const roomCode = playerToGame.get(socket.id);
    if (!roomCode) return;

    const engine = games.get(roomCode);
    if (!engine) return;

    engine.markDisconnected(socket.id);
    io.to(roomCode).emit('player_disconnected', { playerId: socket.id });
    console.log(`[等待] ${ROOM_EXPIRY / 1000}秒 后清理 ${socket.id} (房间 ${roomCode})`);

    const timer = setTimeout(() => {
      disconnectTimers.delete(socket.id);
      const eng = games.get(roomCode);
      if (!eng) return;

      eng.removePlayer(socket.id);
      io.to(roomCode).emit('player_left', socket.id);
      playerToGame.delete(socket.id);
      console.log(`[清理] 移除 ${socket.id} (房间 ${roomCode}, 剩余slot: ${eng.getTotalPlayerCount()})`);

      if (eng.getTotalPlayerCount() === 0) {
        games.delete(roomCode);
        console.log(`[删除] 房间 ${roomCode} 已删除`);
      }
    }, ROOM_EXPIRY);

    disconnectTimers.set(socket.id, { timer, roomCode });
  });
});

function runBattle(roomCode, engine) {
  const battleResult = engine.simulateBattle();

  for (const [pid] of engine.players) {
    io.to(pid).emit('battle_start', battleResult.log);
  }

  const totalDuration = battleResult.log.length * 800 + 2000;

  setTimeout(() => {
    engine.applyBattleResult(battleResult);

    const gameOver = engine.checkGameOver();
    if (gameOver) {
      for (const [pid] of engine.players) {
        io.to(pid).emit('game_over', gameOver);
      }
      // Keep room for 1 min after game over so players can see result on reload
      setTimeout(() => {
        if (games.has(roomCode)) {
          games.delete(roomCode);
          console.log(`[删除] 房间 ${roomCode} 游戏结束后清理`);
        }
      }, 60000);
      return;
    }

    engine.startNewRound();

    for (const [pid] of engine.players) {
      io.to(pid).emit('game_state', engine.getStateForPlayer(pid));
      io.to(pid).emit('phase_change', { phase: engine.phase, round: engine.round, timer: engine.phaseTimer });
    }
  }, totalDuration);
}

// Auto-advance phases
setInterval(() => {
  for (const [roomCode, engine] of games) {
    if (engine.phase === 'preparation' && engine.players.size === 2) {
      engine.phaseTimer--;
      if (engine.phaseTimer <= 0) {
        runBattle(roomCode, engine);
        engine.phase = 'battle';
        for (const [pid] of engine.players) {
          io.to(pid).emit('phase_change', { phase: 'battle', round: engine.round, timer: 0 });
        }
      } else {
        for (const [pid] of engine.players) {
          io.to(pid).emit('timer_update', engine.phaseTimer);
        }
      }
    }
  }
}, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=== 金铲铲之战 - 自走棋 ===`);
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`在浏览器打开 http://localhost:${PORT}\n`);
});
