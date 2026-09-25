// ============================================================
//  app.js — 参加者の 画面
//
//  しんだん → なまえ → じゅんびの 2問 → 本編の 質問 → 結果（卓・つよさ・合言葉）
//  文字送りは 速く、途中でも 選択肢を おせます。待たせません。
//  見た目は ボードゲームライブラリー（BGL）と 同じ 部品で 組んでいます。
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
  prePicked: {},      // じゅんびの 問いで えらんだ もの（もどった ときに 印を つける）
  preIndex: 0,
  answers: [],
  started: false
};

const $screen = document.getElementById('screen');

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
// tab      … したの タブの どれを 光らせるか（'ask' / 'seat'）
// lede     … いちばん 上の 見出し
// progress … { label, now, total }
// text     … ぬしの セリフ
// extra    … セリフの 下に ならべる ウィンドウ
// after    … ボタンの 下に ならべる もの
// input    … なまえ入力（{ value, onSubmit }）
// choices  … [{ label, onPick, kind: 'hero' | 'primary', picked }]
// back     … 小さな「もどる」ボタン（{ label, onPick }）
function render(opts) {
  finishTyping();
  setTab(opts.tab || 'ask');
  const wrap = h('div', { class: 'screen-in' });

  if (opts.lede) wrap.appendChild(h('h1', { class: 'lede', text: opts.lede }));

  if (opts.progress) {
    const pct = Math.round(100 * opts.progress.now / opts.progress.total);
    wrap.appendChild(h('div', { class: 'progress' }, [
      h('span', { text: opts.progress.label }),
      h('div', { class: 'bar', role: 'presentation' }, [h('i', { style: 'width:' + pct + '%' })])
    ]));
  }

  const textEl = h('div', { class: 'msg-text' });
  const msg = h('section', { class: 'win msg', onclick: finishTyping }, [
    h('div', { class: 'msg-icon', 'data-icon': SITE.hostIcon, 'aria-hidden': 'true' }),
    h('div', { class: 'msg-body' }, [h('div', { class: 'msg-name', text: SITE.host }), textEl]),
    h('span', { class: 'msg-next', text: '▼', 'aria-hidden': 'true' })
  ]);
  const stack = h('div', { class: 'stack' }, [msg]);
  (opts.extra || []).forEach((el) => stack.appendChild(el));

  if (opts.input) {
    const input = h('input', {
      type: 'text', value: opts.input.value || '', maxlength: '12',
      placeholder: 'なまえ', autocomplete: 'off', enterkeyhint: 'done', 'aria-label': 'なまえ'
    });
    const submit = () => { finishTyping(); opts.input.onSubmit(input.value); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    stack.appendChild(h('section', { class: 'win' }, [
      h('h2', { text: 'なまえ' }),
      h('div', { class: 'field' }, [input, h('button', { class: 'btn primary', type: 'button', text: 'けってい', onclick: submit })])
    ]));
    setTimeout(() => { try { input.focus({ preventScroll: true }); } catch (e) {} }, 50);
  }

  if (opts.choices && opts.choices.length) {
    const col = h('div', { class: 'btn-col' });
    opts.choices.forEach((c) => {
      const cls = 'btn' + (c.kind ? ' ' + c.kind : '') + (c.picked ? ' picked' : '');
      const kids = c.kind === 'hero' ? [h('span', { class: 'arrow', text: '▶', 'aria-hidden': 'true' }), c.label] : [c.label];
      col.appendChild(h('button', { class: cls, type: 'button', onclick: () => { finishTyping(); c.onPick(); } }, kids));
    });
    stack.appendChild(col);
  }

  (opts.after || []).forEach((el) => stack.appendChild(el));

  if (opts.back) {
    stack.appendChild(h('div', { class: 'back-row' }, [
      h('button', { class: 'btn small', type: 'button', text: '◀ ' + opts.back.label, onclick: () => { finishTyping(); opts.back.onPick(); } })
    ]));
  }

  wrap.appendChild(stack);
  $screen.replaceChildren(wrap);
  paintIcons(wrap);
  window.scrollTo(0, 0);
  typeInto(msg, textEl, opts.text || '');
}

// BGL の「なかまの なまえ」と 同じ 形の カード
function linkCard(icon, title, sub, onPick) {
  return h('button', { class: 'link-card', type: 'button', onclick: () => { finishTyping(); onPick(); } }, [
    h('span', { class: 'i', 'data-icon': icon, 'aria-hidden': 'true' }),
    h('span', {}, [h('span', { class: 't', text: title, style: 'display:block' }), h('span', { class: 's', text: sub, style: 'display:block' })]),
    h('span', { class: 'go', text: '▶', 'aria-hidden': 'true' })
  ]);
}

// ---- したの タブ ------------------------------------------
const $tabs = document.querySelectorAll('.tab[data-tab]');
function setTab(name) {
  $tabs.forEach((t) => t.setAttribute('aria-current', String(t.dataset.tab === name)));
}
$tabs.forEach((t) => t.addEventListener('click', () => {
  Sound.se('cursor');
  if (t.dataset.tab === 'seat') seatsScreen();
  else titleScreen();
}));
const $library = document.getElementById('tab-library');
if ($library && SITE.libraryUrl) $library.setAttribute('href', SITE.libraryUrl);

// まだ 見ていない 席の はっぴょうが あれば、「せき」タブに 点を つける
function paintSeatDot() {
  const dot = document.getElementById('seat-dot');
  const data = Store.get('seats', null);
  if (dot) dot.hidden = !(data && data.at && Store.get('seatsSeen', 0) !== data.at);
}

// ---- 画面たち ----------------------------------------------
function titleScreen() {
  const last = Store.get('last', null);
  const seats = Store.get('seats', null);
  const extra = [];
  if (seats && seats.seats && seats.seats.length) {
    extra.push(linkCard('seat', 'きょうの せき', 'かんじが はっぴょう した せきを みる', () => { Sound.se('decide'); seatsScreen(); }));
  }
  if (last && TABLES[last.table]) {
    const t = TABLES[last.table];
    extra.push(linkCard('star', 'まえの けっか', t.label + ' ' + t.name + '・あいことば ' + last.code, () => { Sound.se('decide'); resultScreen(last, false); }));
  }
  render({
    lede: 'せきを きめる しんだん',
    text: LINES.welcome,
    after: extra,
    choices: [{ label: 'しんだんを はじめる', kind: 'hero', onPick: () => { Sound.se('decide'); nameScreen(); } }]
  });
}

// 最初の ひと押しで BGM を はじめる（iPhone では 押した 瞬間 しか 許可が 取れない）
function begin() {
  if (state.started) return;
  state.started = true;
  Sound.unlock();
  Sound.bgm('main');
}

function nameScreen() {
  render({
    lede: 'なまえ',
    text: LINES.askName,
    input: { value: state.name, onSubmit: submitName },
    back: { label: 'もどる', onPick: () => { Sound.se('cancel'); titleScreen(); } }
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
    lede: 'じゅんび',
    progress: { label: (i + 1) + ' / ' + PRE_QUESTIONS.length, now: i, total: PRE_QUESTIONS.length },
    text: intro + q.text,
    choices: q.options.map((o) => ({
      label: o.label,
      picked: state.prePicked[q.key] && state[q.key] === o.value,
      onPick: () => {
        state[q.key] = o.value;
        state.prePicked[q.key] = true;
        Sound.se('decide');
        if (i + 1 < PRE_QUESTIONS.length) { state.preIndex = i + 1; preScreen(); }
        else questionScreen(0);
      }
    })),
    back: { label: 'ひとつ もどる', onPick: () => {
      Sound.se('cancel');
      if (i > 0) { state.preIndex = i - 1; preScreen(); } else nameScreen();
    } }
  });
}

function questionScreen(i) {
  const q = QUESTIONS[i];
  const intro = i === 0 ? LINES.qIntro + '\n\n' : '';
  render({
    lede: 'しつもん',
    progress: { label: (i + 1) + ' / ' + QUESTIONS.length, now: i, total: QUESTIONS.length },
    text: intro + q.text,
    choices: q.options.map((o, ci) => ({
      label: o.label,
      picked: state.answers[i] === ci,
      onPick: () => {
        state.answers[i] = ci;
        Sound.se('decide');
        if (i + 1 < QUESTIONS.length) questionScreen(i + 1);
        else finish();
      }
    })),
    back: { label: 'ひとつ もどる', onPick: () => {
      Sound.se('cancel');
      if (i > 0) questionScreen(i - 1);
      else { state.preIndex = PRE_QUESTIONS.length - 1; preScreen(); }
    } }
  });
}

function finish() {
  state.answers.length = QUESTIONS.length;
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
  state.answers = [];
  state.prePicked = {};
  Sound.se('fanfare');
  resultScreen(res, true);
}

function statRows(stats) {
  const rows = [];
  STATS.forEach((s) => {
    const n = stats[s.key];
    const filled = Math.round(n);
    const blocks = h('span', { class: 'blocks', 'aria-label': filled + ' / 4' });
    for (let i = 0; i < 4; i++) blocks.appendChild(h('span', { class: 'block' + (i < filled ? ' on' : '') }));
    const word = n >= 8 / 3 ? s.high : (n <= 4 / 3 ? s.low : 'ふつう');
    rows.push(h('span', { text: s.name }), blocks, h('span', { class: 'stat-word', text: word }));
  });
  return rows;
}

function resultScreen(res, fresh) {
  const t = TABLES[res.table];
  const head = h('section', { class: 'win' }, [
    h('h2', { text: res.name + ' の たく' }),
    h('div', { class: 'result-name tc', style: tableTone(res.table) }, [h('span', { class: 'sq', 'aria-hidden': 'true' }), t.label + ' ' + t.name]),
    h('div', { class: 'result-type', text: t.type }),
    h('p', { class: 'result-desc', text: t.desc })
  ]);
  const stats = h('section', { class: 'win' }, [
    h('h2', { text: 'つよさ' }),
    h('div', { class: 'stats' }, statRows(res.stats))
  ]);
  const code = h('section', { class: 'win' }, [
    h('h2', { text: 'あいことば' }),
    h('div', { class: 'code', text: res.code }),
    h('div', { class: 'code-note', text: 'かんじに この 4もじを みせてね' })
  ]);

  const choices = [];
  if (Store.get('seats', null)) choices.push({ label: 'きょうの せきを みる', kind: 'primary', onPick: () => { Sound.se('decide'); seatsScreen(); } });
  choices.push({ label: 'もういちど しんだん する', onPick: () => { Sound.se('decide'); nameScreen(); } });

  render({
    lede: 'しんだん けっか',
    text: fresh ? LINES.result : LINES.resume.replace('{name}', res.name),
    extra: [head, code, stats],
    choices,
    back: { label: 'はじめに もどる', onPick: () => { Sound.se('cancel'); titleScreen(); } }
  });
}

function seatsScreen() {
  const data = Store.get('seats', null);
  if (!data || !data.seats || !data.seats.length) {
    render({ tab: 'seat', lede: 'きょうの せき', text: LINES.seatsNone });
    return;
  }
  Store.set('seatsSeen', data.at || 0);
  paintSeatDot();

  const groups = [];
  const byLabel = {};
  data.seats.forEach((s) => {
    if (!byLabel[s.g]) { byLabel[s.g] = { label: s.g, key: s.k, names: [] }; groups.push(byLabel[s.g]); }
    byLabel[s.g].names.push(s.n);
  });
  const me = state.name || Store.get('name', '');
  const mine = groups.find((g) => g.names.indexOf(me) >= 0);
  // じぶんの 卓を いちばん 上に
  if (mine) { groups.splice(groups.indexOf(mine), 1); groups.unshift(mine); }

  const extra = groups.map((g) => h('section', { class: 'win' }, [
    h('h2', { class: 'colored tc', style: tableTone(g.key), text: g.label + (g === mine ? '　← おぬし' : '') }),
    h('div', { class: 'seat-names' }, g.names.map((n) => h('span', { class: n === me ? 'me' : '', text: n === me ? n + '（おぬし）' : n })))
  ]));
  render({
    tab: 'seat',
    lede: 'きょうの せき',
    text: mine ? LINES.seatsMine.replace('{name}', me).replace('{table}', mine.label) : LINES.seatsIn,
    extra
  });
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

paintIcons(document);
bindTopbar(() => { state.started = true; Sound.bgm('main'); });
if (importPublished()) seatsScreen();
else titleScreen();
paintSeatDot();

// すでに 開いている ページで リンクを ひらくと、# から後ろだけが 変わって
// 読みこみ直しに ならないことが ある。その 変化も ひろう。
window.addEventListener('hashchange', () => { if (importPublished()) seatsScreen(); });

// 最初に 画面の どこかを おした 瞬間に 音の 許可を とり、BGM を はじめる。
// タッチの 場合、指を 置いた 瞬間（pointerdown）では 許可が 取れないので click で。
// capture で ボタンの 処理より 先に 走らせる。
document.addEventListener('click', begin, { capture: true, once: true });
