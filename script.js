// ═══════════════════════════════════════════
// SOUND ENGINE
// ═══════════════════════════════════════════
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
function getAudioCtx() { if (!audioCtx) audioCtx = new AudioCtx(); return audioCtx; }

function playSound(type) {
    try {
        const ctx = getAudioCtx();
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        if (type === 'type') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(600 + Math.random() * 200, ctx.currentTime);
            gain.gain.setValueAtTime(.03, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .06);
            osc.start(); osc.stop(ctx.currentTime + .06);
        } else if (type === 'hit') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + .15);
            gain.gain.setValueAtTime(.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .25);
            osc.start(); osc.stop(ctx.currentTime + .25);
        } else if (type === 'miss') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(80, ctx.currentTime + .3);
            gain.gain.setValueAtTime(.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .4);
            osc.start(); osc.stop(ctx.currentTime + .4);
        } else if (type === 'levelup') {
            [523, 659, 784, 1047].forEach((f, i) => {
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.connect(g); g.connect(ctx.destination);
                const t = ctx.currentTime + i * .1;
                o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(.12, t);
                g.gain.exponentialRampToValueAtTime(.001, t + .2); o.start(t); o.stop(t + .2);
            });
        } else if (type === 'combo') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, ctx.currentTime);
            osc.frequency.linearRampToValueAtTime(880, ctx.currentTime + .12);
            gain.gain.setValueAtTime(.1, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .18);
            osc.start(); osc.stop(ctx.currentTime + .18);
        }
    } catch (e) { }
}

// ═══════════════════════════════════════════
// WORD LIST
// ═══════════════════════════════════════════
const WORDS = [
    'node', 'code', 'type', 'fire', 'byte', 'data', 'loop', 'link', 'grid', 'scan',
    'pixel', 'cache', 'stack', 'parse', 'debug', 'class', 'query', 'array', 'index', 'frame',
    'system', 'stream', 'render', 'server', 'module', 'object', 'vector', 'cursor', 'buffer', 'signal',
    'runtime', 'network', 'compile', 'encrypt', 'process', 'console', 'command', 'memory', 'deploy', 'config',
    'interface', 'algorithm', 'framework', 'database', 'function', 'variable', 'prototype', 'recursive',
    'asynchronous', 'blockchain', 'middleware', 'iteration', 'parameter', 'exception', 'component',
    'typescript', 'javascript', 'developer', 'repository', 'benchmark'
];

// ═══════════════════════════════════════════
// LEADERBOARD
// ═══════════════════════════════════════════
const LS_KEY = 'typefall_lb_v2';
function getLeaderboard() { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } }
function saveScore(name, score, combo, words, wpm, acc) {
    const lb = getLeaderboard();
    lb.push({ name: (name || 'ANON').substring(0, 12), score, combo, words, wpm, acc, date: Date.now() });
    lb.sort((a, b) => b.score - a.score); lb.splice(10);
    localStorage.setItem(LS_KEY, JSON.stringify(lb));
}
function getHighScore() { const lb = getLeaderboard(); return lb.length ? lb[0].score : 0; }

// ═══════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════
const state = {
    running: false, score: 0, hearts: 3, level: 1,
    combo: 0, maxCombo: 0, wordsHit: 0, wordsMissed: 0,
    totalCharsTyped: 0, totalCharsCorrect: 0,
    startTime: 0, spawnInterval: null, animFrame: null, words: [],
};

function getLevelConfig(lvl) {
    const l = Math.min(lvl, 12);
    return {
        minSpeed: 25 + l * 8, maxSpeed: 45 + l * 14,
        spawnDelay: Math.max(700, 2400 - l * 150),
        maxWords: Math.min(4 + Math.floor(l / 2), 9),
    };
}

function calcWPM() {
    const elapsed = (performance.now() - state.startTime) / 60000;
    return elapsed < .01 ? 0 : Math.round(state.wordsHit / elapsed);
}
function calcAcc() {
    return state.totalCharsTyped === 0 ? 100 : Math.round((state.totalCharsCorrect / state.totalCharsTyped) * 100);
}

// ═══════════════════════════════════════════
// DOM
// ═══════════════════════════════════════════
const $ = id => document.getElementById(id);
const gameArea = $('game-area');

function showScreen(id) {
    ['start-screen', 'game-screen', 'leaderboard-screen'].forEach(s => {
        $(s).classList.toggle('hidden', s !== id);
    });
    // Show/hide in-game menu button
    $('btn-menu-ingame').style.display = (id === 'game-screen') ? 'block' : 'none';
    // Toggle custom mobile keyboard (only present on touch devices)
    const mobileKbd = $('mobile-keyboard');
    if (mobileKbd) {
        if (id === 'game-screen') {
            mobileKbd.classList.remove('hidden');
            // Measure height after layout — use two rAF ticks to ensure rendering is done
            requestAnimationFrame(() => requestAnimationFrame(() => {
                const h = mobileKbd.offsetHeight;
                document.documentElement.style.setProperty('--kbd-height', h + 'px');
            }));
        } else {
            mobileKbd.classList.add('hidden');
        }
    }
}

function updateHUD() {
    const sv = $('hud-score');
    sv.textContent = String(state.score).padStart(6, '0');
    sv.classList.remove('pulse'); void sv.offsetWidth; sv.classList.add('pulse');
    $('level-badge').textContent = 'LVL ' + state.level;
    $('hud-wpm').textContent = calcWPM();
    $('hud-acc').textContent = state.totalCharsTyped > 0 ? calcAcc() + '%' : '–';
}

function updateHearts() {
    for (let i = 1; i <= 3; i++) {
        const el = $('h' + i);
        if (i > state.hearts) {
            el.classList.add('lost');
            el.classList.remove('fa-solid'); el.classList.add('fa-regular');
        } else {
            el.classList.remove('lost');
            el.classList.remove('fa-regular'); el.classList.add('fa-solid');
        }
    }
}

function flashScreen(type) {
    const el = $('flash-overlay');
    el.className = ''; void el.offsetWidth;
    if (type === 'miss') el.className = 'flash-red';
}

// ═══════════════════════════════════════════
// PARTICLES
// ═══════════════════════════════════════════
function spawnParticles(x, y, color, count = 8) {
    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = 3 + Math.random() * 4;
        p.style.cssText = `width:${size}px;height:${size}px;background:${color};box-shadow:0 0 6px ${color};left:${x}px;top:${y}px;`;
        gameArea.appendChild(p);
        const angle = (Math.PI * 2 * i) / count + Math.random() * .5;
        const speed = 60 + Math.random() * 80;
        const vx = Math.cos(angle) * speed, vy = Math.sin(angle) * speed;
        let px = x, py = y, life = 1, last = performance.now();
        const animate = now => {
            const dt = (now - last) / 1000; last = now; life -= dt * 2.5;
            px += vx * dt; py += vy * dt + 40 * dt;
            p.style.left = px + 'px'; p.style.top = py + 'px'; p.style.opacity = Math.max(0, life);
            if (life > 0) requestAnimationFrame(animate); else p.remove();
        };
        requestAnimationFrame(animate);
    }
}

function spawnShockwave(x) {
    const sw = document.createElement('div');
    sw.className = 'shockwave'; sw.style.left = x + 'px';
    gameArea.appendChild(sw);
    setTimeout(() => sw.remove(), 650);
}

// ═══════════════════════════════════════════
// WORDS
// ═══════════════════════════════════════════
let nextWordId = 0;

function createWord() {
    const cfg = getLevelConfig(state.level);
    if (state.words.length >= cfg.maxWords) return;
    const wordList = WORDS.filter(w => !state.words.find(wd => wd.text === w));
    const text = wordList[Math.floor(Math.random() * wordList.length)];
    const speed = cfg.minSpeed + Math.random() * (cfg.maxSpeed - cfg.minSpeed);
    const margin = 70;
    const x = margin + Math.random() * (window.innerWidth - margin * 2);
    const el = document.createElement('div');
    el.className = 'word-item zone-safe';
    el.style.left = x + 'px'; el.style.top = '-40px';
    gameArea.appendChild(el);
    const word = { id: nextWordId++, text, typed: 0, x, y: -40, speed, el, targeted: false, dead: false };
    renderWordEl(word);
    state.words.push(word);
}

function renderWordEl(word) {
    const typed = word.text.slice(0, word.typed);
    const rest = word.text.slice(word.typed);
    word.el.innerHTML = typed ? `<span class="typed-part">${typed}</span>${rest}` : rest;
}

function getZoneClass(y) {
    const kbdH = (window.mobileKbdHeight ? window.mobileKbdHeight() : 0);
    const groundY = window.innerHeight - 60 - kbdH;
    const pct = Math.max(0, Math.min(1, y / groundY));
    if (pct < .45) return 'zone-safe';
    if (pct < .68) return 'zone-warn';
    if (pct < .85) return 'zone-danger';
    return 'zone-critical';
}

function updateWordZone(word) {
    if (word.dead) return;
    word.el.className = `word-item ${getZoneClass(word.y)}${word.targeted ? ' targeted' : ''}`;
}

function setTargetedWord(word) {
    state.words.forEach(w => { if (w.targeted && w !== word) { w.targeted = false; updateWordZone(w); } });
    if (word) { word.targeted = true; updateWordZone(word); }
}

function clearTarget() {
    state.words.forEach(w => { if (w.targeted) { w.targeted = false; updateWordZone(w); } });
}

// ═══════════════════════════════════════════
// GAME LOOP
// ═══════════════════════════════════════════
let lastFrame = 0;
function gameLoop(now) {
    if (!state.running) return;
    const dt = Math.min((now - lastFrame) / 1000, .05);
    lastFrame = now;
    // Account for mobile keyboard + input bar height so ground is always visible
    const kbdH = (window.mobileKbdHeight ? window.mobileKbdHeight() : 0);
    const groundY = window.innerHeight - 60 - kbdH;
    state.words.forEach(word => {
        if (word.dead) return;
        word.y += word.speed * dt;
        word.el.style.top = word.y + 'px';
        updateWordZone(word);
        if (word.y + 30 >= groundY) hitGround(word);
    });
    if (state.wordsHit > 0 || state.totalCharsTyped > 0) {
        $('hud-wpm').textContent = calcWPM();
        $('hud-acc').textContent = calcAcc() + '%';
    }
    state.animFrame = requestAnimationFrame(gameLoop);
}

function hitGround(word) {
    if (word.dead) return;
    word.dead = true;
    const idx = state.words.indexOf(word);
    if (idx !== -1) state.words.splice(idx, 1);
    word.el.className = 'word-item breaking';
    playSound('miss'); flashScreen('miss');
    spawnParticles(word.x, window.innerHeight - 60, 'var(--neon-pink)', 12);
    spawnShockwave(word.x);
    state.combo = 0; updateComboDisplay();
    state.hearts--; state.wordsMissed++; updateHearts();
    if (state.hearts <= 0) setTimeout(() => endGame(), 600);
    setTimeout(() => word.el.remove(), 600);
    if (word.targeted) { $('type-input').value = ''; clearTarget(); }
}

// ═══════════════════════════════════════════
// INPUT
// ═══════════════════════════════════════════
$('type-input').addEventListener('input', (e) => {
    if (!state.running) return;
    const val = e.target.value.toLowerCase().replace(/\s/g, '');
    e.target.value = val;
    if (!val) {
        state.words.forEach(w => { w.typed = 0; renderWordEl(w); });
        clearTarget(); return;
    }
    playSound('type');
    state.totalCharsTyped++;
    let target = state.words.find(w => w.targeted && !w.dead);

    if (target) {
        if (target.text.startsWith(val)) {
            state.totalCharsCorrect++;
            target.typed = val.length; renderWordEl(target);
            $('type-input').classList.remove('correct-flash', 'wrong-flash');
            void $('type-input').offsetWidth; $('type-input').classList.add('correct-flash');
            if (val === target.text) { wordCompleted(target); e.target.value = ''; clearTarget(); }
        } else {
            const nm = state.words.filter(w => !w.dead && w.text.startsWith(val));
            if (nm.length) {
                const nt = nm.reduce((a, b) => a.y > b.y ? a : b);
                target.typed = 0; renderWordEl(target);
                setTargetedWord(nt); nt.typed = val.length; renderWordEl(nt);
                state.totalCharsCorrect++;
                $('type-input').classList.remove('correct-flash', 'wrong-flash');
                void $('type-input').offsetWidth; $('type-input').classList.add('correct-flash');
            } else {
                $('type-input').classList.remove('wrong-flash');
                void $('type-input').offsetWidth; $('type-input').classList.add('wrong-flash');
                e.target.value = val.slice(0, -1);
                const tv = e.target.value;
                if (target.text.startsWith(tv)) { target.typed = tv.length; }
                else { target.typed = 0; clearTarget(); e.target.value = ''; }
                renderWordEl(target);
            }
        }
    } else {
        const matches = state.words.filter(w => !w.dead && w.text.startsWith(val));
        if (matches.length) {
            const nt = matches.reduce((a, b) => a.y > b.y ? a : b);
            setTargetedWord(nt); nt.typed = val.length; renderWordEl(nt);
            state.totalCharsCorrect++;
            $('type-input').classList.remove('correct-flash', 'wrong-flash');
            void $('type-input').offsetWidth; $('type-input').classList.add('correct-flash');
            if (val === nt.text) { wordCompleted(nt); e.target.value = ''; clearTarget(); }
        } else {
            $('type-input').classList.remove('wrong-flash');
            void $('type-input').offsetWidth; $('type-input').classList.add('wrong-flash');
            e.target.value = '';
        }
    }
});

function wordCompleted(word) {
    if (word.dead) return;
    word.dead = true;
    const idx = state.words.indexOf(word);
    if (idx !== -1) state.words.splice(idx, 1);
    state.combo++;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    const mult = Math.max(1, Math.floor(state.combo / 3));
    state.score += (10 + word.text.length * 3) * mult;
    state.wordsHit++;
    playSound('hit');
    if (state.combo > 1 && state.combo % 3 === 0) playSound('combo');
    spawnParticles(word.x, word.y, 'var(--neon-green)', 10);
    word.el.className = 'word-item hit';
    setTimeout(() => word.el.remove(), 400);
    updateHUD(); updateComboDisplay();
    const newLevel = Math.floor(state.score / 300) + 1;
    if (newLevel > state.level) { state.level = newLevel; showLevelUp(); }
}

function updateComboDisplay() {
    const cd = $('combo-display');
    if (state.combo >= 2) {
        cd.classList.remove('hidden');
        $('combo-num').textContent = 'x' + Math.max(1, Math.floor(state.combo / 3) + 1);
    } else { cd.classList.add('hidden'); }
}

function showLevelUp() {
    playSound('levelup');
    const el = $('level-up-banner');
    el.textContent = '— LEVEL ' + state.level + ' —';
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    $('level-badge').style.color = 'var(--neon-yellow)';
    $('level-badge').style.borderColor = 'var(--neon-yellow)';
    setTimeout(() => { $('level-badge').style.color = ''; $('level-badge').style.borderColor = ''; }, 1600);
}

// ═══════════════════════════════════════════
// SPAWN
// ═══════════════════════════════════════════
function startSpawning() {
    clearInterval(state.spawnInterval);
    state.spawnInterval = setInterval(() => {
        if (state.running) { createWord(); clearInterval(state.spawnInterval); startSpawning(); }
    }, getLevelConfig(state.level).spawnDelay);
}

// ═══════════════════════════════════════════
// GAME FLOW
// ═══════════════════════════════════════════
function startGame() {
    state.running = false;
    cancelAnimationFrame(state.animFrame);
    clearInterval(state.spawnInterval);
    gameArea.innerHTML = '';
    Object.assign(state, {
        words: [], score: 0, hearts: 3, level: 1, combo: 0, maxCombo: 0,
        wordsHit: 0, wordsMissed: 0, totalCharsTyped: 0, totalCharsCorrect: 0,
        startTime: performance.now()
    });
    updateHUD(); updateHearts(); updateComboDisplay();
    $('type-input').value = '';
    showScreen('game-screen');
    setTimeout(() => $('type-input').focus(), 120);
    state.running = true;
    lastFrame = performance.now();
    state.animFrame = requestAnimationFrame(gameLoop);
    createWord(); setTimeout(createWord, 600); startSpawning();
}

function endGame() {
    state.running = false;
    cancelAnimationFrame(state.animFrame);
    clearInterval(state.spawnInterval);
    const wpm = calcWPM(), acc = calcAcc();
    const hs = getHighScore(), isNew = state.score > hs;
    showNameModal(state.score, wpm, acc, isNew ? state.score : hs);
}

// ═══════════════════════════════════════════
// NAME MODAL
// ═══════════════════════════════════════════
function showNameModal(score, wpm, acc, bestScore) {
    $('modal-score-val').textContent = String(score).padStart(6, '0');
    $('modal-wpm-val').textContent = wpm;
    $('modal-acc-val').textContent = acc + '%';
    $('modal-best-val').textContent = String(bestScore || 0).padStart(6, '0');
    $('modal-words-val').textContent = state.wordsHit;
    $('modal-combo-val').textContent = state.maxCombo;
    $('modal-name-input').value = '';
    $('modal-char-count').textContent = '0/12';
    $('name-modal-backdrop').classList.add('open');
    setTimeout(() => $('modal-name-input').focus(), 200);
}

function closeNameModal(name, goToStart) {
    $('name-modal-backdrop').classList.remove('open');
    const finalName = (name || 'ANON').toUpperCase().substring(0, 12);
    saveScore(finalName, state.score, state.maxCombo, state.wordsHit, calcWPM(), calcAcc());
    updateMenuHighScore();
    if (goToStart) showScreen('start-screen');
}

$('modal-name-input').addEventListener('input', e => {
    $('modal-char-count').textContent = e.target.value.length + '/12';
});
$('modal-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); closeNameModal($('modal-name-input').value, true); }
    if (e.key === 'Escape') closeNameModal('ANON', true);
});
$('btn-modal-confirm').addEventListener('click', () => closeNameModal($('modal-name-input').value, true));
$('btn-modal-skip').addEventListener('click', () => closeNameModal('ANON', true));

function updateMenuHighScore() {
    $('menu-high-score').textContent = String(getHighScore()).padStart(6, '0');
}

// ═══════════════════════════════════════════
// LEADERBOARD
// ═══════════════════════════════════════════
function showLeaderboard() {
    const lb = getLeaderboard();
    const rows = $('lb-rows');
    rows.innerHTML = '';
    if (!lb.length) {
        rows.innerHTML = '<div style="padding:1.8rem;text-align:center;color:var(--text-dim);font-size:.8rem;letter-spacing:.2em">NO SCORES YET</div>';
    } else {
        lb.forEach((entry, i) => {
            const row = document.createElement('div');
            row.className = 'lb-row';
            const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
            const rankIcon = i === 0 ? '<i class="fa-solid fa-crown" style="color:var(--neon-yellow)"></i>'
                : i === 1 ? '<i class="fa-solid fa-medal" style="color:#c0c0c0"></i>'
                    : i === 2 ? '<i class="fa-solid fa-medal" style="color:#cd7f32"></i>'
                        : (i + 1);
            row.innerHTML = `
    <span class="lb-rank ${rankClass}">${rankIcon}</span>
    <span class="lb-name">${entry.name}</span>
    <span class="lb-score">${String(entry.score).padStart(6, '0')}</span>
  `;
            rows.appendChild(row);
        });
    }
    showScreen('leaderboard-screen');
}

// ═══════════════════════════════════════════
// CURSOR + EVENTS
// ═══════════════════════════════════════════
document.addEventListener('mousemove', e => {
    const c = $('cursor'); c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px';
});

$('btn-start').addEventListener('click', startGame);
$('btn-leaderboard').addEventListener('click', showLeaderboard);
$('btn-lb-back').addEventListener('click', () => showScreen('start-screen'));
$('btn-menu-ingame').addEventListener('click', () => {
    if (!state.running) return;
    // Pause the game
    state.running = false;
    cancelAnimationFrame(state.animFrame);
    clearInterval(state.spawnInterval);
    // Show pause modal
    $('pause-modal-backdrop').classList.add('open');
});

$('btn-pause-continue').addEventListener('click', () => {
    $('pause-modal-backdrop').classList.remove('open');
    // 3-2-1 countdown before resuming
    const overlay = $('countdown-overlay');
    const numEl = $('countdown-number');
    let count = 3;
    overlay.classList.add('active');
    numEl.textContent = count;
    // restart animation
    void numEl.offsetWidth; numEl.style.animation = 'none'; void numEl.offsetWidth;
    numEl.style.animation = '';
    const tick = setInterval(() => {
        count--;
        if (count <= 0) {
            clearInterval(tick);
            overlay.classList.remove('active');
            state.running = true;
            lastFrame = performance.now();
            state.animFrame = requestAnimationFrame(gameLoop);
            startSpawning();
            $('type-input').focus();
        } else {
            numEl.textContent = count;
            void numEl.offsetWidth; numEl.style.animation = 'none'; void numEl.offsetWidth;
            numEl.style.animation = '';
        }
    }, 900);
});

$('btn-pause-home').addEventListener('click', () => {
    // Show confirm modal on top of pause modal
    $('confirm-modal-backdrop').classList.add('open');
});

$('btn-confirm-yes').addEventListener('click', () => {
    $('confirm-modal-backdrop').classList.remove('open');
    $('pause-modal-backdrop').classList.remove('open');
    // Clean up game state
    state.words.forEach(w => { if (w.el) w.el.remove(); });
    state.words = [];
    showScreen('start-screen');
});

$('btn-confirm-no').addEventListener('click', () => {
    $('confirm-modal-backdrop').classList.remove('open');
});

// ── SECRET CODE (homescreen) ──────────────────────────
(function () {
    const SECRET = 'jamwassogreat';
    let typed = '';
    document.addEventListener('keydown', e => {
        // Only active on start screen
        if (!$('start-screen').classList.contains('hidden')) {
            typed += e.key.toLowerCase();
            if (typed.length > SECRET.length) typed = typed.slice(-SECRET.length);
            if (typed === SECRET) {
                localStorage.removeItem(LS_KEY);
                updateMenuHighScore();
                typed = '';
                const toast = $('secret-toast');
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 2500);
            }
        } else {
            typed = '';
        }
    });
})();

document.addEventListener('keydown', e => {
    if (state.running && document.activeElement !== $('type-input')) $('type-input').focus();
});
$('game-area').addEventListener('touchstart', () => { if (state.running) $('type-input').focus(); });

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
updateMenuHighScore();

(function animateGrid() {
    const grid = $('grid-bg'); let offset = 0;
    setInterval(() => { offset = (offset + .3) % 48; grid.style.backgroundPosition = `0 ${offset}px`; }, 16);
})();

// ═══════════════════════════════════════════
// CUSTOM MOBILE KEYBOARD
// ═══════════════════════════════════════════
(function () {
    // Strict mobile/tablet detection — excludes laptops with touch screens
    // Only activate if the PRIMARY pointer is coarse (finger), not fine (mouse)
    const isMobileOrTablet = () => {
        const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
        const noFinePointer = !window.matchMedia('(pointer: fine)').matches;
        const hasTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
        return coarsePointer && noFinePointer && hasTouch;
    };

    if (!isMobileOrTablet()) return; // desktop: use native keyboard, no custom kbd shown

    const kbd = $('mobile-keyboard');
    const typeInput = $('type-input');

    // Mark body so CSS can offset game elements
    document.body.classList.add('mobile-kbd-active');

    // ── Height tracking ──────────────────────
    function getKbdHeight() {
        return kbd.classList.contains('hidden') ? 0 : kbd.offsetHeight;
    }
    function updateKbdHeight() {
        const h = getKbdHeight();
        document.documentElement.style.setProperty('--kbd-height', h + 'px');
    }
    window.addEventListener('resize', updateKbdHeight);

    // Expose so gameLoop can read the real usable game area bottom
    window.mobileKbdHeight = getKbdHeight;

    // ── Block native OS keyboard ─────────────
    // inputmode=none is the strongest signal to suppress the OS keyboard
    typeInput.setAttribute('readonly', 'readonly');
    typeInput.setAttribute('inputmode', 'none');
    typeInput.addEventListener('focus', () => typeInput.blur());

    // ── Key injection ────────────────────────
    // We bypass the readonly guard by temporarily removing it, mutating value,
    // restoring it, then dispatching a real InputEvent so the game handler fires normally.
    function injectChar(key) {
        if (!state.running) return;
        typeInput.removeAttribute('readonly');
        if (key === 'Backspace') {
            typeInput.value = typeInput.value.slice(0, -1);
        } else {
            typeInput.value += key.toLowerCase();
        }
        typeInput.setAttribute('readonly', 'readonly');
        // Dispatch as InputEvent so e.target.value is correct inside the handler
        typeInput.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
    }

    // ── Touch handlers ───────────────────────
    kbd.addEventListener('touchstart', e => {
        e.preventDefault(); // critical: blocks OS keyboard + scroll
        const btn = e.target.closest('.kbd-key');
        if (!btn) return;
        btn.classList.add('pressed');
        injectChar(btn.dataset.key);
    }, { passive: false });

    kbd.addEventListener('touchend', e => {
        e.preventDefault();
        const btn = e.target.closest('.kbd-key');
        if (btn) setTimeout(() => btn.classList.remove('pressed'), 80);
    }, { passive: false });

    // Prevent any touch on the keyboard from bubbling to game-area
    kbd.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

    // ── Name modal: restore native kb for callsign entry ──
    $('name-modal-backdrop').addEventListener('transitionend', () => {
        const isOpen = $('name-modal-backdrop').classList.contains('open');
        const nameInput = $('modal-name-input');
        if (isOpen) {
            nameInput.removeAttribute('readonly');
            nameInput.removeAttribute('inputmode');
            setTimeout(() => nameInput.focus(), 150);
        } else {
            typeInput.setAttribute('readonly', 'readonly');
            typeInput.setAttribute('inputmode', 'none');
        }
    });

    // Initial height measurement after first show
    kbd.addEventListener('transitionend', updateKbdHeight);
    setTimeout(updateKbdHeight, 100);
})();