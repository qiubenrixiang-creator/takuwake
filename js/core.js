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
// ボードゲームライブラリーと 同じく Web Audio で 鳴らします。
//
// まえは ふつうの Audio（<audio>）で 鳴らして いましたが、iPhone では
//   ・画面を おした その 瞬間 以外に 鳴らすと、だまって ことわられる
//   ・同じ 音を つづけて 鳴らすと、まえの 指示が あとの 音を 止めてしまう
//   ・ほかの アプリに 切りかえたり 画面を ロックすると、そのまま 止まる
// という ことが 起きて、とちゅうで 音が 鳴らなく なって いました。
//
// Web Audio は、一度 画面を おして 目を さませば、あとは いつでも 何度でも 鳴らせます。
// 止まって しまっても、つぎに 画面を おした ときに かならず 目を さまします。
// 音の データは 最初に 1回だけ 読みこみ、あとは それを 使いまわします。
const Sound = (function () {
  const AC = window.AudioContext || window.webkitAudioContext;
  // Web Audio は 音の ファイルを 読みこむ（fetch）ので、サイトとして 開いた ときだけ 使う。
  // パソコンで index.html を 直接 開いた ときは、ふつうの Audio で 鳴らす。
  const useCtx = !!AC && /^https?:$/.test(location.protocol);
  let ctx = null;
  let unlocked = false;
  const defs = {};      // name → { src, loop, volume }
  const bufs = {};      // name → 読みこんだ 音
  const loading = {};   // name → 読みこみ中
  const voices = {};    // name → 鳴っている 音（止める ため）
  const els = {};       // ふつうの Audio（よび）
  let bgmOn = Shared.read('bgm', true) !== false;
  let seOn = Shared.read('se', true) !== false;
  let currentBgm = null;
  let bgmVoice = null;  // { name, src, g }

  function getCtx() {
    if (ctx || !useCtx) return ctx;
    try { ctx = new AC(); } catch (e) { ctx = null; }
    return ctx;
  }

  function wake() {
    if (ctx && ctx.state !== 'running') { try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  }

  function fetchBuf(name) {
    if (bufs[name]) return Promise.resolve(bufs[name]);
    if (loading[name]) return loading[name];
    const c = getCtx();
    if (!c || !defs[name]) return Promise.reject(new Error('no'));
    const p = fetch(defs[name].src)
      .then((r) => { if (!r.ok) throw new Error('notfound'); return r.arrayBuffer(); })
      .then((ab) => new Promise((ok, ng) => {
        // ふるい Safari は コールバック しか 使えない
        const pr = c.decodeAudioData(ab, ok, ng);
        if (pr && pr.then) pr.then(ok, ng);
      }))
      .then((buf) => { bufs[name] = buf; if (defs[name].loop) measure(name, buf); return buf; });
    loading[name] = p;
    p.catch(() => { delete loading[name]; });
    return p;
  }

  // mp3 の 前後に つく 無音を はかって、くりかえしの つなぎめを なめらかに する
  function measure(name, buf) {
    const d = buf.getChannelData(0), n = d.length, TH = 0.0015;
    let a = 0; while (a < n && Math.abs(d[a]) < TH) a++;
    let b = n - 1; while (b > a && Math.abs(d[b]) < TH) b--;
    if (b - a < buf.sampleRate) { a = 0; b = n - 1; }
    defs[name].a = a / buf.sampleRate;
    defs[name].b = (b + 1) / buf.sampleRate;
  }

  // ページを 開いた 時点で、効果音も BGM も 読みこんで おく。
  // こうして おくと、画面に さわった 瞬間に すぐ 鳴らせる（読みこみ待ちで 遅れない）。
  // 画面の 表示を じゃま しないよう、効果音 → BGM の 順に、表示の あとで 読む。
  function load(map) {
    Object.keys(map).forEach((k) => { defs[k] = Object.assign({}, map[k]); });
    if (!getCtx()) return;
    const keys = Object.keys(map);
    const go = () => {
      Promise.all(keys.filter((k) => !map[k].loop).map((k) => fetchBuf(k).catch(() => {})))
        .then(() => keys.filter((k) => map[k].loop).forEach((k) => fetchBuf(k).catch(() => {})));
    };
    if (document.readyState === 'complete') setTimeout(go, 0);
    else window.addEventListener('load', () => setTimeout(go, 0), { once: true });
  }

  // 画面を おすたびに よぶ。止まって いたら 目を さます。
  function unlock() {
    const c = getCtx();
    if (!c) return;
    wake();
    if (!unlocked) {
      unlocked = true;
      // 無音を ひとつ 鳴らして iPhone の ロックを はずす
      try {
        const s = c.createBufferSource();
        s.buffer = c.createBuffer(1, 1, 22050);
        s.connect(c.destination);
        s.start(0);
      } catch (e) {}
    }
    if (bgmOn && currentBgm && !bgmVoice) startBgm();
  }

  // ---- ふつうの Audio（よび）----
  function el(name) {
    if (!els[name]) {
      const a = new Audio(defs[name].src);
      a.loop = !!defs[name].loop;
      a.volume = defs[name].volume == null ? 1 : defs[name].volume;
      els[name] = a;
    }
    return els[name];
  }

  function se(name) {
    if (!seOn || !defs[name]) return;
    if (!ctx) {
      try { const a = el(name); a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
      return;
    }
    wake();
    const buf = bufs[name];
    if (!buf) { fetchBuf(name).catch(() => {}); return; }   // まだ 読みこみ中なら 今回は 鳴らさない（遅れて 鳴るのを ふせぐ）
    try {
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      g.gain.value = defs[name].volume == null ? 1 : defs[name].volume;
      src.buffer = buf;
      src.connect(g); g.connect(ctx.destination);
      const v = { src };
      (voices[name] = voices[name] || []).push(v);
      src.onended = () => { voices[name] = (voices[name] || []).filter((x) => x !== v); };
      src.start(0);
    } catch (e) {}
  }

  function stop(name) {
    if (els[name]) { try { els[name].pause(); } catch (e) {} }
    (voices[name] || []).forEach((v) => { try { v.src.onended = null; v.src.stop(0); } catch (e) {} });
    voices[name] = [];
  }

  function startBgm() {
    const name = currentBgm;
    if (!bgmOn || !name || !defs[name]) return;
    if (!ctx) {
      try { const a = el(name); const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
      return;
    }
    if (bgmVoice) return;
    wake();
    fetchBuf(name).then((buf) => {
      // 読みこみの あいだに 止められた・曲が 変わった・もう 鳴っている ときは 何もしない
      if (!bgmOn || currentBgm !== name || bgmVoice) return;
      const d = defs[name];
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      src.buffer = buf;
      src.loop = true;
      if (d.b) { src.loopStart = d.a; src.loopEnd = d.b; }
      // すぐに 聞こえるよう、ふわっと 出す 時間は ごく 短く
      const vol = d.volume == null ? 1 : d.volume;
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.06);
      src.connect(g); g.connect(ctx.destination);
      src.start(0, d.a || 0);
      bgmVoice = { name, src, g };
    }).catch(() => {});
  }

  function stopBgm() {
    Object.keys(els).forEach((k) => { if (defs[k] && defs[k].loop) { try { els[k].pause(); } catch (e) {} } });
    if (!bgmVoice || !ctx) { bgmVoice = null; return; }
    const v = bgmVoice;
    bgmVoice = null;
    try {
      const t = ctx.currentTime;
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setValueAtTime(v.g.gain.value, t);
      v.g.gain.linearRampToValueAtTime(0, t + 0.15);
      v.src.stop(t + 0.2);
    } catch (e) {}
  }

  function bgm(name) {
    if (bgmVoice && bgmVoice.name !== name) stopBgm();
    currentBgm = name;
    startBgm();
  }

  function setBgm(on) {
    bgmOn = !!on;
    Shared.write('bgm', bgmOn);
    if (bgmOn) startBgm(); else stopBgm();
  }

  function setSe(on) {
    seOn = !!on;
    Shared.write('se', seOn);
  }

  // 画面を おすたびに 目を さます（ほかの アプリから もどった あとや、電話の あとでも 鳴るように）
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach((t) => {
    document.addEventListener(t, unlock, { capture: true, passive: true });
  });
  // うらに まわったら 止めて、もどったら 再開する（電池の せつやく と、止まったままを ふせぐ）
  document.addEventListener('visibilitychange', () => {
    if (!ctx) {
      if (document.hidden) Object.keys(els).forEach((k) => { if (defs[k].loop) try { els[k].pause(); } catch (e) {} });
      else if (bgmOn && currentBgm) startBgm();
      return;
    }
    if (document.hidden) { try { ctx.suspend(); } catch (e) {} }
    else if (unlocked) wake();
  });

  return {
    load, unlock, se, stop, bgm, setBgm, setSe,
    isBgm: () => bgmOn, isSe: () => seOn,
    // ようすを しらべる ため（テスト用）
    debug: () => ({ mode: useCtx ? 'webaudio' : 'audio', state: ctx ? ctx.state : 'none', bgm: bgmVoice ? bgmVoice.name : null, loaded: Object.keys(bufs) })
  };
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
  gear:   ['..#..#..', '.######.', '.#....#.', '##....##', '##....##', '.#....#.', '.######.', '..#..#..'],
  book:   ['.######.', '.#..#.#.', '.#..#.#.', '.#..#.#.', '.#..#.#.', '.#..#.#.', '.######.', '........'],
  crown:  ['........', '#..##..#', '#.####.#', '########', '########', '.######.', '.######.', '........'],
  lock:   ['..####..', '.#....#.', '.#....#.', '########', '###..###', '###..###', '########', '........'],
  star:   ['...##...', '...##...', '########', '.######.', '..####..', '.##..##.', '##....##', '........']
};

// 秘宝の ドット絵（data.js の TREASURES）も ICONS に くわえる
if (typeof TREASURES !== 'undefined') TREASURES.forEach((t) => { ICONS['t_' + t.key] = t.icon; });

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

// ---- たしかめの まど（BGL の ask と 同じ）--------------------------
// ask('けしますか？', () => { けす }, { yes: 'けす', danger: true })
function ask(msg, onYes, opts) {
  opts = opts || {};
  let back = document.getElementById('dialog');
  if (!back) {
    back = h('div', { id: 'dialog', class: 'dialog-back', hidden: 'hidden' }, [
      h('div', { class: 'dialog-win', role: 'dialog', 'aria-modal': 'true' }, [
        h('p', { id: 'dialog-msg' }),
        h('div', { class: 'btn-row' }, [
          h('button', { class: 'btn small', type: 'button', id: 'dialog-no' }),
          h('button', { class: 'btn small primary', type: 'button', id: 'dialog-yes' })
        ])
      ])
    ]);
    document.body.appendChild(back);
  }
  const yes = document.getElementById('dialog-yes');
  const no = document.getElementById('dialog-no');
  document.getElementById('dialog-msg').textContent = msg;
  yes.textContent = opts.yes || 'はい';
  no.textContent = opts.no || 'いいえ';
  yes.className = 'btn small ' + (opts.danger ? 'danger' : 'primary');
  back.hidden = false;
  const close = () => { back.hidden = true; yes.onclick = null; no.onclick = null; back.onclick = null; };
  yes.onclick = () => { close(); if (onYes) onYes(); };
  no.onclick = () => { close(); Sound.se('cancel'); };
  back.onclick = (e) => { if (e.target === back) { close(); Sound.se('cancel'); } };
  try { no.focus({ preventScroll: true }); } catch (e) {}
}

// ---- やくわり（さんかしゃ／かんじ）----------------------------------
// せっていで「かんじ」を えらんだ スマホだけが さくせんしつに 入れます。
function isHost() { return Store.get('role', '') === 'host'; }

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

// ---- きろく（図鑑・しょうごう）-------------------------------
// この 端末の 中だけに のこります。小さな かずだけ なので 重く なりません。
//   runs   … しんだんを おえた かず
//   met    … しんだんで であった たく { A: { n: かいすう, first: '2026-09-25' } }
//   sat    … はっぴょうで じっさいに すわった たく（おなじ かたち）
//   meets  … すわった かいの しるし（はっぴょうの 時刻。おなじ かいを 2どと かぞえない）
//   recent … さいごの 3かいの しんだん けっか
//   themes … しんだんを おえた ときの がめん（night / day）
//   flags  … ふしぎな ふるまいの しるし
const Record = {
  load() {
    const r = Store.get('record', null) || {};
    return {
      runs: r.runs | 0,
      met: r.met || {},
      sat: r.sat || {},
      meets: Array.isArray(r.meets) ? r.meets : [],
      recent: Array.isArray(r.recent) ? r.recent : [],
      themes: r.themes || {},
      flags: r.flags || {},
      days: Array.isArray(r.days) ? r.days : [],   // しんだんを おえた 日（ちがう 日を かぞえる）
      pokes: r.pokes | 0,                          // ぬしの かおを つついた かず（あわせて）
      backs: r.backs | 0                           // ひきかえした かず（あわせて）
    };
  },
  save(r) { Store.set('record', r); },
  clear() { ['record', 'titles', 'title', 'fresh', 'treasures'].forEach((k) => Store.remove(k)); }
};

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// 図鑑で「NEW」を つける もの（'table:A' や しょうごうの key）
function markFresh(keys) {
  if (!keys.length) return;
  const f = Store.get('fresh', []);
  keys.forEach((k) => { if (f.indexOf(k) < 0) f.push(k); });
  Store.set('fresh', f);
}

// しんだんを おえた とき。
// run = { table, answers, backs, ms, hour, theme, skips（ぬしの ことばを さえぎった かず）, silent（音なしで おえた）}
function recordRun(run) {
  const r = Record.load();
  r.runs++;
  const fresh = [];
  if (!r.met[run.table]) { r.met[run.table] = { n: 0, first: todayStr() }; fresh.push('table:' + run.table); }
  r.met[run.table].n++;
  r.recent = r.recent.concat(run.table).slice(-3);
  r.themes[run.theme] = 1;
  const a = run.answers;
  if (a.length && a.every((x) => x === 1)) r.flags.middle = 1;
  if (a.length && a.every((x) => x !== 1)) r.flags.extreme = 1;
  if (run.backs === 0 && run.ms <= 20000) r.flags.swift = 1;
  if (run.backs >= 5) r.flags.waver = 1;
  if (run.hour >= 0 && run.hour < 4) r.flags.owl = 1;
  // 秘宝の しるし
  if (run.backs >= 10) r.flags.compass = 1;
  if (run.backs === 0 && run.ms <= 10000) r.flags.kutsu = 1;
  if (a.length && a.every((x) => x === 2)) r.flags.men = 1;
  if (run.silent) r.flags.suzu = 1;
  if (run.hour >= 18 && run.hour <= 23) r.flags.sunadokei = 1;
  if (run.backs === 0 && run.skips === 0) r.flags.eda = 1;
  const day = todayStr();
  if (r.days.indexOf(day) < 0) r.days = r.days.concat(day).slice(-30);
  Record.save(r);
  markFresh(fresh);
  return settle(r);
}

// はっぴょうで じぶんの せきを みた とき（at は はっぴょうの 時刻）
function recordSeat(table, at) {
  const r = Record.load();
  if (!TABLES[table] || r.meets.indexOf(at) >= 0) return [];
  r.meets = r.meets.concat(at).slice(-100);
  if (!r.sat[table]) r.sat[table] = { n: 0, first: todayStr() };
  r.sat[table].n++;
  Record.save(r);
  return settle(r);
}

function recordFlag(name) {
  const r = Record.load();
  r.flags[name] = 1;
  Record.save(r);
  return settle(r);
}

// あわせての かず（pokes / backs）を ふやす
function recordCount(name, n) {
  const r = Record.load();
  r[name] = (r[name] | 0) + (n || 1);
  Record.save(r);
  return settle(r);
}

// しょうごう と 秘宝を まとめて しらべる。しょうごうの リストを かえし、
// 秘宝は「まだ 見せていない 秘宝」に ためて おく（画面の まんなかに 出すため）。
function settle(r) {
  const titles = earnTitles(r);
  earnTreasures(r);
  return titles;
}

// ---- 秘宝 --------------------------------------------------
// data.js の TREASURES と key で つながる。later の 秘宝は まだ 条件が ない。
const TREASURE_RULES = {
  crystal:   (r) => !!r.flags.crystal,
  compass:   (r) => !!r.flags.compass,
  inkpot:    (r) => !!r.flags.inkpot,
  key:       (r) => r.days.length >= 3,
  shiori:    (r) => TABLE_KEYS.every((k) => r.sat[k]),
  hige:      (r) => r.pokes >= 100,
  kutsu:     (r) => !!r.flags.kutsu,
  men:       (r) => !!r.flags.men,
  suzu:      (r) => !!r.flags.suzu,
  himo:      (r) => r.backs >= 30,
  sunadokei: (r) => !!r.flags.sunadokei,
  utsushimi: (r) => !!r.flags.utsushimi,
  eda:       (r) => !!r.flags.eda,
  sand:      (r) => TABLE_KEYS.every((k) => r.met[k]) && !!Store.get('titles', {}).legend
};

let pendingTreasures = [];
function earnTreasures(r) {
  const have = Store.get('treasures', {});
  const add = [];
  TREASURES.forEach((t) => {
    if (have[t.key] || t.later) return;
    const rule = TREASURE_RULES[t.key];
    if (rule && rule(r)) { have[t.key] = todayStr(); add.push(t); }
  });
  if (add.length) {
    Store.set('treasures', have);
    markFresh(add.map((t) => 't:' + t.key));
    pendingTreasures = pendingTreasures.concat(add);
  }
  return add;
}

// ためて おいた 秘宝を ひとつずつ 画面の まんなかに 出す
function flushTreasures() {
  if (!pendingTreasures.length || document.getElementById('treasure-back')) return;
  const t = pendingTreasures.shift();
  showTreasure(t, true, flushTreasures);
}

function showTreasure(t, fresh, onClose) {
  const have = Store.get('treasures', {});
  const back = h('div', { id: 'treasure-back', class: 'dialog-back' }, [
    h('div', { class: 'dialog-win treasure-win' + (fresh ? ' fresh' : ''), role: 'dialog', 'aria-modal': 'true' }, [
      h('div', { class: 'tr-head', text: fresh ? 'ひほうを てに いれた！' : 'ひほう' }),
      h('div', { class: 'tr-ico', 'data-icon': 't_' + t.key, 'aria-hidden': 'true' }),
      h('div', { class: 'tr-name', text: t.name }),
      h('p', { class: 'tr-lore', text: t.lore }),
      h('div', { class: 'tr-how', text: 'てに いれた わけ：' + t.how + (have[t.key] ? '（' + have[t.key].replace(/-/g, '/') + '）' : '') }),
      h('button', { class: 'btn primary', type: 'button', text: 'とじる', onclick: () => {
        back.remove();
        Sound.se('cursor');
        if (onClose) onClose();
      } })
    ])
  ]);
  document.body.appendChild(back);
  paintIcons(back);
  if (fresh) Sound.se('fanfare');
}

// しょうごうの 条件（data.js の TITLES と key で つながる）
const TITLE_RULES = {
  visit1:   (r) => r.runs >= 1,
  visit5:   (r) => r.runs >= 5,
  visit15:  (r) => r.runs >= 15,
  met4:     (r) => Object.keys(r.met).length >= 4,
  met8:     (r) => TABLE_KEYS.every((k) => r.met[k]),
  sat1:     (r) => r.meets.length >= 1,
  meets3:   (r) => r.meets.length >= 3,
  sat8:     (r) => TABLE_KEYS.every((k) => r.sat[k]),
  swift:    (r) => !!r.flags.swift,
  waver:    (r) => !!r.flags.waver,
  middle:   (r) => !!r.flags.middle,
  extreme:  (r) => !!r.flags.extreme,
  shift:    (r) => r.recent.length >= 3 && new Set(r.recent).size === 3,
  poke:     (r) => !!r.flags.poke,
  owl:      (r) => !!r.flags.owl,
  daynight: (r) => !!(r.themes.night && r.themes.day)
};
TABLE_KEYS.forEach((k) => { TITLE_RULES['lord' + k] = (r) => !!(r.met[k] && r.met[k].n >= 3); });

// 条件を みたした しょうごうを てに いれて、あたらしく 手に いれた ものを かえす
function earnTitles(r) {
  const have = Store.get('titles', {});
  const add = [];
  TITLES.forEach((t) => {
    if (have[t.key] || t.key === 'legend') return;
    const rule = TITLE_RULES[t.key];
    if (rule && rule(r)) { have[t.key] = todayStr(); add.push(t); }
  });
  const legend = TITLES.find((t) => t.key === 'legend');
  if (legend && !have.legend && TITLES.every((t) => t.key === 'legend' || have[t.key])) { have.legend = todayStr(); add.push(legend); }
  if (add.length) { Store.set('titles', have); markFresh(add.map((t) => t.key)); }
  return add;
}

function titleByKey(key) { return TITLES.find((t) => t.key === key) || null; }

// ひとに みせる しょうごう（えらんで いれば それ、なければ さいごに 手に いれた もの）
function shownTitle() {
  const have = Store.get('titles', {});
  const pick = Store.get('title', '');
  if (pick && have[pick] && titleByKey(pick)) return titleByKey(pick);
  const keys = Object.keys(have).filter((k) => titleByKey(k));
  return keys.length ? titleByKey(keys[keys.length - 1]) : null;
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
