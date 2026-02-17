const socket = io();

let gameState = null;
let selectedBenchIndex = null;
let selectedBoardCell = null;

// ===== LOBBY =====
function createGame() {
  const name = document.getElementById('playerName').value.trim() || 'Player 1';
  socket.emit('create_game', name);
}

function joinGame() {
  const name = document.getElementById('playerName').value.trim() || 'Player 2';
  const roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!roomCode) {
    showError('Enter a room code');
    return;
  }
  socket.emit('join_game', { roomCode, playerName: name });
}

socket.on('game_created', ({ roomCode }) => {
  document.getElementById('waitingMsg').style.display = 'block';
  document.getElementById('roomCodeDisplay').textContent = roomCode;
  document.getElementById('btnCreate').style.display = 'none';
  document.getElementById('btnJoin').style.display = 'none';
  document.getElementById('roomCodeInput').style.display = 'none';
  document.querySelector('.divider').style.display = 'none';
});

socket.on('game_joined', () => {
  // Will transition when game_state arrives
});

// ===== GAME STATE =====
socket.on('game_state', (state) => {
  gameState = state;

  // Switch to game screen
  document.getElementById('lobby').classList.remove('active');
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
    document.getElementById('timerDisplay').textContent = t + 's';
    if (t <= 5) {
      document.getElementById('timerDisplay').style.color = '#ef4444';
    } else {
      document.getElementById('timerDisplay').style.color = '';
    }
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
  document.getElementById('phaseDisplay').textContent = gameState.phase === 'preparation' ? '🛠 Preparation' : '⚔️ Battle';
  document.getElementById('timerDisplay').textContent = gameState.timer + 's';
  document.getElementById('goldDisplay').textContent = p.gold;
  document.getElementById('levelDisplay').textContent = p.level;
  document.getElementById('xpDisplay').textContent = `${p.xp}/${p.xpToLevel}`;
  document.getElementById('unitCount').textContent = `${p.boardCount}/${p.maxUnits}`;

  if (p.streak > 0) {
    document.getElementById('streakDisplay').textContent = `🔥 ${p.streak}W`;
    document.getElementById('streakDisplay').style.color = '#4ade80';
  } else if (p.streak < 0) {
    document.getElementById('streakDisplay').textContent = `💀 ${Math.abs(p.streak)}L`;
    document.getElementById('streakDisplay').style.color = '#ef4444';
  } else {
    document.getElementById('streakDisplay').textContent = '';
  }

  if (o) {
    document.getElementById('oppName').textContent = o.name;
    document.getElementById('oppHp').textContent = o.hp;
  }

  // HP bar color
  const hpEl = document.getElementById('myHp');
  hpEl.parentElement.style.color = p.hp > 50 ? '#4ade80' : p.hp > 25 ? '#fbbf24' : '#ef4444';
}

function renderTraits() {
  const bar = document.getElementById('traitsBar');
  const traits = gameState.player.activeTraits || [];
  bar.innerHTML = traits.map(t =>
    `<div class="trait-badge active">${t.icon} ${t.name} (${t.count}/${t.threshold})</div>`
  ).join('');
}

function renderOpponentBoard() {
  const container = document.getElementById('opponentBoard');
  const o = gameState.opponent;
  if (!o || !o.board) {
    container.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--text-dim);font-size:0.8rem;">Waiting for opponent...</div>';
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
      const traitText = champ.traits.join(', ');
      html += `<div class="shop-card cost-${champ.cost}" onclick="buyChampion(${i})">
        <div class="emoji">${champ.emoji}</div>
        <div class="name">${champ.name}</div>
        <div class="cost">💰 ${champ.cost}</div>
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

  if (selectedBoardCell) {
    // Board cell was selected, now clicking bench - return board unit if bench slot empty
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

  if (selectedBenchIndex === index) {
    // Deselect
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
      // Deselect
      selectedBoardCell = null;
      renderPlayerBoard();
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
  const interval = setInterval(() => {
    if (i >= log.length) {
      clearInterval(interval);
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 1500);
      return;
    }

    const entry = log[i];
    const div = document.createElement('div');
    div.className = 'log-entry';

    switch (entry.type) {
      case 'attack':
        div.className += ' log-attack';
        div.textContent = `${entry.attacker.emoji} ${entry.attacker.name} hits ${entry.target.emoji} ${entry.target.name} for ${entry.damage} dmg (${entry.targetHp}/${entry.targetMaxHp} HP)`;
        break;
      case 'crit':
        div.className += ' log-crit';
        div.textContent = `💥 ${entry.attacker.emoji} ${entry.attacker.name} CRITS ${entry.target.emoji} ${entry.target.name} for ${entry.damage} dmg!`;
        break;
      case 'ability':
        div.className += ' log-ability';
        div.textContent = `✨ ${entry.attacker.emoji} ${entry.attacker.name} uses ${entry.attacker.ability} on ${entry.target.emoji} ${entry.target.name} for ${entry.damage} dmg`;
        break;
      case 'death':
        div.className += ' log-death';
        div.textContent = `☠️ ${entry.unit.emoji} ${entry.unit.name} has fallen!`;
        break;
      case 'move':
        div.className += ' log-move';
        div.textContent = `→ ${entry.unit.emoji} ${entry.unit.name} moves`;
        break;
    }

    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;
    i++;
  }, 600);
}

// ===== ERROR =====
function showError(msg) {
  const toast = document.getElementById('errorToast');
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => {
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
