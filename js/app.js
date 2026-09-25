// ============================================================
//  app.js — 参加者の 画面
//
//  はじめる → なまえ → じゅんびの 2問 → 本編の 質問 → 結果（卓・つよさ・合言葉）
//  文字送りは 速く、途中でも 選択肢を おせます。待たせません。
// ============================================================

Sound.load({
  main:    { src: 'assets/audio/bgm_main.mp3', loop: true, volume: 0.6 },
  decide:  { src: 'assets/audio/se_decide.mp3' },
  cancel:  { src: 'assets/audio/se_cancel.mp3' },
  cursor:  { src: 'assets/audio/se_back.mp3' },
  fanfare: { src: 'assets/audio/se_fanfare.mp3' },
  talk:    { src: 'assets/audio/se_talk.mp3', volume: 0.5 }
});

const state = {
  name: Store.get('name', ''),
  exp: 1,
  leave: 0,
  preIndex: 0,
  answers: [],
  started: false
};

const $screen = document.getElementById('screen');
const $sound = document.getElementById('btn-sound');

// ---- 小さな 道具 ----------------------------------------
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

// ---- 文字送り --------------------------------------------
// 1秒に およそ 60文字。メッセージを たたくと 全文が 出ます。
let typing = null;

function typeInto(box, textEl, text) {
  finishTyping();
  const node = document.createTextNode('');
  textEl.appendChild(node);
  box.classList.remove('done');
  if (!text) { box.classList.add('done'); return; }
  Sound.se('talk');
  const t = { box, node, text, i: 0, raf: 0 };
  const step = () => {
    t.i = Math.min(text.length, t.i + 1);
    node.nodeValue = text.slice(0, t.i);
    if (t.i < text.length) t.raf = requestAnimationFrame(step);
    else endTyping(t);
  };
  t.raf = requestAnimationFrame(step);
  typing = t;
}

function endTyping(t) {
  Sound.stop('talk');
  t.box.classList.add('done');
  if (typing === t) typing = null;
}

function finishTyping() {
  if (!typing) return;
  cancelAnimationFrame(typing.raf);
  typing.node.nodeValue = typing.text;
  endTyping(typing);
}

// ---- 画面を 組み立てる ------------------------------------
// text     … ぬしの セリフ
// choices  … [{ label, onPick, sub, accent }]
// extra    … メッセージと 選択肢の あいだに 入れる ウィンドウ
// input    … なまえ入力（{ value, onSubmit }）
// progress … { label, now, total }
function render(opts) {
  finishTyping();
  const wrap = h('div', { class: 'screen-in' });

  if (opts.progress) {
    const pips = h('div', { class: 'pips' });
    for (let i = 0; i < opts.progress.total; i++) pips.appendChild(h('span', { class: 'pip' + (i < opts.progress.now ? ' on' : '') }));
    wrap.appendChild(h('div', { class: 'progress' }, [h('span', { text: opts.progress.label }), pips]));
  }

  const textEl = h('div', { class: 'msg-text' });
  const msg = h('section', { class: 'win msg', onclick: finishTyping }, [
    h('span', { class: 'win-title', text: SITE.host }),
    h('div', { class: 'msg-icon', text: SITE.hostIcon, 'aria-hidden': 'true' }),
    textEl,
    h('span', { class: 'msg-next', text: '▼', 'aria-hidden': 'true' })
  ]);
  wrap.appendChild(msg);

  (opts.extra || []).forEach((el) => wrap.appendChild(el));

  const cmd = h('nav', { class: 'win cmd' });
  if (opts.input) {
    const input = h('input', {
      class: 'input', type: 'text', value: opts.input.value || '', maxlength: '12',
      placeholder: 'なまえ', autocomplete: 'off', enterkeyhint: 'done'
    });
    const submit = () => { finishTyping(); opts.input.onSubmit(input.value); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    cmd.appendChild(h('div', { class: 'field' }, [input, h('button', { class: 'btn', type: 'button', text: 'けってい', onclick: submit })]));
    setTimeout(() => { try { input.focus({ preventScroll: true }); } catch (e) {} }, 50);
  }
  (opts.choices || []).forEach((c) => {
    cmd.appendChild(h('button', {
      class: 'opt' + (c.sub ? ' sub' : '') + (c.accent ? ' accent' : ''),
      type: 'button', text: c.label,
      onclick: () => { finishTyping(); c.onPick(); }
    }));
  });
  wrap.appendChild(cmd);

  $screen.replaceChildren(wrap);
  window.scrollTo(0, 0);
  typeInto(msg, textEl, opts.text || '');
}

// ---- おと ------------------------------------------------
function paintSound() {
  const on = Sound.isEnabled();
  $sound.textContent = on ? 'おと ON' : 'おと OFF';
  $sound.classList.toggle('off', !on);
}

$sound.addEventListener('click', () => {
  const on = !Sound.isEnabled();
  Sound.setEnabled(on);
  if (on) { Sound.unlock(); if (state.started) Sound.bgm('main'); Sound.se('cursor'); }
  paintSound();
});

// ---- 画面たち ----------------------------------------------
function titleScreen() {
  const last = Store.get('last', null);
  const seats = Store.get('seats', null);
  const choices = [
    { label: 'はじめる', accent: true, onPick: () => start(true) },
    { label: 'おとなしで はじめる', onPick: () => start(false) }
  ];
  if (last) choices.push({ label: 'まえの けっかを みる', sub: true, onPick: () => { begin(); resultScreen(last, false); } });
  if (seats) choices.push({ label: 'きょうの せきを みる', sub: true, onPick: () => { begin(); seatsScreen(); } });
  render({ text: LINES.welcome, choices });
}

// 最初の ひと押しで 音の 許可を とる（iPhone では この 瞬間 しか 取れない）
function begin() {
  if (state.started) return;
  state.started = true;
  if (Sound.isEnabled()) { Sound.unlock(); Sound.bgm('main'); }
}

function start(withSound) {
  Sound.setEnabled(withSound);
  paintSound();
  begin();
  Sound.se('decide');
  nameScreen();
}

function nameScreen() {
  render({
    text: LINES.askName,
    input: { value: state.name, onSubmit: submitName },
    choices: [{ label: 'もどる', sub: true, onPick: () => { Sound.se('cancel'); titleScreen(); } }]
  });
}

function submitName(raw) {
  const name = String(raw || '').trim();
  if (name === ADMIN_WORDS.kumi) {
    try { sessionStorage.setItem('takuwake2.kumiPass', '1'); } catch (e) {}
    Sound.se('decide');
    location.href = 'kumi.html';
    return;
  }
  if (!name) { Sound.se('cancel'); return say(LINES.noName); }
  if (NG_WORDS.test(name)) { Sound.se('cancel'); return say(LINES.badName); }
  state.name = name;
  Store.set('name', name);
  state.preIndex = 0;
  Sound.se('decide');
  preScreen();
}

// 今の 画面の まま、ぬしの セリフだけ 変える
function say(text) {
  const box = $screen.querySelector('.msg');
  const el = $screen.querySelector('.msg-text');
  if (!box || !el) return;
  finishTyping();
  el.textContent = '';
  typeInto(box, el, text);
}

function preScreen() {
  const i = state.preIndex;
  const q = PRE_QUESTIONS[i];
  const intro = i === 0 ? LINES.preIntro.replace('{name}', state.name) + '\n' : '';
  render({
    progress: { label: 'じゅんび ' + (i + 1) + ' / ' + PRE_QUESTIONS.length, now: i, total: PRE_QUESTIONS.length },
    text: intro + q.text,
    choices: q.options.map((o) => ({
      label: o.label,
      onPick: () => {
        state[q.key] = o.value;
        Sound.se('decide');
        if (i + 1 < PRE_QUESTIONS.length) { state.preIndex = i + 1; preScreen(); }
        else { state.answers = []; questionScreen(0); }
      }
    })).concat([{ label: 'ひとつ もどる', sub: true, onPick: () => {
      Sound.se('cancel');
      if (i > 0) { state.preIndex = i - 1; preScreen(); } else nameScreen();
    } }])
  });
}

function questionScreen(i) {
  const q = QUESTIONS[i];
  const intro = i === 0 ? LINES.qIntro + '\n\n' : '';
  render({
    progress: { label: 'しつもん ' + (i + 1) + ' / ' + QUESTIONS.length, now: i, total: QUESTIONS.length },
    text: intro + q.text,
    choices: q.options.map((o, ci) => ({
      label: o.label,
      onPick: () => {
        state.answers[i] = ci;
        state.answers.length = i + 1;
        Sound.se('decide');
        if (i + 1 < QUESTIONS.length) questionScreen(i + 1);
        else finish();
      }
    })).concat([{ label: 'ひとつ もどる', sub: true, onPick: () => {
      Sound.se('cancel');
      if (i > 0) questionScreen(i - 1);
      else { state.preIndex = PRE_QUESTIONS.length - 1; preScreen(); }
    } }])
  });
}

function finish() {
  const r = diagnose(state.answers);
  const res = {
    name: state.name,
    table: r.table,
    stats: r.stats,
    exp: state.exp,
    leave: state.leave,
    code: encodeSeat(r.table, state.exp, state.leave, r.stats),
    at: Date.now()
  };
  Store.set('last', res);
  Sound.se('fanfare');
  resultScreen(res, true);
}

function statRows(stats) {
  const rows = [];
  STATS.forEach((s) => {
    const n = stats[s.key];
    const filled = Math.round(n);
    const blocks = h('div', { class: 'blocks' });
    for (let i = 0; i < 4; i++) blocks.appendChild(h('span', { class: 'block' + (i < filled ? ' on' : '') }));
    const word = n >= 8 / 3 ? s.high : (n <= 4 / 3 ? s.low : 'ふつう');
    rows.push(h('span', { class: 'stat-name', text: s.name }));
    rows.push(h('div', { class: 'stat-bar' }, [blocks, h('span', { class: 'stat-word', text: word })]));
  });
  return rows;
}

function resultScreen(res, fresh) {
  const t = TABLES[res.table];
  const head = h('section', { class: 'win' }, [
    h('span', { class: 'win-title', text: 'しんだん けっか' }),
    h('div', { class: 'result-head' }, [
      h('div', { class: 'result-label', text: res.name + ' の たくは' }),
      h('div', { class: 'result-name', text: t.label + ' ' + t.name, style: 'color:' + t.color }),
      h('div', { class: 'result-type', text: t.type })
    ]),
    h('p', { class: 'result-desc', text: t.desc })
  ]);
  const stats = h('section', { class: 'win' }, [
    h('span', { class: 'win-title', text: 'つよさ' }),
    h('div', { class: 'stats' }, statRows(res.stats))
  ]);
  const code = h('section', { class: 'win' }, [
    h('span', { class: 'win-title', text: 'あいことば' }),
    h('div', { class: 'code-box' }, [
      h('div', { class: 'code', text: res.code }),
      h('div', { class: 'code-note', text: 'かんじに この 4もじを みせる' })
    ])
  ]);

  const choices = [];
  if (Store.get('seats', null)) choices.push({ label: 'きょうの せきを みる', accent: true, onPick: () => { Sound.se('decide'); seatsScreen(); } });
  choices.push({ label: 'もういちど しんだん する', onPick: () => { Sound.se('decide'); nameScreen(); } });
  choices.push({ label: 'はじめに もどる', sub: true, onPick: () => { Sound.se('cancel'); titleScreen(); } });

  render({
    text: fresh ? LINES.result : LINES.resume.replace('{name}', res.name),
    extra: [head, stats, code],
    choices
  });
}

function seatsScreen() {
  const data = Store.get('seats', null);
  const back = [{ label: 'もどる', sub: true, onPick: () => { Sound.se('cancel'); titleScreen(); } }];
  if (!data || !data.seats || !data.seats.length) {
    render({ text: LINES.seatsNone, choices: back });
    return;
  }
  const groups = [];
  const byLabel = {};
  data.seats.forEach((s) => {
    if (!byLabel[s.g]) { byLabel[s.g] = { label: s.g, key: s.k, names: [] }; groups.push(byLabel[s.g]); }
    byLabel[s.g].names.push(s.n);
  });
  const me = state.name || Store.get('name', '');
  const extra = groups.map((g) => {
    const color = TABLES[g.key] ? TABLES[g.key].color : 'var(--accent)';
    const title = h('span', { class: 'win-title', text: g.label });
    title.style.color = color;
    return h('section', { class: 'win seat-group', style: 'border-color:' + color }, [
      title,
      h('div', { class: 'seat-names' }, g.names.map((n) => h('span', { class: n === me ? 'me' : '', text: n === me ? n + '（おぬし）' : n })))
    ]);
  });
  render({ text: LINES.seatsIn, extra, choices: back });
}

// ---- はじまり ----------------------------------------------
// 幹事の 発表リンク（#r=...）で 開かれたら、席を この端末に 取りこむ
function importPublished() {
  const m = (location.hash || '').match(/[#&]r=([^&]+)/);
  if (!m) return false;
  const data = decodePublish(m[1]);
  history.replaceState(null, '', location.pathname + location.search);
  if (!data) return false;
  Store.set('seats', data);
  return true;
}

paintSound();
if (importPublished()) seatsScreen();
else titleScreen();

// すでに 開いている ページで リンクを ひらくと、# から後ろだけが 変わって
// 読みこみ直しに ならないことが ある。その 変化も ひろう。
window.addEventListener('hashchange', () => { if (importPublished()) seatsScreen(); });

// 最初に 画面の どこかを おした 瞬間に 音の 許可を とる。
// タッチの 場合、指を 置いた 瞬間（pointerdown）では 許可が 取れないので click で。
// capture で ボタンの 処理より 先に 走らせる。
document.addEventListener('click', () => { if (Sound.isEnabled()) Sound.unlock(); }, { capture: true, once: true });
