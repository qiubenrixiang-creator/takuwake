// ============================================================
//  core.js — 参加者の画面と 卓組みの間で 共通に つかう 部品
//  ・保存（この端末の中だけ）
//  ・音
//  ・診断の 計算
//  ・合言葉（4文字）と 発表リンク
// ============================================================

// ---- 保存 ------------------------------------------------
// ボードゲームライブラリーと 同じ github.io に 置くと、保存場所を 共有します。
// まざらないよう、名前の 頭に 'takuwake2.' を つけています。
const Store = {
  prefix: 'takuwake2.',
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(this.prefix + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(this.prefix + key, JSON.stringify(value)); } catch (e) { /* 保存できなくても 画面は 続けられる */ }
  },
  remove(key) {
    try { localStorage.removeItem(this.prefix + key); } catch (e) {}
  }
};

// 名前など 人が 入力した 文字を 画面に 出すときは、必ず これを 通す
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- 画面の 部品を つくる 小さな 道具 ---------------------------
// h('button', { class: 'btn', text: 'おす', onclick: fn }, [子ども])
function h(tag, attrs, children) {
  const el = document.createElement(tag);
  if (attrs) Object.keys(attrs).forEach((k) => {
    const v = attrs[k];
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v);
  });
  (children || []).forEach((c) => { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return el;
}

// 卓の 色。よる／ひるで 見やすい 色が ちがうので、両方を わたしておき
// CSS（.tc）の がわで えらびます。切りかえても すぐ 色が かわります。
function tableTone(key) {
  const t = TABLES[key];
  return t ? '--tc:' + t.color + ';--tc-day:' + (t.day || t.color) : '';
}

// ---- BGLと 共有する 設定 ------------------------------------
// ボードゲームライブラリー（BGL）と 同じ github.io に 置くと、
// 「よる／ひる」「BGM」「効果音」の 設定を BGL と 共有します。
// どちらで 切りかえても、もう一方にも 反映されます。
const Shared = {
  keys: { theme: 'bgl.theme2', bgm: 'bgl.bgmEnabled', se: 'bgl.seEnabled' },
  read(name, fallback) {
    try { const v = localStorage.getItem(this.keys[name]); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  },
  write(name, value) {
    try { localStorage.setItem(this.keys[name], JSON.stringify(value)); } catch (e) {}
  }
};

const Theme = {
  get() { return Shared.read('theme', 'night') === 'day' ? 'day' : 'night'; },
  apply(t) {
    if (t === 'day') document.documentElement.setAttribute('data-theme', 'day');
    else document.documentElement.removeAttribute('data-theme');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'day' ? '#FFFFFF' : '#0A0E24');
  },
  toggle() { const t = this.get() === 'day' ? 'night' : 'day'; Shared.write('theme', t); this.apply(t); return t; }
};
Theme.apply(Theme.get());

// ---- 音 --------------------------------------------------
// play() は「鳴らす じゅんびを せよ」という 要求で、音が 出るまで 時間差が あります。
// その間に 止めても あとから 鳴りだすので、札を つけて 確実に 止めます。
const Sound = (function () {
  const nativePlay = HTMLMediaElement.prototype.play;
  const nativePause = HTMLMediaElement.prototype.pause;
  const bank = {};
  let bgmOn = Shared.read('bgm', true) !== false;
  let seOn = Shared.read('se', true) !== false;
  let ready = null;          // 許可を とり終えたら 解決する
  let currentBgm = null;

  function make(src, loop, volume) {
    const a = new Audio(src);
    a.preload = 'auto';
    a.loop = !!loop;
    a.volume = volume == null ? 1 : volume;
    let token = 0;
    a._play = function () {
      const mine = ++token;
      let p;
      try { p = nativePlay.call(a); } catch (e) { return; }
      if (p && p.then) p.then(() => { if (mine !== token) { nativePause.call(a); a.currentTime = 0; } }).catch(() => {});
    };
    a._stop = function () { token++; try { nativePause.call(a); } catch (e) {} };
    return a;
  }

  function load(map) {
    Object.keys(map).forEach((k) => { const m = map[k]; bank[k] = make(m.src, m.loop, m.volume); });
  }

  // iPhone は「一度も 鳴らしたことの ない 音」を あとから 鳴らせません。
  // 画面を おした（click の）瞬間に、すべての 音に 無音で 許可を とります。
  // 許可を とり終えるまでは、鳴らす指示を 順番に 待たせます（途中で 鳴らすと 止められるため）。
  function unlock() {
    if (ready) return ready;
    ready = Promise.all(Object.values(bank).map((a) => new Promise((done) => {
      const settle = () => { try { nativePause.call(a); a.currentTime = 0; } catch (e) {} a.muted = false; done(); };
      try {
        a.muted = true;
        const p = nativePlay.call(a);
        if (p && p.then) p.then(settle).catch(settle); else settle();
      } catch (e) { a.muted = false; done(); }
    })));
    return ready;
  }

  function whenReady(fn) { if (ready) ready.then(fn); }

  function se(name) {
    if (!seOn || !bank[name]) return;
    whenReady(() => { const a = bank[name]; a.currentTime = 0; a._play(); });
  }

  function stop(name) {
    if (!bank[name]) return;
    bank[name]._stop();
    whenReady(() => bank[name]._stop());
  }

  function bgm(name) {
    if (currentBgm && currentBgm !== name && bank[currentBgm]) bank[currentBgm]._stop();
    currentBgm = name;
    if (!bgmOn || !bank[name]) return;
    whenReady(() => { if (bgmOn && currentBgm === name) bank[name]._play(); });
  }

  function setBgm(on) {
    bgmOn = !!on;
    Shared.write('bgm', bgmOn);
    if (!currentBgm || !bank[currentBgm]) return;
    if (bgmOn) { unlock(); whenReady(() => { if (bgmOn) bank[currentBgm]._play(); }); }
    else bank[currentBgm]._stop();
  }

  function setSe(on) {
    seOn = !!on;
    Shared.write('se', seOn);
    if (seOn) unlock();
  }

  return { load, unlock, se, stop, bgm, setBgm, setSe, isBgm: () => bgmOn, isSe: () => seOn };
})();

// ---- ドット絵の アイコン（BGLと 同じ 描きかた）------------------
// '#' の ところだけ 塗った 小さな 四角を ならべて SVG に します。
const ICONS = {
  yakata: ['...##...', '..####..', '.######.', '########', '.##..##.', '.##..##.', '.######.', '.##..##.'],
  nushi:  ['..####..', '.#....#.', '#..#...#', '#.#....#', '#......#', '.#....#.', '..####..', '.######.'],
  ask:    ['..####..', '.##..##.', '.....##.', '....##..', '...##...', '...##...', '........', '...##...'],
  seat:   ['........', '.######.', '.######.', '..#..#..', '#.#..#.#', '###..###', '#.#..#.#', '........'],
  chest:  ['..####..', '.######.', '.#.##.#.', '########', '#..##..#', '#..##..#', '########', '........'],
  key:    ['.###....', '#...#...', '#...####', '#...#.#.', '.###....', '........', '........', '........'],
  door:   ['.######.', '.#....#.', '.#....#.', '.#....#.', '.#...##.', '.#....#.', '.#....#.', '.######.'],
  star:   ['...##...', '...##...', '########', '.######.', '..####..', '.##..##.', '##....##', '........']
};

function pix(name) {
  const map = ICONS[name];
  if (!map) return '';
  const w = Math.max.apply(null, map.map((r) => r.length));
  let rects = '';
  map.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '#') rects += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>'; });
  return '<svg viewBox="0 0 ' + w + ' ' + map.length + '" width="100%" height="100%" fill="currentColor" shape-rendering="crispEdges" aria-hidden="true">' + rects + '</svg>';
}

function paintIcons(root) {
  (root || document).querySelectorAll('[data-icon]').forEach((el) => {
    if (!el.dataset.painted) { el.innerHTML = pix(el.dataset.icon); el.dataset.painted = '1'; }
  });
}

// ---- 下に 出る 小さな お知らせ（BGLの toast と 同じ）----------------
function toast(text) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 1800);
}

// ---- 上の バー（♪・SE・よる）を つなぐ ---------------------------
function bindTopbar(onBgmOn) {
  const $bgm = document.getElementById('btn-bgm');
  const $se = document.getElementById('btn-se');
  const $theme = document.getElementById('btn-theme');
  const paint = () => {
    if ($bgm) { $bgm.classList.toggle('off', !Sound.isBgm()); $bgm.setAttribute('aria-pressed', String(Sound.isBgm())); }
    if ($se) { $se.classList.toggle('off', !Sound.isSe()); $se.setAttribute('aria-pressed', String(Sound.isSe())); }
    if ($theme) $theme.textContent = Theme.get() === 'day' ? 'ひる' : 'よる';
  };
  if ($bgm) $bgm.addEventListener('click', () => {
    Sound.setBgm(!Sound.isBgm());
    if (Sound.isBgm() && onBgmOn) onBgmOn();
    toast(Sound.isBgm() ? 'BGMを ならします' : 'BGMを とめました');
    paint();
  });
  if ($se) $se.addEventListener('click', () => {
    Sound.setSe(!Sound.isSe());
    Sound.se('cursor');
    toast(Sound.isSe() ? 'こうかおんを ならします' : 'こうかおんを とめました');
    paint();
  });
  if ($theme) $theme.addEventListener('click', () => {
    Theme.toggle();
    Sound.se('cursor');
    paint();
  });
  paint();
}

// ---- 診断の 計算 ----------------------------------------
// こたえごとの 点数を 足し、7つの つよさを 0〜4 に ならして、
// いちばん 近い 性格の 卓を えらびます（bias で かたよりを 均します）。
function statRanges() {
  const lo = {}, hi = {};
  STATS.forEach((s) => { lo[s.key] = 0; hi[s.key] = 0; });
  QUESTIONS.forEach((q) => {
    STATS.forEach((s) => {
      const vals = q.options.map((o) => (o.points[s.key] || 0));
      lo[s.key] += Math.min(...vals);
      hi[s.key] += Math.max(...vals);
    });
  });
  return { lo, hi };
}

function diagnose(answers) {
  const { lo, hi } = statRanges();
  const raw = {};
  STATS.forEach((s) => { raw[s.key] = 0; });
  answers.forEach((choice, i) => {
    const pts = QUESTIONS[i].options[choice].points;
    Object.keys(pts).forEach((k) => { raw[k] += pts[k]; });
  });
  const norm = {};
  STATS.forEach((s) => {
    const k = s.key;
    norm[k] = hi[k] > lo[k] ? 4 * (raw[k] - lo[k]) / (hi[k] - lo[k]) : 2;
  });
  let best = null, bestD = Infinity;
  TABLE_KEYS.forEach((key) => {
    const t = TABLES[key];
    let d = t.bias || 0;
    STATS.forEach((s) => { d += Math.pow(norm[s.key] - t.profile[s.key], 2); });
    if (d < bestD - 1e-9) { bestD = d; best = key; }
  });
  return { table: best, stats: norm };
}

// ---- 合言葉（4文字）--------------------------------------
// 中身は「卓・腕前・途中退出・4つの つよさ（3段階）」。
// 4文字目は 検査用。打ち間違えると その場で はじかれます。
// 見間違えやすい 0 O 1 I は つかいません。
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
// 並び順を 変えると 以前の 合言葉が 読めなくなるので、足すときは 後ろに。
const CODE_TABLES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const CODE_AXES = ['w', 's', 't', 'p'];

function level3(n) { return n < 4 / 3 ? 0 : (n < 8 / 3 ? 1 : 2); }

function checkChar(body) {
  const w = [1, 3, 7];
  let sum = 0;
  for (let i = 0; i < 3; i++) sum += CODE_ALPHABET.indexOf(body[i]) * w[i];
  return CODE_ALPHABET[sum % 32];
}

function encodeSeat(table, exp, leave, stats) {
  let t = CODE_TABLES.indexOf(table); if (t < 0) t = 0;
  let axes = 0;
  CODE_AXES.forEach((k) => { axes = axes * 3 + level3(stats[k]); });
  let v = t;
  v = v * 3 + Math.max(0, Math.min(2, exp | 0));
  v = v * 2 + (leave ? 1 : 0);
  v = v * 81 + axes;
  v = v * 2 + 0;                                   // 予備（あとの 段階で つかう）
  let body = '';
  for (let i = 0; i < 3; i++) { body = CODE_ALPHABET[v % 32] + body; v = Math.floor(v / 32); }
  return body + checkChar(body);
}

function decodeSeat(code) {
  const s = String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (s.length !== 4) return null;
  for (const ch of s) if (CODE_ALPHABET.indexOf(ch) < 0) return null;
  const body = s.slice(0, 3);
  if (checkChar(body) !== s[3]) return null;
  let v = 0;
  for (const ch of body) v = v * 32 + CODE_ALPHABET.indexOf(ch);
  const flag = v % 2; v = Math.floor(v / 2);
  let axes = v % 81; v = Math.floor(v / 81);
  const leave = v % 2; v = Math.floor(v / 2);
  const exp = v % 3; v = Math.floor(v / 3);
  if (v >= CODE_TABLES.length) return null;
  const table = CODE_TABLES[v];
  const levels = {};
  for (let i = CODE_AXES.length - 1; i >= 0; i--) { levels[CODE_AXES[i]] = axes % 3; axes = Math.floor(axes / 3); }
  return { table, exp, leave, levels, flag };
}

// ---- 発表リンク ------------------------------------------
// 卓組みの 結果を URL の中に つめこみます。サーバーは つかいません。
function encodePublish(seats) {
  const json = JSON.stringify({ v: 1, at: Date.now(), seats });
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodePublish(str) {
  try {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
    const data = JSON.parse(decodeURIComponent(escape(atob(b64))));
    if (!data || !Array.isArray(data.seats)) return null;
    data.seats = data.seats
      .filter((s) => s && s.n)
      .map((s) => ({ n: String(s.n).slice(0, 20), g: String(s.g || '').slice(0, 20), k: String(s.k || '').slice(0, 2) }));
    return data;
  } catch (e) { return null; }
}
