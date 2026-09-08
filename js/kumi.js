// ============================================================
//  kumi.js — 卓組みの間（幹事用）
//
//  名簿(roster)を読み込み、全員そろった状態でまとめて卓を割り当てます。
//  結果を「反映する」と、各自の記録画面にも最終的な卓が表示されます。
// ============================================================

let roster = [];        // [{ id, name, table, color, exp, leave, profile, lockedTable }]
let capacities = [];
let groups = null;      // [[id, ...], ...]
let selectedId = null;

// ---- 表示のこまごま ----------------------------------------
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

// 割り当て先の卓は、館のA卓〜H卓をそのまま使います。
function tableInfo(index) {
  const key = ALL_TABLES[index] || 'G';
  const d = TABLE_DATA[key];
  return { key: key, name: d.main.split(' ')[0], full: d.main, color: d.color };
}

// ---- 名簿の読み込み ----------------------------------------
db.ref('roster').on('value', (snap) => {
  const data = snap.val() || {};
  const prevLocks = {};
  roster.forEach((p) => { if (Number.isInteger(p.lockedTable)) prevLocks[p.id] = p.lockedTable; });

  roster = Object.keys(data)
    .map((id) => {
      const v = data[id] || {};
      return {
        id: id,
        name: v.name || '名無し',
        table: v.table || '',
        color: v.color || '#ffffff',
        exp: typeof v.exp === 'number' ? v.exp : 1,
        leave: typeof v.leave === 'number' ? v.leave : 0,
        isCollecting: !!v.isCollecting,
        timestamp: v.timestamp || 0,
        profile: profileFromTableName(v.table),
        lockedTable: prevLocks[id]
      };
    })
    // 図鑑収集モードの人は席の対象外
    .filter((p) => !p.isCollecting)
    .sort((a, b) => a.timestamp - b.timestamp);

  // 名簿から消えた人を割り当てからも外す
  if (groups) {
    const alive = new Set(roster.map((p) => p.id));
    groups = groups.map((g) => g.filter((id) => alive.has(id)));
  }
  renderAll();
});

db.ref('.info/connected').on('value', (snap) => {
  document.getElementById('net-status').style.display = snap.val() === true ? 'none' : 'block';
});

// ---- 卓の設定 ----------------------------------------------
function recalcCapacities(silent) {
  const size = parseInt(document.getElementById('pref-size').value) || 4;
  capacities = suggestCapacities(roster.length, size, ALL_TABLES.length);
  groups = null;
  if (!silent) renderAll();
}

function renderCapSummary() {
  const el = document.getElementById('cap-summary');
  if (!capacities.length) {
    el.textContent = '診断を終えた者が2名以上になると、卓数のめやすが出るぞい。';
    return;
  }
  const seats = capacities.reduce((a, b) => a + b, 0);
  el.textContent = `${capacities.length}卓（${capacities.join('・')}名）＝ ${seats}席 ／ 参加者 ${roster.length}名`;
}

// ---- 割り当て ----------------------------------------------
function runAssign() {
  const msg = document.getElementById('assign-msg');
  if (roster.length < 2) {
    msg.className = 'host-note host-note-warn';
    msg.textContent = '診断を終えた者が2名以上おらぬと、卓は組めぬ。';
    return;
  }
  if (!capacities.length) recalcCapacities(true);

  try {
    const result = assignTables(roster, capacities);
    groups = result.map((g) => g.map((p) => p.id));
    selectedId = null;
    msg.className = 'host-note';
    msg.textContent = '卓を組んだぞい。気に入らぬところは名前をタップして入れ替えるのじゃ。';
    setMessage('割り当てができたぞい。<br>確認したら「この結果を全員に反映する」を押すのじゃ。');
    renderAll();
  } catch (e) {
    msg.className = 'host-note host-note-warn';
    msg.textContent = e.message;
  }
}

// ---- 手で入れ替える ----------------------------------------
function seatClick(tableIndex, id) {
  if (!groups) return;

  if (selectedId === null) {
    if (id === null) return;
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
  renderAll();
}

function toggleLock(id) {
  const p = roster.find((x) => x.id === id);
  if (!p) return;
  if (Number.isInteger(p.lockedTable)) p.lockedTable = undefined;
  else {
    const t = groups ? groups.findIndex((g) => g.includes(id)) : -1;
    if (t >= 0) p.lockedTable = t;
  }
  renderAll();
}

// ---- 反映 --------------------------------------------------
function applyToRoster() {
  if (!groups) { showNotice('先に「卓を組む」を押すのじゃ。'); return; }
  if (!confirm('この割り当てを全員の記録画面に反映します。よろしいですか。')) return;

  const jobs = [];
  groups.forEach((ids, ti) => {
    const info = tableInfo(ti);
    ids.forEach((id) => {
      jobs.push(db.ref('roster/' + id).update({ table: info.name, color: info.color }));
    });
  });

  Promise.all(jobs)
    .then(() => {
      setMessage('全員に反映したぞい。<br>各自の「📜 記録」に最終的な卓が表示される。');
      showNotice('反映しました。');
    })
    .catch(() => {
      showNotice('反映できませんでした。通信とFirebaseのルールを確認してください。');
    });
}

// ---- 表示 --------------------------------------------------
function renderRoster() {
  const box = document.getElementById('roster-list');
  document.getElementById('roster-count').textContent = `(${roster.length}名)`;
  box.innerHTML = '';

  if (roster.length === 0) {
    box.innerHTML = '<div class="host-note">まだ誰も診断を終えておらぬようじゃ。</div>';
    return;
  }

  roster.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'host-roster-row';

    const marks = [];
    if (p.exp === 2) marks.push('説明できる');
    if (p.exp === 0) marks.push('初心者');
    if (p.leave === 1) marks.push('途中で帰る');
    if (Number.isInteger(p.lockedTable)) marks.push(`${tableInfo(p.lockedTable).name}に固定`);

    const who = document.createElement('div');
    who.className = 'who';
    who.innerHTML = '<b></b><span class="meta"></span>';
    who.querySelector('b').textContent = p.name;
    who.querySelector('.meta').textContent =
      (p.table || '診断中') + (marks.length ? '／' + marks.join('・') : '');
    row.appendChild(who);

    const lock = document.createElement('button');
    lock.className = 'host-icon-btn';
    lock.textContent = Number.isInteger(p.lockedTable) ? '固定中' : '固定';
    lock.onclick = () => toggleLock(p.id);
    row.appendChild(lock);

    box.appendChild(row);
  });
}

function renderTables() {
  const box = document.getElementById('tables');
  const title = document.getElementById('result-title');
  const hint = document.getElementById('swap-hint');
  box.innerHTML = '';

  if (!groups) {
    title.textContent = '卓の割り当て';
    hint.textContent = '';
    box.innerHTML = '<div class="host-note">「卓を組む」を押すと、ここに結果が出るぞい。</div>';
    return;
  }

  title.textContent = '卓の割り当て';
  hint.textContent = selectedId
    ? '入れ替える相手か、空席をタップするのじゃ。'
    : '名前をタップして、もう一人をタップすると席を入れ替えられる。';

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

function copyResult() {
  const text = buildResultText();
  if (!text) { showNotice('先に「卓を組む」を押すのじゃ。'); return; }
  navigator.clipboard.writeText(text)
    .then(() => showNotice('コピーしました。'))
    .catch(() => { window.prompt('下の文字を選択してコピーしてください。', text); });
}

document.addEventListener('DOMContentLoaded', renderAll);
