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
const $sound = document.getElementById('btn-sound');

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

function win(title, children, extraClass) {
  return h('section', { class: 'win' + (extraClass ? ' ' + extraClass : '') }, [h('span', { class: 'win-title', text: title })].concat(children));
}

// ---- ぬしの ひとこと ----------------------------------------
let $say = null;
function say(text) { if ($say) $say.textContent = text; }

// ---- おと ------------------------------------------------
function paintSound() {
  const on = Sound.isEnabled();
  $sound.textContent = on ? 'おと ON' : 'おと OFF';
  $sound.classList.toggle('off', !on);
}
$sound.addEventListener('click', () => {
  const on = !Sound.isEnabled();
  Sound.setEnabled(on);
  if (on) { Sound.unlock(); Sound.bgm('kumi'); Sound.se('cursor'); }
  paintSound();
});
document.addEventListener('click', () => {
  if (Sound.isEnabled()) { Sound.unlock(); Sound.bgm('kumi'); }
}, { capture: true, once: true });

// ---- 扉の 錠 ------------------------------------------------
function isUnlocked() {
  try { return sessionStorage.getItem('takuwake2.kumiPass') === '1'; } catch (e) { return false; }
}

function lockScreen() {
  const input = h('input', { class: 'input', type: 'password', placeholder: 'あいことば', autocomplete: 'off', enterkeyhint: 'done' });
  const msg = h('div', { class: 'msg-text', text: 'この とびらには かぎが かかって おる。\nかんじの あいことばを つげるのじゃ。' });
  const open = () => {
    if (input.value.trim() !== ADMIN_WORDS.kumi) { Sound.se('cancel'); input.value = ''; msg.textContent = 'ちがう ようじゃ。'; return; }
    try { sessionStorage.setItem('takuwake2.kumiPass', '1'); } catch (e) {}
    Sound.se('decide');
    mainScreen();
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); open(); } });
  $screen.replaceChildren(h('div', { class: 'screen-in' }, [
    h('section', { class: 'win msg' }, [h('span', { class: 'win-title', text: 'とざされた とびら' }), h('div', { class: 'msg-icon', text: '🚪' }), msg]),
    h('nav', { class: 'win cmd' }, [
      h('div', { class: 'field' }, [input, h('button', { class: 'btn', type: 'button', text: 'ひらく', onclick: open })]),
      h('a', { class: 'opt sub', href: 'index.html', text: 'やかたへ もどる' })
    ])
  ]));
}

// ---- 本体 ------------------------------------------------
let $roster, $plan, $groups, $publish, $addMsg, $name, $code;

function mainScreen() {
  $say = h('div', { class: 'msg-text', text: 'しんだんを おえた ものは、4もじの あいことばを もっておる。\nなまえと いっしょに うちこむのじゃ。' });

  $name = h('input', { class: 'input', type: 'text', placeholder: 'なまえ', maxlength: '12', autocomplete: 'off', enterkeyhint: 'next' });
  $code = h('input', { class: 'input code-input', type: 'text', placeholder: '4もじ', maxlength: '5', autocomplete: 'off', autocapitalize: 'characters', enterkeyhint: 'done' });
  $name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $code.focus(); } });
  $code.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addPerson(); } });
  $addMsg = h('div', { class: 'note' });

  $roster = h('div', { class: 'roster' });
  $plan = h('div');
  $groups = h('div', { class: 'groups' });
  $publish = h('div');

  $screen.replaceChildren(h('div', { class: 'screen-in' }, [
    h('section', { class: 'win msg' }, [h('span', { class: 'win-title', text: SITE.host }), h('div', { class: 'msg-icon', text: SITE.hostIcon }), $say]),
    win('むかえる', [
      h('div', { class: 'field add-field' }, [$name, $code]),
      h('div', { class: 'field' }, [h('button', { class: 'btn wide', type: 'button', text: 'むかえる', onclick: addPerson })]),
      $addMsg
    ], 'no-print'),
    win('めいぼ', [$roster], 'no-print'),
    win('たくの せってい', [$plan], 'no-print'),
    $groups,
    $publish
  ]));
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
  if (!p || !confirm(p.name + ' を めいぼから はずしますか。')) return;
  Sound.se('cancel');
  K.roster = K.roster.filter((x) => x.id !== id);
  if (K.groups) K.groups = K.groups.map((g) => g.filter((x) => x !== id));
  save();
  renderAll();
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
function badge(text, cls) { return h('span', { class: 'badge' + (cls ? ' ' + cls : ''), text }); }

function typeChip(key) {
  const t = TABLES[key];
  return h('span', { class: 'type-chip', text: t ? t.label : '?', style: t ? 'color:' + t.color + ';border-color:' + t.color : '' });
}

function renderRoster() {
  $roster.replaceChildren();
  if (!K.roster.length) { $roster.appendChild(h('div', { class: 'note', text: 'まだ だれも むかえて おらぬ。' })); return; }
  K.roster.forEach((p) => {
    const marks = [];
    if (p.exp === 0) marks.push(badge('はじめて'));
    if (p.exp === 2) marks.push(badge('せつめい できる', 'good'));
    if (p.leave === 1) marks.push(badge('とちゅうで かえる', 'warn'));
    if (Number.isInteger(p.locked)) marks.push(badge('こてい', 'lock'));
    $roster.appendChild(h('div', { class: 'roster-row' }, [
      typeChip(p.table),
      h('div', { class: 'who' }, [h('div', { class: 'who-name', text: p.name }), h('div', { class: 'marks' }, marks)]),
      h('button', { class: 'mini', type: 'button', text: Number.isInteger(p.locked) ? 'はずす' : 'こてい', onclick: () => toggleLock(p.id), disabled: !K.groups && !Number.isInteger(p.locked) }),
      h('button', { class: 'mini', type: 'button', text: '×', 'aria-label': p.name + 'を はずす', onclick: () => removePerson(p.id) })
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
    h('div', { class: 'field' }, [h('button', { class: 'btn wide', type: 'button', text: 'たくを くむ', onclick: runAssign })])
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

    const title = h('span', { class: 'win-title', text: t.label + ' ' + t.name + '　' + members.length + '/' + caps[gi] });
    title.style.color = t.color;
    const box = h('section', { class: 'win group', style: 'border-color:' + t.color }, [title, h('div', { class: 'seats' }, seats),
      h('div', { class: 'mood', text: groupMood(members) })]
      .concat(groupWarnings(members).map((w) => h('div', { class: 'warn-line', text: '※ ' + w }))));
    $groups.appendChild(box);
  });

  $publish.appendChild(win('はっぴょう', [
    h('div', { class: 'note', text: 'リンクを LINEなどに はる。ひらいた ものの スマホに せきが のこり、いつでも みられる。' }),
    h('nav', { class: 'cmd' }, [
      h('button', { class: 'opt accent', type: 'button', text: 'はっぴょう リンクを コピー', onclick: copyPublish }),
      h('button', { class: 'opt', type: 'button', text: 'もじで コピー', onclick: copyText }),
      h('button', { class: 'opt', type: 'button', text: 'たくに おく ふだを いんさつ', onclick: () => { Sound.se('decide'); window.print(); } }),
      h('button', { class: 'opt sub', type: 'button', text: 'めいぼを しろしに もどす', onclick: clearAll }),
      h('a', { class: 'opt sub', href: 'index.html', text: 'やかたへ もどる' })
    ])
  ], 'no-print'));
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
  copy(url, () => say('はっぴょう リンクを コピーしたぞい。\nみなに わたすのじゃ。'));
}

function copyText() {
  const lines = ['【たくわけの やかた】きょうの せき', ''];
  const byGroup = {};
  publishSeats().forEach((s) => { (byGroup[s.g] = byGroup[s.g] || []).push(s.n); });
  Object.keys(byGroup).forEach((g) => { lines.push(g + '： ' + byGroup[g].join('、')); });
  Sound.se('decide');
  copy(lines.join('\n'), () => say('もじで コピーしたぞい。'));
}

function clearAll() {
  if (!confirm('めいぼと たくぐみを すべて けします。よろしいですか。')) return;
  Sound.se('cancel');
  K.roster = []; K.groups = null; K.names = null; K.selected = null;
  save();
  say('めいぼを しろしに もどしたぞい。');
  renderAll();
}

// ---- はじまり ----------------------------------------------
paintSound();
if (isUnlocked()) mainScreen(); else lockScreen();
