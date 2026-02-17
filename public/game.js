const socket = io();

let gameState = null;
let selectedBenchIndex = null;
let selectedBoardCell = null;
let myRoomCode = null;

// ===== LOBBY =====
function createGame() {
  const name = document.getElementById('playerName').value.trim() || 'Player 1';
  socket.emit('create_game', name);
}

function joinGame() {
  const name = document.getElementById('playerName').value.trim() || 'Player 2';
  const roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!roomCode || roomCode.length < 4) {
    showError('Enter a valid 4-letter room code');
    return;
  }
  socket.emit('join_game', { roomCode, playerName: name });
}

function copyRoomCode() {
  if (!myRoomCode) return;
  const fullText = window.location.href.split('?')[0] + ' - Room Code: ' + myRoomCode;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(fullText).then(() => {
      const fb = document.getElementById('copyFeedback');
      fb.style.display = 'block';
      fb.textContent = 'Copied to clipboard!';
      setTimeout(() => { fb.style.display = 'none'; }, 2000);
    });
  } else {
    prompt('Copy this and send to your friend:', fullText);
  }
}

// When game is created, show waiting room with room code (stay on lobby screen!)
socket.on('game_created', ({ roomCode, playerId }) => {
  myRoomCode = roomCode;
  document.getElementById('lobbyMenu').style.display = 'none';
  document.getElementById('waitingRoom').style.display = 'block';
  document.getElementById('roomCodeDisplay').textContent = roomCode;
  document.getElementById('roomCodeReminder').textContent = roomCode;
  document.getElementById('gameLink').textContent = window.location.href.split('?')[0];
});

// When joined a game, show a brief message (game_state will trigger transition)
socket.on('game_joined', () => {
  // Transition happens when game_started + game_state arrives
});

// Game started signal: now we know it's time to switch to game screen
socket.on('game_started', () => {
  // Transition will happen when game_state arrives right after this
});

// ===== GAME STATE =====
socket.on('game_state', (state) => {
  // Only switch to game screen if the game has actually started (round > 0)
  if (state.phase === 'waiting' || state.round === 0) {
    // Game hasn't started yet, stay on lobby
    return;
  }

  gameState = state;

  // Switch to game screen
  document.getElementById('lobby').classList.remove('active');
  document.getElementById('lobby').style.display = 'none';
  const gameEl = document.getElementById('game');
  gameEl.classList.add('active');
  gameEl.style.display = 'flex';

  renderGame();
});

socket.on('phase_change', ({ phase, round, timer }) => {
  if (gameState) {
    gameState.phase = phase;
    gameState.round = round;
    gameState.timer = timer;
    renderTopBar();
  }
});

socket.on('timer_update', (t) => {
  if (gameState) {
    gameState.timer = t;
    const el = document.getElementById('timerDisplay');
    el.textContent = t + 's';
    el.style.color = t <= 5 ? '#ef4444' : '';
  }
});

socket.on('battle_start', (log) => {
  showBattle(log);
});

socket.on('game_over', (result) => {
  const overlay = document.getElementById('gameOverOverlay');
  overlay.style.display = 'flex';
  const isWinner = result.winner === gameState.playerId;
  document.getElementById('gameOverTitle').textContent = isWinner ? '🏆 Victory!' : '💀 Defeat';
  document.getElementById('gameOverTitle').className = isWinner ? 'victory' : 'defeat';
  document.getElementById('gameOverMsg').textContent = isWinner
    ? `You defeated ${result.loserName}!`
    : `${result.winnerName} won the battle.`;
});

socket.on('error_msg', (msg) => {
  showError(msg);
});

socket.on('player_left', () => {
  showError('Opponent disconnected');
});

// ===== RENDER =====
function renderGame() {
  if (!gameState) return;
  renderTopBar();
  renderTraits();
  renderOpponentBoard();
  renderPlayerBoard();
  renderBench();
  renderShop();
}

function renderTopBar() {
  const p = gameState.player;
  const o = gameState.opponent;

  document.getElementById('myName').textContent = p.name;
  document.getElementById('myHp').textContent = p.hp;
  document.getElementById('roundDisplay').textContent = `Round ${gameState.round}`;

  const phaseEl = document.getElementById('phaseDisplay');
  if (gameState.phase === 'preparation') {
    phaseEl.textContent = '🛠 Prep';
    phaseEl.style.borderColor = 'var(--gold-dark)';
  } else {
    phaseEl.textContent = '⚔️ Battle';
    phaseEl.style.borderColor = 'var(--red)';
  }

  document.getElementById('timerDisplay').textContent = gameState.timer + 's';
  document.getElementById('goldDisplay').textContent = p.gold;
  document.getElementById('levelDisplay').textContent = p.level;
  document.getElementById('xpDisplay').textContent = `${p.xp}/${p.xpToLevel}`;
  document.getElementById('unitCount').textContent = `${p.boardCount}/${p.maxUnits}`;

  if (p.streak > 0) {
    document.getElementById('streakDisplay').textContent = `🔥${p.streak}W`;
    document.getElementById('streakDisplay').style.color = '#4ade80';
  } else if (p.streak < 0) {
    document.getElementById('streakDisplay').textContent = `💀${Math.abs(p.streak)}L`;
    document.getElementById('streakDisplay').style.color = '#ef4444';
  } else {
    document.getElementById('streakDisplay').textContent = '';
  }

  if (o) {
    document.getElementById('oppName').textContent = o.name;
    document.getElementById('oppHp').textContent = o.hp;
  }

  const hpEl = document.getElementById('myHp');
  hpEl.parentElement.style.color = p.hp > 50 ? '#4ade80' : p.hp > 25 ? '#fbbf24' : '#ef4444';
}

function renderTraits() {
  const bar = document.getElementById('traitsBar');
  const traits = gameState.player.activeTraits || [];
  bar.innerHTML = traits.map(t =>
    `<div class="trait-badge active">${t.icon} ${t.name} ${t.count}/${t.threshold}</div>`
  ).join('');
}

function renderOpponentBoard() {
  const container = document.getElementById('opponentBoard');
  const o = gameState.opponent;
  if (!o || !o.board) {
    container.innerHTML = '';
    return;
  }

  let html = '';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      const unit = o.board[r][c];
      if (unit) {
        const stars = '⭐'.repeat(unit.stars);
        html += `<div class="board-cell has-unit cost-${unit.cost}">
          ${unit.emoji}
          <span class="unit-stars">${stars}</span>
        </div>`;
      } else {
        html += `<div class="board-cell"></div>`;
      }
    }
  }
  container.innerHTML = html;
}

function renderPlayerBoard() {
  const container = document.getElementById('playerBoard');
  const board = gameState.player.board;

  let html = '';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      const unit = board[r][c];
      const isSelected = selectedBoardCell && selectedBoardCell.row === r && selectedBoardCell.col === c;

      if (unit) {
        const stars = '⭐'.repeat(unit.stars);
        html += `<div class="board-cell has-unit cost-${unit.cost} ${isSelected ? 'selected' : ''}"
          onclick="onBoardCellClick(${r}, ${c})" data-row="${r}" data-col="${c}">
          ${unit.emoji}
          <span class="unit-stars">${stars}</span>
        </div>`;
      } else {
        html += `<div class="board-cell ${isSelected ? 'selected' : ''}"
          onclick="onBoardCellClick(${r}, ${c})" data-row="${r}" data-col="${c}"></div>`;
      }
    }
  }
  container.innerHTML = html;
}

function renderBench() {
  const container = document.getElementById('benchContainer');
  const bench = gameState.player.bench;

  let html = '';
  for (let i = 0; i < 9; i++) {
    const unit = bench[i];
    const isSelected = selectedBenchIndex === i;

    if (unit) {
      const stars = '⭐'.repeat(unit.stars);
      html += `<div class="bench-slot has-unit cost-${unit.cost} ${isSelected ? 'selected' : ''}"
        onclick="onBenchClick(${i})">
        ${unit.emoji}
        <span class="unit-stars">${stars}</span>
        <span class="bench-name">${unit.name}</span>
      </div>`;
    } else {
      html += `<div class="bench-slot" onclick="onBenchClick(${i})"></div>`;
    }
  }
  container.innerHTML = html;
}

function renderShop() {
  const container = document.getElementById('shopCards');
  const shop = gameState.player.shop;

  let html = '';
  for (let i = 0; i < 5; i++) {
    const champ = shop[i];
    if (champ) {
      const traitText = champ.traits.join(' ');
      html += `<div class="shop-card cost-${champ.cost}" onclick="buyChampion(${i})">
        <div class="emoji">${champ.emoji}</div>
        <div class="name">${champ.name}</div>
        <div class="cost">💰${champ.cost}</div>
        <div class="traits">${traitText}</div>
      </div>`;
    } else {
      html += `<div class="shop-card empty"><div class="emoji">-</div></div>`;
    }
  }
  container.innerHTML = html;
}

// ===== INTERACTIONS =====
function onBenchClick(index) {
  const unit = gameState.player.bench[index];

  // If board cell was selected, return it to this bench slot
  if (selectedBoardCell) {
    if (!unit) {
      socket.emit('return_to_bench', {
        boardRow: selectedBoardCell.row,
        boardCol: selectedBoardCell.col,
      });
    }
    selectedBoardCell = null;
    selectedBenchIndex = null;
    renderPlayerBoard();
    renderBench();
    return;
  }

  // Toggle bench selection
  if (selectedBenchIndex === index) {
    // Double-tap = sell
    if (unit) {
      socket.emit('sell_champion', { from: 'bench', index: index });
    }
    selectedBenchIndex = null;
    renderBench();
    return;
  }

  if (unit) {
    selectedBenchIndex = index;
    selectedBoardCell = null;
    renderBench();
    renderPlayerBoard();
  }
}

function onBoardCellClick(row, col) {
  const unit = gameState.player.board[row][col];

  // If a bench unit is selected, place it on the board
  if (selectedBenchIndex !== null) {
    socket.emit('place_champion', {
      benchIndex: selectedBenchIndex,
      boardRow: row,
      boardCol: col,
    });
    selectedBenchIndex = null;
    selectedBoardCell = null;
    return;
  }

  // If a board cell is selected, move/swap
  if (selectedBoardCell) {
    if (selectedBoardCell.row === row && selectedBoardCell.col === col) {
      // Double-tap on board: return to bench
      socket.emit('return_to_bench', { boardRow: row, boardCol: col });
      selectedBoardCell = null;
      return;
    }

    socket.emit('move_champion', {
      fromRow: selectedBoardCell.row,
      fromCol: selectedBoardCell.col,
      toRow: row,
      toCol: col,
    });
    selectedBoardCell = null;
    return;
  }

  // Select board cell with a unit
  if (unit) {
    selectedBoardCell = { row, col };
    selectedBenchIndex = null;
    renderPlayerBoard();
    renderBench();
  }
}

function buyChampion(shopIndex) {
  socket.emit('buy_champion', shopIndex);
}

function refreshShop() {
  socket.emit('refresh_shop');
}

function buyXP() {
  socket.emit('buy_xp');
}

// ===== BATTLE =====
function showBattle(log) {
  const overlay = document.getElementById('battleOverlay');
  const logContainer = document.getElementById('battleLog');
  overlay.style.display = 'flex';
  logContainer.innerHTML = '';

  let i = 0;
  const speed = Math.max(150, Math.min(600, 8000 / (log.length || 1)));

  const interval = setInterval(() => {
    if (i >= log.length) {
      clearInterval(interval);
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 1200);
      return;
    }

    const entry = log[i];
    const div = document.createElement('div');
    div.className = 'log-entry';

    switch (entry.type) {
      case 'attack':
        div.className += ' log-attack';
        div.textContent = `${entry.attacker.emoji} ${entry.attacker.name} → ${entry.target.emoji} ${entry.target.name} -${entry.damage} (${entry.targetHp}hp)`;
        break;
      case 'crit':
        div.className += ' log-crit';
        div.textContent = `💥 CRIT! ${entry.attacker.emoji} ${entry.attacker.name} → ${entry.target.emoji} -${entry.damage}!`;
        break;
      case 'ability':
        div.className += ' log-ability';
        div.textContent = `✨ ${entry.attacker.emoji} ${entry.attacker.ability}! → ${entry.target.emoji} -${entry.damage}`;
        break;
      case 'death':
        div.className += ' log-death';
        div.textContent = `☠️ ${entry.unit.emoji} ${entry.unit.name} defeated!`;
        break;
      case 'move':
        // Skip move logs to keep it readable
        i++;
        return;
    }

    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;
    i++;
  }, speed);
}

// ===== ERROR =====
function showError(msg) {
  const toast = document.getElementById('errorToast');
  toast.textContent = msg;
  toast.style.display = 'block';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.display = 'none';
  }, 2500);
}

// Enter key support
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (document.getElementById('lobby').classList.contains('active')) {
      const code = document.getElementById('roomCodeInput').value.trim();
      if (code) joinGame();
      else createGame();
    }
  }
});
