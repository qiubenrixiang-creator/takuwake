// ============================================================
//  assign.js — 卓の わりあて
//
//  考えかた：
//   1. 「そろえたい つよさ」だけで 近さを はかる。
//      にぎやかさ・すばやさ・おもさ が バラバラな 卓は いごこちが 悪い。
//      かしこさ（運か戦略か）は ちがっても かまわないので 入れない。
//   2. 診断で 同じ卓に なった人どうしは、少し 近いと みなす。
//   3. 初心者だけの 卓を 作らない。途中で 帰る人を 重い卓に 入れない。
//   4. 卓の 定員は 必ず まもる。
//   5. まず 素朴に 配ってから、2人ずつ 入れかえて 良くなるかを 何千回も 試す。
// ============================================================

const ASSIGN = {
  weights: { t: 1.5, p: 1.2, w: 1.0 },   // にぎやかさ・すばやさ・おもさ の 重み
  sameTypeBonus: 1.5,                     // 診断が ちがう 卓どうしの ときの 追加の 遠さ
  noTeacher: 40,                          // 初心者が いるのに 説明できる人が いない（ほぼ 必ず 守る）
  leaverHeavy: 8                          // 途中で 帰る人が 重い卓に いる
};

function groupCost(members) {
  if (members.length <= 1) return 0;
  let cost = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      const a = members[i], b = members[j];
      Object.keys(ASSIGN.weights).forEach((k) => { cost += ASSIGN.weights[k] * Math.abs(a.profile[k] - b.profile[k]); });
      if (a.table !== b.table) cost += ASSIGN.sameTypeBonus;
    }
  }
  cost /= (members.length - 1);
  if (members.some((m) => m.exp === 0) && !members.some((m) => m.exp === 2)) cost += ASSIGN.noTeacher;
  const avgW = members.reduce((s, m) => s + m.profile.w, 0) / members.length;
  const leavers = members.filter((m) => m.leave === 1).length;
  if (leavers) cost += ASSIGN.leaverHeavy * leavers * (avgW / 4);
  return cost;
}

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// 人数から 卓の 数と 定員を きめる。1卓だけ 極端に 少なくならないよう 均す。
function planCapacities(count, perTable, maxTables) {
  if (count < 2) return [];
  let n = Math.max(1, Math.round(count / (perTable || 4)));
  n = Math.min(n, maxTables || 8);
  while (n > 1 && count / n < 2) n--;
  const base = Math.floor(count / n);
  let rest = count % n;
  const caps = [];
  for (let i = 0; i < n; i++) { caps.push(base + (rest > 0 ? 1 : 0)); if (rest > 0) rest--; }
  return caps;
}

// people: [{ id, table, exp, leave, profile:{w,s,t,p}, locked }]  →  [[id, ...], ...]
function assignGroups(people, caps) {
  const seats = caps.reduce((a, b) => a + b, 0);
  if (people.length > seats) throw new Error('席が たりぬ。' + people.length + '人に 対して ' + seats + '席 しかないぞ。');

  const locked = people.filter((p) => Number.isInteger(p.locked) && p.locked < caps.length);
  const free = people.filter((p) => !(Number.isInteger(p.locked) && p.locked < caps.length));
  let best = null, bestCost = Infinity;

  for (let round = 0; round < 6; round++) {
    const rand = seededRandom(round * 7919 + 13);
    const groups = caps.map(() => []);
    locked.forEach((p) => groups[p.locked].push(p));

    const order = free.slice();
    if (round === 0) order.sort((a, b) => (b.profile.t * 5 + b.profile.p) - (a.profile.t * 5 + a.profile.p));
    else for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }

    order.forEach((p) => {
      let target = -1, add = Infinity;
      groups.forEach((g, gi) => {
        if (g.length >= caps[gi]) return;
        const d = groupCost(g.concat([p])) - groupCost(g);
        if (d < add) { add = d; target = gi; }
      });
      groups[target].push(p);
    });

    for (let it = 0; it < 6000; it++) {
      const a = Math.floor(rand() * groups.length), b = Math.floor(rand() * groups.length);
      if (a === b || !groups[a].length) continue;
      const ga = groups[a], gb = groups[b];
      const ia = Math.floor(rand() * ga.length);
      if (Number.isInteger(ga[ia].locked)) continue;
      const before = groupCost(ga) + groupCost(gb);

      if (gb.length < caps[b]) {                      // 空席が あれば 移動も ためす
        const m = ga.splice(ia, 1)[0]; gb.push(m);
        if (groupCost(ga) + groupCost(gb) < before) continue;
        gb.pop(); ga.splice(ia, 0, m);
      }
      if (!gb.length) continue;
      const ib = Math.floor(rand() * gb.length);
      if (Number.isInteger(gb[ib].locked)) continue;
      [ga[ia], gb[ib]] = [gb[ib], ga[ia]];
      if (groupCost(ga) + groupCost(gb) >= before) [ga[ia], gb[ib]] = [gb[ib], ga[ia]];
    }

    const total = groups.reduce((s, g) => s + groupCost(g), 0);
    if (total < bestCost) { bestCost = total; best = groups.map((g) => g.map((p) => p.id)); }
  }
  return best;
}

// 組んだ 卓に、いちばん ふさわしい 卓の 名前を つける（かぶらないように）
function nameGroups(groups, byId) {
  const pairs = [];
  groups.forEach((ids, gi) => {
    const members = ids.map((id) => byId[id]).filter(Boolean);
    TABLE_KEYS.forEach((key) => {
      const votes = members.filter((m) => m.table === key).length;
      let dist = 0;
      if (members.length) ['w', 's', 't', 'p'].forEach((k) => {
        const avg = members.reduce((s, m) => s + m.profile[k], 0) / members.length;
        dist += Math.abs(avg - TABLES[key].profile[k]);
      });
      pairs.push({ gi, key, score: votes * 10 - dist });
    });
  });
  pairs.sort((a, b) => b.score - a.score);
  const names = new Array(groups.length).fill(null);
  const used = {};
  pairs.forEach((p) => { if (names[p.gi] === null && !used[p.key]) { names[p.gi] = p.key; used[p.key] = true; } });
  return names;
}

function groupWarnings(members) {
  const w = [];
  if (!members.length) return w;
  if (members.some((m) => m.exp === 0) && !members.some((m) => m.exp === 2)) w.push('はじめての 人が いるが、ルールを 説明できる 人が いない');
  const talks = members.map((m) => m.profile.t);
  if (Math.max(...talks) - Math.min(...talks) >= 4) w.push('しずかに 遊びたい 人と、わいわい 遊びたい 人が いっしょ');
  const avgW = members.reduce((s, m) => s + m.profile.w, 0) / members.length;
  if (members.some((m) => m.leave === 1) && avgW >= 2.7) w.push('途中で 帰る人が いるので、長い ゲームは さけて');
  return w;
}

function groupMood(members) {
  if (!members.length) return '';
  const avg = (k) => members.reduce((s, m) => s + m.profile[k], 0) / members.length;
  const t = avg('t'), w = avg('w'), s = avg('s'), p = avg('p');
  const out = [];
  out.push(t >= 2.7 ? 'わいわい' : (t <= 1.3 ? 'しずか' : 'ほどほどに 会話'));
  out.push(w >= 2.7 ? 'おもめ' : (w <= 1.3 ? 'かるめ' : '中くらいの おもさ'));
  out.push(s >= 2.7 ? 'せんりゃく 好き' : (s <= 1.3 ? 'うん 好き' : 'うんも せんりゃくも'));
  if (p >= 2.7) out.push('テンポ 重視');
  return out.join('・');
}

if (typeof module !== 'undefined') module.exports = { groupCost, assignGroups, planCapacities, nameGroups, groupWarnings, groupMood };
