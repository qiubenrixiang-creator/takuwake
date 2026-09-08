// ============================================================
//  firebase-config.js — 名簿の共有に使う Firebase の接続設定
//
//  ここに書かれた apiKey は「公開されても問題ない種類のキー」です。
//  データを守っているのは Firebase コンソールの「ルール」の方なので、
//  ルールの設定だけは必ず確認してください（README.md 参照）。
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyDV5GOhLAj0JdoWTv6ap56LNk_qXIb-rMI",
  authDomain: "takuwake-no-yakata.firebaseapp.com",
  databaseURL: "https://takuwake-no-yakata-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "takuwake-no-yakata",
  storageBucket: "takuwake-no-yakata.firebasestorage.app",
  messagingSenderId: "711432154786",
  appId: "1:711432154786:web:813fd30ec0641f719ef1fb"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
