const socket = io();

let gameState = null;
let selectedBenchIndex = null;
let selectedBoardCell = null;
let myRoomCode = null;

// ===== 大厅 =====
function createGame() {
  const name = document.getElementById('playerName').value.trim() || '玩家1';
  socket.emit('create_game', name);
}

function joinGame() {
  const name = document.getElementById('playerName').value.trim() || '玩家2';
  const roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!roomCode || roomCode.length < 4) {
    showError('请输入4位房间号');
    return;
  }
  socket.emit('join_game', { roomCode, playerName: name });
}

function copyRoomCode() {
  if (!myRoomCode) return;
  const fullText = '金铲铲之战 - 房间号: ' + myRoomCode + ' 链接: ' + window.location.href.split('?')[0];
  if (navigator.clipboard) {
    navigator.clipboard.writeText(fullText).then(() => {
      const fb = document.getElementById('copyFeedback');
      fb.style.display = 'block';
      fb.textContent = '已复制到剪贴板！';
      setTimeout(() => { fb.style.display = 'none'; }, 2000);
    });
  } else {
    prompt('复制以下内容发给好友：', fullText);
  }
}

// 创建房间后，显示等待界面（留在大厅页面）
socket.on('game_created', ({ roomCode, playerId }) => {
  myRoomCode = roomCode;
  document.getElementById('lobbyMenu').style.display = 'none';
  document.getElementById('waitingRoom').style.display = 'block';
  document.getElementById('roomCodeDisplay').textContent = roomCode;
  document.getElementById('roomCodeReminder').textContent = roomCode;
  document.getElementById('gameLink').textContent = window.location.href.split('?')[0];
});

socket.on('game_joined', () => {
  // 等 game_state 到来后自动跳转
});

socket.on('game_started', () => {
  // game_state 紧随其后
});

// ===== 游戏状态 =====
socket.on('game_state', (state) => {
  // 只有游戏真正开始（回合>0）才切换到游戏界面
  if (state.phase === 'waiting' || state.round === 0) {
    return;
  }

  gameState = state;

  // 切换到游戏界面
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
    el.textContent = t + '秒';
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
  document.getElementById('gameOverTitle').textContent = isWinner ? '🏆 大吉大利！' : '💀 落败了...';
  document.getElementById('gameOverTitle').className = isWinner ? 'victory' : 'defeat';
  document.getElementById('gameOverMsg').textContent = isWinner
    ? `你击败了 ${result.loserName}！`
    : `${result.winnerName} 获得了胜利`;
});

socket.on('error_msg', (msg) => {
  showError(msg);
});

socket.on('player_left', () => {
  showError('对手已断开连接');
});

// ===== 渲染 =====
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
  document.getElementById('roundDisplay').textContent = `第${gameState.round}回合`;

  const phaseEl = document.getElementById('phaseDisplay');
  if (gameState.phase === 'preparation') {
    phaseEl.textContent = '🛠 备战中';
    phaseEl.style.borderColor = 'var(--gold-dark)';
  } else {
    phaseEl.textContent = '⚔️ 战斗中';
    phaseEl.style.borderColor = 'var(--red)';
  }

  document.getElementById('timerDisplay').textContent = gameState.timer + '秒';
  document.getElementById('goldDisplay').textContent = p.gold;
  document.getElementById('levelDisplay').textContent = p.level;
  document.getElementById('xpDisplay').textContent = `${p.xp}/${p.xpToLevel}`;
  document.getElementById('unitCount').textContent = `${p.boardCount}/${p.maxUnits}`;

  if (p.streak > 0) {
    document.getElementById('streakDisplay').textContent = `🔥${p.streak}连胜`;
    document.getElementById('streakDisplay').style.color = '#4ade80';
  } else if (p.streak < 0) {
    document.getElementById('streakDisplay').textContent = `💀${Math.abs(p.streak)}连败`;
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

// ===== 交互操作 =====
function onBenchClick(index) {
  const unit = gameState.player.bench[index];

  // 如果棋盘格子被选中了，点击备战席空位 = 把棋盘棋子移回备战席
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

  // 双击 = 出售
  if (selectedBenchIndex === index) {
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

  // 备战席棋子已选中 -> 放到棋盘
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

  // 棋盘格子已选中 -> 移动/交换
  if (selectedBoardCell) {
    if (selectedBoardCell.row === row && selectedBoardCell.col === col) {
      // 双击棋盘棋子 = 移回备战席
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

  // 选中棋盘上的棋子
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

// ===== 战斗 =====
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
        div.textContent = `${entry.attacker.emoji} ${entry.attacker.name} → ${entry.target.emoji} ${entry.target.name} -${entry.damage} (剩${entry.targetHp}血)`;
        break;
      case 'crit':
        div.className += ' log-crit';
        div.textContent = `💥 暴击！${entry.attacker.emoji} ${entry.attacker.name} → ${entry.target.emoji} -${entry.damage}！`;
        break;
      case 'ability':
        div.className += ' log-ability';
        div.textContent = `✨ ${entry.attacker.emoji} 释放【${entry.attacker.ability}】→ ${entry.target.emoji} -${entry.damage}`;
        break;
      case 'death':
        div.className += ' log-death';
        div.textContent = `☠️ ${entry.unit.emoji} ${entry.unit.name} 阵亡！`;
        break;
      case 'move':
        i++;
        return;
    }

    logContainer.appendChild(div);
    logContainer.scrollTop = logContainer.scrollHeight;
    i++;
  }, speed);
}

// ===== 错误提示 =====
function showError(msg) {
  const toast = document.getElementById('errorToast');
  toast.textContent = msg;
  toast.style.display = 'block';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.display = 'none';
  }, 2500);
}

// 回车键支持
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (document.getElementById('lobby').classList.contains('active')) {
      const code = document.getElementById('roomCodeInput').value.trim();
      if (code) joinGame();
      else createGame();
    }
  }
});
