const COLS = 8, ROWS = 8, MIN_MATCH = 6;
const PAD = 6, GAP = 3;
const CS = (338 - PAD * 2 - GAP * (COLS - 1)) / COLS;

const PALETTE = [
  { base: '#0077FF', light: '#66B8FF', glow: '#33A1FF' },
  { base: '#18B267', light: '#4DDFAA', glow: '#20D678' },
  { base: '#E02245', light: '#FF5577', glow: '#FF2255' },
  { base: '#FF6A00', light: '#FFC04D', glow: '#FF8C00' },
  { base: '#7A00E6', light: '#C156FF', glow: '#B000FF' },
  { base: '#49CFFF', light: '#9AE8FF', glow: '#6EDBFF' },
  { base: '#FFD400', light: '#FFF176', glow: '#FFE100' },
];

const SHAPES = [
  { cells: [[0, 0]], w: 1, h: 1, wt: 3 },
  { cells: [[0, 0], [0, 1]], w: 2, h: 1, wt: 5 },
  { cells: [[0, 0], [1, 0]], w: 1, h: 2, wt: 5 },
  { cells: [[0, 0], [0, 1], [0, 2]], w: 3, h: 1, wt: 6 },
  { cells: [[0, 0], [1, 0], [2, 0]], w: 1, h: 3, wt: 6 },
  { cells: [[0, 0], [0, 1], [1, 0]], w: 2, h: 2, wt: 5 },
  { cells: [[0, 0], [0, 1], [1, 1]], w: 2, h: 2, wt: 5 },
  { cells: [[0, 0], [1, 0], [1, 1]], w: 2, h: 2, wt: 5 },
  { cells: [[0, 1], [1, 0], [1, 1]], w: 2, h: 2, wt: 5 },
  { cells: [[0, 0], [1, 1]], w: 2, h: 2, wt: 2 },
  { cells: [[0, 1], [1, 0]], w: 2, h: 2, wt: 2 },
];

const totalWt = SHAPES.reduce((s, sh) => s + sh.wt, 0);

function rndShape() {
  let r = Math.random() * totalWt;
  for (const s of SHAPES) { r -= s.wt; if (r <= 0) return s; }
  return SHAPES[0];
}

function rndPal() {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

function rndPalExcept(used = []) {
  const pool = PALETTE.filter(p => !used.includes(p));
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : rndPal();
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildThreeColors(danger) {
  const pairChance = danger === 'critical' ? 0.16 : danger === 'warning' ? 0.07 : 0;
  const tripleChance = danger === 'critical' ? 0.003 : 0.0004;
  const roll = Math.random();

  if (roll < tripleChance) {
    const c = rndPal();
    return [c, c, c];
  }
  if (roll < tripleChance + pairChance) {
    const a = rndPal(), b = rndPalExcept([a]);
    return shuffleArray([a, a, b]);
  }
  return shuffleArray([...PALETTE]).slice(0, 3);
}

function applySpawnColors(batch, danger) {
  const locked = batch.filter(p => p.colorLocked);
  const unlocked = batch.filter(p => !p.colorLocked);
  if (unlocked.length === 0) return;

  let colors;
  if (locked.length > 0) {
    const taken = locked.map(p => p.pal);
    colors = [];
    for (let i = 0; i < unlocked.length; i++) colors.push(rndPalExcept([...taken, ...colors]));
    const pairChance = danger === 'critical' ? 0.12 : danger === 'warning' ? 0.05 : 0;
    if (unlocked.length >= 2 && Math.random() < pairChance) {
      colors[1] = colors[0];
      const sameCount = taken.filter(p => p === colors[0]).length + colors.filter(c => c === colors[0]).length;
      if (sameCount >= 3) colors[1] = rndPalExcept([colors[0], ...taken]);
    }
  } else colors = buildThreeColors(danger);

  unlocked.forEach((p, i) => { p.pal = colors[i]; });
}

function placementsForShape(shape) {
  let count = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (canPlace(shape, r, c)) count++;
  return count;
}

function analyzeBoardState() {
  let filled = 0;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (board[r][c]) filled++;
  const fillRatio = filled / (ROWS * COLS);
  let totalPlacements = 0;
  SHAPES.forEach(s => totalPlacements += placementsForShape(s));
  let danger = 'none';
  if (totalPlacements <= 12 || (fillRatio >= 0.84 && totalPlacements <= 24)) danger = 'critical';
  else if (fillRatio >= 0.72 || totalPlacements <= 28) danger = 'warning';
  return { fillRatio, totalPlacements, danger };
}

function updateAdaptiveMode() {
  const st = analyzeBoardState();
  if (st.fillRatio <= 0.24 && st.totalPlacements >= 120)
    pressureSpawnsLeft = Math.max(pressureSpawnsLeft, 2);
}

function comboCellsAfterPlace(shape, pal, r, c) {
  if (!canPlace(shape, r, c)) return 0;
  const tmp = board.map(row => [...row]);
  shape.cells.forEach(([dr, dc]) => {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) tmp[nr][nc] = pal;
  });
  const vis = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  let comboCells = 0;
  for (let gr = 0; gr < ROWS; gr++) for (let gc = 0; gc < COLS; gc++) {
    if (tmp[gr][gc] && !vis[gr][gc]) {
      const palRef = tmp[gr][gc];
      let size = 0;
      const stack = [[gr, gc]];
      while (stack.length) {
        const [cr, cc] = stack.pop();
        if (cr < 0 || cr >= ROWS || cc < 0 || cc >= COLS || vis[cr][cc] || tmp[cr][cc] !== palRef) continue;
        vis[cr][cc] = true; size++;
        stack.push([cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]);
      }
      if (size >= MIN_MATCH) comboCells += size;
    }
  }
  return comboCells;
}

function pickComboPiece() {
  let best = null;
  for (const pal of PALETTE) {
    for (const shape of SHAPES) {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const combo = comboCellsAfterPlace(shape, pal, r, c);
        if (combo > 0 && (!best || combo > best.combo)) best = { shape, pal, combo };
      }
    }
  }
  return best ? { shape: best.shape, pal: best.pal, used: false, colorLocked: true } : null;
}

function pickPlaceablePiece() {
  let best = null;
  for (const shape of SHAPES) {
    const n = placementsForShape(shape);
    if (n > 0 && (!best || n > best.n || (n === best.n && shape.cells.length < best.shape.cells.length)))
      best = { shape, n };
  }
  if (best) return { shape: best.shape, pal: rndPal(), used: false };
  return { shape: SHAPES[0], pal: rndPal(), used: false };
}

function pickRescuePiece(severity) {
  if (severity === 'critical' && Math.random() < 0.4) {
    const combo = pickComboPiece();
    if (combo) return combo;
  }
  return pickPlaceablePiece();
}

function pickPressurePiece() {
  const awkwardShapes = [SHAPES[9], SHAPES[10], SHAPES[3], SHAPES[4]];
  const shape = awkwardShapes[Math.floor(Math.random() * awkwardShapes.length)];
  return { shape, pal: rndPal(), used: false };
}

function pickNormalPiece() {
  if (pressureSpawnsLeft > 0) {
    pressureSpawnsLeft--;
    return pickPressurePiece();
  }
  return { shape: rndShape(), pal: rndPal(), used: false };
}

function shufflePieces(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function congratsFor(size) {
  if (size >= 14) return { t: '👑 LEGENDARY', s: 32, c: '#FFD700' };
  if (size >= 11) return { t: '🔥 INCREDIBLE', s: 28, c: '#FF6B35' };
  if (size >= 9)  return { t: '⚡ MEGA COMBO', s: 26, c: '#C070FF' };
  if (size >= 7)  return { t: '✨ AWESOME',    s: 24, c: '#33DDFF' };
  return { t: 'COMBO', s: 20, c: '#4DDFAA' };
}

let board, score, best = 0, pieces, animating = false, dragPieceIdx = -1;
let previewCells = [], previewOk = false, previewCombo = [];
let animBlocks = [], particles = [], explodingCells = [];
let pendingCb = null, rafId = null;
let comboStreak = 0;
let pressureSpawnsLeft = 0;
let activePointerId = null;
let activePointerType = null;
let lastPointer = { x: 0, y: 0 };

const cv = document.getElementById('game-cv');
const ctx = cv.getContext('2d');

function cx(c) { return PAD + c * (CS + GAP); }
function cy(r) { return PAD + r * (CS + GAP); }

function initGame() {
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  score = 0; animating = false; dragPieceIdx = -1;
  comboStreak = 0;
  pressureSpawnsLeft = 0;
  animBlocks = []; explodingCells = []; previewCells = []; previewCombo = []; particles = []; pendingCb = null;
  document.getElementById('restart').style.display = 'none';
  const msg = document.getElementById('msg');
  msg.textContent = '';
  msg.classList.remove('game-over');
  document.getElementById('congrats').innerHTML = '';
  const bg = document.getElementById('board-bg'); bg.innerHTML = '';
  for (let i = 0; i < ROWS * COLS; i++) {
    const d = document.createElement('div'); d.className = 'bg-cell'; bg.appendChild(d);
  }
  spawnPieces(); renderPieces(); updateHUD();
  if (rafId) cancelAnimationFrame(rafId);
  loop();
}

function spawnPieces() {
  const { danger } = analyzeBoardState();
  const rescueCount = danger === 'critical' ? 2 : danger === 'warning' ? 1 : 0;
  const batch = [];
  for (let i = 0; i < rescueCount; i++) batch.push(pickRescuePiece(danger));
  while (batch.length < 3) batch.push(pickNormalPiece());
  applySpawnColors(batch, danger);
  batch.forEach(p => delete p.colorLocked);
  pieces = shufflePieces(batch);
}

function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

function drawBlock(c, x, y, sz, pal, alpha = 1, sc = 1) {
  c.save(); c.globalAlpha = alpha;
  const bcx = x + sz / 2, bcy = y + sz / 2;
  c.translate(bcx, bcy); c.scale(sc, sc); c.translate(-bcx, -bcy);

  const grd = c.createRadialGradient(x + sz * .3, y + sz * .25, sz * .04, x + sz * .55, y + sz * .6, sz * .85);
  grd.addColorStop(0, pal.light);
  grd.addColorStop(0.45, pal.base);
  grd.addColorStop(1, shadeColor(pal.base, -40));
  rr(c, x, y, sz, sz, 7); c.fillStyle = grd; c.fill();

  const inner = c.createLinearGradient(x, y, x, y + sz);
  inner.addColorStop(0, 'rgba(255,255,255,.12)');
  inner.addColorStop(0.5, 'rgba(0,0,0,0)');
  inner.addColorStop(1, 'rgba(0,0,0,.25)');
  rr(c, x, y, sz, sz, 7); c.fillStyle = inner; c.fill();

  c.shadowColor = pal.glow; c.shadowBlur = 10;
  rr(c, x + .6, y + .6, sz - 1.2, sz - 1.2, 6.5);
  c.strokeStyle = pal.light + '88'; c.lineWidth = 1.2; c.stroke();
  c.shadowBlur = 0;

  c.beginPath(); c.ellipse(x + sz * .27, y + sz * .21, sz * .14, sz * .09, -0.35, 0, Math.PI * 2);
  c.fillStyle = 'rgba(255,255,255,.45)'; c.fill();

  c.beginPath(); c.ellipse(x + sz * .72, y + sz * .78, sz * .1, sz * .06, 0.4, 0, Math.PI * 2);
  c.fillStyle = 'rgba(255,255,255,.12)'; c.fill();
  c.restore();
}

function shadeColor(hex, pct) {
  let n = parseInt(hex.slice(1), 16);
  let r = Math.min(255, Math.max(0, (n >> 16) + pct));
  let g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + pct));
  let b = Math.min(255, Math.max(0, (n & 0xff) + pct));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function spawnParticles(px, py, pal, n = 16) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, spd = 1.5 + Math.random() * 5;
    particles.push({
      x: px, y: py,
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 1.5,
      r: 1.5 + Math.random() * 3.5, life: 1, pal,
      type: Math.random() > .5 ? 'sq' : 'ci',
      rot: Math.random() * Math.PI * 2,
      rv: (Math.random() - .5) * .25
    });
  }
}

function calcPreviewCombo(shape, r, c) {
  if (!canPlace(shape, r, c)) return [];
  const tmp = board.map(row => [...row]);
  shape.cells.forEach(([dr, dc]) => {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS)
      tmp[nr][nc] = shape._pal || { base: '#fff', light: '#fff', glow: '#fff' };
  });
  const combo = [];
  const vis = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  for (let gr = 0; gr < ROWS; gr++) for (let gc = 0; gc < COLS; gc++) {
    if (tmp[gr][gc] && !vis[gr][gc]) {
      const pal = tmp[gr][gc]; const cells = []; const stack = [[gr, gc]];
      while (stack.length) {
        const [cr, cc] = stack.pop();
        if (cr < 0 || cr >= ROWS || cc < 0 || cc >= COLS || vis[cr][cc] || tmp[cr][cc] !== pal) continue;
        vis[cr][cc] = true; cells.push([cr, cc]);
        stack.push([cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]);
      }
      if (cells.length >= MIN_MATCH) cells.forEach(cell => combo.push(cell));
    }
  }
  return combo;
}

function loop() {
  ctx.clearRect(0, 0, 338, 338);

  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (board[r][c]) drawBlock(ctx, cx(c), cy(r), CS, board[r][c]);
  }

  if (previewCombo.length > 0) {
    previewCombo.forEach(([r, c]) => {
      ctx.save();
      rr(ctx, cx(c) + 1, cy(r) + 1, CS - 2, CS - 2, 6);
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill();
      ctx.restore();
    });
  }

  previewCells.forEach(([r, c]) => {
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
    rr(ctx, cx(c), cy(r), CS, CS, 6);
    ctx.fillStyle = previewOk ? 'rgba(255,255,255,.13)' : 'rgba(255,60,60,.1)'; ctx.fill();
    ctx.strokeStyle = previewOk ? 'rgba(255,255,255,.4)' : 'rgba(255,60,60,.4)'; ctx.lineWidth = 1.5; ctx.stroke();
  });

  explodingCells = explodingCells.filter(e => {
    e.t += 0.05; if (e.t > 1) return false;
    if (e.t < 0.25) {
      drawBlock(ctx, cx(e.c), cy(e.r), CS, e.pal, 1, 1 + e.t * 1.8);
      rr(ctx, cx(e.c), cy(e.r), CS, CS, 6);
      ctx.fillStyle = `rgba(255,255,255,${(0.25 - e.t) * 3})`; ctx.fill();
    } else {
      const al = Math.max(0, 1 - (e.t - .25) / .75);
      drawBlock(ctx, cx(e.c), cy(e.r), CS, e.pal, al, 1.3 + e.t * .6);
    }
    return true;
  });

  particles = particles.filter(p => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life -= 0.022; p.rot += p.rv;
    if (p.life <= 0) return false;
    ctx.save(); ctx.globalAlpha = p.life * p.life;
    if (p.type === 'sq') {
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.pal.light; ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
    } else {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.pal.light; ctx.fill();
    }
    ctx.restore();
    return true;
  });

  let falling = false;
  animBlocks.forEach(b => {
    if (b.landed) return;
    // Faster gravity animation for falling blocks
    b.vy += 1.35; b.y += b.vy;
    const ty = cy(b.toRow);
    if (b.y >= ty) {
      b.y = ty; b.vy = -b.vy * .24; b.bounces = (b.bounces || 0) + 1;
      spawnParticles(cx(b.col) + CS / 2, ty + CS, b.pal, 4);
      if (b.bounces >= 2 || Math.abs(b.vy) < 1.4) { b.y = ty; b.vy = 0; b.landed = true; }
    }
    const sq = b.landed ? 1 : Math.max(.7, 1 - Math.abs(b.vy) * .012);
    drawBlock(ctx, cx(b.col), b.y, CS, b.pal, 1, sq);
    if (!b.landed) falling = true;
  });

  rafId = requestAnimationFrame(loop);

  if (animBlocks.length > 0 && !falling && explodingCells.length === 0) {
    const was = animating; animBlocks = [];
    if (was && pendingCb) {
      const cb = pendingCb; pendingCb = null;
      animating = false; cb();
    }
  }
}

function runGravity(cb) {
  const newBoard = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const fallers = [];
  for (let c = 0; c < COLS; c++) {
    const col = [];
    for (let r = 0; r < ROWS; r++) if (board[r][c]) col.push({ r, pal: board[r][c] });
    const empty = ROWS - col.length;
    col.forEach((item, i) => {
      const toRow = empty + i;
      newBoard[toRow][c] = item.pal;
      if (toRow !== item.r)
        fallers.push({ pal: item.pal, col: c, fromRow: item.r, toRow, y: cy(item.r), vy: 0, landed: false, bounces: 0 });
    });
  }
  if (fallers.length === 0) { cb(); return; }
  fallers.forEach(f => board[f.fromRow][f.col] = null);
  animBlocks = fallers; animating = true; pendingCb = () => { board = newBoard; cb(); };
}

function canPlace(shape, r, c) {
  return shape.cells.every(([dr, dc]) => {
    const nr = r + dr, nc = c + dc;
    return nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && !board[nr][nc];
  });
}

function getGroups(b) {
  b = b || board;
  const vis = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const groups = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (b[r][c] && !vis[r][c]) {
      const pal = b[r][c]; const cells = []; const stack = [[r, c]];
      while (stack.length) {
        const [cr, cc] = stack.pop();
        if (cr < 0 || cr >= ROWS || cc < 0 || cc >= COLS || vis[cr][cc] || b[cr][cc] !== pal) continue;
        vis[cr][cc] = true; cells.push([cr, cc]);
        stack.push([cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]);
      }
      groups.push({ pal, cells, size: cells.length });
    }
  }
  return groups;
}

function checkMatches(cb, suppressBasicCombo = false) {
  const grounded = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  for (let r = ROWS - 1; r >= 0; r--) for (let c = 0; c < COLS; c++) {
    if (board[r][c]) {
      if (r === ROWS - 1 || board[r + 1][c]) grounded[r][c] = true;
    }
  }
  const vis = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const groups = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (board[r][c] && grounded[r][c] && !vis[r][c]) {
      const pal = board[r][c]; const cells = []; const stack = [[r, c]];
      while (stack.length) {
        const [cr, cc] = stack.pop();
        if (cr < 0 || cr >= ROWS || cc < 0 || cc >= COLS || vis[cr][cc] || board[cr][cc] !== pal || !grounded[cr][cc]) continue;
        vis[cr][cc] = true; cells.push([cr, cc]);
        stack.push([cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]);
      }
      groups.push({ pal, cells, size: cells.length });
    }
  }
  const matches = groups.filter(g => g.size >= MIN_MATCH);
  if (matches.length === 0) { cb(false); return; }
  animating = true; let pts = 0;
  matches.forEach(g => {
    g.cells.forEach(([r, c]) => {
      explodingCells.push({ r, c, pal: g.pal, t: 0 });
      spawnParticles(cx(c) + CS / 2, cy(r) + CS / 2, g.pal, 14);
      board[r][c] = null;
    });
    const gained = g.size * 10; pts += gained;
    showCongrats(g.size, gained, g.pal, suppressBasicCombo);
  });
  score += pts; if (score > best) best = score; updateHUD();
  const wait = setInterval(() => {
    if (explodingCells.length === 0 && particles.filter(p => p.life > .1).length === 0) {
      clearInterval(wait); animating = false; cb(true);
    }
  }, 60);
}

function showComboChain(mult) {
  if (mult < 2) return;
  const el = document.getElementById('congrats');
  const line = document.createElement('div');
  line.className = 'combo-chain';
  line.textContent = `COMBO x${mult}`;
  el.appendChild(line);
  requestAnimationFrame(() => {
    line.style.opacity = '1';
    line.style.transform = 'translate(-50%, 0) scale(1)';
  });
  setTimeout(() => {
    line.style.opacity = '0';
    line.style.transform = 'translate(-50%, -14px) scale(.9)';
  }, 650);
  setTimeout(() => line.remove(), 1300);
}

function resolveBoard(onDone, chain = 0, suppressBasicCombo = false) {
  runGravity(() => {
    checkMatches(matched => {
      if (!matched) { onDone(chain > 0, chain); return; }
      const nextChain = chain + 1;
      showComboChain(nextChain);
      resolveBoard(onDone, nextChain, suppressBasicCombo);
    }, suppressBasicCombo || chain > 0);
  });
}

function showCongrats(size, pts, pal, suppressBasicCombo = false) {
  const cfg = congratsFor(size);
  const hideBasicCombo = suppressBasicCombo && cfg.t === 'COMBO';
  const el = document.getElementById('congrats');
  el.innerHTML = '';
  const l2 = document.createElement('div'); l2.className = 'congrats-line';
  l2.textContent = '+' + pts; l2.style.fontSize = (cfg.s * .65) + 'px'; l2.style.color = pal.light;
  l2.style.textShadow = `0 0 16px ${pal.glow}`;
  let l1 = null;
  if (!hideBasicCombo) {
    l1 = document.createElement('div'); l1.className = 'congrats-line';
    l1.textContent = cfg.t; l1.style.fontSize = cfg.s + 'px'; l1.style.color = cfg.c;
    l1.style.textShadow = `0 0 20px ${cfg.c},0 0 40px ${cfg.c}`;
    el.appendChild(l1);
  }
  el.appendChild(l2);
  requestAnimationFrame(() => {
    [l1, l2].filter(Boolean).forEach((l, i) => setTimeout(() => {
      l.style.transition = 'opacity .2s,transform .2s';
      l.style.opacity = '1';
      l.style.transform = 'scale(1) translateY(0)';
    }, i * 70));
  });
  setTimeout(() => {
    [l1, l2].filter(Boolean).forEach(l => {
      l.style.transition = 'opacity .5s,transform .5s';
      l.style.opacity = '0';
      l.style.transform = 'scale(.9) translateY(-12px)';
    });
  }, 950);
  setTimeout(() => el.innerHTML = '', 1500);
}

function onDrop(r, c) {
  if (dragPieceIdx < 0 || animating) return;
  const p = pieces[dragPieceIdx];
  if (!canPlace(p.shape, r, c)) { endDrag(); return; }
  previewCells = []; previewCombo = [];
  p.shape.cells.forEach(([dr, dc]) => { board[r + dr][c + dc] = p.pal; });
  pieces[dragPieceIdx].used = true; endDrag(); renderPieces();
  resolveBoard((hadCombo, chain) => {
    if (hadCombo) {
      comboStreak += 1;
      if (comboStreak > 1 && chain < 2) showComboChain(comboStreak);
    } else comboStreak = 0;
    updateAdaptiveMode();
    if (pieces.every(p => p.used)) { spawnPieces(); renderPieces(); }
    checkGameOver();
  }, 0, comboStreak > 0);
}

function startDrag(idx, e) {
  if (animating || pieces[idx].used) return;
  dragPieceIdx = idx;
  pieces[idx].shape._pal = pieces[idx].pal;
  document.querySelectorAll('.piece-box')[idx].classList.add('dragging-src');
  buildGhost(idx);
  const x = e.clientX ?? (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
  const y = e.clientY ?? (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
  lastPointer = { x, y };
  moveGhost(x, y);
  document.getElementById('ghost').style.display = 'block';
}

function buildGhost(idx) {
  const p = pieces[idx]; const gcv = document.getElementById('ghost-cv');
  const sz = 36, gap = 3;
  gcv.width = p.shape.w * (sz + gap); gcv.height = p.shape.h * (sz + gap);
  const gc = gcv.getContext('2d'); gc.clearRect(0, 0, gcv.width, gcv.height);
  p.shape.cells.forEach(([dr, dc]) => drawBlock(gc, dc * (sz + gap), dr * (sz + gap), sz, p.pal));
}

function touchLiftPx() {
  // Lift applied to keep the ghost visible above the finger on touch devices.
  // IMPORTANT: the same lift is also applied to preview/drop calculations.
  return activePointerType === 'touch' ? 72 : 0;
}

function adjustedClientPoint(clientX, clientY) {
  const lift = touchLiftPx();
  return { x: clientX, y: clientY - lift };
}

function moveGhost(x, y) {
  const g = document.getElementById('ghost');
  const touchLift = touchLiftPx();
  g.style.left = (x - 22) + 'px';
  g.style.top = (y - 22 - touchLift) + 'px';
}

function endDrag() {
  document.getElementById('ghost').style.display = 'none';
  document.querySelectorAll('.piece-box').forEach(b => b.classList.remove('dragging-src'));
  dragPieceIdx = -1; previewCells = []; previewCombo = [];
  activePointerId = null;
  activePointerType = null;
}

function updatePreviewFromPoint(clientX, clientY) {
  if (dragPieceIdx < 0 || animating) return;
  const rect = cv.getBoundingClientRect();
  const mx = clientX - rect.left, my = clientY - rect.top;
  const c = Math.floor((mx - PAD) / (CS + GAP));
  const r = Math.floor((my - PAD) / (CS + GAP));
  if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
    const p = pieces[dragPieceIdx];
    previewOk = canPlace(p.shape, r, c);
    previewCells = p.shape.cells.map(([dr, dc]) => [r + dr, c + dc]);
    previewCombo = previewOk ? calcPreviewCombo(p.shape, r, c) : [];
  } else { previewCells = []; previewCombo = []; }
}

function tryDropAtPoint(clientX, clientY) {
  if (dragPieceIdx < 0 || animating) return;
  const rect = cv.getBoundingClientRect();
  const c = Math.floor((clientX - rect.left - PAD) / (CS + GAP));
  const r = Math.floor((clientY - rect.top - PAD) / (CS + GAP));
  onDrop(r, c);
}

function onPointerMove(e) {
  if (dragPieceIdx < 0 || animating) return;
  if (activePointerId !== null && e.pointerId !== activePointerId) return;
  lastPointer = { x: e.clientX, y: e.clientY };
  const adj = adjustedClientPoint(e.clientX, e.clientY);
  moveGhost(e.clientX, e.clientY);
  updatePreviewFromPoint(adj.x, adj.y);
}

function onPointerUp(e) {
  if (dragPieceIdx < 0) return;
  if (activePointerId !== null && e.pointerId !== activePointerId) return;
  const adj = adjustedClientPoint(lastPointer.x, lastPointer.y);
  tryDropAtPoint(adj.x, adj.y);
  if (dragPieceIdx >= 0) endDrag();
}

document.addEventListener('pointermove', onPointerMove, { passive: false });
document.addEventListener('pointerup', onPointerUp, { passive: false });
document.addEventListener('pointercancel', () => { if (dragPieceIdx >= 0) endDrag(); });
cv.addEventListener('pointerleave', () => { previewCells = []; previewCombo = []; });

function checkGameOver() {
  const any = pieces.some(p => {
    if (p.used) return false;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (canPlace(p.shape, r, c)) return true;
  });
  if (!any) {
    const msg = document.getElementById('msg');
    msg.textContent = 'Game Over';
    msg.classList.add('game-over');
    document.getElementById('restart').style.display = 'block';
  }
}

function updateHUD() {
  document.getElementById('score').textContent = score.toLocaleString();
  document.getElementById('best').textContent = best.toLocaleString();
}

function renderPieces() {
  const row = document.getElementById('pieces-row'); row.innerHTML = '';
  pieces.forEach((p, i) => {
    const box = document.createElement('div');
    box.className = 'piece-box' + (p.used ? ' used' : '');
    const pcv = document.createElement('canvas');
    const sz = 22, gap = 2;
    pcv.width = p.shape.w * (sz + gap); pcv.height = p.shape.h * (sz + gap);
    const pc = pcv.getContext('2d');
    p.shape.cells.forEach(([dr, dc]) => drawBlock(pc, dc * (sz + gap), dr * (sz + gap), sz, p.pal));
    box.appendChild(pcv);
    box.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch') e.preventDefault();
      activePointerId = e.pointerId;
      activePointerType = e.pointerType;
      try { box.setPointerCapture(e.pointerId); } catch {}
      startDrag(i, e);
      onPointerMove(e);
    }, { passive: false });
    row.appendChild(box);
  });
}

initGame();
