// ============================================================
//  store.js — 館の保管庫（この端末の中だけ）
//
//  以前はFirebaseという外部サービスに名簿を預けていましたが、
//  そのためにコンソールでの設定やルールの貼り替えが必要でした。
//  今はこのファイルが同じ役目を、端末の中だけで果たします。
//
//  ・通信は一切しません。電波が悪くても動きます。
//  ・名前がどこかのサーバーに残ることもありません。
//  ・GitHub Pages に置くだけで動きます。
//
//  保存先はブラウザの localStorage です。
//  同じ端末・同じブラウザで開くかぎり残り続けます。
// ============================================================

const HALL_STORE_KEY = 'takuwake_store_v1';

const db = (function () {
  let tree = {};
  const watchers = [];   // { path, cb }

  function load() {
    try {
      tree = JSON.parse(localStorage.getItem(HALL_STORE_KEY)) || {};
    } catch (e) {
      tree = {};          // 壊れていたら空から始める
    }
  }

  function save() {
    try {
      localStorage.setItem(HALL_STORE_KEY, JSON.stringify(tree));
    } catch (e) {
      /* 保存できなくても、画面の操作は続けられる */
    }
  }

  function parts(path) {
    return String(path).split('/').filter((s) => s !== '');
  }

  function getAt(path) {
    let node = tree;
    for (const key of parts(path)) {
      if (node === null || typeof node !== 'object') return null;
      node = node[key];
      if (node === undefined) return null;
    }
    return node === undefined ? null : node;
  }

  function setAt(path, value, merge) {
    const keys = parts(path);
    if (keys.length === 0) { tree = value || {}; return; }
    let node = tree;
    for (let i = 0; i < keys.length - 1; i++) {
      if (node[keys[i]] === null || typeof node[keys[i]] !== 'object') node[keys[i]] = {};
      node = node[keys[i]];
    }
    const last = keys[keys.length - 1];
    if (value === null) delete node[last];
    else if (merge && node[last] && typeof node[last] === 'object') Object.assign(node[last], value);
    else node[last] = value;
  }

  // 変更があった場所と、その親を見ている人に知らせる
  function notify(changed) {
    watchers.forEach((w) => {
      const a = parts(w.path).join('/');
      const b = parts(changed).join('/');
      if (a === b || b.indexOf(a + '/') === 0 || a.indexOf(b + '/') === 0) {
        try { w.cb({ val: () => getAt(w.path) }); } catch (e) { /* 一人の失敗で他を止めない */ }
      }
    });
  }

  function ref(path) {
    return {
      // Firebase版と同じ書き方で使えるようにしてあります
      on: function (event, cb) {
        if (path === '.info/connected') {
          // 通信しないので、常につながっている扱いです
          setTimeout(() => cb({ val: () => true }), 0);
          return;
        }
        watchers.push({ path: path, cb: cb });
        setTimeout(() => { try { cb({ val: () => getAt(path) }); } catch (e) {} }, 0);
      },
      once: function () { return Promise.resolve({ val: () => getAt(path) }); },
      set: function (value) { setAt(path, value, false); save(); notify(path); return Promise.resolve(); },
      update: function (value) { setAt(path, value, true); save(); notify(path); return Promise.resolve(); },
      remove: function () { setAt(path, null, false); save(); notify(path); return Promise.resolve(); }
    };
  }

  load();
  return { ref: ref, _raw: () => tree, _reload: load };
})();
