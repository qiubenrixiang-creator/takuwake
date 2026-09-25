# 公開の手順（PC作業用）

Claude版の たくわけの やかた を GitHub Pages で公開する手順です。
GitHub だけで完結します。所要15分ほど。

**旧版はそのまま残して、新しいリポジトリで公開する**やり方にしています。
新版で会を1回回してみて、問題がなければ旧版を片付けてください。

> **前の版を もう `takuwake-claude` に入れた場合**
> 1〜2 と 5 は飛ばしてください。
> GitHub Desktop の「Repository」→「Show in Explorer」で開いたフォルダの中身（`.git` 以外）をすべて削除し、
> このフォルダの中身を貼り付けて、4 の手順で送れば完了です。

---

## 1. 新しいリポジトリを作る

1. GitHub 右上の「**+**」→「**New repository**」
2. 次のとおり入力

   | 項目 | 設定 |
   |---|---|
   | Repository name | `takuwake-claude`（好きな名前で構いません） |
   | 公開設定 | **Public**（GitHub Pages の無料版に必要） |
   | Add a README file | チェックを入れる |

3. 「**Create repository**」

## 2. PCに取り込む

1. GitHub Desktop →「File」→「**Clone repository**」
2. 「GitHub.com」タブから `takuwake-claude` を選んで「**Clone**」

## 3. ファイルを入れる

1. GitHub Desktop の「Repository」→「**Show in Explorer**」
2. 中の `README.md` を削除
3. このフォルダの**中身**をすべてコピーして貼り付け

   ```
   assets   css   js          ← フォルダ3つ（assets の中に audio と bg.png）
   index.html   kumi.html   README.md   SETUP.md   .gitignore
   ```

## 4. GitHub へ送る

1. GitHub Desktop に戻る
2. 変更一覧に `assets/audio/bgm_main.mp3` のように**スラッシュ付き**で並んでいることを確認
3. Summary に `Claude版 音の修正・せってい` と入力
4. 「**Commit to main**」→「**Push origin**」

## 5. 公開設定

1. リポジトリの「**Settings**」→「**Pages**」
2. Source: `Deploy from a branch`
3. Branch: `main` / `(root)` →「**Save**」
4. 数分で URL が出ます

   `https://qiubenrixiang-creator.github.io/takuwake-claude/`

---

## 6. 動作確認（iPhoneで）

- [ ] 酒場の背景に、BGL と同じ 黒地・白わくのウィンドウが出る
- [ ] 上に ♪・SE・よる、下に しんだん・せき・ライブラリー が並ぶ
- [ ] 画面を最初に押したときに BGM が鳴る（♪ で止められる）
- [ ] 「よる」を押すと ひる の画面になる。BGL を開いても同じ設定になっている
- [ ] 文字送りの途中でも、選択肢を押せる
- [ ] 最後まで答えると、卓・つよさ・4文字の合言葉が出る
- [ ] 下の「せってい」→ やくわり「かんじ」→ 合言葉 `たくぐみ` で、たくぐみの ま へ入れる
- [ ] 名前と合言葉を入れて「むかえる」→ 2人以上で「たくを くむ」
- [ ] 「はっぴょう リンクを コピー」→ そのリンクを別の端末で開くと、席が出る
- [ ] 下の「ライブラリー」で ボードゲームライブラリーが開く
- [ ] しんだんを終えると「やかたの きゃくじん」の称号が出る
- [ ] 「ずかん」タブに、出会った卓と称号が並ぶ。称号をたたくと名乗れる
- [ ] 結果画面の「この けっかを けす」、せっていの「きろくを けす」で消せる
- [ ] しばらく操作しても音が止まらない。ほかのアプリに切りかえて戻っても、画面を押せば鳴る
- [ ] ※ マナーモードでは鳴りません（BGL と同じ）

---

## ファイルを直すとき

1. PCのフォルダでファイルを直す
2. GitHub Desktop で「Commit to main」→「Push origin」

文章や質問は `js/data.js` だけで直せます。
