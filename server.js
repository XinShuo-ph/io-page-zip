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

const games = new Map();
const playerToGame = new Map();
const disconnectTimers = new Map(); // grace period timers for disconnects

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Debug endpoint to check server state
app.get('/api/status', (req, res) => {
  const roomList = [];
  for (const [code, engine] of games) {
    roomList.push({
      code,
      players: engine.players.size,
      phase: engine.phase,
      round: engine.round,
    });
  }
  res.json({
    ok: true,
    rooms: roomList,
    totalConnections: io.engine.clientsCount,
  });
});

io.on('connection', (socket) => {
  console.log(`[连接] ${socket.id} (transport: ${socket.conn.transport.name})`);

  socket.conn.on('upgrade', (transport) => {
    console.log(`[升级] ${socket.id} -> ${transport.name}`);
  });

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

  socket.on('join_game', ({ roomCode, playerName }) => {
    roomCode = (roomCode || '').toUpperCase().trim();
    console.log(`[加入] "${playerName}" (${socket.id}) 尝试加入房间 ${roomCode}`);

    const engine = games.get(roomCode);
    if (!engine) {
      console.log(`[错误] 房间 ${roomCode} 不存在. 当前房间: [${[...games.keys()].join(', ')}]`);
      socket.emit('error_msg', '房间不存在，请检查房间号');
      return;
    }
    if (engine.players.size >= 2) {
      console.log(`[错误] 房间 ${roomCode} 已满 (${engine.players.size} 玩家)`);
      socket.emit('error_msg', '房间已满');
      return;
    }

    // Cancel any pending disconnect cleanup for the room creator
    for (const [sid, timer] of disconnectTimers) {
      if (playerToGame.get(sid) === roomCode) {
        clearTimeout(timer);
        disconnectTimers.delete(sid);
        console.log(`[恢复] 取消房间 ${roomCode} 的清理计时器`);
      }
    }

    engine.addPlayer(socket.id, playerName || '玩家2');
    playerToGame.set(socket.id, roomCode);
    socket.join(roomCode);
    socket.emit('game_joined', { roomCode, playerId: socket.id });
    console.log(`[加入] "${playerName}" 成功加入房间 ${roomCode} (玩家数: ${engine.players.size})`);

    if (engine.players.size === 2) {
      engine.startGame();
      console.log(`[开始] 房间 ${roomCode} 游戏开始! 回合 ${engine.round}`);
      io.to(roomCode).emit('game_started');
      for (const [pid] of engine.players) {
        io.to(pid).emit('game_state', engine.getStateForPlayer(pid));
      }
      io.to(roomCode).emit('phase_change', { phase: engine.phase, round: engine.round, timer: engine.phaseTimer });
    }
  });

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

  socket.on('ready_for_battle', () => {
    const roomCode = playerToGame.get(socket.id);
    if (!roomCode) return;
    const engine = games.get(roomCode);
    if (!engine) return;
    engine.playerReady(socket.id);

    if (engine.allPlayersReady()) {
      runBattle(roomCode, engine);
    }
  });

  socket.on('disconnect', (reason) => {
    console.log(`[断开] ${socket.id} 原因: ${reason}`);
    const roomCode = playerToGame.get(socket.id);
    if (roomCode) {
      const engine = games.get(roomCode);
      if (engine) {
        // Grace period: wait 30s before actually removing the player/room
        // This handles mobile connection drops and tunnel hiccups
        console.log(`[等待] 30秒后清理 ${socket.id} (房间 ${roomCode})`);
        const timer = setTimeout(() => {
          disconnectTimers.delete(socket.id);
          const eng = games.get(roomCode);
          if (eng) {
            eng.removePlayer(socket.id);
            io.to(roomCode).emit('player_left', socket.id);
            console.log(`[清理] 移除玩家 ${socket.id} (房间 ${roomCode}, 剩余: ${eng.players.size})`);
            if (eng.players.size === 0) {
              games.delete(roomCode);
              console.log(`[删除] 房间 ${roomCode} 已删除（无玩家）`);
            }
          }
          playerToGame.delete(socket.id);
        }, 30000);
        disconnectTimers.set(socket.id, timer);
      }
    }
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
      games.delete(roomCode);
      return;
    }

    engine.startNewRound();

    for (const [pid] of engine.players) {
      io.to(pid).emit('game_state', engine.getStateForPlayer(pid));
      io.to(pid).emit('phase_change', { phase: engine.phase, round: engine.round, timer: engine.phaseTimer });
    }
  }, totalDuration);
}

// Auto-advance phases with timers
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
