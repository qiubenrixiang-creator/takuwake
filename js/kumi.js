// ============================================================
//  kumi.js — 卓組みの間（幹事用）
//
//  参加者が診断を終えると、画面に4文字の合言葉が出ます。
//  幹事はそれを名前と一緒に打ち込むだけ。通信は一切しません。
//
//  全員そろってから一度に割り当てるので、
//  「後から診断した人ほど希望と違う卓になる」ことがありません。
// ============================================================

const KUMI_PASSWORD = 'たくぐみ';          // 館の名前入力欄でも、この言葉で入れます
const KUMI_STORE_KEY = 'takuwake_kumi_v1';

// ---- 音 ------------------------------------------------------
// 館と同じ作りです。play() は「鳴らす準備をせよ」という要求で、
// 実際に音が出るまでに時間差があります。その間に pause() を呼んでも
// 遅れて再生が始まってしまうため、札を付けて確実に止めます。
const nativePlay = HTMLMediaElement.prototype.play;
const nativePause = HTMLMediaElement.prototype.pause;

function makeSafeAudio(audio, preloadMode) {
  let token = 0;
  audio.preload = preloadMode || 'auto';
  audio.play = function () {
    const mine = ++token;
    let p;
    try { p = nativePlay.call(audio); } catch (e) { return Promise.resolve(); }
    if (!p || !p.then) return Promise.resolve();
    return p.then(() => {
      if (mine !== token) { nativePause.call(audio); audio.currentTime = 0; }
    }).catch(() => {});
  };
  audio.pause = function () {
    token++;
    try { nativePause.call(audio); } catch (e) { /* 未読込なら何もしない */ }
  };
  return audio;
}

const kumiBGM     = makeSafeAudio(new Audio(AUDIO_FILES.bgmKumi), 'auto');
kumiBGM.loop = true;
kumiBGM.volume = 0.5;
const seDecide    = makeSafeAudio(new Audio(AUDIO_FILES.seDecide), 'auto');
const seCancel    = makeSafeAudio(new Audio(AUDIO_FILES.seCancel), 'auto');
const seBack      = makeSafeAudio(new Audio(AUDIO_FILES.seBack), 'auto');
const seFanfare   = makeSafeAudio(new Audio(AUDIO_FILES.seFanfare), 'auto');
const seEyecatch  = makeSafeAudio(new Audio(AUDIO_FILES.seEyecatch), 'auto');

let kumiSoundOn = true;
try { kumiSoundOn = localStorage.getItem('takuwake_kumi_sound') !== 'off'; } catch (e) {}
let kumiAudioReady = false;

// iOSのSafariは「一度も再生したことのない音声」を後から鳴らそうとしても拒みます。
// 画面を最初に触った瞬間に、無音の再生許可だけを取っておきます。
function unlockAudio(audio) {
  if (audio._unlocked) return Promise.resolve();
  audio._unlocked = true;
  return new Promise((done) => {
    const settle = () => {
      try { nativePause.call(audio); audio.currentTime = 0; } catch (e) {}
      audio.muted = false;
      done();
    };
    try {
      audio.muted = true;
      const p = nativePlay.call(audio);
      if (p && p.then) p.then(settle).catch(settle);
      else settle();
    } catch (e) { audio.muted = false; done(); }
  });
}

function startKumiAudio() {
  if (kumiAudioReady) return;
  kumiAudioReady = true;
  const all = [seDecide, seCancel, seBack, seFanfare, seEyecatch, kumiBGM];
  Promise.all(all.map(unlockAudio)).then(() => {
    if (kumiSoundOn) { kumiBGM.currentTime = 0; kumiBGM.play().catch(() => {}); }
  });
}

function se(audio) {
  if (!kumiSoundOn || !kumiAudioReady) return;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

function toggleKumiSound() {
  kumiSoundOn = !kumiSoundOn;
  try { localStorage.setItem('takuwake_kumi_sound', kumiSoundOn ? 'on' : 'off'); } catch (e) {}
  if (kumiSoundOn) { kumiBGM.play().catch(() => {}); se(seDecide); }
  else { kumiBGM.pause(); }
  renderSoundButton();
}

function renderSoundButton() {
  const b = document.getElementById('btn-sound');
  if (b) b.textContent = kumiSoundOn ? '🔊 音あり' : '🔇 音なし';
}

let roster = [];        // [{ id, name, tableKey, exp, leave, title, profile, lockedTable }]
let capacities = [];
let groups = null;      // [[id, ...], ...]
let selectedId = null;

// ---- 保存 ----------------------------------------------------
function saveKumi() {
  try {
    localStorage.setItem(KUMI_STORE_KEY, JSON.stringify({ roster, capacities, groups }));
  } catch (e) { /* 保存できなくても操作は続けられる */ }
}

function loadKumi() {
  try {
    const s = JSON.parse(localStorage.getItem(KUMI_STORE_KEY));
    if (!s || !Array.isArray(s.roster)) return;
    roster = s.roster;
    capacities = Array.isArray(s.capacities) ? s.capacities : [];
    groups = Array.isArray(s.groups) ? s.groups : null;
  } catch (e) { /* 壊れていたら空から始める */ }
}

// ---- 扉の錠 --------------------------------------------------
// 神の座か合言葉から入った人だけが通れます。
function isUnlocked() {
  try { return sessionStorage.getItem('takuwake_kumi_pass') === '1'; }
  catch (e) { return false; }
}

function tryUnlock() {
  const el = document.getElementById('lock-word');
  if (el.value.trim() !== KUMI_PASSWORD) {
    se(seCancel);
    el.value = '';
    el.placeholder = '違うようじゃ';
    return;
  }
  se(seDecide);
  try { sessionStorage.setItem('takuwake_kumi_pass', '1'); } catch (e) { /* 一度きりの入室になる */ }
  document.getElementById('lock-screen').style.display = 'none';
}

// ---- 表示のこまごま ------------------------------------------
function showNotice(message) {
  const el = document.getElementById('notice-bar');
  el.textContent = message;
  el.style.display = 'block';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.display = 'none'; }, 6000);
}

function setMessage(html) {
  document.getElementById('host-message').innerHTML = html;
}

// 割り当て先は、館のA卓〜H卓をそのまま使います。
function tableInfo(index) {
  const key = ALL_TABLES[index] || 'G';
  const d = TABLE_DATA[key];
  return { key: key, name: d.main.split(' ')[0], full: d.main, color: d.color };
}

// ---- 参加者の追加 --------------------------------------------
function newId() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function addByCode() {
  const nameEl = document.getElementById('add-name');
  const codeEl = document.getElementById('add-code');
  const msg = document.getElementById('add-msg');
  const name = nameEl.value.trim();

  if (!name) {
    se(seCancel);
    msg.className = 'host-note host-note-warn';
    msg.textContent = '名前を入れるのじゃ。';
    nameEl.focus();
    return;
  }

  const seat = decodeSeatCode(codeEl.value);
  if (!seat) {
    se(seCancel);
    msg.className = 'host-note host-note-warn';
    msg.textContent = '合言葉が読み取れぬ。4文字をもう一度確かめるのじゃ。';
    codeEl.focus();
    return;
  }

  // 同じ名前の人は実際に来るので、止めずに区別できる形で受け入れます
  let finalName = name;
  if (roster.some((p) => p.name === name)) {
    let n = 2;
    while (roster.some((p) => p.name === `${name}(${n})`)) n++;
    finalName = `${name}(${n})`;
  }

  roster.push({
    id: newId(),
    name: finalName,
    tableKey: seat.tableKey,
    exp: seat.exp,
    leave: seat.leave,
    title: seat.title,
    profile: TABLE_PROFILE[seat.tableKey] || TABLE_PROFILE.G,
    lockedTable: undefined
  });

  groups = null;
  recalcCapacities(true);
  saveKumi();
  renderAll();
  se(seDecide);

  msg.className = 'host-note';
  msg.textContent = finalName === name
    ? `${finalName} を迎え入れた。`
    : `同じ名がおったので「${finalName}」として迎え入れた。`;
  nameEl.value = '';
  codeEl.value = '';
  nameEl.focus();
}

function removeParticipant(id) {
  const p = roster.find((x) => x.id === id);
  if (!p) return;
  if (!confirm(`${p.name} を名簿から外しますか。`)) return;
  se(seCancel);
  roster = roster.filter((x) => x.id !== id);
  if (groups) groups = groups.map((g) => g.filter((x) => x !== id));
  recalcCapacities(true);
  saveKumi();
  renderAll();
}

function clearRoster() {
  if (!confirm('名簿と卓組みをすべて消します。元に戻せません。よろしいですか。')) return;
  se(seCancel);
  roster = []; groups = null; capacities = []; selectedId = null;
  saveKumi();
  renderAll();
  setMessage('名簿を白紙に戻したぞい。');
}

// ---- 卓の設定 ------------------------------------------------
function recalcCapacities(silent) {
  const size = parseInt(document.getElementById('pref-size').value) || 4;
  capacities = suggestCapacities(roster.length, size, ALL_TABLES.length);
  groups = null;
  if (!silent) { se(seBack); saveKumi(); renderAll(); }
}

function renderCapSummary() {
  const el = document.getElementById('cap-summary');
  if (!capacities.length) {
    el.textContent = '参加者が2名以上になると、卓数のめやすが出るぞい。';
    return;
  }
  const seats = capacities.reduce((a, b) => a + b, 0);
  el.textContent = `${capacities.length}卓（${capacities.join('・')}名）＝ ${seats}席 ／ 参加者 ${roster.length}名`;
}

// ---- 割り当て ------------------------------------------------
function runAssign() {
  const msg = document.getElementById('assign-msg');
  if (roster.length < 2) {
    se(seCancel);
    msg.className = 'host-note host-note-warn';
    msg.textContent = '参加者が2名以上おらぬと、卓は組めぬ。';
    return;
  }
  if (!capacities.length) recalcCapacities(true);

  try {
    const result = assignTables(roster, capacities);
    groups = result.map((g) => g.map((p) => p.id));
    selectedId = null;
    se(seFanfare);
    msg.className = 'host-note';
    msg.textContent = '卓を組んだぞい。気に入らぬところは名前をたたいて入れ替えるのじゃ。';
    setMessage('割り当てができたぞい。<br>よければ「発表リンクを作る」を押すのじゃ。');
    saveKumi();
    renderAll();
  } catch (e) {
    se(seCancel);
    msg.className = 'host-note host-note-warn';
    msg.textContent = e.message;
  }
}

// ---- 手で入れ替える ------------------------------------------
function seatClick(tableIndex, id) {
  if (!groups) return;

  if (selectedId === null) {
    if (id === null) return;
    se(seBack);
    selectedId = id;
    renderTables();
    return;
  }
  if (selectedId === id) { selectedId = null; renderTables(); return; }

  const from = groups.findIndex((g) => g.includes(selectedId));
  if (from < 0) { selectedId = null; renderTables(); return; }

  if (id === null) {
    if (groups[tableIndex].length >= capacities[tableIndex]) { selectedId = null; renderTables(); return; }
    groups[from] = groups[from].filter((x) => x !== selectedId);
    groups[tableIndex].push(selectedId);
  } else {
    const to = groups.findIndex((g) => g.includes(id));
    if (to === from) { selectedId = null; renderTables(); return; }
    groups[from] = groups[from].map((x) => (x === selectedId ? id : x));
    groups[to] = groups[to].map((x) => (x === id ? selectedId : x));
  }
  selectedId = null;
  se(seDecide);
  saveKumi();
  renderAll();
}

function toggleLock(id) {
  const p = roster.find((x) => x.id === id);
  if (!p) return;
  se(seBack);
  if (Number.isInteger(p.lockedTable)) p.lockedTable = undefined;
  else {
    const t = groups ? groups.findIndex((g) => g.includes(id)) : -1;
    if (t >= 0) p.lockedTable = t;
  }
  saveKumi();
  renderAll();
}

// ---- 発表 ----------------------------------------------------
// 割り当てをURLの中に詰め込みます。サーバーは使いません。
// 参加者はこのリンクを一度開けば、以後いつでも館の「📜 記録」から席を見られます。
function buildPublishUrl() {
  if (!groups) return '';
  const seats = [];
  groups.forEach((ids, ti) => {
    const info = tableInfo(ti);
    ids.forEach((id) => {
      const p = roster.find((x) => x.id === id);
      if (p) seats.push({ n: p.name, t: info.name, c: info.color });
    });
  });
  const json = JSON.stringify({ seats: seats, at: Date.now() });
  const b64 = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const base = location.href.replace(/kumi\.html.*$/, 'index.html');
  return base + '#r=' + b64;
}

function copyPublishUrl() {
  const url = buildPublishUrl();
  if (!url) { se(seCancel); showNotice('先に「卓を組む」を押すのじゃ。'); return; }
  se(seEyecatch);
  copyText(url, '発表リンクをコピーした。LINEなどに貼って皆に渡すのじゃ。');
}

function copyResult() {
  const text = buildResultText();
  if (!text) { se(seCancel); showNotice('先に「卓を組む」を押すのじゃ。'); return; }
  se(seBack);
  copyText(text, '結果をコピーした。');
}

function copyText(text, okMessage) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showNotice(okMessage))
      .catch(() => window.prompt('下の文字を選んでコピーしてください。', text));
  } else {
    window.prompt('下の文字を選んでコピーしてください。', text);
  }
}

function buildResultText() {
  if (!groups) return '';
  const lines = ['【卓分けの館 / 卓組み結果】', ''];
  groups.forEach((ids, ti) => {
    const info = tableInfo(ti);
    const members = ids.map((id) => roster.find((p) => p.id === id)).filter(Boolean);
    lines.push(`${info.full}： ${members.map((m) => m.name).join('、')}`);
    lines.push(`  ${describeTableGroup(members)}`);
    tableGroupWarnings(members).forEach((w) => lines.push(`  ※${w}`));
    lines.push('');
  });
  return lines.join('\n');
}

// ---- 表示 ----------------------------------------------------
function renderRoster() {
  const box = document.getElementById('roster-list');
  document.getElementById('roster-count').textContent = `(${roster.length}名)`;
  box.innerHTML = '';

  if (roster.length === 0) {
    box.innerHTML = '<div class="host-note">まだ誰も迎えておらぬ。名前と合言葉を入れるのじゃ。</div>';
    return;
  }

  roster.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'host-roster-row';

    const marks = [];
    if (p.exp === 2) marks.push('説明できる');
    if (p.exp === 0) marks.push('初心者');
    if (p.leave === 1) marks.push('途中で帰る');
    if (p.title) marks.push(p.title);
    if (Number.isInteger(p.lockedTable)) marks.push(`${tableInfo(p.lockedTable).name}に固定`);

    const who = document.createElement('div');
    who.className = 'who';
    who.innerHTML = '<b></b><span class="meta"></span>';
    who.querySelector('b').textContent = p.name;
    who.querySelector('.meta').textContent =
      (TABLE_DATA[p.tableKey] ? TABLE_DATA[p.tableKey].main.split(' ')[0] : '?') +
      (marks.length ? '／' + marks.join('・') : '');
    row.appendChild(who);

    const lock = document.createElement('button');
    lock.className = 'host-icon-btn';
    lock.textContent = Number.isInteger(p.lockedTable) ? '固定中' : '固定';
    lock.onclick = () => toggleLock(p.id);
    row.appendChild(lock);

    const del = document.createElement('button');
    del.className = 'host-icon-btn';
    del.textContent = '×';
    del.onclick = () => removeParticipant(p.id);
    row.appendChild(del);

    box.appendChild(row);
  });
}

function renderTables() {
  const box = document.getElementById('tables');
  const hint = document.getElementById('swap-hint');
  box.innerHTML = '';

  if (!groups) {
    hint.textContent = '';
    box.innerHTML = '<div class="host-note">「卓を組む」を押すと、ここに結果が出るぞい。</div>';
    return;
  }

  hint.textContent = selectedId
    ? '入れ替える相手か、空席をたたくのじゃ。'
    : '名前をたたいて、もう一人をたたくと席を入れ替えられる。';

  groups.forEach((ids, ti) => {
    const info = tableInfo(ti);
    const members = ids.map((id) => roster.find((p) => p.id === id)).filter(Boolean);

    const card = document.createElement('div');
    card.className = 'host-table-card';
    card.style.borderColor = info.color;

    const head = document.createElement('div');
    head.className = 'host-table-head';
    head.style.color = info.color;
    head.style.borderColor = info.color;
    head.innerHTML = '<span class="label"></span><span class="count"></span>';
    head.querySelector('.label').textContent = info.full;
    head.querySelector('.count').textContent = `${members.length} / ${capacities[ti]}名`;
    card.appendChild(head);

    members.forEach((m) => {
      const b = document.createElement('button');
      b.className = 'host-seat' + (selectedId === m.id ? ' selected' : '');
      const sub = [
        m.exp === 2 ? '説明できる' : (m.exp === 0 ? '初心者' : ''),
        m.leave === 1 ? '途中退出' : ''
      ].filter(Boolean).join('・');
      b.innerHTML = '<span class="nm"></span><span class="role"></span>';
      b.querySelector('.nm').textContent = m.name;
      b.querySelector('.role').textContent = sub;
      b.onclick = () => seatClick(ti, m.id);
      card.appendChild(b);
    });

    for (let k = members.length; k < capacities[ti]; k++) {
      const b = document.createElement('button');
      b.className = 'host-seat empty';
      b.textContent = '空席';
      b.onclick = () => seatClick(ti, null);
      card.appendChild(b);
    }

    const note = document.createElement('div');
    note.className = 'host-table-note';
    note.textContent = describeTableGroup(members);
    card.appendChild(note);

    tableGroupWarnings(members).forEach((w) => {
      const el = document.createElement('div');
      el.className = 'host-table-warn';
      el.textContent = '※' + w;
      card.appendChild(el);
    });

    box.appendChild(card);
  });
}

function renderAll() {
  if (!capacities.length || capacities.reduce((a, b) => a + b, 0) < roster.length) {
    recalcCapacities(true);
  }
  renderRoster();
  renderCapSummary();
  renderTables();
}

document.addEventListener('DOMContentLoaded', () => {
  if (isUnlocked()) document.getElementById('lock-screen').style.display = 'none';
  document.getElementById('lock-word').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); tryUnlock(); }
  });
  document.getElementById('add-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('add-code').focus(); }
  });
  document.getElementById('add-code').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addByCode(); }
  });
  loadKumi();
  renderSoundButton();
  renderAll();

  // 最初に画面を触った瞬間だけが、iOSが再生を許す機会です
  document.addEventListener('pointerdown', startKumiAudio, { once: true });
  document.addEventListener('click', startKumiAudio, { once: true });
  document.addEventListener('keydown', startKumiAudio, { once: true });
});
