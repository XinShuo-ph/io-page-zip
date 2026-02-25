// ===== P2P Game Client using PeerJS =====
let peer = null;
let conn = null;
let isHost = false;
let engine = null;
let gameState = null;
let selectedBenchIndex = null;
let selectedBoardCell = null;
let myRoomCode = null;
let myPlayerName = null;
let myPlayerId = 'host';
let longPressTimer = null;
let phaseInterval = null;

const PEER_PREFIX = 'jcc-tft-';
const PEER_CONFIG = { debug: 1, serialization: 'json' };

const TRAIT_NAMES = {
  warrior:'⚔️ 战士', mage:'🔮 法师', ranger:'🏹 游侠', tank:'🛡️ 重装',
  assassin:'🗡️ 刺客', mystic:'✨ 秘术', dragon:'🐉 龙族', demon:'👹 恶魔',
};
const TRAIT_DESC = {
  warrior:'2个:攻击+15 / 3个:攻击+30', mage:'2个:法术+30 / 3个:法术+60',
  ranger:'2个:攻速+30% / 3个:攻速+60%', tank:'2个:护甲+30 / 3个:护甲+60',
  assassin:'2个:暴击率+30% / 3个:暴击率+60%', mystic:'2个:魔抗+30 / 3个:魔抗+60',
  dragon:'2个:攻击+20, 生命+200', demon:'2个:法术+20, 攻击+10',
};

// ===== 连接状态 =====
function updateConnectionStatus(connected, msg) {
  const el = document.getElementById('connectionStatus');
  if (!el) return;
  if (connected) {
    el.textContent = '🟢 ' + (msg || '就绪');
    el.className = 'connection-status connected';
  } else {
    el.textContent = '🔴 ' + (msg || '连接中...');
    el.className = 'connection-status disconnected';
  }
}

// ===== 发送消息 =====
function sendToRemote(type, data) {
  try {
    if (conn && conn.open) {
      conn.send({ type, data });
    }
  } catch (e) {
    console.error('[P2P] Send error:', e);
  }
}

// Host: send game state to guest
function hostSendState() {
  if (!engine || !isHost) return;
  const guestState = engine.getStateForPlayer('guest');
  if (guestState) sendToRemote('game_state', guestState);
  const hostState = engine.getStateForPlayer('host');
  if (hostState) {
    gameState = hostState;
    showGameScreen();
    renderGame();
  }
}

function hostSendPhase() {
  if (!engine) return;
  sendToRemote('phase_change', { phase: engine.phase, round: engine.round, timer: engine.phaseTimer });
}

// ===== 创建房间 (Host) =====
function createGame() {
  const name = document.getElementById('playerName').value.trim() || '玩家1';
  myPlayerName = name;
  isHost = true;
  myPlayerId = 'host';

  const code = generateRoomCode();
  myRoomCode = code;

  updateConnectionStatus(false, '正在创建房间...');

  peer = new Peer(PEER_PREFIX + code, PEER_CONFIG);

  peer.on('open', (id) => {
    console.log('[Host] Peer opened:', id);
    updateConnectionStatus(true, '房间已创建，等待对手');
    document.getElementById('lobbyMenu').style.display = 'none';
    document.getElementById('waitingRoom').style.display = 'block';
    document.getElementById('roomCodeDisplay').textContent = code;
    document.getElementById('roomCodeReminder').textContent = code;
    document.getElementById('gameLink').textContent = getRoomLink(code);
    saveSession(code, name, 'host');
  });

  peer.on('connection', (dataConn) => {
    console.log('[Host] Guest incoming connection');
    conn = dataConn;
    setupHostConnection(dataConn);
  });

  peer.on('error', (err) => {
    console.error('[Host] Peer error:', err.type, err);
    if (err.type === 'unavailable-id') {
      showError('房间号已被占用，请重试');
      setTimeout(() => location.reload(), 2000);
    } else {
      updateConnectionStatus(false, '连接错误: ' + err.type);
      showError('创建房间失败: ' + err.type);
    }
  });

  peer.on('disconnected', () => {
    console.log('[Host] Peer disconnected from signaling server, reconnecting...');
    if (peer && !peer.destroyed) peer.reconnect();
  });
}

function setupHostConnection(dataConn) {
  dataConn.on('open', () => {
    console.log('[Host] DataChannel open with guest');
    updateConnectionStatus(true, '对手已连接');

    engine = new GameEngine(myRoomCode);
    engine.addPlayer('host', myPlayerName);
    engine.addPlayer('guest', dataConn.metadata?.name || '玩家2');
    engine.startGame();

    sendToRemote('game_started', {});
    hostSendState();
    hostSendPhase();
    startPhaseTimer();
  });

  dataConn.on('data', (msg) => {
    console.log('[Host] Received:', msg?.type);
    handleMessage(msg.type, msg.data);
  });

  dataConn.on('close', () => {
    console.log('[Host] Guest disconnected');
    updateConnectionStatus(false, '对手已断线');
    showError('对手已断开连接');
    stopPhaseTimer();
  });

  dataConn.on('error', (err) => {
    console.error('[Host] DataChannel error:', err);
  });
}

// ===== 加入房间 (Guest) =====
function joinGame() {
  const name = document.getElementById('playerName').value.trim() || '玩家2';
  const roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!roomCode || roomCode.length < 4) { showError('请输入4位房间号'); return; }

  myPlayerName = name;
  isHost = false;
  myPlayerId = 'guest';
  myRoomCode = roomCode;

  const btn = document.getElementById('btnJoin');
  btn.textContent = '⏳ 加入中...';
  btn.disabled = true;

  updateConnectionStatus(false, '正在连接到房间...');

  peer = new Peer(undefined, PEER_CONFIG);

  peer.on('open', () => {
    console.log('[Guest] Peer opened:', peer.id);
    console.log('[Guest] Connecting to host:', PEER_PREFIX + roomCode);

    conn = peer.connect(PEER_PREFIX + roomCode, {
      metadata: { name },
      serialization: 'json',
    });

    setupGuestConnection(conn, btn);
  });

  peer.on('error', (err) => {
    console.error('[Guest] Peer error:', err.type, err);
    if (err.type === 'peer-unavailable') {
      showError('房间不存在或已关闭');
    } else {
      showError('连接失败: ' + err.type);
    }
    updateConnectionStatus(false, '连接失败');
    btn.textContent = '🤝 加入房间';
    btn.disabled = false;
  });
}

function setupGuestConnection(dataConn, btn) {
  dataConn.on('open', () => {
    console.log('[Guest] DataChannel open with host');
    updateConnectionStatus(true, '已连接');
    saveSession(myRoomCode, myPlayerName, 'guest');
  });

  dataConn.on('data', (msg) => {
    console.log('[Guest] Received:', msg?.type);
    handleMessage(msg.type, msg.data);
  });

  dataConn.on('close', () => {
    console.log('[Guest] Host disconnected');
    updateConnectionStatus(false, '房主已断线');
    showError('房主已断开连接');
  });

  dataConn.on('error', (err) => {
    console.error('[Guest] DataChannel error:', err);
    showError('连接出错: ' + err.message);
    if (btn) { btn.textContent = '🤝 加入房间'; btn.disabled = false; }
  });

  // Timeout for connection
  setTimeout(() => {
    if (!conn || !conn.open) {
      showError('连接超时，房间可能不存在');
      updateConnectionStatus(false, '连接超时');
      if (btn) { btn.textContent = '🤝 加入房间'; btn.disabled = false; }
    }
  }, 10000);
}

// ===== 消息处理 =====
function handleMessage(type, data) {
  switch (type) {
    case 'game_started':
      console.log('[Game] 游戏开始!');
      break;
    case 'game_state':
      if (data.phase === 'waiting' || data.round === 0) return;
      gameState = data;
      myRoomCode = data.roomCode;
      showGameScreen();
      renderGame();
      break;
    case 'phase_change':
      if (gameState) {
        gameState.phase = data.phase;
        gameState.round = data.round;
        gameState.timer = data.timer;
        renderTopBar();
      }
      break;
    case 'timer_update':
      if (gameState) {
        gameState.timer = data;
        const el = document.getElementById('timerDisplay');
        el.textContent = data + '秒';
        el.style.color = data <= 5 ? '#ef4444' : '';
      }
      break;
    case 'battle_start':
      showBattle(data);
      break;
    case 'error_msg':
      showError(data);
      break;
    case 'game_over':
      clearSession();
      stopPhaseTimer();
      const overlay = document.getElementById('gameOverOverlay');
      overlay.style.display = 'flex';
      const isWinner = data.winner === myPlayerId;
      document.getElementById('gameOverTitle').textContent = isWinner ? '🏆 大吉大利！' : '💀 落败了...';
      document.getElementById('gameOverTitle').className = isWinner ? 'victory' : 'defeat';
      document.getElementById('gameOverMsg').textContent = isWinner
        ? `你击败了 ${data.loserName}！` : `${data.winnerName} 获得了胜利`;
      break;
    // Guest -> Host: game actions
    case 'buy_champion': hostAction(() => engine.buyChampion('guest', data)); break;
    case 'sell_champion': hostAction(() => engine.sellChampion('guest', data.from, data.index)); break;
    case 'place_champion': hostAction(() => engine.placeChampion('guest', data.benchIndex, data.boardRow, data.boardCol)); break;
    case 'move_champion': hostAction(() => engine.moveChampion('guest', data.fromRow, data.fromCol, data.toRow, data.toCol)); break;
    case 'return_to_bench': hostAction(() => engine.returnToBench('guest', data.boardRow, data.boardCol)); break;
    case 'refresh_shop': hostAction(() => engine.refreshShop('guest')); break;
    case 'buy_xp': hostAction(() => engine.buyXP('guest')); break;
  }
}

function hostAction(fn) {
  if (!isHost || !engine) return;
  const result = fn();
  if (result && !result.success) {
    sendToRemote('error_msg', result.message);
  }
  hostSendState();
}

// ===== 游戏操作 (统一入口) =====
function emitAction(type, data) {
  if (isHost) {
    let result;
    switch (type) {
      case 'buy_champion': result = engine.buyChampion('host', data); break;
      case 'sell_champion': result = engine.sellChampion('host', data.from, data.index); break;
      case 'place_champion': result = engine.placeChampion('host', data.benchIndex, data.boardRow, data.boardCol); break;
      case 'move_champion': result = engine.moveChampion('host', data.fromRow, data.fromCol, data.toRow, data.toCol); break;
      case 'return_to_bench': result = engine.returnToBench('host', data.boardRow, data.boardCol); break;
      case 'refresh_shop': result = engine.refreshShop('host'); break;
      case 'buy_xp': result = engine.buyXP('host'); break;
    }
    if (result && !result.success) showError(result.message);
    hostSendState();
  } else {
    sendToRemote(type, data);
  }
}

// ===== 备战阶段计时器 (Host only) =====
function startPhaseTimer() {
  if (!isHost) return;
  stopPhaseTimer();
  phaseInterval = setInterval(() => {
    if (!engine || engine.phase !== 'preparation' || engine.players.size !== 2) return;
    engine.phaseTimer--;
    if (engine.phaseTimer <= 0) {
      runBattle();
    } else {
      sendToRemote('timer_update', engine.phaseTimer);
      if (gameState) { gameState.timer = engine.phaseTimer; renderTopBar(); }
    }
  }, 1000);
}

function stopPhaseTimer() {
  if (phaseInterval) { clearInterval(phaseInterval); phaseInterval = null; }
}

function runBattle() {
  if (!engine) return;
  const battleResult = engine.simulateBattle();

  sendToRemote('battle_start', battleResult.log);
  showBattle(battleResult.log);

  const totalDuration = battleResult.log.length * 800 + 2000;

  engine.phase = 'battle';
  sendToRemote('phase_change', { phase: 'battle', round: engine.round, timer: 0 });
  if (gameState) { gameState.phase = 'battle'; renderTopBar(); }

  setTimeout(() => {
    if (!engine) return;
    engine.applyBattleResult(battleResult);

    const gameOver = engine.checkGameOver();
    if (gameOver) {
      sendToRemote('game_over', gameOver);
      handleMessage('game_over', gameOver);
      return;
    }

    engine.startNewRound();
    hostSendState();
    hostSendPhase();
  }, totalDuration);
}

// ===== Session =====
function saveSession(code, name, role) {
  localStorage.setItem('tft_session', JSON.stringify({ roomCode: code, playerName: name, role, ts: Date.now() }));
}
function loadSession() {
  try {
    const s = JSON.parse(localStorage.getItem('tft_session'));
    if (!s || Date.now() - s.ts > 10 * 60 * 1000) { clearSession(); return null; }
    return s;
  } catch { return null; }
}
function clearSession() { localStorage.removeItem('tft_session'); }

// Rejoin stubs -- P2P can't rejoin (host holds engine state in browser memory)
function doRejoin() {
  clearSession();
  showRejoinBar(null);
  showError('P2P模式不支持重连，请重新创建房间');
}
function dismissRejoin() {
  clearSession();
  showRejoinBar(null);
}
function showRejoinBar(session) {
  const bar = document.getElementById('rejoinBar');
  if (!bar) return;
  if (!session) { bar.style.display = 'none'; return; }
  bar.style.display = 'block';
  document.getElementById('rejoinRoomCode').textContent = session.roomCode;
  document.getElementById('rejoinName').textContent = session.playerName;
}

function leaveGame() { clearSession(); if (peer) peer.destroy(); location.reload(); }

function copyRoomCode() {
  if (!myRoomCode) return;
  const link = getRoomLink(myRoomCode);
  const text = '金铲铲之战 - 点击直接加入: ' + link;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      const fb = document.getElementById('copyFeedback');
      fb.style.display = 'block'; fb.textContent = '已复制到剪贴板！';
      setTimeout(() => { fb.style.display = 'none'; }, 2000);
    }).catch(() => prompt('复制发给好友：', text));
  } else { prompt('复制发给好友：', text); }
}

function getRoomLink(code) {
  const base = window.location.origin + window.location.pathname;
  return base + '?room=' + code;
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ===== 棋子详情 =====
function showCardDetail(unit) {
  if (!unit) return;
  const overlay = document.getElementById('cardDetail');
  const header = document.getElementById('cardDetailHeader');
  const body = document.getElementById('cardDetailBody');
  const card = overlay.querySelector('.card-detail');
  card.className = 'card-detail cd-cost-' + unit.cost;
  const stars = unit.stars ? '⭐'.repeat(unit.stars) : '';
  const traitTags = (unit.traits || []).map(t => `<span class="cd-trait-tag">${TRAIT_NAMES[t] || t}</span>`).join('');
  header.innerHTML = `<div class="cd-emoji">${unit.emoji}</div><div class="cd-name">${unit.name} ${stars}</div><div class="cd-cost">💰 ${unit.cost}费棋子</div><div class="cd-traits">${traitTags}</div>`;
  const rangeText = unit.range <= 1 ? '近战' : `远程(${unit.range}格)`;
  body.innerHTML = `
    <div class="cd-row"><span class="cd-label">❤️ 生命值</span><span class="cd-value">${unit.hp}</span></div>
    <div class="cd-row"><span class="cd-label">⚔️ 攻击力</span><span class="cd-value">${unit.attack}</span></div>
    <div class="cd-row"><span class="cd-label">⏩ 攻击速度</span><span class="cd-value">${unit.attackSpeed}</span></div>
    <div class="cd-row"><span class="cd-label">🎯 攻击距离</span><span class="cd-value">${rangeText}</span></div>
    <div class="cd-ability"><div class="cd-ability-name">✨ 技能：${unit.ability}</div><div class="cd-ability-desc">蓄满法力后释放，造成 ${unit.abilityDmg} 点法术伤害</div></div>
    ${(unit.traits || []).map(t => `<div style="font-size:0.7rem;color:var(--text-dim);margin-top:0.3rem">${TRAIT_NAMES[t] || t}：${TRAIT_DESC[t] || ''}</div>`).join('')}`;
  overlay.style.display = 'flex';
}
function closeCardDetail() { document.getElementById('cardDetail').style.display = 'none'; }
function startLongPress(unit, e) { if (e) e.preventDefault(); clearTimeout(longPressTimer); longPressTimer = setTimeout(() => { showCardDetail(unit); longPressTimer = -1; }, 400); }
function cancelLongPress() { if (longPressTimer && longPressTimer !== -1) clearTimeout(longPressTimer); longPressTimer = null; }
function wasLongPress() { return longPressTimer === -1; }

// ===== 新手提示 =====
function showTutorial() { document.getElementById('tutorialOverlay').style.display = 'flex'; }
function closeTutorial() { document.getElementById('tutorialOverlay').style.display = 'none'; localStorage.setItem('tft_tutorial_seen', '1'); }
function maybeShowTutorial() { if (!localStorage.getItem('tft_tutorial_seen')) showTutorial(); }

// ===== UI切换 =====
function showGameScreen() {
  const lobby = document.getElementById('lobby');
  const game = document.getElementById('game');
  if (lobby.classList.contains('active')) {
    lobby.classList.remove('active'); lobby.style.display = 'none';
    game.classList.add('active'); game.style.display = 'flex';
    maybeShowTutorial();
  }
}

// ===== 渲染 =====
function renderGame() {
  if (!gameState) return;
  renderTopBar(); renderTraits(); renderOpponentBoard(); renderPlayerBoard(); renderBench(); renderShop();
}

function renderTopBar() {
  const p = gameState.player, o = gameState.opponent;
  document.getElementById('myName').textContent = p.name;
  document.getElementById('myHp').textContent = p.hp;
  document.getElementById('roundDisplay').textContent = `第${gameState.round}回合`;
  const phaseEl = document.getElementById('phaseDisplay');
  if (gameState.phase === 'preparation') { phaseEl.textContent = '🛠 备战中'; phaseEl.style.borderColor = 'var(--gold-dark)'; }
  else { phaseEl.textContent = '⚔️ 战斗中'; phaseEl.style.borderColor = 'var(--red)'; }
  document.getElementById('timerDisplay').textContent = gameState.timer + '秒';
  document.getElementById('goldDisplay').textContent = p.gold;
  document.getElementById('levelDisplay').textContent = p.level;
  document.getElementById('xpDisplay').textContent = `${p.xp}/${p.xpToLevel}`;
  document.getElementById('unitCount').textContent = `${p.boardCount}/${p.maxUnits}`;
  if (p.streak > 0) { document.getElementById('streakDisplay').textContent = `🔥${p.streak}连胜`; document.getElementById('streakDisplay').style.color = '#4ade80'; }
  else if (p.streak < 0) { document.getElementById('streakDisplay').textContent = `💀${Math.abs(p.streak)}连败`; document.getElementById('streakDisplay').style.color = '#ef4444'; }
  else { document.getElementById('streakDisplay').textContent = ''; }
  if (o) { document.getElementById('oppName').textContent = o.name; document.getElementById('oppHp').textContent = o.hp; }
  const hpEl = document.getElementById('myHp');
  hpEl.parentElement.style.color = p.hp > 50 ? '#4ade80' : p.hp > 25 ? '#fbbf24' : '#ef4444';
}

function renderTraits() {
  const bar = document.getElementById('traitsBar');
  bar.innerHTML = (gameState.player.activeTraits || []).map(t => `<div class="trait-badge active">${t.icon} ${t.name} ${t.count}/${t.threshold}</div>`).join('');
}

function renderOpponentBoard() {
  const c = document.getElementById('opponentBoard'), o = gameState.opponent;
  if (!o || !o.board) { c.innerHTML = ''; return; }
  let h = '';
  for (let r = 0; r < 4; r++) for (let col = 0; col < 7; col++) { const u = o.board[r][col]; h += u ? `<div class="board-cell has-unit cost-${u.cost}">${u.emoji}<span class="unit-stars">${'⭐'.repeat(u.stars)}</span></div>` : `<div class="board-cell"></div>`; }
  c.innerHTML = h;
}

function renderPlayerBoard() {
  const c = document.getElementById('playerBoard'), board = gameState.player.board;
  let h = '';
  for (let r = 0; r < 4; r++) for (let col = 0; col < 7; col++) {
    const u = board[r][col], sel = selectedBoardCell && selectedBoardCell.row === r && selectedBoardCell.col === col;
    if (u) h += `<div class="board-cell has-unit cost-${u.cost} ${sel ? 'selected' : ''}" onclick="onBoardTap(${r},${col})" ontouchstart="startLongPress(gameState.player.board[${r}][${col}],event)" ontouchend="cancelLongPress()" onmousedown="startLongPress(gameState.player.board[${r}][${col}],event)" onmouseup="cancelLongPress()" onmouseleave="cancelLongPress()">${u.emoji}<span class="unit-stars">${'⭐'.repeat(u.stars)}</span></div>`;
    else h += `<div class="board-cell ${sel ? 'selected' : ''}" onclick="onBoardTap(${r},${col})"></div>`;
  }
  c.innerHTML = h;
}

function renderBench() {
  const c = document.getElementById('benchContainer'), bench = gameState.player.bench;
  let h = '';
  for (let i = 0; i < 9; i++) { const u = bench[i], sel = selectedBenchIndex === i;
    if (u) h += `<div class="bench-slot has-unit cost-${u.cost} ${sel ? 'selected' : ''}" onclick="onBenchTap(${i})" ontouchstart="startLongPress(gameState.player.bench[${i}],event)" ontouchend="cancelLongPress()" onmousedown="startLongPress(gameState.player.bench[${i}],event)" onmouseup="cancelLongPress()" onmouseleave="cancelLongPress()">${u.emoji}<span class="unit-stars">${'⭐'.repeat(u.stars)}</span><span class="bench-name">${u.name}</span></div>`;
    else h += `<div class="bench-slot" onclick="onBenchTap(${i})"></div>`;
  }
  c.innerHTML = h;
}

function renderShop() {
  const c = document.getElementById('shopCards'), shop = gameState.player.shop;
  let h = '';
  for (let i = 0; i < 5; i++) { const ch = shop[i];
    if (ch) { const ti = (ch.traits || []).map(t => (TRAIT_NAMES[t] || t).replace(/^.+\s/, '')).join(' ');
      h += `<div class="shop-card cost-${ch.cost}" onclick="onShopClick(${i})" ontouchstart="startLongPress(gameState.player.shop[${i}],event)" ontouchend="cancelLongPress()" onmousedown="startLongPress(gameState.player.shop[${i}],event)" onmouseup="cancelLongPress()" onmouseleave="cancelLongPress()"><div class="emoji">${ch.emoji}</div><div class="name">${ch.name}</div><div class="shop-stats">❤${ch.hp} ⚔${ch.attack}</div><div class="cost">💰${ch.cost}</div><div class="traits">${ti}</div></div>`;
    } else h += `<div class="shop-card empty"><div class="emoji">-</div></div>`;
  }
  c.innerHTML = h;
}

// ===== 交互 =====
function onShopClick(i) { if (wasLongPress()) { longPressTimer = null; return; } emitAction('buy_champion', i); }
function onBenchTap(i) { if (wasLongPress()) { longPressTimer = null; return; } onBenchClick(i); }
function onBoardTap(r, c) { if (wasLongPress()) { longPressTimer = null; return; } onBoardCellClick(r, c); }

function onBenchClick(index) {
  const unit = gameState.player.bench[index];
  if (selectedBoardCell) {
    if (!unit) emitAction('return_to_bench', { boardRow: selectedBoardCell.row, boardCol: selectedBoardCell.col });
    selectedBoardCell = null; selectedBenchIndex = null; renderPlayerBoard(); renderBench(); return;
  }
  if (selectedBenchIndex === index) {
    if (unit) emitAction('sell_champion', { from: 'bench', index });
    selectedBenchIndex = null; renderBench(); return;
  }
  if (unit) { selectedBenchIndex = index; selectedBoardCell = null; renderBench(); renderPlayerBoard(); }
}

function onBoardCellClick(row, col) {
  const unit = gameState.player.board[row][col];
  if (selectedBenchIndex !== null) {
    emitAction('place_champion', { benchIndex: selectedBenchIndex, boardRow: row, boardCol: col });
    selectedBenchIndex = null; selectedBoardCell = null; return;
  }
  if (selectedBoardCell) {
    if (selectedBoardCell.row === row && selectedBoardCell.col === col) { emitAction('return_to_bench', { boardRow: row, boardCol: col }); selectedBoardCell = null; return; }
    emitAction('move_champion', { fromRow: selectedBoardCell.row, fromCol: selectedBoardCell.col, toRow: row, toCol: col }); selectedBoardCell = null; return;
  }
  if (unit) { selectedBoardCell = { row, col }; selectedBenchIndex = null; renderPlayerBoard(); renderBench(); }
}

function buyChampion(i) { emitAction('buy_champion', i); }
function refreshShop() { emitAction('refresh_shop', {}); }
function buyXP() { emitAction('buy_xp', {}); }

// ===== 战斗动画 =====
function showBattle(log) {
  const overlay = document.getElementById('battleOverlay'), lc = document.getElementById('battleLog');
  overlay.style.display = 'flex'; lc.innerHTML = '';
  let i = 0; const speed = Math.max(150, Math.min(600, 8000 / (log.length || 1)));
  const iv = setInterval(() => {
    if (i >= log.length) { clearInterval(iv); setTimeout(() => { overlay.style.display = 'none'; }, 1200); return; }
    const e = log[i], div = document.createElement('div'); div.className = 'log-entry';
    switch (e.type) {
      case 'attack': div.className += ' log-attack'; div.textContent = `${e.attacker.emoji} ${e.attacker.name} → ${e.target.emoji} ${e.target.name} -${e.damage} (剩${e.targetHp}血)`; break;
      case 'crit': div.className += ' log-crit'; div.textContent = `💥 暴击！${e.attacker.emoji} → ${e.target.emoji} -${e.damage}！`; break;
      case 'ability': div.className += ' log-ability'; div.textContent = `✨ ${e.attacker.emoji} 释放【${e.attacker.ability}】→ ${e.target.emoji} -${e.damage}`; break;
      case 'death': div.className += ' log-death'; div.textContent = `☠️ ${e.unit.emoji} ${e.unit.name} 阵亡！`; break;
      case 'move': i++; return;
    }
    lc.appendChild(div); lc.scrollTop = lc.scrollHeight; i++;
  }, speed);
}

function showError(msg) {
  const t = document.getElementById('errorToast'); t.textContent = msg; t.style.display = 'block';
  clearTimeout(t._to); t._to = setTimeout(() => { t.style.display = 'none'; }, 3000);
}

// ===== 页面初始化 =====
(function init() {
  // Check URL room param
  const p = new URLSearchParams(window.location.search), room = (p.get('room') || '').toUpperCase().trim();
  if (room && room.length === 4) {
    const inp = document.getElementById('roomCodeInput');
    if (inp) { inp.value = room; setTimeout(() => inp.focus(), 500); }
  }

  // Check stale session
  const session = loadSession();
  if (session) {
    showRejoinBar(session);
  }

  updateConnectionStatus(true, '就绪');
})();

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('lobby').classList.contains('active')) {
    const code = document.getElementById('roomCodeInput').value.trim();
    if (code) joinGame(); else createGame();
  }
});
