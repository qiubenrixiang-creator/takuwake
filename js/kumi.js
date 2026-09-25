// ============================================================
//  kumi.js — たくぐみの ま（幹事用）
//
//  参加者の「なまえ」と「4文字の 合言葉」を 打ちこみ、
//  全員 そろったら まとめて 卓を 組みます。通信は しません。
// ============================================================

Sound.load({
  kumi:    { src: 'assets/audio/bgm_kumi.mp3', loop: true, volume: 0.45 },
  decide:  { src: 'assets/audio/se_decide.mp3' },
  cancel:  { src: 'assets/audio/se_cancel.mp3' },
  cursor:  { src: 'assets/audio/se_back.mp3' },
  fanfare: { src: 'assets/audio/se_fanfare.mp3' }
});

const saved = Store.get('kumi', null) || {};
const K = {
  roster: Array.isArray(saved.roster) ? saved.roster : [],   // [{ id, name, table, exp, leave, profile, locked }]
  perTable: saved.perTable || 4,
  groups: Array.isArray(saved.groups) ? saved.groups : null, // [[id, ...], ...]
  names: Array.isArray(saved.names) ? saved.names : null,    // 各卓に つけた 卓の key
  selected: null
};

function save() {
  Store.set('kumi', { roster: K.roster, perTable: K.perTable, groups: K.groups, names: K.names });
}

const $screen = document.getElementById('screen');
// ウィンドウ（BGL と 同じ ▼見出し つき）
function win(title, children, extraClass) {
  return h('section', { class: 'win' + (extraClass ? ' ' + extraClass : '') }, [h('h2', { text: title })].concat(children));
}

// ぬしの ウィンドウ
function nushi(textEl, name, icon) {
  return h('section', { class: 'win msg done' }, [
    h('div', { class: 'msg-icon', 'data-icon': icon || SITE.hostIcon, 'aria-hidden': 'true' }),
    h('div', { class: 'msg-body' }, [h('div', { class: 'msg-name', text: name || SITE.host }), textEl])
  ]);
}

function show(children) {
  const wrap = h('section', { class: 'page screen-in' }, children);
  $screen.replaceChildren(wrap);
  paintIcons(wrap);
  window.scrollTo(0, 0);
}

// ---- ぬしの ひとこと ----------------------------------------
let $say = null;
function say(text) { if ($say) $say.textContent = text; }

// ---- おと ------------------------------------------------
// 最初に 画面を おした 瞬間に 許可を とって、たくぐみの ま の BGM を ながす
document.addEventListener('click', () => { Sound.unlock(); Sound.bgm('kumi'); }, { capture: true, once: true });

// ---- 扉の 錠 ------------------------------------------------
// やかたの「せってい」で かんじを えらんだ スマホだけが 入れます。
function lockScreen() {
  const msg = h('div', { class: 'msg-text', text: 'この とびらは かんじにしか ひらけぬ。\nやかたの「せってい」で、やくわりを「かんじ」に するのじゃ。' });
  show([
    h('h1', { class: 'lede', text: 'とざされた とびら' }),
    h('div', { class: 'stack' }, [
      nushi(msg, 'とびら', 'door'),
      h('div', { class: 'btn-col' }, [h('a', { class: 'btn primary', href: 'index.html#settings', text: 'せってい を ひらく' })]),
      h('div', { class: 'back-row' }, [h('a', { class: 'btn small', href: 'index.html', text: '◀ やかたへ もどる' })])
    ])
  ]);
}

// ---- 本体 ------------------------------------------------
let $roster, $rosterTitle, $plan, $groups, $publish, $addMsg, $name, $code;

function mainScreen() {
  $say = h('div', { class: 'msg-text', text: 'しんだんを おえた ものは、4もじの あいことばを もっておる。\nなまえと いっしょに うちこむのじゃ。' });

  $name = h('input', { type: 'text', placeholder: 'なまえ', maxlength: '12', autocomplete: 'off', enterkeyhint: 'next' });
  $code = h('input', { class: 'code-input', type: 'text', placeholder: '4もじ', maxlength: '5', autocomplete: 'off', autocapitalize: 'characters', enterkeyhint: 'done' });
  $name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $code.focus(); } });
  $code.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addPerson(); } });
  $addMsg = h('div', { class: 'note' });

  $roster = h('div', { class: 'roster' });
  $plan = h('div');
  $groups = h('div', { class: 'groups' });
  $publish = h('div', { class: 'stack' });
  $rosterTitle = h('h2', { text: 'めいぼ' });

  show([
    h('h1', { class: 'lede', text: 'たくぐみの ま' }),
    h('div', { class: 'stack' }, [
      h('div', { class: 'no-print' }, [nushi($say)]),
      win('むかえる', [
        h('div', { class: 'field add-field' }, [$name, $code]),
        h('div', { class: 'btn-col tight' }, [h('button', { class: 'btn primary', type: 'button', text: 'むかえる', onclick: addPerson })]),
        $addMsg
      ], 'no-print'),
      h('section', { class: 'win no-print' }, [$rosterTitle, $roster]),
      win('たくの せってい', [$plan], 'no-print'),
      $groups,
      $publish
    ])
  ]);
  renderAll();
}

function newId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function addPerson() {
  const name = $name.value.trim();
  const seat = decodeSeat($code.value);
  if (!name) { Sound.se('cancel'); $addMsg.className = 'note warn'; $addMsg.textContent = 'なまえを いれるのじゃ。'; $name.focus(); return; }
  if (!seat) { Sound.se('cancel'); $addMsg.className = 'note warn'; $addMsg.textContent = 'あいことばが よめぬ。4もじを たしかめるのじゃ。'; $code.focus(); return; }

  let finalName = name, n = 2;
  while (K.roster.some((p) => p.name === finalName)) finalName = name + '(' + (n++) + ')';

  const lv = seat.levels;
  K.roster.push({
    id: newId(), name: finalName, table: seat.table, exp: seat.exp, leave: seat.leave,
    profile: { w: lv.w * 2, s: lv.s * 2, t: lv.t * 2, p: lv.p * 2 }, locked: null
  });
  K.groups = null; K.names = null; K.selected = null;
  save();
  Sound.se('decide');
  $addMsg.className = 'note';
  $addMsg.textContent = finalName === name ? finalName + ' を むかえいれた。' : '同じ なまえが おったので「' + finalName + '」と した。';
  $name.value = ''; $code.value = ''; $name.focus();
  say(K.roster.length + 'にんが そろったぞい。');
  renderAll();
}

function removePerson(id) {
  const p = K.roster.find((x) => x.id === id);
  if (!p) return;
  ask(p.name + ' を めいぼから はずしますか。', () => {
    Sound.se('cancel');
    K.roster = K.roster.filter((x) => x.id !== id);
    if (K.groups) K.groups = K.groups.map((g) => g.filter((x) => x !== id));
    save();
    renderAll();
  }, { yes: 'はずす', danger: true });
}

function toggleLock(id) {
  const p = K.roster.find((x) => x.id === id);
  if (!p) return;
  Sound.se('cursor');
  if (Number.isInteger(p.locked)) p.locked = null;
  else if (K.groups) { const gi = K.groups.findIndex((g) => g.includes(id)); if (gi >= 0) p.locked = gi; }
  save();
  renderAll();
}

function capacities() {
  const caps = planCapacities(K.roster.length, K.perTable, TABLE_KEYS.length);
  if (K.groups && K.groups.length === caps.length) return caps;
  return caps;
}

function runAssign() {
  if (K.roster.length < 2) { Sound.se('cancel'); say('2にん いじょう そろわぬと たくは くめぬ。'); return; }
  try {
    const caps = capacities();
    K.groups = assignGroups(K.roster, caps);
    const byId = {}; K.roster.forEach((p) => { byId[p.id] = p; });
    K.names = nameGroups(K.groups, byId);
    K.selected = null;
    save();
    Sound.se('fanfare');
    say('たくを くんだぞい！\nきに いらぬ ところは なまえを たたいて いれかえるのじゃ。');
    renderAll();
    setTimeout(() => { $groups.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
  } catch (e) { Sound.se('cancel'); say(e.message); }
}

// 名前を たたく → もう一人 たたくと 入れかえ。空席を たたくと 移動。
function tapSeat(gi, id) {
  if (!K.groups) return;
  if (K.selected === null) { if (id === null) return; K.selected = id; Sound.se('cursor'); renderGroups(); return; }
  if (K.selected === id) { K.selected = null; renderGroups(); return; }
  const from = K.groups.findIndex((g) => g.includes(K.selected));
  const caps = capacities();
  if (id === null) {
    if (K.groups[gi].length >= caps[gi]) { K.selected = null; renderGroups(); return; }
    K.groups[from] = K.groups[from].filter((x) => x !== K.selected);
    K.groups[gi].push(K.selected);
  } else {
    const to = K.groups.findIndex((g) => g.includes(id));
    if (to === from) { K.selected = id; Sound.se('cursor'); renderGroups(); return; }
    K.groups[from] = K.groups[from].map((x) => (x === K.selected ? id : x));
    K.groups[to] = K.groups[to].map((x) => (x === id ? K.selected : x));
  }
  K.selected = null;
  Sound.se('decide');
  save();
  renderGroups();
}

// ---- 表示 --------------------------------------------------
function badge(text, cls) { return h('span', { class: 'tag' + (cls ? ' ' + cls : ''), text }); }

function typeChip(key) {
  const t = TABLES[key];
  return h('span', { class: 'type-chip tc', text: t ? t.label : '?', style: tableTone(key) });
}

function renderRoster() {
  $roster.replaceChildren();
  $rosterTitle.textContent = 'めいぼ（' + K.roster.length + 'にん）';
  if (!K.roster.length) { $roster.appendChild(h('div', { class: 'note', text: 'まだ だれも むかえて おらぬ。' })); return; }
  K.roster.forEach((p) => {
    const marks = [];
    if (p.exp === 0) marks.push(badge('はじめて'));
    if (p.exp === 2) marks.push(badge('せつめい できる', 'mizu'));
    if (p.leave === 1) marks.push(badge('とちゅうで かえる', 'warn'));
    if (Number.isInteger(p.locked)) marks.push(badge('こてい', 'hit'));
    $roster.appendChild(h('div', { class: 'roster-row' }, [
      typeChip(p.table),
      h('div', { class: 'who' }, [h('div', { class: 'who-name', text: p.name }), h('div', { class: 'marks' }, marks)]),
      h('button', { class: 'mini', type: 'button', text: Number.isInteger(p.locked) ? 'はずす' : 'こてい', onclick: () => toggleLock(p.id), disabled: !K.groups && !Number.isInteger(p.locked) }),
      h('button', { class: 'mini warn', type: 'button', text: '×', 'aria-label': p.name + 'を はずす', onclick: () => removePerson(p.id) })
    ]));
  });
}

function renderPlan() {
  const caps = capacities();
  const summary = caps.length ? caps.length + 'たく（' + caps.join('・') + 'にん）' : '2にん いじょうで けいさん するぞい';
  const step = (d) => () => { K.perTable = Math.max(2, Math.min(8, K.perTable + d)); K.groups = null; K.names = null; save(); Sound.se('cursor'); renderAll(); };
  $plan.replaceChildren(
    h('div', { class: 'stepper' }, [
      h('span', { text: '1たく あたり' }),
      h('button', { class: 'mini', type: 'button', text: '−', onclick: step(-1) }),
      h('span', { class: 'num', text: String(K.perTable) }),
      h('button', { class: 'mini', type: 'button', text: '＋', onclick: step(1) }),
      h('span', { text: 'にん' })
    ]),
    h('div', { class: 'note', text: summary }),
    h('div', { class: 'btn-col tight' }, [h('button', { class: 'btn primary', type: 'button', text: 'たくを くむ', onclick: runAssign })])
  );
}

function renderGroups() {
  $groups.replaceChildren();
  $publish.replaceChildren();
  if (!K.groups) return;
  const caps = capacities();
  const byId = {}; K.roster.forEach((p) => { byId[p.id] = p; });

  $groups.appendChild(h('div', { class: 'note center no-print', text: K.selected ? 'いれかえる あいてか、あいた せきを たたく' : 'なまえを たたいて、もう ひとり たたくと いれかえ' }));

  K.groups.forEach((ids, gi) => {
    const key = (K.names && K.names[gi]) || TABLE_KEYS[gi];
    const t = TABLES[key];
    const members = ids.map((id) => byId[id]).filter(Boolean);
    const seats = members.map((m) => h('button', {
      class: 'seat' + (K.selected === m.id ? ' selected' : ''), type: 'button',
      onclick: () => tapSeat(gi, m.id)
    }, [typeChip(m.table), h('span', { class: 'seat-name', text: m.name }),
        h('span', { class: 'seat-sub', text: [m.exp === 2 ? 'せつめい' : (m.exp === 0 ? 'はじめて' : ''), m.leave ? 'とちゅう' : ''].filter(Boolean).join('・') })]));
    for (let k = members.length; k < caps[gi]; k++) seats.push(h('button', { class: 'seat empty', type: 'button', text: 'あいた せき', onclick: () => tapSeat(gi, null) }));

    const title = h('h2', { class: 'colored tc', style: tableTone(key) }, [t.label + ' ' + t.name, h('span', { class: 'count', text: members.length + '/' + caps[gi] + 'にん' })]);
    const box = h('section', { class: 'win group' }, [title, h('div', { class: 'seats' }, seats),
      h('div', { class: 'mood', text: groupMood(members) })]
      .concat(groupWarnings(members).map((w) => h('div', { class: 'warn-line', text: '※ ' + w }))));
    $groups.appendChild(box);
  });

  $publish.appendChild(win('はっぴょう', [
    h('p', { class: 'small muted', text: 'リンクを LINEなどに はる。ひらいた ひとの スマホに せきが のこり、いつでも みられる。' }),
    h('div', { class: 'btn-col tight' }, [
      h('button', { class: 'btn hero', type: 'button', onclick: copyPublish }, [h('span', { class: 'arrow', text: '▶', 'aria-hidden': 'true' }), 'はっぴょう リンクを コピー']),
      h('button', { class: 'btn', type: 'button', text: 'もじで コピー', onclick: copyText }),
      h('button', { class: 'btn', type: 'button', text: 'たくに おく ふだを いんさつ', onclick: () => { Sound.se('decide'); window.print(); } })
    ])
  ], 'no-print'));
  $publish.appendChild(h('div', { class: 'back-row no-print' }, [
    h('button', { class: 'btn danger small', type: 'button', text: 'めいぼを しろしに もどす', onclick: clearAll })
  ]));
}

function renderAll() { renderRoster(); renderPlan(); renderGroups(); }

// ---- はっぴょう -------------------------------------------
function publishSeats() {
  const byId = {}; K.roster.forEach((p) => { byId[p.id] = p; });
  const seats = [];
  K.groups.forEach((ids, gi) => {
    const key = (K.names && K.names[gi]) || TABLE_KEYS[gi];
    const t = TABLES[key];
    ids.forEach((id) => { const p = byId[id]; if (p) seats.push({ n: p.name, g: t.label + ' ' + t.name, k: key }); });
  });
  return seats;
}

function copy(text, done) {
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => window.prompt('これを コピーしてください', text));
  else window.prompt('これを コピーしてください', text);
}

function copyPublish() {
  const base = location.href.replace(/kumi\.html.*$/, 'index.html').replace(/#.*$/, '');
  const url = base + '#r=' + encodePublish(publishSeats());
  Sound.se('decide');
  copy(url, () => { toast('リンクを コピーしました'); say('はっぴょう リンクを コピーしたぞい。\nみなに わたすのじゃ。'); });
}

function copyText() {
  const lines = ['【たくわけの やかた】きょうの せき', ''];
  const byGroup = {};
  publishSeats().forEach((s) => { (byGroup[s.g] = byGroup[s.g] || []).push(s.n); });
  Object.keys(byGroup).forEach((g) => { lines.push(g + '： ' + byGroup[g].join('、')); });
  Sound.se('decide');
  copy(lines.join('\n'), () => { toast('もじで コピーしました'); say('もじで コピーしたぞい。'); });
}

function clearAll() {
  ask('めいぼと たくぐみを すべて けします。よろしいですか。', () => {
    Sound.se('cancel');
    K.roster = []; K.groups = null; K.names = null; K.selected = null;
    save();
    say('めいぼを しろしに もどしたぞい。');
    renderAll();
  }, { yes: 'けす', danger: true });
}

// ---- はじまり ----------------------------------------------
paintIcons(document);
bindTopbar(() => Sound.bgm('kumi'));
const $library = document.getElementById('tab-library');
if ($library && SITE.libraryUrl) $library.setAttribute('href', SITE.libraryUrl);
if (isHost()) mainScreen(); else lockScreen();
