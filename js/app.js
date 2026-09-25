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
  run: null,          // この しんだんの ようす（はじめた 時刻・もどった かず）
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
// tab      … したの タブの どれを 光らせるか（'ask' / 'zukan' / 'seat'）
// lede     … いちばん 上の 見出し
// sub      … 見出しの 下の 小さな 説明（BGL と 同じ）
// progress … { label, now, total }
// text     … ぬしの セリフ
// extra    … セリフの 下に ならべる ウィンドウ
// after    … ボタンの 下に ならべる もの
// input    … なまえ入力（{ value, onSubmit }）
// choices  … [{ label, onPick, kind: 'hero' | 'primary', picked }]
// back     … 小さな「もどる」ボタン（{ label, onPick }）
function render(opts) {
  finishTyping();
  stopIdleWatch();
  setTab(opts.tab || 'ask');
  const wrap = h('section', { class: 'page screen-in' });

  if (opts.lede) wrap.appendChild(h('h1', { class: 'lede', text: opts.lede }));
  if (opts.sub) wrap.appendChild(h('p', { class: 'sub', text: opts.sub }));

  if (opts.progress) {
    const pct = Math.round(100 * opts.progress.now / opts.progress.total);
    wrap.appendChild(h('div', { class: 'progress' }, [
      h('span', { text: opts.progress.label }),
      h('div', { class: 'bar', role: 'presentation' }, [h('i', { style: 'width:' + pct + '%' })])
    ]));
  }

  const textEl = h('div', { class: 'msg-text' });
  const msg = h('section', { class: 'win msg', onclick: interrupt }, [
    h('div', { class: 'msg-icon', 'data-icon': SITE.hostIcon, 'aria-hidden': 'true', onclick: pokeNushi }),
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
      col.appendChild(h('button', { class: cls, type: 'button', onclick: () => { interrupt(); c.onPick(); } }, kids));
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
  else if (t.dataset.tab === 'zukan') zukanScreen();
  else if (t.dataset.tab === 'set') settingsScreen();
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

// 図鑑に まだ 見ていない ものが あれば、「ずかん」タブに 点を つける
function paintZukanDot() {
  const dot = document.getElementById('zukan-dot');
  if (dot) dot.hidden = !Store.get('fresh', []).length;
}

// あたらしく 手に いれた しょうごうを 知らせる
// 秘宝が あれば、すこし 間を おいて 画面の まんなかに 出す
function announceTitles(list) {
  if (list && list.length) toast('しょうごう「' + list[list.length - 1].name + '」を てに いれた！');
  paintZukanDot();
  // しんだんの とちゅうでは 出さずに、けっかの 画面まで とっておく
  setTimeout(() => { if (!state.run) flushTreasures(); }, 700);
}

// ぬしの ことばを とちゅうで さえぎった ことを かぞえる（「静寂を破らぬ枝」のため）
function interrupt() {
  if (typing && state.run) state.run.skips++;
  finishTyping();
}

// ぬしの かおを すばやく 3かい たたくと……
let pokes = [];
function pokeNushi() {
  announceTitles(recordCount('pokes'));   // つついた かずを かぞえる（百たびで 秘宝）
  const now = Date.now();
  pokes = pokes.filter((t) => now - t < 1500).concat(now);
  if (pokes.length < 3) return;
  pokes = [];
  const got = Store.get('titles', {}).poke;
  Sound.se(got ? 'cancel' : 'fanfare');
  say(got ? LINES.poke2 : LINES.poke);
  if (!got) announceTitles(recordFlag('poke'));
}

// ---- 画面たち ----------------------------------------------
function titleScreen() {
  const last = Store.get('last', null);
  const seats = Store.get('seats', null);
  const extra = [];
  if (seats && seats.seats && seats.seats.length) {
    extra.push(linkCard('seat', 'きょうの せき', 'かんじが はっぴょう した せきを みる', () => { Sound.se('decide'); seatsScreen(); }));
  }
  if (isHost()) {
    extra.unshift(linkCard('key', SITE.room, 'かんじの へや：せきを くんで はっぴょう する', () => { Sound.se('decide'); location.href = 'kumi.html'; }));
  }
  if (last && TABLES[last.table]) {
    const t = TABLES[last.table];
    extra.push(linkCard('star', 'まえの けっか', t.label + ' ' + t.name + '・あいことば ' + last.code, () => { Sound.se('decide'); resultScreen(last, false); }));
  }
  render({
    lede: 'せきを きめる しんだん',
    sub: '8つの しつもんに こたえると、にた ものどうしが おなじ たくに あつまります。',
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
  if (!name) { Sound.se('cancel'); return say(LINES.noName); }
  if (NG_WORDS.test(name)) { Sound.se('cancel'); return say(LINES.badName); }
  state.name = name;
  Store.set('name', name);
  state.preIndex = 0;
  state.run = { start: Date.now(), backs: 0, skips: 0, silent: !Sound.isBgm() && !Sound.isSe() };
  // ぬしと おなじ 名を なのった
  const same = [SITE.host, 'ぬし', 'たくわけのぬし'].map(normWord);
  state.sameName = same.indexOf(normWord(name)) >= 0;
  if (state.sameName) announceTitles(recordFlag('utsushimi'));
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
  const intro = i === 0 ? (state.sameName ? LINES.sameName + '\n' : '') + LINES.preIntro.replace('{name}', state.name) + '\n' : '';
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
      if (state.run) state.run.backs++;
      recordCount('backs');
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
      if (state.run) state.run.backs++;
      recordCount('backs');
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
  const run = state.run || { start: 0, backs: 99, skips: 99, silent: false };
  const got = recordRun({
    table: r.table, answers: state.answers.slice(), backs: run.backs,
    ms: Date.now() - run.start, hour: new Date().getHours(), theme: Theme.get(),
    skips: run.skips, silent: run.silent && !Sound.isBgm() && !Sound.isSe()
  });
  state.answers = [];
  state.prePicked = {};
  state.run = null;
  Sound.se('fanfare');
  resultScreen(res, true, got);
  announceTitles(got);
  paintZukanDot();
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

function resultScreen(res, fresh, newTitles) {
  const t = TABLES[res.table];
  const shown = shownTitle();
  const head = h('section', { class: 'win' }, [
    h('h2', { text: res.name + ' の たく' }),
    shown ? h('div', { class: 'result-who', text: 'しょうごう：' + shown.name }) : null,
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

  const extra = [head, code, stats];
  if (newTitles && newTitles.length) {
    extra.unshift(h('section', { class: 'win new-titles' }, [
      h('h2', { text: 'あたらしい しょうごう' })
    ].concat(newTitles.map((nt) => h('div', { class: 'nt' }, [
      h('div', { class: 'nt-name' }, [h('span', { class: 'nt-ico', 'data-icon': 'crown', 'aria-hidden': 'true' }), nt.name]),
      h('div', { class: 'nt-desc', text: nt.desc })
    ]))).concat([h('button', { class: 'btn small', type: 'button', text: 'ずかんで みる ▶', onclick: () => { Sound.se('decide'); zukanScreen(); } })])));
  }
  const del = h('div', { class: 'back-row' }, [h('button', { class: 'btn danger small', type: 'button', text: 'この けっかを けす', onclick: () => {
    ask('この しんだん けっかを けします。よろしいですか。\n（ずかんと しょうごうは のこります）', () => {
      Store.remove('last');
      Sound.se('cancel');
      toast('けっかを けしました');
      titleScreen();
      announceTitles(recordFlag('inkpot'));
    }, { yes: 'けす', danger: true });
  } })]);
  render({
    after: [del],
    lede: 'しんだん けっか',
    text: fresh ? (newTitles && newTitles.length ? LINES.newTitle : LINES.result) : LINES.resume.replace('{name}', res.name),
    extra,
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
  if (mine) setTimeout(() => announceTitles(recordSeat(mine.key, data.at || 0)), 0);
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
  // せきを ひらいたまま 三分 うごかずに いると……（「万里を見透かす水晶」）
  startIdleWatch(180000, () => announceTitles(recordFlag('crystal')));
}

// 画面に さわらずに いた 時間を はかる（さわると はじめから）
let idle = null;
function startIdleWatch(ms, done) {
  stopIdleWatch();
  const reset = () => { clearTimeout(idle.t); if (!document.hidden) idle.t = setTimeout(fire, ms); };
  const fire = () => { stopIdleWatch(); done(); };
  idle = { t: 0, reset };
  ['pointerdown', 'keydown', 'wheel', 'touchmove'].forEach((e) => document.addEventListener(e, reset, { passive: true }));
  document.addEventListener('visibilitychange', reset);
  reset();
}
function stopIdleWatch() {
  if (!idle) return;
  clearTimeout(idle.t);
  ['pointerdown', 'keydown', 'wheel', 'touchmove'].forEach((e) => document.removeEventListener(e, idle.reset));
  document.removeEventListener('visibilitychange', idle.reset);
  idle = null;
}

// ---- ずかん ----------------------------------------------
// であった たく（8つ）と、てに いれた しょうごうが ならびます。
function zukanScreen() {
  const r = Record.load();
  const have = Store.get('titles', {});
  const fresh = Store.get('fresh', []);
  const shown = shownTitle();
  const metN = TABLE_KEYS.filter((k) => r.met[k]).length;
  const satN = TABLE_KEYS.filter((k) => r.sat[k]).length;
  const gotN = TITLES.filter((t) => have[t.key]).length;
  const trHave = Store.get('treasures', {});
  const trN = TREASURES.filter((t) => trHave[t.key]).length;

  // ひほう：名前も 手に入れ方も ふせて ならべる
  const trGrid = h('div', { class: 'tr-grid' }, TREASURES.map((t) => {
    if (!trHave[t.key]) {
      return h('div', { class: 'tr-card locked', 'aria-label': 'まだ みつけて いない ひほう' }, [
        h('span', { class: 'tr-card-ico', text: '？' }),
        h('span', { class: 'tr-card-name', text: '？？？' })
      ]);
    }
    return h('button', { class: 'tr-card', type: 'button', onclick: () => { Sound.se('decide'); showTreasure(t, false); } }, [
      fresh.indexOf('t:' + t.key) >= 0 ? h('span', { class: 'zk-new', text: 'NEW' }) : null,
      h('span', { class: 'tr-card-ico', 'data-icon': 't_' + t.key, 'aria-hidden': 'true' }),
      h('span', { class: 'tr-card-name', text: t.name })
    ]);
  }));
  const name = state.name || Store.get('name', '') || 'たびびと';

  // じぶんの カード（BGL の ぼうけんしゃカードと 同じ 形）
  const card = h('section', { class: 'adv' }, [
    h('div', { class: 'adv-head' }, [h('span', { class: 'adv-name', text: name }), h('span', { class: 'adv-lv', text: 'しんだん ' + r.runs + 'かい' })]),
    h('div', { class: 'adv-title' }, [h('small', { text: 'しょうごう' }), h('span', { text: shown ? shown.name : 'まだ ない' })]),
    h('div', { class: 'adv-nums' }, [
      h('span', {}, ['であった たく ', h('b', { text: metN + '/8' })]),
      h('span', {}, ['すわった たく ', h('b', { text: satN + '/8' })]),
      h('span', {}, ['しょうごう ', h('b', { text: gotN + '/' + TITLES.length })]),
      h('span', {}, ['ひほう ', h('b', { text: trN + '/' + TREASURES.length })])
    ])
  ]);

  // たくの ずかん
  const grid = h('div', { class: 'zk-grid' }, TABLE_KEYS.map((k) => {
    const t = TABLES[k], m = r.met[k], sat = r.sat[k];
    if (!m) {
      return h('div', { class: 'zk-card locked', 'aria-label': 'まだ であって いない たく' }, [
        h('span', { class: 'zk-mark', text: '？' }),
        h('span', { class: 'zk-name', text: '？？？' }),
        h('span', { class: 'zk-sub', text: 'まだ であって いない' })
      ]);
    }
    return h('button', { class: 'zk-card', type: 'button', onclick: () => { Sound.se('decide'); tableScreen(k); } }, [
      fresh.indexOf('table:' + k) >= 0 ? h('span', { class: 'zk-new', text: 'NEW' }) : null,
      h('span', { class: 'zk-mark tc', style: tableTone(k), text: t.label }),
      h('span', { class: 'zk-name', text: t.name }),
      h('span', { class: 'zk-sub', text: 'しんだん ' + m.n + (sat ? '・すわった ' + sat.n : '') })
    ]);
  }));

  // しょうごう
  const titleBox = h('div', { class: 'win tl' });
  TITLE_GROUPS.forEach((g) => {
    const list = TITLES.filter((t) => t.group === g.key);
    if (!list.length) return;
    titleBox.appendChild(h('div', { class: 'catlabel', text: g.name }));
    list.forEach((t) => {
      const got = !!have[t.key];
      const isShown = shown && shown.key === t.key;
      const row = h(got ? 'button' : 'div', {
        class: 'tl-row' + (got ? ' got' : '') + (isShown ? ' on' : ''),
        type: got ? 'button' : null,
        onclick: got ? () => pickTitle(t.key) : null
      }, [
        h('span', { class: 'tl-mark', text: isShown ? '▶' : (got ? '✓' : '・') }),
        h('span', { class: 'tl-body' }, [
          h('span', { class: 'tl-name' }, [got ? t.name : '？？？', fresh.indexOf(t.key) >= 0 ? h('span', { class: 'zk-new inline', text: 'NEW' }) : null]),
          h('span', { class: 'tl-how', text: got ? t.desc : (t.secret ? 'ひみつ：' + t.how : t.how) })
        ]),
        h('span', { class: 'tl-date', text: got ? have[t.key].slice(5).replace('-', '/') : '' })
      ]);
      titleBox.appendChild(row);
    });
  });

  render({
    tab: 'zukan',
    lede: 'ずかん',
    sub: 'であった たく・てに いれた しょうごう・みつけた ひほう。この スマホの なかに のこります。',
    text: r.runs ? LINES.zukan : LINES.zukanNone,
    extra: [
      card,
      h('div', {}, [h('h2', { class: 'field-h' }, ['たくの ずかん', h('em', { text: metN + ' / 8' })]), grid]),
      h('div', {}, [
        h('h2', { class: 'field-h' }, ['ひほう', h('em', { text: trN + ' / ' + TREASURES.length })]),
        h('p', { class: 'count', text: LINES.hihouNote }),
        trGrid
      ]),
      h('div', {}, [
        h('h2', { class: 'field-h' }, ['しょうごう', h('em', { text: gotN + ' / ' + TITLES.length })]),
        h('p', { class: 'count', text: 'てに いれた しょうごうを たたくと、それを なのれます。もう いちど たたくと じどうに もどります。' }),
        titleBox
      ]),
      h('div', { class: 'divider' }),
      h('div', { class: 'back-row' }, [h('button', { class: 'btn danger small', type: 'button', text: 'ずかん・しょうごう・ひほうを けす', onclick: clearRecord })])
    ]
  });
  // 見たので NEW を けす（つぎに 開いたときには つかない）
  Store.set('fresh', []);
  paintZukanDot();
}

function pickTitle(key) {
  const now = Store.get('title', '');
  const next = now === key ? '' : key;
  Store.set('title', next);
  Sound.se('cursor');
  toast(next ? '「' + titleByKey(key).name + '」を なのります' : 'しょうごうを じどうに しました');
  const y = window.scrollY;
  zukanScreen();
  finishTyping();
  window.scrollTo(0, y);
}

function clearRecord() {
  ask('ずかん・しょうごう・ひほうの きろくを すべて けします。よろしいですか。\n（まえの けっかと きょうの せきは のこります）', () => {
    Record.clear();
    Sound.se('cancel');
    toast('ずかんを しろしに もどしました');
    zukanScreen();
  }, { yes: 'けす', danger: true });
}

function tableScreen(key) {
  const t = TABLES[key];
  const r = Record.load();
  const m = r.met[key], sat = r.sat[key];
  const rows = [];
  STATS.forEach((st) => {
    const n = t.profile[st.key];
    const blocks = h('span', { class: 'blocks' });
    for (let i = 0; i < 4; i++) blocks.appendChild(h('span', { class: 'block' + (i < n ? ' on' : '') }));
    rows.push(h('span', { text: st.name }), blocks, h('span', { class: 'stat-word', text: n >= 3 ? st.high : (n <= 1 ? st.low : 'ふつう') }));
  });
  render({
    tab: 'zukan',
    lede: 'たくの ずかん',
    text: t.label + '……' + t.name + 'じゃな。\n' + t.desc,
    extra: [
      h('section', { class: 'win' }, [
        h('h2', { class: 'colored tc', style: tableTone(key), text: t.label + ' ' + t.name }),
        h('div', { class: 'result-type', text: t.type }),
        h('div', { class: 'zk-facts' }, [
          h('span', { text: 'はじめて であった ひ：' + (m ? m.first.replace(/-/g, '/') : '―') }),
          h('span', { text: 'しんだんで みちびかれた：' + (m ? m.n : 0) + 'かい' }),
          h('span', { text: 'じっさいに すわった：' + (sat ? sat.n : 0) + 'かい' })
        ])
      ]),
      h('section', { class: 'win' }, [h('h2', { text: 'たくの せいかく' }), h('div', { class: 'stats' }, rows)])
    ],
    back: { label: 'ずかんに もどる', onPick: () => { Sound.se('cancel'); zukanScreen(); } }
  });
}

// ---- せってい ----------------------------------------------
// なまえ・やくわり（さんかしゃ／かんじ）・きろくを けす
function settingsScreen(line) {
  const name = Store.get('name', '');
  const host = isHost();

  // なまえ
  const nameIn = h('input', { type: 'text', value: name, maxlength: '12', placeholder: 'なまえ', autocomplete: 'off', enterkeyhint: 'done', 'aria-label': 'なまえ' });
  const saveName = () => {
    const v = nameIn.value.trim();
    if (!v) { Sound.se('cancel'); return say(LINES.noName); }
    if (NG_WORDS.test(v)) { Sound.se('cancel'); return say(LINES.badName); }
    state.name = v; Store.set('name', v);
    Sound.se('decide'); toast('なまえを「' + v + '」に しました');
  };
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveName(); } });
  const nameWin = h('section', { class: 'win' }, [
    h('h2', { text: 'なまえ' }),
    h('div', { class: 'field' }, [nameIn, h('button', { class: 'btn primary', type: 'button', text: 'けってい', onclick: saveName })]),
    h('p', { class: 'count', style: 'margin:8px 0 0', text: 'はっぴょうされた せきで「おぬし」の しるしが つく なまえです。' })
  ]);

  // やくわり
  const passBox = h('div');
  const becomeHost = () => {
    Store.set('role', 'host');
    Sound.se('fanfare');
    settingsScreen(LINES.hostOk.replace('{room}', SITE.room));
  };
  const askPass = () => {
    if (host) return;
    if (!ADMIN_WORDS.kumi) return becomeHost();
    Sound.se('cursor');
    // type="password" だと iPhone で 英字しか 打てないので、ふつうの 文字入力に する
    const pass = h('input', { type: 'text', placeholder: 'あいことば', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': 'かんじの あいことば' });
    const check = () => {
      if (normWord(pass.value) === normWord(ADMIN_WORDS.kumi)) becomeHost();
      else { Sound.se('cancel'); pass.value = ''; say(LINES.hostNg); }
    };
    pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } });
    passBox.replaceChildren(h('div', { class: 'field', style: 'margin-top:10px' }, [pass, h('button', { class: 'btn primary', type: 'button', text: 'けってい', onclick: check })]));
    say(LINES.hostAsk);
    setTimeout(() => { try { pass.focus({ preventScroll: true }); } catch (e) {} }, 50);
  };
  const roleWin = h('section', { class: 'win' }, [
    h('h2', { text: 'やくわり' }),
    h('div', { class: 'role-row' }, [
      h('button', { class: 'btn' + (host ? '' : ' picked'), type: 'button', text: 'さんかしゃ', onclick: () => {
        if (!host) return;
        Store.remove('role');
        Sound.se('cancel');
        settingsScreen(LINES.hostOff);
      } }),
      h('button', { class: 'btn' + (host ? ' picked' : ''), type: 'button', text: 'かんじ', onclick: askPass })
    ]),
    passBox,
    h('p', { class: 'count', style: 'margin:8px 0 0', text: host
      ? 'この スマホで「' + SITE.room + '」に 入れます。'
      : 'かんじを えらぶと、この スマホで「' + SITE.room + '」に 入れるように なります。' }),
    host ? linkCard('key', SITE.room + ' へ', 'せきを くんで はっぴょう する', () => { Sound.se('decide'); location.href = 'kumi.html'; }) : null
  ]);

  // きろくを けす
  const r = Record.load();
  const titlesN = Object.keys(Store.get('titles', {})).length;
  const items = [
    { label: 'まえの しんだん けっか', note: 'けっか・あいことば', has: !!Store.get('last', null),
      run: () => { Store.remove('last'); setTimeout(() => announceTitles(recordFlag('inkpot')), 0); } },
    { label: 'きょうの せき', note: 'かんじが はっぴょう した せき', has: !!Store.get('seats', null),
      run: () => { Store.remove('seats'); Store.remove('seatsSeen'); } },
    { label: 'ずかん・しょうごう・ひほう', note: 'しんだん ' + r.runs + 'かい・しょうごう ' + titlesN + 'こ・ひほう ' + Object.keys(Store.get('treasures', {})).length + 'こ', has: r.runs > 0 || titlesN > 0 || Object.keys(Store.get('treasures', {})).length > 0,
      run: () => { Record.clear(); } },
    { label: 'ぜんぶ', note: 'なまえ・やくわり・' + SITE.room + 'の めいぼ も ふくむ', has: true,
      run: () => { clearAllLocal(); } }
  ];
  const delWin = h('section', { class: 'win' }, [
    h('h2', { text: 'きろくを けす' }),
    h('div', { class: 'set-list' }, items.map((it) => h('div', { class: 'set-item' }, [
      h('div', { class: 'set-text' }, [it.label, h('small', { text: it.has ? it.note : 'なにも ない' })]),
      h('button', { class: 'btn danger small', type: 'button', text: 'けす', disabled: it.has ? null : 'disabled', onclick: () => {
        ask('「' + it.label + '」を けします。\nけした ものは もとに もどせません。よろしいですか。', () => {
          it.run();
          Sound.se('cancel');
          toast('「' + it.label + '」を けしました');
          paintSeatDot(); paintZukanDot();
          settingsScreen(LINES.deleted);
        }, { yes: 'けす', danger: true });
      } })
    ])))
  ]);

  render({
    tab: 'set',
    lede: 'せってい',
    sub: 'なまえ・やくわり・きろくの せいり。おと と よる／ひる は うえの ボタンで かえられます。',
    text: line || LINES.settings,
    extra: [nameWin, roleWin, delWin]
  });
}

// あいことばを くらべる ために そろえる（空白・全角半角・カタカナ／ひらがな の ちがいを なくす）
function normWord(v) {
  return String(v || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase()
    .replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

// この スマホに ある やかたの きろくを すべて けす（BGL の データには さわらない）
function clearAllLocal() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(Store.prefix) === 0) keys.push(k); }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch (e) {}
  state.name = '';
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

// BGM を よやく。画面が 出おわってから 読みはじめ、画面に さわった 瞬間に 鳴る
if (document.readyState === 'complete') Sound.bgm('main');
else window.addEventListener('load', () => Sound.bgm('main'), { once: true });
paintIcons(document);
bindTopbar(() => { state.started = true; Sound.bgm('main'); });
if (importPublished()) seatsScreen();
else if (location.hash === '#settings') { history.replaceState(null, '', location.pathname + location.search); settingsScreen(); }
else titleScreen();
paintSeatDot();
paintZukanDot();

// すでに 開いている ページで リンクを ひらくと、# から後ろだけが 変わって
// 読みこみ直しに ならないことが ある。その 変化も ひろう。
window.addEventListener('hashchange', () => { if (importPublished()) seatsScreen(); });

// 最初に 画面の どこかを おした 瞬間に 音の 許可を とり、BGM を はじめる。
// タッチの 場合、指を 置いた 瞬間（pointerdown）では 許可が 取れないので click で。
// capture で ボタンの 処理より 先に 走らせる。
document.addEventListener('click', begin, { capture: true, once: true });
