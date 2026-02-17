const socket = io({
  transports: ['polling', 'websocket'],
  upgrade: true,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});

let gameState = null;
let selectedBenchIndex = null;
let selectedBoardCell = null;
let myRoomCode = null;
let myPlayerName = null;
let isConnected = false;

// ===== Session 持久化 =====
function saveSession(roomCode, playerName) {
  localStorage.setItem('tft_session', JSON.stringify({ roomCode, playerName, ts: Date.now() }));
}

function loadSession() {
  try {
    const raw = localStorage.getItem('tft_session');
    if (!raw) return null;
    const s = JSON.parse(raw);
    // 过期检查: 10分钟
    if (Date.now() - s.ts > 10 * 60 * 1000) {
      clearSession();
      return null;
    }
    return s;
  } catch { return null; }
}

function clearSession() {
  localStorage.removeItem('tft_session');
}

// ===== 连接状态管理 =====
function updateConnectionStatus(connected, msg) {
  isConnected = connected;
  const el = document.getElementById('connectionStatus');
  if (!el) return;
  if (connected) {
    el.textContent = '🟢 已连接';
    el.className = 'connection-status connected';
  } else {
    el.textContent = '🔴 ' + (msg || '连接中...');
    el.className = 'connection-status disconnected';
  }
  const btns = document.querySelectorAll('#btnCreate, #btnJoin');
  btns.forEach(b => { b.disabled = !connected; b.style.opacity = connected ? '1' : '0.5'; });
}

socket.on('connect', () => {
  console.log('[Socket] Connected:', socket.id);
  updateConnectionStatus(true);
  // 尝试自动重连到已有的游戏
  tryAutoRejoin();
});

socket.on('disconnect', (reason) => {
  console.log('[Socket] Disconnected:', reason);
  updateConnectionStatus(false, '已断开，重连中...');
});

socket.on('connect_error', (err) => {
  console.log('[Socket] Connection error:', err.message);
  updateConnectionStatus(false, '连接失败，重试中...');
});

socket.on('reconnect_attempt', (n) => {
  updateConnectionStatus(false, `重连中 (${n})...`);
});

// ===== 自动重连逻辑 =====
function tryAutoRejoin() {
  const session = loadSession();
  if (!session) return;

  console.log('[Rejoin] 尝试自动重连:', session.roomCode, session.playerName);

  // 先检查房间是否还在
  fetch('/api/room/' + session.roomCode)
    .then(r => r.json())
    .then(data => {
      if (!data.exists) {
        console.log('[Rejoin] 房间已不存在，清除session');
        clearSession();
        showRejoinBar(null);
        return;
      }
      // 检查该玩家名是否在房间里
      const mySlot = data.slots.find(s => s.name === session.playerName);
      if (!mySlot) {
        console.log('[Rejoin] 房间里没有该玩家名，清除session');
        clearSession();
        showRejoinBar(null);
        return;
      }
      // 房间存在且有该玩家，显示重连提示 或 自动重连
      if (data.round > 0) {
        // 游戏已开始，直接重连
        socket.emit('rejoin_game', { roomCode: session.roomCode, playerName: session.playerName });
      } else {
        // 游戏还没开始（等待中），显示提示
        showRejoinBar(session);
      }
    })
    .catch(err => {
      console.log('[Rejoin] API检查失败:', err);
    });
}

function showRejoinBar(session) {
  const bar = document.getElementById('rejoinBar');
  if (!bar) return;
  if (!session) {
    bar.style.display = 'none';
    return;
  }
  bar.style.display = 'block';
  document.getElementById('rejoinRoomCode').textContent = session.roomCode;
  document.getElementById('rejoinName').textContent = session.playerName;
}

function doRejoin() {
  const session = loadSession();
  if (!session || !isConnected) return;
  socket.emit('rejoin_game', { roomCode: session.roomCode, playerName: session.playerName });
}

function dismissRejoin() {
  clearSession();
  const bar = document.getElementById('rejoinBar');
  if (bar) bar.style.display = 'none';
}

// === 重连结果 ===
socket.on('rejoin_success', ({ roomCode }) => {
  console.log('[Rejoin] 重连成功:', roomCode);
  myRoomCode = roomCode;
  const session = loadSession();
  if (session) myPlayerName = session.playerName;
  saveSession(roomCode, myPlayerName);
  const bar = document.getElementById('rejoinBar');
  if (bar) bar.style.display = 'none';
});

socket.on('rejoin_failed', (msg) => {
  console.log('[Rejoin] 重连失败:', msg);
  clearSession();
  showRejoinBar(null);
  showError(msg);
});

// ===== 大厅 =====
function createGame() {
  if (!isConnected) { showError('未连接到服务器，请等待...'); return; }
  const name = document.getElementById('playerName').value.trim() || '玩家1';
  myPlayerName = name;
  socket.emit('create_game', name);
}

function joinGame() {
  if (!isConnected) { showError('未连接到服务器，请等待...'); return; }
  const name = document.getElementById('playerName').value.trim() || '玩家2';
  const roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!roomCode || roomCode.length < 4) { showError('请输入4位房间号'); return; }
  myPlayerName = name;
  const btn = document.getElementById('btnJoin');
  btn.textContent = '⏳ 加入中...';
  btn.disabled = true;
  socket.emit('join_game', { roomCode, playerName: name });
  setTimeout(() => {
    if (document.getElementById('lobby').classList.contains('active')) {
      btn.textContent = '🤝 加入房间';
      btn.disabled = false;
    }
  }, 5000);
}

function leaveGame() {
  socket.emit('leave_game');
  clearSession();
  location.reload();
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
    }).catch(() => { prompt('复制以下内容发给好友：', fullText); });
  } else {
    prompt('复制以下内容发给好友：', fullText);
  }
}

// === 创建/加入 回调 ===
socket.on('game_created', ({ roomCode, playerId }) => {
  myRoomCode = roomCode;
  saveSession(roomCode, myPlayerName);
  document.getElementById('lobbyMenu').style.display = 'none';
  document.getElementById('waitingRoom').style.display = 'block';
  document.getElementById('roomCodeDisplay').textContent = roomCode;
  document.getElementById('roomCodeReminder').textContent = roomCode;
  document.getElementById('gameLink').textContent = window.location.href.split('?')[0];
  const bar = document.getElementById('rejoinBar');
  if (bar) bar.style.display = 'none';
});

socket.on('game_joined', ({ roomCode }) => {
  myRoomCode = roomCode;
  saveSession(roomCode, myPlayerName);
});

socket.on('game_started', () => {
  console.log('[Game] 游戏开始!');
});

// ===== 游戏状态 =====
socket.on('game_state', (state) => {
  console.log('[Game] game_state: round=' + state.round + ' phase=' + state.phase);

  if (state.phase === 'waiting' || state.round === 0) return;

  gameState = state;
  myRoomCode = state.roomCode;
  // 更新session
  if (state.player && state.player.name) {
    myPlayerName = state.player.name;
    saveSession(state.roomCode, state.player.name);
  }

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

socket.on('battle_start', (log) => { showBattle(log); });

socket.on('game_over', (result) => {
  clearSession(); // 游戏结束清除session
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
  const btn = document.getElementById('btnJoin');
  if (btn) { btn.textContent = '🤝 加入房间'; btn.disabled = false; }
});

socket.on('player_left', () => { showError('对手已离开游戏'); });
socket.on('player_disconnected', () => { showError('对手已断线，等待重连...'); });

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
    phaseEl.textContent = '🛠 备战中'; phaseEl.style.borderColor = 'var(--gold-dark)';
  } else {
    phaseEl.textContent = '⚔️ 战斗中'; phaseEl.style.borderColor = 'var(--red)';
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
  if (!o || !o.board) { container.innerHTML = ''; return; }
  let html = '';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 7; c++) {
      const unit = o.board[r][c];
      if (unit) {
        html += `<div class="board-cell has-unit cost-${unit.cost}">${unit.emoji}<span class="unit-stars">${'⭐'.repeat(unit.stars)}</span></div>`;
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
      const sel = selectedBoardCell && selectedBoardCell.row === r && selectedBoardCell.col === c;
      if (unit) {
        html += `<div class="board-cell has-unit cost-${unit.cost} ${sel?'selected':''}" onclick="onBoardCellClick(${r},${c})">${unit.emoji}<span class="unit-stars">${'⭐'.repeat(unit.stars)}</span></div>`;
      } else {
        html += `<div class="board-cell ${sel?'selected':''}" onclick="onBoardCellClick(${r},${c})"></div>`;
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
    const sel = selectedBenchIndex === i;
    if (unit) {
      html += `<div class="bench-slot has-unit cost-${unit.cost} ${sel?'selected':''}" onclick="onBenchClick(${i})">${unit.emoji}<span class="unit-stars">${'⭐'.repeat(unit.stars)}</span><span class="bench-name">${unit.name}</span></div>`;
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
    const ch = shop[i];
    if (ch) {
      html += `<div class="shop-card cost-${ch.cost}" onclick="buyChampion(${i})"><div class="emoji">${ch.emoji}</div><div class="name">${ch.name}</div><div class="cost">💰${ch.cost}</div><div class="traits">${ch.traits.join(' ')}</div></div>`;
    } else {
      html += `<div class="shop-card empty"><div class="emoji">-</div></div>`;
    }
  }
  container.innerHTML = html;
}

// ===== 交互操作 =====
function onBenchClick(index) {
  const unit = gameState.player.bench[index];
  if (selectedBoardCell) {
    if (!unit) socket.emit('return_to_bench', { boardRow: selectedBoardCell.row, boardCol: selectedBoardCell.col });
    selectedBoardCell = null; selectedBenchIndex = null;
    renderPlayerBoard(); renderBench(); return;
  }
  if (selectedBenchIndex === index) {
    if (unit) socket.emit('sell_champion', { from: 'bench', index });
    selectedBenchIndex = null; renderBench(); return;
  }
  if (unit) { selectedBenchIndex = index; selectedBoardCell = null; renderBench(); renderPlayerBoard(); }
}

function onBoardCellClick(row, col) {
  const unit = gameState.player.board[row][col];
  if (selectedBenchIndex !== null) {
    socket.emit('place_champion', { benchIndex: selectedBenchIndex, boardRow: row, boardCol: col });
    selectedBenchIndex = null; selectedBoardCell = null; return;
  }
  if (selectedBoardCell) {
    if (selectedBoardCell.row === row && selectedBoardCell.col === col) {
      socket.emit('return_to_bench', { boardRow: row, boardCol: col });
      selectedBoardCell = null; return;
    }
    socket.emit('move_champion', { fromRow: selectedBoardCell.row, fromCol: selectedBoardCell.col, toRow: row, toCol: col });
    selectedBoardCell = null; return;
  }
  if (unit) { selectedBoardCell = { row, col }; selectedBenchIndex = null; renderPlayerBoard(); renderBench(); }
}

function buyChampion(i) { socket.emit('buy_champion', i); }
function refreshShop() { socket.emit('refresh_shop'); }
function buyXP() { socket.emit('buy_xp'); }

// ===== 战斗 =====
function showBattle(log) {
  const overlay = document.getElementById('battleOverlay');
  const logContainer = document.getElementById('battleLog');
  overlay.style.display = 'flex'; logContainer.innerHTML = '';
  let i = 0;
  const speed = Math.max(150, Math.min(600, 8000 / (log.length || 1)));
  const interval = setInterval(() => {
    if (i >= log.length) { clearInterval(interval); setTimeout(() => { overlay.style.display = 'none'; }, 1200); return; }
    const e = log[i]; const div = document.createElement('div'); div.className = 'log-entry';
    switch (e.type) {
      case 'attack': div.className += ' log-attack'; div.textContent = `${e.attacker.emoji} ${e.attacker.name} → ${e.target.emoji} ${e.target.name} -${e.damage} (剩${e.targetHp}血)`; break;
      case 'crit': div.className += ' log-crit'; div.textContent = `💥 暴击！${e.attacker.emoji} ${e.attacker.name} → ${e.target.emoji} -${e.damage}！`; break;
      case 'ability': div.className += ' log-ability'; div.textContent = `✨ ${e.attacker.emoji} 释放【${e.attacker.ability}】→ ${e.target.emoji} -${e.damage}`; break;
      case 'death': div.className += ' log-death'; div.textContent = `☠️ ${e.unit.emoji} ${e.unit.name} 阵亡！`; break;
      case 'move': i++; return;
    }
    logContainer.appendChild(div); logContainer.scrollTop = logContainer.scrollHeight; i++;
  }, speed);
}

function showError(msg) {
  const toast = document.getElementById('errorToast');
  toast.textContent = msg; toast.style.display = 'block';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('lobby').classList.contains('active')) {
    const code = document.getElementById('roomCodeInput').value.trim();
    if (code) joinGame(); else createGame();
  }
});
