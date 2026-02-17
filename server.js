const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const GameEngine = require('./game/engine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

const games = new Map();
const playerToGame = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('create_game', (playerName) => {
    const roomCode = generateRoomCode();
    const engine = new GameEngine(roomCode);
    engine.addPlayer(socket.id, playerName || 'Player 1');
    games.set(roomCode, engine);
    playerToGame.set(socket.id, roomCode);
    socket.join(roomCode);
    socket.emit('game_created', { roomCode, playerId: socket.id });
    // Don't send game_state yet - wait for opponent to join
    console.log(`Game ${roomCode} created by ${playerName}`);
  });

  socket.on('join_game', ({ roomCode, playerName }) => {
    roomCode = (roomCode || '').toUpperCase();
    const engine = games.get(roomCode);
    if (!engine) {
      socket.emit('error_msg', 'Game not found');
      return;
    }
    if (engine.players.size >= 2) {
      socket.emit('error_msg', 'Game is full');
      return;
    }
    engine.addPlayer(socket.id, playerName || 'Player 2');
    playerToGame.set(socket.id, roomCode);
    socket.join(roomCode);
    socket.emit('game_joined', { roomCode, playerId: socket.id });

    if (engine.players.size === 2) {
      engine.startGame();
      // Notify both players the game is starting
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

  socket.on('disconnect', () => {
    const roomCode = playerToGame.get(socket.id);
    if (roomCode) {
      const engine = games.get(roomCode);
      if (engine) {
        engine.removePlayer(socket.id);
        io.to(roomCode).emit('player_left', socket.id);
        if (engine.players.size === 0) {
          games.delete(roomCode);
        }
      }
      playerToGame.delete(socket.id);
    }
    console.log(`Player disconnected: ${socket.id}`);
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
  console.log(`\n=== 金铲铲 Auto-Battler ===`);
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser\n`);
});
