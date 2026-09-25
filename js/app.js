// ============================================================
//  app.js — 卓分けの館 / 動きのプログラム
//  質問文や卓の設定を直したいだけなら js/data.js を見てください。
// ============================================================


  // グローバル変数
  let soundEnabled = true;
  let isCollectionMode = false; 
  let tempPeopleCount = 0;
  let tempTableCount = 0;
  let tempMaxPerTable = 0;
  let stepHistory = [];
  let playerName = "";
  let realPlayerName = "";
  let tempName = "";
  let finalResultData = null;
  let emptyNameCount = 0;
  let emptyPeopleCount = 0;
  let isRetry = false;
  let currentRetryMode = '';
  let undoCount = 0; 
  let nushiTapCount = 0;
  let nushiTapTimer = null;
  let idleTimer = null;
  let abyssWarningIssued = false;
  const IDLE_TIME_LIMIT = 120000; 
  let galleryClickSequence = [];
  let isGodMode = false;
  let isDirectGodMode = false; 
  let typeTimer = null;
  let isTyping = false;
  
  // 図鑑ノイズ復元用変数
  let currentTargetText = "";
  let currentOnComplete = null;
  let currentIsNameScreen = false;

  let pendingResultKey = "";
  let pendingResultIsJump = false;
  let activeMQuiz = [];
  let mQuizIndex = 0;
  let activeSacrificeQuiz = [];
  let sacrificeIndex = 0;
  let sacrificeCorrectCount = 0;
  let jumpTargetKey = "";
  let currentStep = "";
  
  let godMethods = JSON.parse(localStorage.getItem('takuwake_god_methods')) || { konami: false, tenkuu: false, gallery: false };
  function saveGodMethods() {
      localStorage.setItem('takuwake_god_methods', JSON.stringify(godMethods));
  }


  let unlockedRoutes = JSON.parse(localStorage.getItem('takuwake_unlocked')) || [];
  let unlockedTitles = JSON.parse(localStorage.getItem('takuwake_titles')) || []; 
  let visitorRoster = [];

  let activeTables = ["A", "B"];
  let currentMaxPerTable = 4; 

  // 音声ファイルの準備
  // play() は「今すぐ鳴らせ」ではなく「鳴らす準備をせよ」という要求で、
  // 実際に音が出るまでに時間差があります。その間に pause() を呼んでも、
  // 遅れて再生が始まってしまうため、場面が変わったあとに前のBGMが
  // 鳴り出すことがありました。
  // ここで play / pause に札（token）を付けて、止めるよう指示された後に
  // 始まってしまった音を、その場で確実に止めます。
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
      token++;                       // 進行中の再生要求を無効にする
      try { nativePause.call(audio); } catch (e) { /* 未読込なら何もしない */ }
    };
    return audio;
  }

  // 効果音は小さいので先に読み込み、BGMは必要になってから取りに行きます。
  // 起動時に全部読むと十数MBの通信が走り、これも音のズレの原因でした。
  const soundBGM = makeSafeAudio(new Audio(AUDIO_FILES.bgmMain), 'auto'); soundBGM.loop = true;
  const soundSecretBGM = makeSafeAudio(new Audio(AUDIO_FILES.bgmSecret), 'metadata'); soundSecretBGM.loop = true;
  const soundSeriousBGM = makeSafeAudio(new Audio(AUDIO_FILES.bgmSerious), 'metadata'); soundSeriousBGM.loop = true;
  const soundStaffRoll = makeSafeAudio(new Audio(AUDIO_FILES.bgmStaffRoll), 'metadata'); soundStaffRoll.loop = true;
  const soundYes = makeSafeAudio(new Audio(AUDIO_FILES.seDecide), 'auto');
  const soundNo = makeSafeAudio(new Audio(AUDIO_FILES.seCancel), 'auto');
  const soundBack = makeSafeAudio(new Audio(AUDIO_FILES.seBack), 'auto');
  const soundTalk = makeSafeAudio(new Audio(AUDIO_FILES.seTalk), 'auto'); soundTalk.loop = true;
  const soundFanfare = makeSafeAudio(new Audio(AUDIO_FILES.seFanfare), 'auto');
  const soundEyecatch = makeSafeAudio(new Audio(AUDIO_FILES.seEyecatch), 'auto');
  const soundGlitch = makeSafeAudio(new Audio(AUDIO_FILES.seGlitch), 'auto');

  function getClearNames() {
      let names = JSON.parse(localStorage.getItem('takuwake_clear_names_list'));
      if (!names) {
          let oldName = localStorage.getItem('takuwake_clear_name');
          names = oldName ? [oldName] : ["OHTANI SHUYA"];
          localStorage.setItem('takuwake_clear_names_list', JSON.stringify(names));
      }
      return names;
  }

  function setClearNames(names) {
      localStorage.setItem('takuwake_clear_names_list', JSON.stringify(names));
  }

  // エンドロールの中身は startStaffRoll() で組み直すので、
  // ここでは名簿の更新だけを受け止めます。
  function updateStaffRollName() { /* buildStaffRoll() が最新の名を読みます */ }

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    abyssWarningIssued = false;
    if (document.getElementById('quiz-buttons').style.display !== 'none' || 
        document.getElementById('name-input-section').style.display !== 'none' || 
        document.getElementById('people-section').style.display !== 'none' || 
        document.getElementById('input-quiz-section').style.display !== 'none') {
      idleTimer = setTimeout(() => {
        triggerIdleDialogue();
      }, IDLE_TIME_LIMIT);
    }
  }

  function triggerIdleDialogue() {
    if (isTyping) return;
    wasIdle = true;
    const isAbyss = document.body.classList.contains('serious-mode');
    if (isAbyss) {
      if (!abyssWarningIssued) {
        abyssWarningIssued = true;
        if(soundEnabled){ soundNo.currentTime=0; soundNo.play().catch(()=>{}); }
        typeWriter("……何をしておる。深淵において迷いは死を意味するぞ。早く答えぬか、残り時間はわずかじゃ……！");
        idleTimer = setTimeout(() => { showResult('X'); }, 30000);
      }
    } else {
      const idleMessages = [
          "お主、考え込んだまま動かんが…どうしたのじゃ？ 寝ておるのか？", 
          "む……？ まさか難しすぎて悩んでおるのか？ 気楽に行けばよいのじゃぞ！", 
          "おいおい、魂が抜けたようになっておるぞ。生きておるかぁ？", 
          "ふむ、あまりに長い沈黙……。もしや、わしの質問に哲学を感じておるのか？"
      ];
      const randomMsg = idleMessages[Math.floor(Math.random() * idleMessages.length)];
      if(soundEnabled){ soundBack.currentTime=0; soundBack.play().catch(()=>{}); }
      typeWriter(randomMsg);
    }
  }

  // Firebaseからの名簿データ取得
  db.ref('roster').on('value', (snapshot) => {
    const data = snapshot.val();
    visitorRoster = [];
    if (data) {
      for (let nameKey in data) {
        const entry = Object.assign({ id: nameKey }, data[nameKey]);
        visitorRoster.push(entry);
      }
      visitorRoster.sort((a, b) => a.timestamp - b.timestamp);
    }
    if(document.getElementById('roster-modal').classList.contains('active')){
      renderRoster();
    }
  });

  // 初期化処理
  document.addEventListener("DOMContentLoaded", () => {
    updateStaffRollName();
    isCollectionMode = false;
    document.getElementById('btn-roster').style.display = 'block';
    typeWriter('まずは、音声の設定を選ぶのじゃ。', null, true);
    buildGallery();
    watchMyHistory();
    bindEnterKeys();
    if (importSeatingFromUrl()) {
      setTimeout(() => {
        typeWriter('おお、卓が発表されたようじゃな。\n「📜 記録」から席の一覧が見られるぞい。', null, true);
      }, 600);
    } 
  });

  // 幹事だけが通れる扉。合言葉か神の座から入る。
  function goToKumiRoom() {
    try { sessionStorage.setItem('takuwake_kumi_pass', '1'); } catch (e) { /* 保存できなくとも合言葉で入れる */ }
    if (soundEnabled) { soundYes.currentTime = 0; soundYes.play().catch(() => {}); }
    location.href = 'kumi.html';
  }

  // スマホでは決定ボタンを押しに行くのが手間なので、Enterでも進めるようにする。
  function bindEnterKeys() {
    const pairs = [
      ['participant-count', checkSettings],
      ['player-name', checkNameInput],
      ['abyss-answer-input', submitAbyssAnswer],
      ['secret-name-answer-input', submitSecretName]
    ];
    pairs.forEach(([id, fn]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); fn(); }
      });
    });
  }

  // iOSのSafariは「一度も再生したことのない音声」を後から鳴らそうとしても拒みます。
  // そこで、ユーザーが「音声あり」を押したその瞬間に、すべての音声へ
  // 無音の再生許可だけを取っておきます。
  //
  // 以前と違うのは load() を呼ばないことです。load() は読み込みを始めてしまい、
  // その間に「ユーザー操作中」という扱いが切れて、続く再生が拒否されていました。
  // ここでは再生と即停止だけを行い、読み込みは各音声が必要になった時に任せます。
  function unlockAudio(audio) {
    if (audio._unlocked) return Promise.resolve();
    audio._unlocked = true;
    return new Promise((done) => {
      const settle = () => {
        try { nativePause.call(audio); audio.currentTime = 0; } catch (e) { /* 未読込 */ }
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

  function preloadAudio(audio) { unlockAudio(audio); }

  // 隠しルート・深淵・エンドロールのBGMは、始まってすぐには鳴りません。
  // これらの許可は次のタップまで待たせ、最初の一押しを軽くします。
  // 画面を触るのはどれもユーザー操作なので、iOSの制限には触れません。
  let heavyAudioUnlocked = false;

  function unlockHeavyAudio() {
    if (heavyAudioUnlocked || !soundEnabled) return;
    heavyAudioUnlocked = true;
    [soundSecretBGM, soundSeriousBGM, soundStaffRoll].forEach(unlockAudio);
  }

  function scheduleHeavyAudioUnlock() {
    if (heavyAudioUnlocked) return;
    const once = () => {
      document.removeEventListener('pointerdown', once);
      document.removeEventListener('click', once);
      unlockHeavyAudio();
    };
    document.addEventListener('pointerdown', once);
    document.addEventListener('click', once);
  }

  let audioReady = false;

  function selectSound(enableAudio) {
    soundEnabled = enableAudio;
    if (soundEnabled) {
      // このボタンを押した瞬間だけが、iOSが再生を許す唯一の機会です。
      // ここで許可を取り、それが済んでから実際に鳴らします。
      // 許可の最中に鳴らすと、無音のまま流れたり、直後に止められたりします。
      //
      // ただし許可を出すと、その音声の読み込みも始まります。
      // 11本すべてを一度に許可すると、この一押しで数MBの通信が走り、
      // 会場の電波では画面が固まったようになります。
      // そこで、ここでは効果音と主BGMだけにとどめ、
      // すぐには要らないBGMは次のタップまで待たせます。
      const first = [soundYes, soundNo, soundBack, soundTalk,
                     soundFanfare, soundEyecatch, soundGlitch, soundBGM];
      Promise.all(first.map(unlockAudio)).then(() => {
        audioReady = true;
        soundYes.currentTime = 0; soundYes.play().catch(() => {});
        soundBGM.currentTime = 0; soundBGM.play().catch(() => {});
      });
      scheduleHeavyAudioUnlock();
    }
    document.getElementById('sound-section').style.display = 'none';

    if (localStorage.getItem('takuwake_registered_table')) {
        document.getElementById('mode-resume-section').style.display = 'flex';
        typeWriter("お主、すでに運命の卓は決まっておるようじゃな。\nどちらのモードで遊ぶか選ぶのじゃ。", null, true);
    } else {
        startSelectionModeFlow();
    }
    resetIdleTimer();
  }

  function startSelectionModeFlow() {
      if(soundEnabled) { soundYes.currentTime = 0; soundYes.play().catch(()=>{}); }
      document.getElementById('mode-resume-section').style.display = 'none';
      isCollectionMode = false;
      document.getElementById('btn-gallery').style.display = 'none';
      
      const urlParams = new URLSearchParams(window.location.search);
      const peopleParam = urlParams.get('people');
      if (peopleParam && parseInt(peopleParam) >= 2) {
          document.getElementById('participant-count').value = peopleParam;
          checkSettings(true); 
      } else {
          document.getElementById('people-section').style.display = 'flex';
          typeWriter('ようこそ『卓分けの館』へ！\n本日の参加人数を入力するのじゃ。', null, true);
      }
  }

  function resumeCollectionModeFlow() {
      if(soundEnabled) { soundYes.currentTime = 0; soundYes.play().catch(()=>{}); }
      document.getElementById('mode-resume-section').style.display = 'none';
      isCollectionMode = true;
      document.getElementById('btn-gallery').style.display = 'block';
      tempPeopleCount = 99; tempTableCount = 8; tempMaxPerTable = 99;
      activeTables = ALL_TABLES; currentMaxPerTable = 99;
      
      document.getElementById('name-input-section').style.display = 'flex';
      typeWriter("【図鑑収集モード】じゃな！\nさあ、お主の名前を教えるのじゃ。", null, true);
  }

  function tapNushi() {
    const isAbyssNow = document.body.classList.contains('serious-mode');
    bumpTap(isAbyssNow);
    if (isTyping || !isCollectionMode) return;
    resetIdleTimer();
    const isAbyss = isAbyssNow;
    
    if (isAbyss) {
      nushiTapCount++;
      if (soundEnabled) { soundBack.currentTime = 0; soundBack.play().catch(()=>{}); }
      if (nushiTapCount >= 3) {
        nushiTapCount = 0; clearTimeout(nushiTapTimer); stepHistory.push(currentStep); 
        document.getElementById('input-quiz-section').style.display = 'none';
        document.getElementById('secret-name-input-section').style.display = 'none';
        document.getElementById('result-box').style.display = 'none';
        document.getElementById('quiz-buttons').style.display = 'flex';
        showQuestion('q_abyss_battle');
      } else {
        clearTimeout(nushiTapTimer); nushiTapTimer = setTimeout(() => { nushiTapCount = 0; }, 2000);
      }
    } else {
      if (currentStep === 'start' && document.getElementById('quiz-buttons').style.display !== 'none') {
        nushiTapCount++;
        if (soundEnabled) { soundBack.currentTime = 0; soundBack.play().catch(()=>{}); }
        if (nushiTapCount >= 3) {
          nushiTapCount = 0; clearTimeout(nushiTapTimer); stepHistory.push('start'); showQuestion('q_secret_j_confirm');
        } else {
          clearTimeout(nushiTapTimer); nushiTapTimer = setTimeout(() => { nushiTapCount = 0; }, 2000);
        }
      }
    }
  }

  // 人数はこの端末で入力したものだけを使います。
  // 以前はサーバー経由で全員に配っていましたが、その必要がなくなりました。
  let sharedPeopleCount = null;

  function checkSettings(skipSound=false) {
    if(isTyping) return;
    resetIdleTimer();
    const inputVal = document.getElementById('participant-count').value;
    const peopleCount = parseInt(inputVal);
    if(isNaN(peopleCount) || peopleCount < 2) {
      emptyPeopleCount++;
      if(soundEnabled){ soundNo.currentTime=0; soundNo.play().catch(()=>{}); }
      const warnings = [
          "参加人数を入力するのじゃ！2名以上からじゃぞ！",
          "コラ！数字を入れ忘れておるぞ！",
          "じゃから、人数をちゃんと入力せよと言うておるじゃろ！",
          "……お主、わしをからかっておるのか？次やらなかったらどうなるか分からんぞ！"
      ];
      typeWriter(warnings[Math.min(emptyPeopleCount-1, 3)], null, true);
      return;
    }
    emptyPeopleCount = 0;
    let tableCount = Math.ceil(peopleCount / 4);
    if(tableCount < 2) tableCount = 2; if(tableCount > 8) tableCount = 8;
    tempPeopleCount = peopleCount; tempTableCount = tableCount; tempMaxPerTable = Math.ceil(peopleCount / tableCount);
    if(soundEnabled && !skipSound) { soundYes.currentTime=0; soundYes.play().catch(()=>{}); }
    
    document.getElementById('people-section').style.display = 'none';
    const confirmHtml = `参加人数: <span class="confirm-highlight">${peopleCount}</span> 名<br><hr style="border-color:#444; margin:10px 0;"><span class="confirm-highlight-blue">${tableCount}</span> 卓 に分割<br><span style="font-size:14px; color:#aaa;">(1卓の目安: 最大 ${tempMaxPerTable} 名)</span>`;
    document.getElementById('confirm-details-text').innerHTML = confirmHtml;
    
    document.getElementById('btn-reinput-people').style.display = (currentRetryMode === 'people' || currentRetryMode === 'both') ? 'none' : 'block';
    document.getElementById('confirmation-section').style.display = 'flex';
    typeWriter("ふむ、入力された人数から計算するとこのようになるが……本当にこの設定で間違いないかの？", null, true);
  }

  function cancelSettings() {
    if(soundEnabled){ soundBack.currentTime=0; soundBack.play().catch(()=>{}); }
    document.getElementById('confirmation-section').style.display = 'none';
    document.getElementById('people-section').style.display = 'flex';
    typeWriter('参加人数を入力し直すのじゃ。', null, true);
    resetIdleTimer();
  }

  function proceedToNameInput() {
    activeTables = ALL_TABLES.slice(0, tempTableCount); currentMaxPerTable = tempMaxPerTable;
    document.getElementById('confirmation-section').style.display = 'none';
    if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); if(soundBGM.paused){ soundBGM.currentTime=0; soundBGM.play().catch(()=>{}); } }
    
    if (currentRetryMode === 'people') {
       document.getElementById('confirm-name-text').textContent = tempName;
       document.getElementById('name-confirm-section').style.display = 'flex';
       typeWriter(`ふむ、名前は『${tempName}』のままじゃな？\n本当にこの設定で始めるかの？`, null, true);
    } else {
       document.getElementById('btn-back-to-people').style.display = (currentRetryMode === 'name' || currentRetryMode === 'both') ? 'none' : 'block';
       typeWriter(`よし、設定完了じゃ！本日は【${tempPeopleCount}名】での集まりじゃな。ならば【${tempTableCount}卓】に分けるのがよかろう！\nさあ、まずは、お主の名前を教えるのじゃ。`, () => {
         document.getElementById('name-input-section').style.display = 'flex';
       }, true);
    }
    resetIdleTimer();
  }

  function goBackToConfirmation() {
    if(soundEnabled){ soundBack.currentTime=0; soundBack.play().catch(()=>{}); }
    document.getElementById('name-input-section').style.display = 'none';
    document.getElementById('confirmation-section').style.display = 'flex';
    typeWriter("ふむ、入力された人数から計算するとこのようになるが……本当にこの設定で間違いないかの？", null, true);
    resetIdleTimer();
  }

  function enterGodRoute() {
    playerName = ""; realPlayerName = ""; emptyNameCount = 0; stepHistory = [];
    const allKeys = Object.keys(TABLE_DATA).filter(k => k !== 'GOD');
    unlockedRoutes = allKeys;
    localStorage.setItem('takuwake_unlocked', JSON.stringify(unlockedRoutes));
    unlockedTitles = Object.keys(TITLES_DEF);
    localStorage.setItem('takuwake_titles', JSON.stringify(unlockedTitles));
    buildGallery();
    
    if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); }
    document.getElementById('name-input-section').style.display = 'none'; 
    document.getElementById('quiz-buttons').style.display = 'flex';
    showQuestion('q_secret_debug');
  }

  function checkNameInput() {
    if(isTyping) return;
    resetIdleTimer();
    const rawNameInput = document.getElementById('player-name').value.trim();
    const nameInput = rawNameInput;
    const normalizedInput = rawNameInput.toUpperCase().replace(/[Ａ-Ｚ]/g, function(s) {
        return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    });

    if (nameInput === "G卓→Ω卓→D卓" || normalizedInput === "G卓→Ω卓→D卓") {
        playerName = "創造神"; 
        realPlayerName = "創造神";
        grantAllTreasures();          // 幹事の合言葉。すべて解放する。
        emptyNameCount = 0; stepHistory = [];
        unlockEverything();

        if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); }
        document.getElementById('name-input-section').style.display = 'none'; 
        
        isGodMode = true;
        isDirectGodMode = true; 
        showResult('GOD');
        return;
    }

    if (nameInput === ADMIN_WORDS.gallery.word) {
        unlockEverything();
        if (soundEnabled) { soundEyecatch.currentTime = 0; soundEyecatch.play().catch(() => {}); }
        document.getElementById('player-name').value = '';
        typeWriter(ADMIN_WORDS.gallery.message, null, true);
        return;
    }

    if (nameInput === ADMIN_WORDS.rite.word) {
        openInheritRite();
        return;
    }

    if (nameInput === ADMIN_WORDS.kumi.word) {
        grantAllTreasures();
        if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); }
        typeWriter(ADMIN_WORDS.kumi.message, () => {
            goToKumiRoom();
        }, true);
        return;
    }

    if (!isCollectionMode) {
        if(ngWords.test(nameInput) || nameInput === "") {
            if(soundEnabled){ soundNo.currentTime=0; soundNo.play().catch(()=>{}); }
            typeWriter("まともな名前を入力するのじゃ！", null, true); return;
        }
        if(!/^[ぁ-んー]+$/.test(nameInput)){
            if(soundEnabled){ soundNo.currentTime=0; soundNo.play().catch(()=>{}); }
            typeWriter("名前は「ひらがな」のみで入力するのじゃ！", null, true); return;
        }
        if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); }
        tempName = nameInput;
        document.getElementById('name-input-section').style.display = 'none';
        document.getElementById('confirm-name-text').textContent = tempName;
        document.getElementById('name-confirm-section').style.display = 'flex';
        typeWriter(`ふむ、『${tempName}』じゃな？\n本当にこの名前で間違いないかの？`, null, true);
        return;
    }

    let triggeredGod = false;
    if (normalizedInput === "↑↑↓↓AB") { godMethods.konami = true; saveGodMethods(); triggeredGod = true; } 
    else if (nameInput === "てんくう") { godMethods.tenkuu = true; saveGodMethods(); triggeredGod = true; }
    
    if (triggeredGod) {
        enterGodRoute(); return;
    }

    const normalCount = unlockedRoutes.filter(k => !['X', 'OMEGA', 'ABYSS_SACRIFICE', 'M', 'GOD', 'S', 'Z', 'N', 'V', 'U'].includes(k) && ['A','B','C','D','E','F','G','H'].includes(k)).length;
    if (nameInput === "しんえん" && normalCount >= 8) {
      const penaltyUntil = localStorage.getItem('takuwake_abyss_penalty');
      if (penaltyUntil && Date.now() < parseInt(penaltyUntil, 10)) {
        if(soundEnabled){ soundNo.currentTime=0; soundNo.play().catch(()=>{}); }
        typeWriter("……今はまだ、奈落の呪縛から解き放たれておらぬ。", null, true); return;
      }
      playerName = ""; realPlayerName = ""; emptyNameCount = 0; stepHistory = [];
      if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); soundBGM.pause(); soundSecretBGM.pause(); soundSeriousBGM.currentTime = 0; soundSeriousBGM.play().catch(()=>{}); }
      document.getElementById('name-input-section').style.display = 'none';
      document.getElementById('quiz-buttons').style.display = 'flex';
      showQuestion('q_abyss_intro'); return;
    }

    const silenceWords = ["そら", "すかい", "とり", "てんし", "くうはく", "せんこう", "やみ", "あんこく", "ふかい", "みどり", "ふかみどり", "いと"];
    if (silenceWords.includes(nameInput) || /[↑↓上下AB]/.test(normalizedInput)) {
      if(soundEnabled){ soundNo.currentTime=0; soundNo.play().catch(()=>{}); }
      typeWriter("・・・・・\n（ぬしは何かを察したような顔で沈黙している…）", null, true); return;
    }

    if(ngWords.test(nameInput) || nameInput === "") {
      emptyNameCount++;
      if(soundEnabled){ soundNo.currentTime=0; soundNo.play().catch(()=>{}); }
      if(emptyNameCount >= 5) {
        playerName = ""; realPlayerName = ""; stepHistory = [];
        document.getElementById('name-input-section').style.display = 'none';
        document.getElementById('quiz-buttons').style.display = 'flex';
        showQuestion('q_secret_n_confirm'); 
      } else {
        const warnings = nameInput === "" ? ["名前を入力するのじゃ！","コラ！名前を入れ忘れておるぞ！","じゃから、名前をちゃんと入力せよと言うておるじゃろ！","……お主、わしをからかっておるのか？次やらなかったらどうなるか分からんぞ！"] : ["お主…なんて下品な言葉を入力しておるのじゃ！まともな名前を入れんか！","コラ！ふざけるでない！やり直しじゃ！","わしを怒らせたいようじゃな…次はないぞ？","……よかろう。お主のその捻くれた根性、最後まで見届けてやろうではないか。"];
        typeWriter(warnings[Math.min(emptyNameCount-1, 3)], null, true);
      }
      return;
    }
    
    if(!/^[ぁ-んー]+$/.test(nameInput)){
      if(soundEnabled){ soundNo.currentTime=0; soundNo.play().catch(()=>{}); }
      typeWriter("名前は「ひらがな」のみで入力するのじゃ！", null, true); return;
    }
    
    if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); }
    tempName = nameInput;
    document.getElementById('name-input-section').style.display = 'none';
    document.getElementById('confirm-name-text').textContent = tempName;
    document.getElementById('name-confirm-section').style.display = 'flex';
    typeWriter(`ふむ、『${tempName}』じゃな？\n本当にこの名前で間違いないかの？`, null, true);
  }

  function cancelNameInput() {
    if(soundEnabled){ soundBack.currentTime=0; soundBack.play().catch(()=>{}); }
    document.getElementById('name-confirm-section').style.display = 'none';
    if (currentRetryMode === 'people' || currentRetryMode === 'both') {
        currentRetryMode = 'both';
        document.getElementById('player-name').value = '';
        document.getElementById('name-input-section').style.display = 'flex';
        typeWriter('ならば、新たなお主の名前を教えるのじゃ。', null, true);
    } else {
        document.getElementById('name-input-section').style.display = 'flex';
        typeWriter('ならば、もう一度正しく名前を入れるのじゃ。', null, true);
    }
    resetIdleTimer();
  }

  // 卓組みに必要な2つの情報を、診断の前に聞いておく。
  // クイズの分岐からは分からないのに、当日の卓の成否を大きく左右するため。
  let preAnswers = { exp: 1, leave: 0 };
  let preIndex = 0;

  function startPreQuiz() {
    preIndex = 0;
    preAnswers = { exp: 1, leave: 0 };
    document.getElementById('quiz-buttons').style.display = 'none';
    renderPreQuestion();
  }

  function renderPreQuestion() {
    const q = PRE_QUESTIONS[preIndex];
    const box = document.getElementById('pre-quiz-section');
    box.innerHTML = '';
    q.options.forEach((o) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = '▶ ' + o.label;
      b.onclick = () => answerPre(o.value);
      box.appendChild(b);
    });
    box.style.display = 'flex';
    typeWriter(q.text, null, true);
  }

  function answerPre(value) {
    if (isTyping) { skipTyping(); return; }
    if (soundEnabled) { soundYes.currentTime = 0; soundYes.play().catch(()=>{}); }
    preAnswers[PRE_QUESTIONS[preIndex].key] = value;
    preIndex++;
    if (preIndex < PRE_QUESTIONS.length) { renderPreQuestion(); return; }
    document.getElementById('pre-quiz-section').style.display = 'none';
    document.getElementById('quiz-buttons').style.display = 'flex';
    showQuestion('start');
  }

  function startGameConfirm() {
    if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); }
    emptyNameCount = 0; playerName = tempName; realPlayerName = tempName; stepHistory = []; undoCount = 0; isGodMode = false;
    allNoSoFar = true; wasIdle = false; quizStartedAt = Date.now();
    document.getElementById('name-confirm-section').style.display = 'none';
    document.getElementById('quiz-buttons').style.display = 'flex';
    
    if(isCollectionMode && soundBGM.paused) {
        soundBGM.currentTime=0; soundBGM.play().catch(()=>{}); 
    }
    // 図鑑収集モードは席に関係しないので、追加の質問は飛ばす
    if (isCollectionMode) { showQuestion('start'); }
    else { startPreQuiz(); }
  }

  function typeWriter(text, onComplete, isNameScreen=false) {
    resetIdleTimer();
    const dialogueEl = document.getElementById('dialogue-text');
    dialogueEl.textContent = '';
    let index = 0;
    isTyping = true;
    
    currentTargetText = text;
    currentOnComplete = onComplete;
    currentIsNameScreen = isNameScreen;
    
    if(!isNameScreen) setButtonsDisabled(true);
    if(soundEnabled && document.getElementById('sound-section').style.display === 'none'){
        soundTalk.currentTime=0; soundTalk.play().catch(()=>{});
    }
    
    const isSecretConfirm = ['q_secret_n_confirm', 'q_secret_p_confirm', 'q_secret_j_confirm', 'q_secret_j_reject_confirm', 'q_secret_debug', 'q_omega_2', 'q_omega_3', 'q_abyss_intro', 'q_omega_1', 'q_abyss_battle'].includes(currentStep);
    
    if (!isCollectionMode || isNameScreen || isSecretConfirm || stepHistory.length === 0) {
        document.getElementById('btn-back').style.display = 'none';
    } else {
        document.getElementById('btn-back').style.display = 'block';
    }
    
    if (currentStep === 'q_omega_1' && isCollectionMode) {
        document.getElementById('btn-back').style.display = 'block';
    }

    if(typeTimer) clearInterval(typeTimer);
    setSkipHint(true);
    typeTimer = setInterval(() => {
      if(index < text.length){
          dialogueEl.textContent += text.charAt(index);
          index++;
      } else {
          clearInterval(typeTimer);
          if(soundEnabled) soundTalk.pause();
          isTyping = false;
          setSkipHint(false);
          currentOnComplete = null;
          if(!isNameScreen) setButtonsDisabled(false);
          if(onComplete) onComplete();
      }
    }, 45);
  }

  // 文字送りの途中でメッセージ欄をタップすると、残りを一気に表示する。
  function skipTyping() {
    if (!isTyping) return;
    if (typeTimer) clearInterval(typeTimer);
    document.getElementById('dialogue-text').textContent = currentTargetText;
    if (soundEnabled) soundTalk.pause();
    isTyping = false;
    setSkipHint(false);
    if (!currentIsNameScreen) setButtonsDisabled(false);
    const cb = currentOnComplete;
    currentOnComplete = null;
    if (cb) cb();
  }

  function setSkipHint(show) {
    const hint = document.getElementById('skip-hint');
    if (hint) hint.style.visibility = show ? 'visible' : 'hidden';
  }

  // 画面上部に短い案内を出す（通信エラーなどの通知用）
  function showNotice(message) {
    const el = document.getElementById('notice-bar');
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.display = 'none'; }, 6000);
  }

  function setButtonsDisabled(disabled) {
    const ids = ['btn-yes', 'btn-no', 'btn-back'];
    ids.forEach(id => { const el = document.getElementById(id); if(el) el.disabled = disabled; });
  }


  // その日の様子と、これまでの来訪をふまえて挨拶を変える。
  // 皆に同じことを言うぬしでは、その場にいる感じが出ないため。
  function nushiGreeting() {
    const specialNames = ["さおとめ", "ゆうご", "しょう", "ひなた", "たかや", "なおまさ", "りりみり"];
    const visits = myVisitDays().length;
    const done = visitorRoster.filter((v) => !v.isCollecting).length;
    const lines = [];

    if (playerName === "ぬし") {
      lines.push('わしの名を名乗るとは、不届きなやつじゃ！まあよい。');
    } else if (visits >= 5) {
      lines.push(`おお、${playerName}か。もう${visits + 1}度目じゃな。すっかり顔なじみじゃ。`);
    } else if (visits >= 1) {
      lines.push(`おお、${playerName}。よう戻ってきたな。これで${visits + 1}度目じゃ。`);
    } else if (specialNames.includes(playerName)) {
      lines.push(`フォッフォッフォ…お主がうわさの${playerName}か！いつも世話になっとるのう！`);
    } else {
      lines.push(`フォッフォッフォ…${playerName}よ、よく来たな。`);
    }

    if (!isCollectionMode) {
      if (done === 0) {
        lines.push('今日はまだ誰も来ておらん。お主が一番乗りじゃな。');
      } else if (sharedPeopleCount && done >= sharedPeopleCount - 1) {
        lines.push('どうやら、お主で最後のようじゃな。皆待っておるぞ。');
      } else {
        lines.push(`本日はお主で${done + 1}人目じゃ。`);
      }
    }
    return lines.join('\n') + '\n';
  }

  function showQuestion(stepKey) {
    currentStep = stepKey; 
    
    if (stepKey === 'q_secret_debug') {
      document.getElementById('btn-no').style.display = 'none';
    } else {
      document.getElementById('btn-no').style.display = 'block';
    }

    if (stepKey.startsWith('m_abyss_input_')) {
      document.getElementById('quiz-buttons').style.display = 'none';
      document.getElementById('input-quiz-section').style.display = 'flex';
      document.getElementById('abyss-answer-input').value = '';
      const prefixes = ["第一の問い。\n", "第二の問い。\n", "第三の問い。\n"];
      typeWriter(prefixes[mQuizIndex] + activeMQuiz[mQuizIndex].q);
      return;
    }

    if (stepKey.startsWith('sacrifice_input_')) {
      document.getElementById('quiz-buttons').style.display = 'none';
      document.getElementById('input-quiz-section').style.display = 'flex';
      document.getElementById('abyss-answer-input').value = '';
      const prefixes = ["第一の問い。\n", "第二の問い。\n", "第三の問い。\n", "第四の問い。\n", "第五の問い。\n"];
      typeWriter(prefixes[sacrificeIndex] + activeSacrificeQuiz[sacrificeIndex].q);
      return;
    }

    document.getElementById('input-quiz-section').style.display = 'none';
    let node = quizTree[stepKey]; 
    if (!node) return;
    let text = node.text;

    if (stepKey === 'start') {
      if (isRetry) { 
          text = `よし、では改めて質問していくぞい。\n\n${text}`; 
      } else {
        text = `${nushiGreeting()}まずはわしからの質問に答えるのじゃ。\n\n${text}`;
      }
    }
    
    const isAbyssStep = stepKey.startsWith('q_omega_') || stepKey === 'q_abyss_intro' || stepKey.startsWith('m_abyss_') || stepKey.startsWith('sacrifice_') || stepKey === 'branch_sacrifice' || currentStep === 'm_abyss_intro_1' || currentStep === 'm_abyss_intro_2' || currentStep === 'q_abyss_battle';
    
    if (isAbyssStep) {
      if (soundEnabled) { soundBGM.pause(); soundSecretBGM.pause(); }
      document.body.classList.add('serious-mode');
      document.querySelector('.character-avatar').textContent = "👁️";
      document.querySelector('.character-name').textContent = "深淵のぬし";
      document.querySelector('.character-name').nextElementSibling.textContent = "館の裏側に潜む影";
    } else {
      document.body.classList.remove('serious-mode');
      document.querySelector('.character-avatar').textContent = "🧙‍♂️";
      document.querySelector('.character-name').textContent = "卓分けのぬし";
      document.querySelector('.character-name').nextElementSibling.textContent = "サークルの運命を司る者";
      if (soundEnabled) {
        if (['q_secret_1','q_secret_2','q_secret_n_confirm','q_secret_p_confirm','q_secret_j_confirm','q_secret_j_reject_confirm', 'q_secret_debug'].includes(stepKey)) {
          soundBGM.pause(); 
          if (soundSeriousBGM) soundSeriousBGM.pause(); 
          if (soundSecretBGM.paused) soundSecretBGM.play().catch(()=>{});
        } else {
          if (!soundSecretBGM.paused){ soundSecretBGM.pause(); soundSecretBGM.currentTime=0; }
          if (soundSeriousBGM) soundSeriousBGM.pause(); 
          if (soundBGM.paused && stepKey !== 'start') soundBGM.play().catch(()=>{});
        }
      }
    }
    typeWriter(text);
  }

  function submitAbyssAnswer() {
    if (isTyping) return;
    resetIdleTimer();
    const val = document.getElementById('abyss-answer-input').value.trim().toLowerCase();
    if (soundEnabled) { soundYes.currentTime = 0; soundYes.play().catch(()=>{}); }

    if (val === "あんこくのとびら" || val === "暗黒の扉") {
      let ansText = "【深淵の全解答一覧】\n";
      programQuizPool.forEach((q, i) => { ansText += `Q${i+1}: ${q.a[0]}\n`; });
      alert(ansText);
      document.getElementById('abyss-answer-input').value = "";
      return;
    }
    
    if (val === "きぼうのひかり" || val === "希望の光") {
      document.getElementById('input-quiz-section').style.display = 'none';
      if (currentStep.startsWith('m_abyss_input_')) showResult('M'); 
      else showResult('ABYSS_SACRIFICE');
      return;
    }
    
    if (currentStep.startsWith('m_abyss_input_')) {
      const isMatch = activeMQuiz[mQuizIndex].a.some(ans => val.includes(ans.toLowerCase()));
      if (isMatch) { 
          mQuizIndex++; 
          if (mQuizIndex < 3) showQuestion('m_abyss_input_' + mQuizIndex); 
          else { document.getElementById('input-quiz-section').style.display = 'none'; showResult('M'); } 
      } else { 
          document.getElementById('input-quiz-section').style.display = 'none'; showResult('X'); 
      } 
      return;
    }
    
    if (currentStep.startsWith('sacrifice_input_')) {
      const isMatch = activeSacrificeQuiz[sacrificeIndex].a.some(ans => val.includes(ans.toLowerCase()));
      if (isMatch) sacrificeCorrectCount++;
      sacrificeIndex++;
      if (sacrificeIndex < 5) showQuestion('sacrifice_input_' + sacrificeIndex);
      else { 
          document.getElementById('input-quiz-section').style.display = 'none'; 
          if (sacrificeCorrectCount >= 4) showResult('ABYSS_SACRIFICE'); 
          else { 
              wipeGalleryData();
              showResult('X'); 
          } 
      } 
      return;
    }
  }

  function answer(isYes) {
    if (isTyping) return;
    resetIdleTimer();
    
    if (currentStep === 'm_abyss_intro_1') {
      if (soundEnabled) { 
          if (isYes) { soundYes.currentTime=0; soundYes.play().catch(()=>{}); } 
          else { soundNo.currentTime=0; soundNo.play().catch(()=>{}); } 
      }
      if (isYes) { 
          currentStep = 'm_abyss_intro_2'; 
          typeWriter("我が出す問いに三度続けて正解できたなら、貴様の知らぬ卓へ案内してやろう。"); 
      } else { 
          showResult('X'); 
      } 
      return;
    }
    
    if (currentStep === 'm_abyss_intro_2') {
      if (soundEnabled) { 
          if (isYes) { soundYes.currentTime=0; soundYes.play().catch(()=>{}); } 
          else { soundNo.currentTime=0; soundNo.play().catch(()=>{}); } 
      }
      if (isYes) { 
          activeMQuiz = [...programQuizPool].sort(() => Math.random() - 0.5).slice(0, 3); 
          mQuizIndex = 0; 
          showQuestion('m_abyss_input_0'); 
      } else { 
          showResult('X'); 
      } 
      return;
    }
    
    if (currentStep === 'branch_sacrifice') {
      if (soundEnabled) { 
          if (isYes) { soundYes.currentTime=0; soundYes.play().catch(()=>{}); } 
          else { soundNo.currentTime=0; soundNo.play().catch(()=>{}); } 
      }
      if (isYes) { 
          activeSacrificeQuiz = [...programQuizPool].sort(() => Math.random() - 0.5).slice(0, 5); 
          sacrificeIndex = 0; 
          sacrificeCorrectCount = 0; 
          showQuestion('sacrifice_input_0'); 
      } else { 
          showResult('X'); 
      } 
      return;
    }
    
    if (soundEnabled) { 
        if (isYes) { soundYes.currentTime=0; soundYes.play().catch(()=>{}); } 
        else { soundNo.currentTime=0; soundNo.play().catch(()=>{}); } 
    }
    
    if (isYes) allNoSoFar = false;
    stepHistory.push(currentStep); 
    const node = quizTree[currentStep]; 
    const nextKey = isYes ? node.yes : node.no;

    if (nextKey === 'action_debug_result') {
      const allKeys = Object.keys(TABLE_DATA).filter(k => k !== 'GOD'); 
      unlockedRoutes = allKeys; 
      localStorage.setItem('takuwake_unlocked', JSON.stringify(unlockedRoutes)); 
      unlockedTitles = Object.keys(TITLES_DEF); 
      localStorage.setItem('takuwake_titles', JSON.stringify(unlockedTitles)); 
      buildGallery(); 
      isGodMode = true; 
      document.getElementById('quiz-buttons').style.display = 'none'; 
      showResult('GOD'); 
      return;
    }
    
    if (nextKey === 'action_back_to_name') {
      document.getElementById('quiz-buttons').style.display = 'none'; 
      document.getElementById('name-input-section').style.display = 'flex'; 
      emptyNameCount = 4; stepHistory = []; 
      document.body.classList.remove('serious-mode'); 
      document.querySelector('.character-avatar').textContent = "🧙‍♂️"; 
      document.querySelector('.character-name').textContent = "卓分けのぬし"; 
      document.querySelector('.character-name').nextElementSibling.textContent = "サークルの運命を司る者";
      if(soundEnabled){ soundSecretBGM.pause(); soundBGM.play().catch(()=>{}); } 
      typeWriter("…そうか。ならば改めてまともな名前を入力するのじゃ。", null, true); 
      return;
    }
    
    if (nextKey === 'action_back_to_people') {
      document.getElementById('quiz-buttons').style.display = 'none'; 
      document.getElementById('people-section').style.display = 'flex'; 
      emptyPeopleCount = 4; stepHistory = [];
      if(soundEnabled){ soundSecretBGM.pause(); soundBGM.play().catch(()=>{}); } 
      typeWriter("…そうか。ならば強がらずに、ちゃんと参加人数を入力するのじゃぞ。", null, true); 
      return;
    }
    
    if (nextKey.startsWith('result_')) {
        showResult(nextKey.replace('result_', '')); 
    } else {
        showQuestion(nextKey);
    }
  }

  function goBack() {
    if (isTyping || !isCollectionMode) return; 
    
    if (currentStep === 'q_omega_1') { 
        if (soundEnabled) { soundBack.currentTime=0; soundBack.play().catch(()=>{}); } 
        currentStep = 'm_abyss_intro_1'; 
        typeWriter("おぬし、逃げるのではないだろうな。決して逃がさぬぞ。"); 
        return; 
    }
    
    const isAbyssStep = currentStep.startsWith('q_omega_') || currentStep === 'q_abyss_intro' || currentStep.startsWith('m_abyss_') || currentStep.startsWith('sacrifice_') || currentStep === 'branch_sacrifice' || currentStep === 'q_abyss_battle';
    if (isAbyssStep) { showResult('X'); return; }
    if (stepHistory.length === 0) return;
    
    if (soundEnabled) { soundBack.currentTime=0; soundBack.play().catch(()=>{}); }
    undoCount++; bumpUndo();
    currentStep = stepHistory.pop(); 
    showQuestion(currentStep);
  }

  function undoFromResult() {
    if (soundEnabled) { 
        soundFanfare.pause(); soundFanfare.currentTime=0; 
        soundEyecatch.pause(); soundEyecatch.currentTime=0; 
        soundBack.currentTime=0; soundBack.play().catch(()=>{}); 
    }
    const resultBox = document.getElementById('result-box'); 
    resultBox.style.display = 'none'; 
    resultBox.classList.remove('fade-in'); 
    document.getElementById('quiz-buttons').style.display = 'flex'; 
    document.getElementById('btn-true-ending').style.display = 'none'; 
    undoCount++; bumpUndo();
    currentStep = stepHistory.pop(); 
    showQuestion(currentStep);
  }

  // 端末ごとに1つだけIDを発行する。
  // 以前は名前をキーにしていたため、同じ名前の人が来ると前の人の記録が消えていた。
  function getDeviceId() {
    let id = localStorage.getItem('takuwake_device_id');
    if (!id) {
      id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      localStorage.setItem('takuwake_device_id', id);
    }
    return id;
  }

  function saveToRoster(name, tableName, tableColor, isCollectingMode) {
    db.ref('roster/' + getDeviceId()).set({ 
        name: name, 
        table: tableName, 
        color: tableColor, 
        timestamp: Date.now(), 
        isCollecting: !!isCollectingMode,
        exp: preAnswers.exp,
        leave: preAnswers.leave
    }).catch(() => {
        /* 端末内に保存するだけなので、ここに来ることはほぼありません */
    });
  }
  
  function getTitle(finalKey) {
    if (finalKey === 'GOD') return '【次元の超越者】'; 
    if (finalKey === 'M') return '【深淵の覇者】'; 
    if (finalKey === 'ABYSS_SACRIFICE') return '【代償の探求者】';
    if (finalKey === 'N') return '【名乗らぬ亡霊】'; 
    if (finalKey === 'OMEGA') return '【真理に触れし者】'; 
    if (finalKey === 'X') return '【奈落の亡者】'; 
    if (undoCount >= 10) return '【優柔不断】'; 
    if (undoCount === 0) return '【直感の獣】'; 
    return '【迷える旅人】';
  }

  function saveTitle(title) {
    if (!unlockedTitles.includes(title)) { 
        unlockedTitles.push(title); 
        localStorage.setItem('takuwake_titles', JSON.stringify(unlockedTitles)); 
        buildGallery(); 
    }
  }

  function showResult(rawTableKey, isJump = false) {
    let finalKey = rawTableKey; 
    let isFullCapacityChanged = false; 
    let originalMainName = "";
    
    if (finalKey === 'OMEGA' || finalKey === 'M' || finalKey === 'ABYSS_SACRIFICE') { 
        finalResultData = TABLE_DATA[finalKey]; 
    } else if (finalKey === 'X') { 
        finalResultData = TABLE_DATA.X; 
    } else {
      if (isJump) { 
          finalKey = finalKey; 
      } else {
         if (!TABLE_DATA[finalKey].isSecret) {
            const tableCounts = {}; 
            activeTables.forEach(k => tableCounts[k] = 0); 
            visitorRoster.forEach(v => { 
                const matchedKey = activeTables.find(k => TABLE_DATA[k].main.startsWith(v.table)); 
                if (matchedKey) tableCounts[matchedKey]++; 
            });
            
            let originalTargetKey = finalKey; 
            if (!activeTables.includes(originalTargetKey)) { 
                for (let key of TABLE_DATA[finalKey].fallback) { 
                    if (activeTables.includes(key)) { originalTargetKey = key; break; } 
                } 
            }
            
            if (tableCounts[originalTargetKey] >= currentMaxPerTable) {
               let newTargetKey = null; 
               const searchList = [originalTargetKey, ...TABLE_DATA[originalTargetKey].fallback];
               for (let key of searchList) { 
                   if (activeTables.includes(key) && tableCounts[key] < currentMaxPerTable) { newTargetKey = key; break; } 
               }
               if (!newTargetKey) newTargetKey = activeTables.reduce((a, b) => tableCounts[a] < tableCounts[b] ? a : b);
               
               if (newTargetKey !== originalTargetKey) { 
                   isFullCapacityChanged = true; 
                   originalMainName = TABLE_DATA[originalTargetKey].main; 
               }
               finalKey = newTargetKey;
            } else { 
                finalKey = originalTargetKey; 
            }
         }
      } 
      finalResultData = TABLE_DATA[finalKey]; 
    }
    
    const isSecret = ['S','Z','N','V','J','U','M','OMEGA','ABYSS_SACRIFICE','GOD'].includes(finalKey);
    if (isSecret && !realPlayerName && finalKey !== 'X' && !isCollectionMode && !isDirectGodMode) { 
        pendingResultKey = finalKey; 
        pendingResultIsJump = isJump; 
        askRealNameForSecretTable(finalKey); 
        return; 
    }
    
    executeShowResult(finalKey, isJump, isFullCapacityChanged, originalMainName);
  }

  function askRealNameForSecretTable(finalKey) {
    document.getElementById('quiz-buttons').style.display = 'none'; 
    document.getElementById('input-quiz-section').style.display = 'none';
    const isAbyss = ['M', 'OMEGA', 'ABYSS_SACRIFICE'].includes(finalKey);
    
    if (isAbyss) {
      document.body.classList.add('serious-mode'); 
      document.querySelector('.character-avatar').textContent = "👁️"; 
      document.querySelector('.character-name').textContent = "深淵のぬし"; 
      document.querySelector('.character-name').nextElementSibling.textContent = "館の裏側に潜む影";
      if(soundEnabled){ soundBGM.pause(); soundSecretBGM.pause(); } 
      typeWriter("……記録に刻む。貴様の『真の名』をここに入力せよ。", () => { 
          document.getElementById('secret-name-input-section').style.display = 'flex'; 
          document.getElementById('secret-name-answer-input').value = ''; 
      });
    } else {
      document.body.classList.remove('serious-mode'); 
      document.querySelector('.character-avatar').textContent = "🧙‍♂️"; 
      document.querySelector('.character-name').textContent = "卓分けのぬし"; 
      document.querySelector('.character-name').nextElementSibling.textContent = "サークルの運命を司る者";
      if(soundEnabled){ soundBGM.pause(); if(soundSecretBGM.paused) soundSecretBGM.play().catch(()=>{}); } 
      typeWriter("記録に刻むため、お主の『本当の名前』をここに入力するのじゃ。", () => { 
          document.getElementById('secret-name-input-section').style.display = 'flex'; 
          document.getElementById('secret-name-answer-input').value = ''; 
      });
    }
  }

  function submitSecretName() {
    const nameInput = document.getElementById('secret-name-answer-input').value.trim();
    if(!/^[ぁ-んー]+$/.test(nameInput)){
      document.getElementById('secret-name-input-section').style.display = 'none'; 
      if(soundEnabled){ soundNo.currentTime=0; soundNo.play().catch(()=>{}); }
      const isAbyss = ['M', 'OMEGA', 'ABYSS_SACRIFICE', 'X'].includes(pendingResultKey);
      if (isAbyss) {
          typeWriter("……ひらがな のみで入力せよ。", () => { document.getElementById('secret-name-input-section').style.display = 'flex'; }); 
      } else {
          typeWriter("名前は「ひらがな」のみで入力するのじゃ！", () => { document.getElementById('secret-name-input-section').style.display = 'flex'; }); 
      }
      return;
    }
    if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); } 
    realPlayerName = nameInput; 
    playerName = nameInput; 
    document.getElementById('secret-name-input-section').style.display = 'none'; 
    showResult(pendingResultKey, pendingResultIsJump);
  }


  // ---- 秘宝 ----------------------------------------------------
  let heldTreasures = JSON.parse(localStorage.getItem('takuwake_treasures')) || [];
  let tapTotal = parseInt(localStorage.getItem('takuwake_tap_total')) || 0;
  let abyssTapTotal = parseInt(localStorage.getItem('takuwake_abyss_tap')) || 0;
  let undoTotal = parseInt(localStorage.getItem('takuwake_undo_total')) || 0;
  let allNoSoFar = true;        // すべての問いを「いいえ」で答えているか
  let quizStartedAt = 0;        // 診断を始めた時刻（静寂を破らぬ枝の判定用）
  let wasIdle = false;          // 途中で放置したか
  let gazeTimer = null;         // 名簿を見つめている時間

  function hasTreasure(key) { return heldTreasures.includes(key); }

  function grantTreasure(key, quiet) {
    if (!TREASURES[key] || hasTreasure(key)) return false;
    heldTreasures.push(key);
    localStorage.setItem('takuwake_treasures', JSON.stringify(heldTreasures));
    buildGallery();
    if (!quiet) announceTreasure(key);
    return true;
  }

  function loseTreasure(key) {
    heldTreasures = heldTreasures.filter((k) => k !== key);
    localStorage.setItem('takuwake_treasures', JSON.stringify(heldTreasures));
    buildGallery();
  }

  // 秘宝の入手は画面中央で見せる。
  // 同時に複数手に入ることがあるので、順番待ちの列を作って一つずつ出します。
  let treasureQueue = [];
  let treasureShowing = false;

  function announceTreasure(key) {
    treasureQueue.push(key);
    if (!treasureShowing) showNextTreasure();
  }

  function showNextTreasure() {
    const overlay = document.getElementById('treasure-overlay');
    if (!overlay) return;
    if (treasureQueue.length === 0) {
      treasureShowing = false;
      overlay.classList.remove('active');
      overlay.style.display = 'none';
      return;
    }
    treasureShowing = true;
    const key = treasureQueue.shift();
    const t = TREASURES[key];
    const rest = treasureQueue.length;

    overlay.innerHTML = `
      <div class="treasure-card">
        <div class="treasure-rays"></div>
        <div class="treasure-label">秘宝を手に入れた</div>
        <div class="treasure-icon">◆</div>
        <div class="treasure-name">${t.name}</div>
        <div class="treasure-lore">${t.lore}</div>
        <button class="btn treasure-close">▶ ${rest > 0 ? `次の秘宝へ（あと${rest}）` : '受け取る'}</button>
      </div>`;
    overlay.style.display = 'flex';
    void overlay.offsetWidth;
    overlay.classList.add('active');

    if (soundEnabled) { soundEyecatch.currentTime = 0; soundEyecatch.play().catch(() => {}); }

    const close = () => {
      if (soundEnabled) { soundYes.currentTime = 0; soundYes.play().catch(() => {}); }
      overlay.classList.remove('active');
      setTimeout(showNextTreasure, 260);
    };
    overlay.querySelector('.treasure-close').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
  }

  // 図鑑に関するものを一度に解き放つ。
  // 全消去したあとでも使えるよう、モードも進行状況も問いません。
  function unlockEverything() {
    unlockedRoutes = Object.keys(TABLE_DATA).filter((k) => k !== 'GOD');
    localStorage.setItem('takuwake_unlocked', JSON.stringify(unlockedRoutes));
    unlockedTitles = Object.keys(TITLES_DEF);
    localStorage.setItem('takuwake_titles', JSON.stringify(unlockedTitles));
    grantAllTreasures();
    buildGallery();
  }

  function grantAllTreasures() {
    Object.keys(TREASURES).forEach((k) => {
      if (!heldTreasures.includes(k)) heldTreasures.push(k);
    });
    localStorage.setItem('takuwake_treasures', JSON.stringify(heldTreasures));
    buildGallery();
  }

  function bumpTap(isAbyss) {
    if (isAbyss) {
      abyssTapTotal++;
      localStorage.setItem('takuwake_abyss_tap', String(abyssTapTotal));
      if (abyssTapTotal >= 10) grantTreasure('me');
    } else {
      tapTotal++;
      localStorage.setItem('takuwake_tap_total', String(tapTotal));
      if (tapTotal >= 100) grantTreasure('hige');
    }
  }

  function bumpUndo() {
    undoTotal++;
    localStorage.setItem('takuwake_undo_total', String(undoTotal));
    if (undoTotal >= 30) grantTreasure('himo');
  }

  // 診断を終えた時点で判定できる秘宝を、まとめて確かめる
  function checkResultTreasures(finalKey) {
    if (!soundEnabled) grantTreasure('suzu');
    if (undoCount === 0 && stepHistory.length <= 4) grantTreasure('kutsu');
    if (allNoSoFar && stepHistory.length >= 4) grantTreasure('men');
    if (undoCount >= 10) grantTreasure('compass');
    if (finalKey === 'N') grantTreasure('kaori');
    if (finalKey === 'U') grantTreasure('sabikagi');
    if (realPlayerName === 'ぬし' || playerName === 'ぬし') grantTreasure('utsushimi');

    const hour = new Date().getHours();
    if (hour >= 18 && hour < 23) grantTreasure('sunadokei');

    if (quizStartedAt && !wasIdle && undoCount === 0 &&
        Date.now() - quizStartedAt < 5 * 60 * 1000) {
      grantTreasure('eda');
    }

    const allKeys = Object.keys(TABLE_DATA).filter((k) => k !== 'GOD');
    if (allKeys.every((k) => unlockedRoutes.includes(k)) &&
        Object.keys(TITLES_DEF).every((t) => unlockedTitles.includes(t))) {
      grantTreasure('sand');
    }

    // 奈落の罰から逃げず、終いまで待ち切ったか
    const penalty = localStorage.getItem('takuwake_abyss_penalty');
    if (penalty && Date.now() >= parseInt(penalty, 10)) {
      localStorage.removeItem('takuwake_abyss_penalty');
      grantTreasure('wedge');
    }
  }

  // ---- 継承の儀 ------------------------------------------------
  // 12点の秘宝から3つを捧げる。220通りあるので、外し続けても
  // 総当たりで解けぬよう、三度外すと10分の封印がかかります。
  let offerSelection = [];
  let offerMisses = parseInt(localStorage.getItem('takuwake_offer_miss')) || 0;

  function openInheritRite() {
    const owned = OFFERABLE.filter(hasTreasure);
    if (owned.length < 3) {
      typeWriter('……その名を知っておるか。\nじゃが、捧げるものが足りぬ。まずは秘宝を集めるのじゃ。', null, true);
      return;
    }
    const sealed = localStorage.getItem('takuwake_offer_seal');
    if (sealed && Date.now() < parseInt(sealed, 10)) {
      const left = Math.ceil((parseInt(sealed, 10) - Date.now()) / 60000);
      typeWriter(`……儀はまだ封じられておる。\nあと${left}分ほど、頭を冷やすのじゃな。`, null, true);
      return;
    }

    offerSelection = [];
    offerOrder = null;                   // 儀を開くたびに並べ直す
    document.getElementById('name-input-section').style.display = 'none';
    document.getElementById('name-confirm-section').style.display = 'none';
    if (soundEnabled) { soundBGM.pause(); soundSecretBGM.currentTime = 0; soundSecretBGM.play().catch(() => {}); }
    document.querySelector('.character-name').textContent = '継承のぬし';
    document.querySelector('.character-name').nextElementSibling.textContent = '館の記憶を守る者';
    document.querySelector('.character-avatar').textContent = '📿';

    typeWriter('……語部よ。\n館に己を差し出した三つの証を、ここへ捧げよ。', () => {
      renderOfferList();
    }, true);
  }

  // 並び順を毎回変える。番号順のままだと、正解の位置を覚えられてしまうため。
  let offerOrder = null;

  function shuffleArray(a) {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  }

  function renderOfferList() {
    const box = document.getElementById('offer-section');
    const held = OFFERABLE.filter(hasTreasure);
    if (!offerOrder || offerOrder.length !== held.length ||
        !offerOrder.every((k) => held.includes(k))) {
      offerOrder = shuffleArray(held);
    }
    const owned = offerOrder;
    box.innerHTML = '';

    const info = document.createElement('div');
    info.className = 'offer-count';
    info.textContent = `捧げるもの ${offerSelection.length} / 3`;
    box.appendChild(info);

    owned.forEach((k) => {
      const b = document.createElement('button');
      const on = offerSelection.includes(k);
      b.className = 'btn offer-item' + (on ? ' selected' : '');
      b.textContent = (on ? '◆ ' : '◇ ') + TREASURES[k].name;
      b.onclick = () => {
        if (isTyping) { skipTyping(); return; }
        if (soundEnabled) { soundBack.currentTime = 0; soundBack.play().catch(() => {}); }
        if (on) offerSelection = offerSelection.filter((x) => x !== k);
        else if (offerSelection.length < 3) offerSelection.push(k);
        renderOfferList();
      };
      box.appendChild(b);
    });

    const go = document.createElement('button');
    go.className = 'btn';
    go.style.borderColor = '#ffd700';
    go.style.color = '#ffd700';
    go.textContent = '▶ この三つを捧げる';
    go.disabled = offerSelection.length !== 3;
    go.onclick = submitOffer;
    box.appendChild(go);

    const back = document.createElement('button');
    back.className = 'btn btn-back';
    back.textContent = '▶ 儀を閉じる';
    back.onclick = closeInheritRite;
    box.appendChild(back);

    box.style.display = 'flex';
  }

  function closeInheritRite() {
    document.getElementById('offer-section').style.display = 'none';
    document.querySelector('.character-name').textContent = '卓分けのぬし';
    document.querySelector('.character-name').nextElementSibling.textContent = 'サークルの運命を司る者';
    document.querySelector('.character-avatar').textContent = '🧙‍♂️';
    if (soundEnabled) { soundSecretBGM.pause(); soundBGM.play().catch(() => {}); }
    document.getElementById('player-name').value = '';
    document.getElementById('name-input-section').style.display = 'flex';
    typeWriter('……よかろう。気が向いたら、また来るのじゃ。', null, true);
  }

  function submitOffer() {
    const picked = offerSelection.slice().sort().join(',');
    const answer = INHERIT_ANSWER.slice().sort().join(',');
    document.getElementById('offer-section').style.display = 'none';

    if (picked !== answer) {
      offerMisses++;
      localStorage.setItem('takuwake_offer_miss', String(offerMisses));
      if (soundEnabled) { soundNo.currentTime = 0; soundNo.play().catch(() => {}); }
      if (offerMisses >= 3) {
        offerMisses = 0;
        localStorage.setItem('takuwake_offer_miss', '0');
        localStorage.setItem('takuwake_offer_seal', String(Date.now() + 10 * 60 * 1000));
        typeWriter('……違う。この三つに、お主の身は宿っておらぬ。\n\n三度も違えたな。しばし儀を封じる。', () => {
          setTimeout(closeInheritRite, 1200);
        });
      } else {
        typeWriter('……違う。この三つに、お主の身は宿っておらぬ。', () => { renderOfferList(); });
      }
      return;
    }

    offerMisses = 0;
    localStorage.setItem('takuwake_offer_miss', '0');
    if (soundEnabled) { soundEyecatch.currentTime = 0; soundEyecatch.play().catch(() => {}); }
    typeWriter('……その三つ、揃えたか。\n通う足、触れる手、そして捨てた名。\nお主はもう、この館の一部じゃな。\n\n受け取るか、選ぶがよい。\n……あるいは、何も持たずに立ち去るか。', () => {
      const box = document.getElementById('offer-section');
      box.innerHTML = `
        <button class="btn" style="border-color:#ffd700; color:#ffd700;" onclick="takeMemoryPower()">▶ 継承の証書を受け取る</button>
        <button class="btn" style="border-color:#88ccff; color:#88ccff;" onclick="walkAwayEmpty()">▶ 何も持たずに立ち去る</button>
      `;
      box.style.display = 'flex';
    });
  }

  // 継承の証書を受け取る。
  // 新しい秘宝を増やすのではなく、ここまで辿り着いた証が形として残ります。
  function takeMemoryPower() {
    document.getElementById('offer-section').style.display = 'none';
    // 合言葉から直に儀へ入ると名前が空になるので、来訪の記録から拾います
    let who = realPlayerName || playerName || (myHistory && myHistory.name) || '';
    if (!who) {
      who = (prompt('証書に刻む名を入れるのじゃ。') || '').trim();
      if (!who) { closeInheritRite(); return; }
    }
    const issued = new Date();
    const record = {
      name: who,
      date: issued.getFullYear() + '年' + (issued.getMonth() + 1) + '月' + issued.getDate() + '日',
      routes: unlockedRoutes.length,
      titles: unlockedTitles.length,
      treasures: heldTreasures.length,
      visits: myVisitDays().length,
      code: buildAchievementCode()
    };
    try { localStorage.setItem('takuwake_certificate', JSON.stringify(record)); } catch (e) { /* 表示は続けられる */ }

    typeWriter('館の記憶は、お主のものとなった。\nこの証書が、お主がここまで辿り着いた証じゃ。', () => {
      showCertificate(record);
    });
  }

  // 証書に載せる実績コード。
  // 将来ボードゲームライブラリーへ渡せるよう、読み取りやすい形にしてあります。
  function buildAchievementCode() {
    const routes = ALL_TABLES.filter((k) => unlockedRoutes.includes(k)).join('');
    return ['TKW1', routes || '-', unlockedTitles.length, heldTreasures.length, myVisitDays().length].join('-');
  }

  function showCertificate(rec) {
    const box = document.getElementById('offer-section');
    box.innerHTML = `
      <div class="certificate" id="certificate">
        <div class="cert-seal">館</div>
        <div class="cert-title">継 承 の 証 書</div>
        <div class="cert-name">${rec.name}</div>
        <div class="cert-body">
          右の者、卓分けの館の理を解き明かし<br>
          館に己を差し出した三つの証を捧げたり<br>
          よってここに館の記憶を継ぐ者と認む
        </div>
        <div class="cert-stats">
          到達せし卓 ${rec.routes}　授かりし称号 ${rec.titles}<br>
          手にせし秘宝 ${rec.treasures}　来訪 ${rec.visits}度
        </div>
        <div class="cert-date">${rec.date}　卓分けのぬし</div>
        <div class="cert-code">${rec.code}</div>
      </div>
      <button class="btn" style="border-color:#ffd700; color:#ffd700;" onclick="saveCertificate()">▶ 証書を画像で保存する</button>
      <button class="btn btn-back" onclick="closeInheritRite()">▶ 儀を閉じる</button>
    `;
    box.style.display = 'flex';
  }

  function saveCertificate() {
    const el = document.getElementById('certificate');
    if (!el || typeof html2canvas === 'undefined') { alert('画像にできませんでした。'); return; }
    html2canvas(el, { backgroundColor: '#0d0a02', scale: 2 }).then((canvas) => {
      showImageModal(canvas.toDataURL('image/png'));
    }).catch(() => alert('画像にできませんでした。'));
  }

  // ---- 発表された卓組みの取り込み --------------------------------
  // 幹事が作った発表リンクを開くと、割り当てがURLの中に入っています。
  // 一度開けばこの端末に残るので、以後は「📜 記録」からいつでも見られます。
  function importSeatingFromUrl() {
    const m = (location.hash || '').match(/[#&]r=([^&]+)/);
    if (!m) return false;
    try {
      const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
      const data = JSON.parse(decodeURIComponent(escape(atob(b64))));
      if (!Array.isArray(data.seats)) return false;

      const roster = {};
      data.seats.forEach((s, i) => {
        if (!s || !s.n) return;
        roster['pub' + i] = {
          name: String(s.n).slice(0, 30),
          table: String(s.t || '').slice(0, 30),
          color: String(s.c || '#ffffff').slice(0, 20),
          timestamp: Date.now() + i,
          isCollecting: false
        };
      });
      db.ref('roster').set(roster);
      history.replaceState(null, '', location.pathname + location.search);
      return true;
    } catch (e) {
      return false;   // 壊れたリンクなら、何もなかったことにします
    }
  }

  // ---- 会をまたいだ記録 ----------------------------------------
  // 同じ端末で来館するたびに、その日の卓を1件だけ残します。
  // 日付をキーにしているので、同じ日に何度書いても増えません。
  let myHistory = null;
  let visitRecorded = false;

  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function watchMyHistory() {
    try {
      db.ref('members/' + getDeviceId()).on('value', (snap) => {
        myHistory = snap.val() || null;
        const box = document.getElementById('result-box');
        if (lastSeatCtx && box && box.style.display === 'block') renderSeatSection();
      }, () => { /* 読めない場合は記録機能だけ働かない */ });
    } catch (e) { /* 同上 */ }
  }

  function myVisitDays() {
    if (!myHistory || !myHistory.events) return [];
    return Object.keys(myHistory.events);
  }

  function mySeatedTables() {
    if (!myHistory || !myHistory.events) return [];
    const set = new Set();
    Object.keys(myHistory.events).forEach((d) => {
      const e = myHistory.events[d];
      if (e && e.table) set.add(String(e.table).charAt(0));
    });
    return ALL_TABLES.filter((k) => set.has(k));
  }

  function recordVisit(tableShort) {
    if (visitRecorded) return;
    const key = String(tableShort).charAt(0);
    if (!ALL_TABLES.includes(key)) return;   // 隠し卓は実際の席ではないので数えない
    visitRecorded = true;
    const name = realPlayerName || playerName || '名無し';
    const base = 'members/' + getDeviceId();
    db.ref(base).update({ name: name })
      .then(() => db.ref(base + '/events/' + todayKey()).set({ table: tableShort, ts: Date.now() }))
      .catch(() => { visitRecorded = false; });
  }

  // 図鑑にまつわる端末内の記録を、すべて還す。
  // 会をまたいだ来訪記録（Firebase側）は、現実に通った証なので残します。
  function wipeGalleryData() {
    unlockedRoutes = [];
    unlockedTitles = [];
    heldTreasures = [];
    tapTotal = 0; abyssTapTotal = 0; undoTotal = 0;
    localStorage.removeItem('takuwake_unlocked');
    localStorage.removeItem('takuwake_titles');
    localStorage.setItem('takuwake_treasures', JSON.stringify([]));
    localStorage.setItem('takuwake_tap_total', '0');
    localStorage.setItem('takuwake_abyss_tap', '0');
    localStorage.setItem('takuwake_undo_total', '0');
    buildGallery();
  }

  function grantVisitTitles() {
    const days = myVisitDays().length;
    const seated = mySeatedTables().length;
    if (days >= 3) { saveTitle('【館の常連】'); grantTreasure('key'); }
    if (days >= 10) saveTitle('【館の古株】');
    if (seated >= 8) { saveTitle('【八卓行脚】'); grantTreasure('shiori'); }
  }

  function buildVisitHtml() {
    const days = myVisitDays();
    if (days.length === 0) return '';
    const seated = mySeatedTables();
    const remain = ALL_TABLES.filter((k) => !seated.includes(k));
    let s = '<div class="visit-box"><strong>【 来訪の記録 】</strong><br>';
    s += `館へ来るのは、これで <b>${days.length}</b> 度目じゃ。<br>`;
    s += `座った卓：${seated.length ? seated.map((k) => k + '卓').join('・') : 'まだ無し'}<br>`;
    s += remain.length
      ? `<span class="visit-remain">まだ見ぬ卓：${remain.map((k) => k + '卓').join('・')}</span>`
      : '<span class="visit-done">八つの卓すべてに座ったな。見事な行脚じゃ！</span>';
    return s + '</div>';
  }

  // ---- 席の表示 ------------------------------------------------
  // 幹事が卓を組み直したあとは、診断結果ではなく
  // 発表された「実際の席」を読みにいきます。
  let lastSeatCtx = null;

  function myRosterEntry() {
    const id = getDeviceId();
    return visitorRoster.find((v) => v.id === id) || null;
  }

  function buildSecretMessage(finalKey, data, inCollection) {
    let msg = data.secretMessage;
    if (!msg || !msg.includes('{STAFF_MSG}')) return msg;
    const staff = inCollection ? {
      S: "この偉大なる記録、図鑑の最奥にしかと刻み込もう。",
      Z: "その優しき心、図鑑に確かに刻ませてもらったぞい！",
      N: "図鑑の1ページとして、その反骨精神をしっかりと刻み込んでおこう。",
      J: "その風流な探究心、しかと図鑑に刻み込んでおこう。",
      U: "その類まれなる『天邪鬼』っぷり、しかと図鑑に記録したぞい！"
    } : {
      S: "スタッフにこの画面を見せて『マスター』と伝えるのじゃ！",
      Z: "スタッフから特別な景品をもらうが良い！",
      N: "その反骨精神に免じて景品をやろう。スタッフに見せるのじゃ！",
      J: "スタッフにこの画面を見せて『ホトトギス』と合言葉を伝えるのじゃ！",
      U: "その類まれなる『天邪鬼』っぷりを称えよう！スタッフにこの画面を見せるのじゃ！"
    };
    return msg.replace('{STAFF_MSG}', staff[finalKey] || '');
  }

  function renderSeatSection() {
    if (!lastSeatCtx) return;
    const ctx = lastSeatCtx;
    const mainTableEl = document.getElementById('main-table');
    const dynamicArea = document.getElementById('dynamic-result-area');

    let html = '';
    if (ctx.data.isSecret) {
      const msg = buildSecretMessage(ctx.finalKey, ctx.data, ctx.isCollection);
      if (msg) html += `<div class="secret-message-box">${msg}</div>`;
    }

    mainTableEl.style.color = ctx.data.color;
    mainTableEl.style.animation = ctx.data.isSecret
      ? 'secretGlow 0.5s infinite alternate' : 'glow 1.2s infinite alternate';

    let seatShort = ctx.data.main.split(' ')[0];
    let seatFull = ctx.data.main;
    // 幹事が卓を組んで発表したあとは、そちらが本当の席になります
    const revealedByHost = !ctx.isCollection && !!myRosterEntry();
    if (revealedByHost) {
      const me = myRosterEntry();
      if (me && me.table) { seatShort = me.table; seatFull = me.table; }
    }
    mainTableEl.textContent = `今回のあなたの席は... ${seatFull}`;

    // 幹事に伝える4文字。これ一つで卓・腕前・途中退出・称号が伝わります。
    if (!ctx.isCollection && ctx.finalKey !== 'GOD') {
      const code = encodeSeatCode(ctx.finalKey, ctx.exp || 0, ctx.leave || 0, ctx.title || '');
      html += `
        <div class="seat-code-box">
          <div class="seat-code-label">幹事に伝える合言葉</div>
          <div class="seat-code">${code}</div>
          <div class="seat-code-note">この4文字を幹事に見せるのじゃ</div>
        </div>`;
    }

    const showMates = !ctx.data.isSecret || revealedByHost;
    if (showMates) {
      let mates = visitorRoster
        .filter((v) => v.table === seatShort && !v.isCollecting)
        .map((v) => v.name);
      if (ctx.displayName && !ctx.isCollection && !mates.includes(ctx.displayName)) {
        mates.push(ctx.displayName);
      }
      html += `
        <hr style="border-color:#444; margin:12px 0;">
        <div style="font-size: 16px; color: #fff; line-height: 1.8; text-align: center;">
          <strong>【 同じ卓の仲間 】</strong><br>
          <span style="color: #ffffff; font-size: 22px; font-weight: bold; text-shadow: 0 0 8px rgba(255,255,255,0.5);">${mates.join('、 ')}</span>
        </div>`;
    }

    if (!ctx.isCollection && ctx.finalKey !== 'GOD') {
      recordVisit(seatShort);
      grantVisitTitles();
      html += buildVisitHtml();
    }

    if (ctx.isCollection && ctx.finalKey !== 'GOD') {
      const regTable = localStorage.getItem('takuwake_registered_table') || "不明";
      html += `
        <div style="font-size: 13px; color: #00ffcc; margin-top: 15px; text-align: center; font-weight: bold; border-top: 1px dashed #444; padding-top: 10px;">
          ※現在は【図鑑収集モード】です。<br>名簿の席は初回の『${regTable}』から動きません。<br>（スタッフへの報告も不要です）
        </div>`;
    }

    dynamicArea.innerHTML = html;
  }

  function showResultBoxAgain() { renderSeatSection(); }

  function executeShowResult(finalKey, isJump, isFullCapacityChanged, originalMainName) {
    let earnedTitle = '【迷える旅人】';
    let displayName = realPlayerName || playerName || "名無し";
    const SECRET_TITLES = { 
        S: "支配者", GOD: "創造神", Z: "菩薩", N: "無法者", V: "孤独なる者", 
        J: "風流人", U: "天邪鬼", M: "深淵の覇者", OMEGA: "真理の探求者", ABYSS_SACRIFICE: "代償の求道者" 
    };
    
    if (['S','Z','N','V','J','U','M','OMEGA','ABYSS_SACRIFICE', 'GOD'].includes(finalKey)) { 
        displayName = `${SECRET_TITLES[finalKey]} ${displayName}`; 
    }

    let baseNameForCheck = realPlayerName || playerName || "名無し";

    if (!isJump) {
      if (finalKey !== 'GOD' && !unlockedRoutes.includes(finalKey)) { 
          unlockedRoutes.push(finalKey); 
          localStorage.setItem('takuwake_unlocked', JSON.stringify(unlockedRoutes)); 
          buildGallery(); 
      }
      if (finalKey !== 'X' && finalKey !== 'GOD') {
          if (!isCollectionMode) {
              localStorage.setItem('takuwake_registered_name', baseNameForCheck); 
              localStorage.setItem('takuwake_registered_table', finalResultData.main.split(' ')[0]); 
              localStorage.setItem('takuwake_registered_color', finalResultData.color);
              saveToRoster(displayName, finalResultData.main.split(' ')[0], finalResultData.color, false);
          }
      }
      earnedTitle = getTitle(finalKey); 
      saveTitle(earnedTitle);
      checkResultTreasures(finalKey);
    } else {
      if (finalKey !== 'X' && finalKey !== 'GOD') {
          saveToRoster(displayName, finalResultData.main.split(' ')[0], finalResultData.color, false);
      }
    }

    if (soundEnabled && !isDirectGodMode) {
      soundBGM.pause(); soundSecretBGM.pause(); soundSeriousBGM.pause();
      if (finalKey === 'X') { soundNo.currentTime = 0; soundNo.play().catch(()=>{}); } 
      else if (finalResultData.isSecret) { soundEyecatch.currentTime = 0; soundEyecatch.play().catch(()=>{}); } 
      else { soundFanfare.currentTime = 0; soundFanfare.play().catch(()=>{}); }
    } else if (soundEnabled && isDirectGodMode) {
      soundBGM.pause(); soundSecretBGM.pause(); soundSeriousBGM.pause();
      soundEyecatch.currentTime = 0; soundEyecatch.play().catch(()=>{});
    }

    document.getElementById('quiz-buttons').style.display = 'none'; 
    document.getElementById('input-quiz-section').style.display = 'none';
    
    const resultBox = document.getElementById('result-box'); 
    const dynamicArea = document.getElementById('dynamic-result-area');
    const mainTableEl = document.getElementById('main-table'); 
    const resultTypeEl = document.getElementById('result-type');
    const btnResultBack = document.getElementById('btn-result-back'); 
    const btnTrueEnding = document.getElementById('btn-true-ending');

    mainTableEl.style.color = finalResultData.color; 
    mainTableEl.style.animation = 'none'; 
    resultTypeEl.style.animation = 'none'; 
    void mainTableEl.offsetWidth; 
    
    if (finalKey === 'GOD') {
       finalResultData.secretMessage = "⚙️ デバッグモード完了<br>創造神様の御威光により、全ルート（深淵含む）と全称号が強制解放されましたぞ！";
       document.getElementById('share-group-buttons').style.display = 'none'; 
       document.getElementById('god-powers-group').style.display = 'flex'; 
       document.getElementById('god-powers-group').style.flexDirection = 'column'; 
       resetGodPowerButtons();
    } else { 
        document.getElementById('share-group-buttons').style.display = 'flex'; 
        document.getElementById('god-powers-group').style.display = 'none'; 
    }
    
    resultBox.classList.remove('error-box', 'omega-box');
    
    if (finalKey === 'X') {
      localStorage.setItem('takuwake_abyss_penalty', Date.now() + 15 * 60 * 1000); 
      resultBox.classList.add('error-box'); 
      document.querySelector('.result-title').textContent = '【 診断失敗 】'; 
      mainTableEl.style.animation = 'errorGlow 0.2s infinite alternate';
      
      document.getElementById('share-group-buttons').style.display = 'none'; 
      document.getElementById('god-powers-group').style.display = 'none'; 
      btnResultBack.style.display = 'none'; 
      document.getElementById('btn-back-to-god').style.display = 'none'; 
      document.getElementById('btn-switch-mode').style.display = 'none'; 
      document.getElementById('btn-restart').style.display = 'none'; 
      
      if(document.getElementById('btn-force-restart')) {
          document.getElementById('btn-force-restart').style.display = 'block';
      }
      
      typeWriter(`獲得称号：${earnedTitle}\n……愚か者め。\n貴様には『卓分けの館』の真理を知る資格はない。`, () => {
        resultTypeEl.textContent = `あなたは【${finalResultData.type}】`; 
        mainTableEl.textContent = ` ${finalResultData.main} へ堕ちるがよい`; 
        const descElX = document.getElementById('result-desc');
        if (descElX) descElX.style.display = 'none';
        dynamicArea.innerHTML = `<div class="secret-message-box">${finalResultData.secretMessage}</div>`; 
        resultBox.style.display = 'block';
      }); 
      return;
    }
    
    if (finalKey === 'OMEGA' || finalKey === 'M' || finalKey === 'ABYSS_SACRIFICE') {
        resultBox.classList.add('omega-box'); 
    }
    
    resultBox.classList.remove('error-box'); 
    document.querySelector('.result-title').textContent = '【 診断完了 】';
    
    if (finalKey !== 'GOD') {
        document.getElementById('share-group-buttons').style.display = 'flex';
    }
    if(document.getElementById('btn-force-restart')) {
        document.getElementById('btn-force-restart').style.display = 'none';
    }
    document.getElementById('btn-restart').style.display = 'block';
    
    if (finalKey === 'GOD') {
        document.getElementById('btn-switch-mode').style.display = 'none'; 
        document.getElementById('btn-back-to-god').style.display = 'block';
    } else {
        document.getElementById('btn-switch-mode').style.display = 'block'; 
        document.getElementById('btn-back-to-god').style.display = (isGodMode) ? 'block' : 'none';
        if (isCollectionMode) {
            document.getElementById('btn-switch-mode').innerHTML = "▶ 卓選択モードに切り替える"; 
        } else {
            document.getElementById('btn-switch-mode').innerHTML = "▶ 図鑑収集モードに切り替える";
        }
    }
    
    mainTableEl.style.animation = finalResultData.isSecret ? 'secretGlow 0.5s infinite alternate' : 'glow 1.2s infinite alternate';

    if (!isCollectionMode || ['N','V','U','OMEGA','M','ABYSS_SACRIFICE','S','GOD'].includes(finalKey) || isJump) {
        btnResultBack.style.display = 'none'; 
    } else { 
        btnResultBack.style.display = 'block'; 
    }

    let prefixMessage = `おお！${realPlayerName ? realPlayerName + 'の' : 'お主の'}運命の卓が決まったようじゃ！`;
    
    if(finalKey === 'OMEGA' || finalKey === 'M' || finalKey === 'ABYSS_SACRIFICE') {
        prefixMessage = `……見事じゃ、${realPlayerName}よ。\n盤上の駒であることを超え、真なる『プレイヤー』としてこの深淵を越えた貴様に、最大の敬意を払おう。`;
    }
    
    if(isJump) prefixMessage = `……流石は創造神様！いともたやすく時空を跳躍し、過去の運命へと辿り着かれたのでありますな！`;
    if(finalKey === 'GOD') prefixMessage = `……創造神様、この館のすべての理を統べる『神の座』へよくぞお戻りになられました！`;
    if (isFullCapacityChanged && !isJump && !isCollectionMode) prefixMessage = `ふむ…本当なら『${originalMainName.split(' ')[0]}』へ案内するつもりじゃったが、あいにく満員じゃのう。\n${realPlayerName ? realPlayerName + 'には' : 'お主には'}、空きのあるこちらの卓を用意したぞい！`;

    let titleStr = (isJump || finalKey === 'GOD' || !isCollectionMode) ? '' : `獲得称号：${earnedTitle}\n`;

    const showResultContent = () => {
      resultTypeEl.textContent = `あなたは【${finalResultData.type}】`;
      const descEl = document.getElementById('result-desc');
      if (descEl) {
        descEl.textContent = finalResultData.desc || '';
        descEl.style.display = finalResultData.desc ? 'block' : 'none';
      }

      lastSeatCtx = {
        finalKey: finalKey,
        data: finalResultData,
        displayName: displayName,
        isCollection: isCollectionMode,
        title: earnedTitle,
        exp: preAnswers.exp,
        leave: preAnswers.leave
      };
      renderSeatSection();

      resultBox.style.display = 'block';
      
      if (canSeeTrueEnding() && btnTrueEnding) btnTrueEnding.style.display = 'block';
    };

    if (isDirectGodMode) {
      document.getElementById('dialogue-text').innerText = `${titleStr}${prefixMessage}`;
      showResultContent();
      isDirectGodMode = false; 
    } else {
      typeWriter(`${titleStr}${prefixMessage}`, showResultContent);
    }
  }

  function handleRestartClick() {
    if (finalResultData && finalResultData.main && finalResultData.main.includes('神の座')) { 
        askRetrySettings(); 
        return; 
    }
    if (isCollectionMode) { 
        askRetrySettingsCollection(); 
    } else { 
        directToNameInputRetry(); 
    }
  }
  
  function handleSwitchModeClick() {
    if (isCollectionMode) { 
        switchToSelectionMode(); 
    } else { 
        switchToCollectionMode(); 
    }
  }

  function directToNameInputRetry() {
    if(soundEnabled){ 
        soundFanfare.pause(); soundFanfare.currentTime=0; 
        soundEyecatch.pause(); soundEyecatch.currentTime=0; 
        soundBGM.play().catch(()=>{}); 
    }
    isGodMode = false;
    document.body.classList.remove('serious-mode'); 
    document.querySelector('.character-avatar').textContent = "🧙‍♂️"; 
    document.querySelector('.character-name').textContent = "卓分けのぬし"; 
    document.querySelector('.character-name').nextElementSibling.textContent = "サークルの運命を司る者";
    document.getElementById('result-box').style.display = 'none'; 
    document.getElementById('btn-true-ending').style.display = 'none'; 
    document.getElementById('btn-back-to-god').style.display = 'none';
    
    isRetry = true; 
    undoCount = 0; 
    stepHistory = []; 
    currentRetryMode = 'name'; 
    emptyNameCount = 0; 
    emptyPeopleCount = 0;
    
    document.getElementById('player-name').value = ''; 
    document.getElementById('name-input-section').style.display = 'flex'; 
    document.getElementById('btn-back-to-people').style.display = 'none';
    typeWriter("よし、設定人数は【" + tempPeopleCount + "名】のままでいくぞい。新たなお主の名前を教えるのじゃ。", null, true);
  }

  function askRetrySettingsCollection() {
    if(soundEnabled){ 
        soundFanfare.pause(); soundEyecatch.pause(); soundBGM.play().catch(()=>{}); 
    }
    isGodMode = false; 
    document.body.classList.remove('serious-mode'); 
    document.querySelector('.character-avatar').textContent = "🧙‍♂️"; 
    document.querySelector('.character-name').textContent = "卓分けのぬし";
    document.getElementById('result-box').style.display = 'none'; 
    document.getElementById('btn-true-ending').style.display = 'none'; 
    document.getElementById('btn-back-to-god').style.display = 'none';
    
    document.getElementById('retry-confirm-section').style.display = 'flex';
    
    document.getElementById('retry-confirm-section').innerHTML = `
      <button class="btn" onclick="retryGame('same')">▶ 設定を変更せずにそのまま始める</button>
      <button class="btn" onclick="retryGame('name')">▶ 名前だけを変更する</button>
      <button class="btn" onclick="retryGame('people')">▶ 参加人数だけを変更する</button>
      <button class="btn" onclick="retryGame('both')">▶ 名前と参加人数の両方を変更する</button>
    `;
    typeWriter("図鑑探索を続けるようじゃな！設定はどうするかの？", null, true);
  }

  function askRetrySettings() {
      if(soundEnabled){ soundFanfare.pause(); soundEyecatch.pause(); soundBGM.pause(); }
      document.body.classList.remove('serious-mode'); 
      document.querySelector('.character-avatar').textContent = "🧙‍♂️"; 
      document.querySelector('.character-name').textContent = "卓分けのぬし";
      
      document.getElementById('result-box').style.display = 'none'; 
      document.getElementById('btn-true-ending').style.display = 'none'; 
      document.getElementById('btn-back-to-god').style.display = 'none';
      
      isGodMode = false; playerName = ""; tempName = ""; realPlayerName = ""; tempPeopleCount = 0; tempTableCount = 0; tempMaxPerTable = 0; stepHistory = []; isRetry = false; currentRetryMode = ''; emptyNameCount = 0; emptyPeopleCount = 0; undoCount = 0;
      
      document.getElementById('participant-count').value = ''; 
      document.getElementById('player-name').value = '';
      
      document.getElementById('mode-resume-section').style.display = 'flex'; 
      typeWriter('ようこそ『卓分けの館』へ！\nまずは、どちらのモードで遊ぶか選ぶのじゃ。', null, true);
  }

  function switchToCollectionMode() {
    if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); }
    isCollectionMode = true; 
    document.getElementById('btn-gallery').style.display = 'block';
    
    const regName = localStorage.getItem('takuwake_registered_name') || realPlayerName || playerName;
    const regTable = localStorage.getItem('takuwake_registered_table'); 
    const regColor = localStorage.getItem('takuwake_registered_color');
    if (regName && regTable) saveToRoster(regName, regTable, regColor, true);

    document.getElementById('result-box').style.display = 'none'; 
    document.getElementById('btn-true-ending').style.display = 'none';
    isRetry = true; stepHistory = []; undoCount = 0;
    
    document.body.classList.remove('serious-mode'); 
    document.querySelector('.character-avatar').textContent = "🧙‍♂️"; 
    document.querySelector('.character-name').textContent = "卓分けのぬし";
    
    tempPeopleCount = 99; tempTableCount = 8; tempMaxPerTable = 99; activeTables = ALL_TABLES; currentMaxPerTable = 99;
    document.getElementById('player-name').value = ''; 
    document.getElementById('name-input-section').style.display = 'flex';
    typeWriter("【図鑑収集モード】に切り替えたぞい！\n新たなお主の名前を教えるのじゃ。", null, true);
  }

  function switchToSelectionMode() {
    if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); }
    isCollectionMode = false; 
    document.getElementById('btn-gallery').style.display = 'none';

    const regName = localStorage.getItem('takuwake_registered_name') || realPlayerName || playerName;
    const regTable = localStorage.getItem('takuwake_registered_table'); 
    const regColor = localStorage.getItem('takuwake_registered_color');
    if (regName && regTable) saveToRoster(regName, regTable, regColor, false);
    
    document.getElementById('result-box').style.display = 'none'; 
    stepHistory = []; undoCount = 0;
    
    document.getElementById('participant-count').value = ''; 
    document.getElementById('people-section').style.display = 'flex';
    typeWriter("【卓選択モード】に切り替えたぞい！\n本日の参加人数から入力し直すのじゃ。", null, true);
  }

  function retryGame(mode) {
    if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); }
    document.getElementById('retry-confirm-section').style.display = 'none';
    isRetry = true; undoCount = 0; stepHistory = []; currentRetryMode = mode; emptyNameCount = 0; emptyPeopleCount = 0; isGodMode = false;
    document.body.classList.remove('serious-mode'); 
    document.querySelector('.character-avatar').textContent = "🧙‍♂️"; 
    document.querySelector('.character-name').textContent = "卓分けのぬし";

    if (mode === 'same') { 
        document.getElementById('quiz-buttons').style.display = 'flex'; showQuestion('start'); 
    } else if (mode === 'name') { 
        document.getElementById('player-name').value = ''; 
        document.getElementById('name-input-section').style.display = 'flex'; 
        document.getElementById('btn-back-to-people').style.display = 'none'; 
        typeWriter("よし、設定人数は【" + tempPeopleCount + "名】のままでいくぞい。新たなお主の名前を教えるのじゃ。", null, true); 
    } else if (mode === 'people') {
        document.getElementById('participant-count').value = tempPeopleCount;
        document.getElementById('people-section').style.display = 'flex';
        typeWriter("参加人数を変更するのじゃな。本日の参加人数を入力するのじゃ。", null, true);
    } else if (mode === 'both') {
        document.getElementById('player-name').value = '';
        document.getElementById('participant-count').value = '';
        document.getElementById('people-section').style.display = 'flex';
        typeWriter("全て設定し直すのじゃな。まずは、本日の参加人数を入力するのじゃ。", null, true);
    }
  }

  // 名簿を開いたまま三分動かずにいると水晶が手に入る。
  // 放置を叱る仕組みを、そのまま報酬に転じています。
  function startGaze() {
    clearTimeout(gazeTimer);
    gazeTimer = setTimeout(() => {
      if (document.getElementById('roster-modal').classList.contains('active')) {
        grantTreasure('crystal');
      }
    }, 3 * 60 * 1000);
  }
  function stopGaze() { clearTimeout(gazeTimer); }

  function openRoster() { 
      if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); } 
      document.getElementById('roster-modal').classList.add('active'); 
      document.getElementById('btn-roster-delete').style.display = (!isCollectionMode) ? 'block' : 'none';
      startGaze();
      renderRoster(); 
  }
  function closeRoster() { 
      if(soundEnabled){ soundBack.currentTime=0; soundBack.play().catch(()=>{}); } 
      document.getElementById('roster-modal').classList.remove('active'); 
      stopGaze();
  }

  function confirmDeleteRoster() {
      if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); }
      const word = prompt("【警告】来訪者の記録（名簿）をすべて削除します。\nこの操作は取り消せません。\n\n実行するには「りせっと」と入力してください。");
      if (word === null) return;
      if (word.trim() !== "りせっと") {
         alert("入力が違うため、削除は行いませんでした。");
         return;
      }
      db.ref('roster').remove()
        .then(() => {
           alert("名簿をリセットしました。");
           closeRoster();
        })
        .catch(() => {
           alert("削除できませんでした。\nFirebaseのルールで roster への書き込みが許可されているか確認してください。");
        });
  }

  function renderRoster(forceFullDisplay = false) {
    const list = document.getElementById('roster-list'); 
    list.innerHTML = '';
    const countDisplay = document.getElementById('roster-count-display');
    const infoText = document.getElementById('roster-info-text');
    const totalPeople = visitorRoster.length; 
    countDisplay.textContent = `現在の完了者: ${totalPeople}名`;

    if (totalPeople === 0) { 
        list.innerHTML = '<div style="text-align:center; color:#888; padding:20px;">まだ誰も終わっておらぬようじゃ。</div>'; 
        return; 
    }
    
    if (isCollectionMode && !forceFullDisplay) {
        infoText.innerHTML = "※お主は現在【図鑑収集モード】のため、ネタバレ防止として卓の詳細情報は伏せておるぞい。<br>ただし、共に図鑑を埋めている猛者たちは見ることができるのじゃ！";
        const collectors = visitorRoster.filter(v => v.isCollecting);
        const groupDiv = document.createElement('div');
        groupDiv.style.marginBottom = '15px'; 
        groupDiv.style.border = `1px solid #00ffcc`; 
        groupDiv.style.padding = '8px'; 
        groupDiv.style.borderRadius = '4px'; 
        groupDiv.style.background = 'rgba(0,34,34,0.5)';
        
        if (collectors.length > 0) {
            const memberNames = collectors.map(v => v.name).join('、 ');
            groupDiv.innerHTML = `
              <div style="color:#00ffcc; font-weight:bold; border-bottom:1px dashed #00ffcc; padding-bottom:4px; margin-bottom:4px;">✨ 図鑑探索中の猛者たち (${collectors.length}名)</div>
              <div style="color:#ddd; font-size:14px; line-height:1.6;">${memberNames}</div>
            `;
        } else {
            groupDiv.innerHTML = `
              <div style="color:#00ffcc; font-weight:bold; border-bottom:1px dashed #00ffcc; padding-bottom:4px; margin-bottom:4px;">✨ 図鑑探索中の猛者たち</div>
              <div style="color:#888; font-size:14px; line-height:1.6;">現在、図鑑探索の旅に出ている者はまだおらぬようじゃ。</div>
            `;
        }
        list.appendChild(groupDiv);

    } else {
        infoText.innerHTML = "※この画面はリアルタイムで連動しておる。他の者が診断を終えると自動で追加されるぞい！";
        const grouped = {};
        visitorRoster.forEach(v => { 
            if (!grouped[v.table]) grouped[v.table] = { color: v.color, members: [] }; 
            let displayStr = v.isCollecting ? `${v.name} <span style="font-size:11px; color:#ffaa00;">[図鑑探索中]</span>` : v.name;
            grouped[v.table].members.push(displayStr); 
        });
        
        for (const [tableName, data] of Object.entries(grouped)) {
          const groupDiv = document.createElement('div');
          groupDiv.style.marginBottom = '15px'; 
          groupDiv.style.border = `1px solid ${data.color}`; 
          groupDiv.style.padding = '8px'; 
          groupDiv.style.borderRadius = '4px'; 
          groupDiv.style.background = 'rgba(0,0,0,0.5)';
          groupDiv.innerHTML = `
            <div style="color:${data.color}; font-weight:bold; border-bottom:1px dashed ${data.color}; padding-bottom:4px; margin-bottom:4px;">${tableName} (${data.members.length}名)</div>
            <div style="color:#ddd; font-size:14px; line-height:1.6;">${data.members.join('、 ')}</div>
          `;
          list.appendChild(groupDiv);
        }
    }
  }

  function buildGallery() {
    const grid = document.getElementById('gallery-grid'); 
    const godHint = document.getElementById('secret-god-hint'); 
    grid.innerHTML = '';
    
    const allKeys = Object.keys(TABLE_DATA).filter(k => k !== 'GOD'); 
    const nonAbyssKeys = ["A", "B", "C", "D", "E", "F", "G", "H", "S", "Z", "N", "V", "J", "U"];
    const abyssKeys = ["M", "OMEGA", "ABYSS_SACRIFICE", "X"];
    const isAbyssRevealed = nonAbyssKeys.every(k => unlockedRoutes.includes(k));
    
    let displayKeys = [];
    if (isAbyssRevealed) { 
        displayKeys = allKeys; 
    } else { 
        displayKeys = allKeys.filter(k => !abyssKeys.includes(k) || unlockedRoutes.includes(k)); 
    }

    const totalTablesCount = displayKeys.length; 
    const unlockedCount = unlockedRoutes.filter(k => allKeys.includes(k)).length;
    document.getElementById('gallery-progress').textContent = `解放率: ${unlockedCount} / ${totalTablesCount}`;

    displayKeys.forEach(key => {
      const isUnlocked = unlockedRoutes.includes(key); 
      const data = TABLE_DATA[key];
      const div = document.createElement('div');
      
      if (key === 'X' && isUnlocked) div.className = 'gallery-item unlocked error';
      else if ((key === 'OMEGA' || key === 'ABYSS_SACRIFICE' || key === 'M') && isUnlocked) div.className = 'gallery-item unlocked omega'; 
      else div.className = `gallery-item ${isUnlocked ? 'unlocked' : 'locked'} ${data.isSecret ? 'secret' : 'normal'}`; 
      
      if (isUnlocked) { 
          div.textContent = data.main.split(' ')[0]; 
          div.onclick = () => showGalleryInfo(key, true); 
      } else { 
          div.textContent = "？？？"; 
          div.onclick = () => showGalleryInfo(key, false); 
      }
      grid.appendChild(div);
    });

    const normalCount = unlockedRoutes.filter(k => ['A','B','C','D','E','F','G','H'].includes(k)).length;
    if (normalCount >= 8) {
      godHint.style.display = 'block';
      if (isAbyssRevealed) { 
          godHint.innerHTML = `【創造神の古文書】<br><br>《第一の理》<br>『天使』の導きが先行するとき、『空白』の静寂がその後を追い、言葉は一つとなる。<br>交わりし四つの音を、己の魂に刻み込め。<br>さすれば、見えざる神の座が姿を現すじゃろう。<br><br>《第二の理》<br>表なる十四の運命、すべてを見届けし者のみに道は開かれる。<br>万物の『深』き底より、交わりし『縁』の糸をたぐり寄せ、己の証として二つの音を刻み込め。<br>さすれば偽りの宴は終わり、真なる問いが幕を開けん。<br><br>${INHERIT_HINT}`; 
      } else { 
          godHint.innerHTML = `【創造神の古文書】<br><br>《第一の理》<br>『天使』の導きが先行するとき、『空白』の静寂がその後を追い、言葉は一つとなる。<br>交わりし四つの音を、己の魂に刻み込め。<br>さすれば、見えざる神の座が姿を現すじゃろう。`; 
      }
    } else { 
        godHint.style.display = 'none'; 
    }

    const existingBtn = document.getElementById('btn-god-silver'); 
    if (existingBtn) existingBtn.remove();
    
    if (godMethods.konami && godMethods.tenkuu && godMethods.gallery) {
      const godBtn = document.createElement('button'); 
      godBtn.id = 'btn-god-silver'; 
      godBtn.className = 'btn';
      godBtn.style.background = 'linear-gradient(135deg, #e6e6e6 0%, #ffffff 50%, #b3b3b3 100%)'; 
      godBtn.style.color = '#000'; 
      godBtn.style.fontWeight = 'bold'; 
      godBtn.style.border = '2px solid #fff'; 
      godBtn.style.boxShadow = '0 0 15px rgba(255,255,255,0.5)'; 
      godBtn.style.marginTop = '15px'; 
      godBtn.style.marginBottom = '10px'; 
      godBtn.style.width = '100%'; 
      godBtn.innerHTML = '✨ 神の座'; 
      godBtn.onclick = () => { closeGallery(); enterGodRoute(); };
      const modalBody = document.querySelector('#gallery-modal .modal-body'); 
      modalBody.insertBefore(godBtn, godHint);
    }

    // ── 秘宝の棚 ──
    // 未入手はヒントを出さず、伏せたまま並べます。
    // 一度でも手にしたものだけ、入手法を記します（代償で失った時の救済）。
    const seen = JSON.parse(localStorage.getItem('takuwake_treasures_seen')) || [];
    heldTreasures.forEach((k) => { if (!seen.includes(k)) seen.push(k); });
    localStorage.setItem('takuwake_treasures_seen', JSON.stringify(seen));

    const tGrid = document.getElementById('treasure-grid');
    if (tGrid) {
      tGrid.innerHTML = '';
      const keys = Object.keys(TREASURES);
      document.getElementById('treasure-progress').textContent =
        `所持: ${heldTreasures.length} / ${keys.length}`;
      keys.forEach((k) => {
        const owned = hasTreasure(k);
        const known = seen.includes(k);
        const div = document.createElement('div');
        div.className = 'treasure-item' + (owned ? ' owned' : (known ? ' lost' : ' unknown'));
        div.textContent = owned ? TREASURES[k].name : (known ? TREASURES[k].name : '？？？');
        div.onclick = () => {
          if (soundEnabled) { soundBack.currentTime = 0; soundBack.play().catch(() => {}); }
          const info = document.getElementById('gallery-info');
          if (owned) {
            info.innerHTML = `<span style="color:#ffd700; font-size:16px; font-weight:bold;">${TREASURES[k].name}</span>` +
              `<hr style="border-color:#444; margin:10px 0;">` +
              `<span style="font-size:13px; color:#ddd;">${TREASURES[k].lore}</span>`;
          } else if (known) {
            info.innerHTML = `<span style="color:#ff9999; font-size:16px; font-weight:bold;">${TREASURES[k].name}</span><br>` +
              `<span style="font-size:12px; color:#ff9999;">（館に預けたままじゃ）</span>` +
              `<hr style="border-color:#444; margin:10px 0;">` +
              `<span style="font-size:13px; color:#ddd;">${TREASURES[k].lore}</span><br><br>` +
              `<span style="color:#aaa; font-size:12px;">【取り戻すには】<br>${TREASURES[k].note}</span>`;
          } else {
            info.innerHTML = `<span style="color:#666;">まだ見ぬ秘宝じゃ。<br>館のどこかに眠っておる。</span>`;
          }
        };
        tGrid.appendChild(div);
      });
    }

    const titleList = document.getElementById('title-list'); 
    titleList.innerHTML = '';
    
    for (const [titleName, data] of Object.entries(TITLES_DEF)) {
      const isTitleUnlocked = unlockedTitles.includes(titleName); 
      const tDiv = document.createElement('div');
      tDiv.className = `title-item ${isTitleUnlocked ? 'unlocked' : 'locked'}`;
      if (isTitleUnlocked) { 
          tDiv.innerHTML = `<div class="title-name">${titleName}</div><div class="title-desc">${data.desc}</div>`; 
      } else { 
          tDiv.innerHTML = `<div class="title-name">？？？</div><div class="title-hint" style="color:#aaa; font-size:12px; font-style:italic;">【ヒント】<br>${data.hint}</div>`; 
      }
      tDiv.onclick = () => showTitleInfo(titleName, isTitleUnlocked); 
      titleList.appendChild(tDiv);
    }
  }

  function startDebugModeFromGallery() {
    playerName = ""; realPlayerName = ""; emptyNameCount = 0; stepHistory = []; isGodMode = true;
    const allKeys = Object.keys(TABLE_DATA).filter(k => k !== 'GOD'); 
    unlockedRoutes = allKeys; localStorage.setItem('takuwake_unlocked', JSON.stringify(unlockedRoutes)); 
    unlockedTitles = Object.keys(TITLES_DEF); localStorage.setItem('takuwake_titles', JSON.stringify(unlockedTitles));
    
    buildGallery(); 
    document.body.classList.remove('serious-mode'); 
    document.querySelector('.character-avatar').textContent = "🧙‍♂️"; 
    document.querySelector('.character-name').textContent = "卓分けのぬし"; 
    document.querySelector('.character-name').nextElementSibling.textContent = "サークルの運命を司る者";
    
    if(soundEnabled){ 
        soundBGM.pause(); soundSecretBGM.pause(); soundSeriousBGM.pause(); 
        soundEyecatch.currentTime = 0; soundEyecatch.play().catch(()=>{}); 
    }
    
    document.getElementById('sound-section').style.display = 'none'; 
    document.getElementById('mode-resume-section').style.display = 'none'; 
    document.getElementById('people-section').style.display = 'none'; 
    document.getElementById('confirmation-section').style.display = 'none'; 
    document.getElementById('name-input-section').style.display = 'none'; 
    document.getElementById('name-confirm-section').style.display = 'none'; 
    document.getElementById('input-quiz-section').style.display = 'none'; 
    document.getElementById('retry-confirm-section').style.display = 'none'; 
    document.getElementById('quiz-buttons').style.display = 'none';
    
    showResult('GOD');
  }

  function openGallery() { 
    if (document.body.classList.contains('serious-mode')) {
      if(soundEnabled){ soundGlitch.currentTime=0; soundGlitch.play().catch(()=>{}); }
      const container = document.getElementById('game-container'); 
      container.classList.add('glitch-effect');
      
      const savedText = currentTargetText;
      const savedOnComplete = currentOnComplete;
      const savedIsNameScreen = currentIsNameScreen;
      
      typeWriter("ザザザーッ……！\n深淵の歪みにより、古文書の記憶に激しいノイズが走り、開くことができない……！", () => {
          setTimeout(() => { 
              if(document.body.classList.contains('serious-mode')) { 
                  typeWriter(savedText, savedOnComplete, savedIsNameScreen); 
              } 
          }, 1000); 
      });
      setTimeout(() => { container.classList.remove('glitch-effect'); }, 500); 
      return;
    }
    if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); } 
    galleryClickSequence = []; 
    document.getElementById('gallery-modal').classList.add('active'); 
    document.getElementById('gallery-info').innerHTML = "※ルートや称号をタップすると、ここに詳細や解放への「ヒント」が表示されるぞい。"; 
  }

  function closeGallery() { 
      if(soundEnabled){ soundBack.currentTime=0; soundBack.play().catch(()=>{}); } 
      document.getElementById('gallery-modal').classList.remove('active'); 
  }

  function showGalleryInfo(key, isUnlocked) {
    if(soundEnabled){ soundBack.currentTime=0; soundBack.play().catch(()=>{}); }
    galleryClickSequence.push(key); 
    if (galleryClickSequence.length > 7) galleryClickSequence.shift();
    
    const seqStr = galleryClickSequence.join('');
    if (seqStr.endsWith('GAME')) { 
        galleryClickSequence = []; closeGallery(); startSacrificeTrialFromGallery(); return; 
    } 
    else if (seqStr.endsWith('GOMEGAD')) { 
        galleryClickSequence = []; godMethods.gallery = true; saveGodMethods(); closeGallery(); enterGodRoute(); return; 
    }

    const infoBox = document.getElementById('gallery-info');
    if (isUnlocked) { 
        const data = TABLE_DATA[key]; 
        infoBox.innerHTML = `
            <span style="color:${data.color}; font-size:16px; font-weight:bold;">${data.main}</span><br><br>${data.type}
            <hr style="border-color:#444; margin:10px 0;">
            <span style="color:#aaa; font-size:12px;">【ヒント】<br>${ROUTE_HINTS[key]}</span>
        `; 
    } else { 
        infoBox.innerHTML = `<span style="color:#aaa;">【ヒント】</span><br>${ROUTE_HINTS[key]}`; 
    }
  }

  function startSacrificeTrialFromGallery() {
    playerName = ""; realPlayerName = ""; 
    document.body.classList.add('serious-mode'); 
    document.querySelector('.character-avatar').textContent = "👁️"; 
    document.querySelector('.character-name').textContent = "深淵のぬし"; 
    document.querySelector('.character-name').nextElementSibling.textContent = "館の裏側に潜む影";
    
    if (soundEnabled) { 
        soundBGM.pause(); soundSecretBGM.pause(); soundSeriousBGM.currentTime = 0; soundSeriousBGM.play().catch(()=>{}); 
    }
    
    document.getElementById('sound-section').style.display = 'none'; 
    document.getElementById('mode-resume-section').style.display = 'none'; 
    document.getElementById('people-section').style.display = 'none'; 
    document.getElementById('confirmation-section').style.display = 'none'; 
    document.getElementById('name-input-section').style.display = 'none'; 
    document.getElementById('name-confirm-section').style.display = 'none'; 
    document.getElementById('input-quiz-section').style.display = 'none'; 
    document.getElementById('retry-confirm-section').style.display = 'none'; 
    document.getElementById('result-box').style.display = 'none'; 
    document.getElementById('share-group-buttons').style.display = 'none'; 
    document.getElementById('god-powers-group').style.display = 'none';
    
    document.getElementById('quiz-buttons').style.display = 'flex'; 
    document.getElementById('btn-yes').style.display = 'block'; 
    document.getElementById('btn-no').style.display = 'block'; 
    document.getElementById('btn-back').style.display = 'none'; 
    
    currentStep = 'branch_sacrifice'; 
    typeWriter("【代償の深淵】\nほう……図鑑の理を解き明かし、我を呼び出すとはな。\n\nここを通るには、お主がこれまで積み上げてきた『すべての図鑑データ』を代償に差し出してもらう。\n\nお主の記憶を賭けて、この代償の深淵に挑むか？");
  }

  function showTitleInfo(titleName, isUnlocked) {
    if(soundEnabled){ soundBack.currentTime=0; soundBack.play().catch(()=>{}); }
    const infoBox = document.getElementById('gallery-info'); 
    const data = TITLES_DEF[titleName];
    if (isUnlocked) { 
        infoBox.innerHTML = `
            <span style="color:#ffaa00; font-size:16px; font-weight:bold;">${titleName}</span><br><br>
            <span style="font-size:13px; color:#ddd;">${data.desc}</span>
            <hr style="border-color:#444; margin:10px 0;">
            <span style="color:#aaa; font-size:12px;">【獲得のヒント】<br>${data.hint}</span>
        `; 
    } else { 
        infoBox.innerHTML = `
            <span style="color:#aaa; font-size:16px; font-weight:bold;">？？？</span><br><br>
            <span style="color:#aaa; font-size:12px;">【獲得のヒント】<br>${data.hint}</span>
        `; 
    }
  }

  // 真のエンディングには『何も持たぬ者の証』が要る。
  // 継承の儀で力を受け取らずに立ち去った者だけが辿り着けます。
  function canSeeTrueEnding() {
    const allKeys = Object.keys(TABLE_DATA).filter((k) => k !== 'GOD');
    return allKeys.every((k) => unlockedRoutes.includes(k))
      && Object.keys(TITLES_DEF).every((t) => unlockedTitles.includes(t))
      && hasTreasure('akashi');
  }

  // エンドロール。到達した卓・称号・館に遺された言葉を織り込んで流します。
  function buildStaffRoll() {
    const names = getClearNames();
    const tables = ALL_TABLES
      .filter((k) => unlockedRoutes.includes(k))
      .map((k) => `<span style="color:${TABLE_DATA[k].color};">${TABLE_DATA[k].main}</span>`);
    const secrets = ['S', 'Z', 'N', 'V', 'J', 'U', 'M', 'ABYSS_SACRIFICE', 'OMEGA', 'X']
      .filter((k) => unlockedRoutes.includes(k))
      .map((k) => `<span style="color:${TABLE_DATA[k].color};">${TABLE_DATA[k].main}</span>`);

    return `
      <div class="roll-title">卓分けの館</div>
      <div class="roll-sub">— 真のエンディング —</div>

      <div class="roll-body">すべての運命を見届けし者よ…<br>
      幾多の選択を越え、<br>この館のすべての扉を開いた<br>お主の執念に心より敬意を表するぞい！</div>

      <div class="roll-head">巡りし表の卓</div>
      <div class="roll-list">${tables.join('<br>')}</div>

      <div class="roll-head">辿り着きし隠されし卓</div>
      <div class="roll-list">${secrets.join('<br>')}</div>

      <div class="roll-head">授かりし称号</div>
      <div class="roll-list">${unlockedTitles.join('<br>')}</div>

      <div class="roll-head">手にせし秘宝</div>
      <div class="roll-list">${heldTreasures.map((k) => TREASURES[k].name).join('<br>')}</div>


      <div class="roll-body">本当におめでとう！<br>そして、遊んでくれてありがとう！</div>

      <div class="roll-head">攻略者</div>
      <div class="roll-list roll-clear">${names.join('<br>')}</div>

      <div class="roll-head">作成者</div>
      <div class="roll-list roll-author">HINATA AKIMOTO</div>

      <div class="roll-head">制作協力</div>
      <div class="roll-list roll-credit">Claude (Anthropic)<br>Gemini (Google)</div>

      <div class="roll-end">卓分けの館<br><span class="roll-fin">— 完 —</span></div>
    `;
  }

  function startStaffRoll() {
    if (soundEnabled) { 
        soundFanfare.pause(); soundEyecatch.pause(); soundSecretBGM.pause(); soundSeriousBGM.pause(); 
        soundBGM.pause();
        soundStaffRoll.currentTime = 0; soundStaffRoll.play().catch(()=>{}); 
    }
    grantTreasure('brush', true);   // 真のエンディングを見た証

    const rollModal = document.getElementById('staff-roll-modal'); 
    const rollContent = document.getElementById('staff-roll-content'); 
    const closeBtn = document.getElementById('btn-close-staff-roll');

    rollContent.innerHTML = buildStaffRoll();
    rollModal.style.display = 'flex'; 
    closeBtn.style.display = 'none'; 
    rollContent.classList.remove('scroll'); 
    void rollContent.offsetWidth; 
    rollContent.classList.add('scroll'); 
    setTimeout(() => { closeBtn.style.display = 'block'; }, 20000);
  }

  function closeStaffRoll() { 
      if (soundEnabled) { 
          soundBack.currentTime = 0; soundBack.play().catch(()=>{}); soundStaffRoll.pause(); 
      } 
      document.getElementById('staff-roll-modal').style.display = 'none'; 
  }

  function getShareText() { return `♟️ ${realPlayerName || playerName || "名無し"}は【${finalResultData.type}】で ${finalResultData.main} に決まりました！\n#卓分けの館 #ボードゲーム`; }
  
  function shareTwitter() { 
      const text = encodeURIComponent(getShareText()); 
      window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank'); 
  }
  
  function shareInstagram() { 
      navigator.clipboard.writeText(getShareText()).then(() => { 
          alert("📝 診断結果をクリップボードにコピーしました！\n\n「OK」を押すとInstagramが開きます。ストーリーズやDMにペースト（貼り付け）して皆に知らせましょう！"); 
          window.open('https://www.instagram.com/', '_blank'); 
      }).catch(err => { 
          alert('コピーに失敗しました。お手数ですが、右の「コピー」ボタンをお試しください。'); 
      }); 
  }
  
  function copyResult() { 
      navigator.clipboard.writeText(getShareText()).then(() => { 
          const copyBtn = document.getElementById('btn-copy'); 
          const originalText = copyBtn.textContent; 
          copyBtn.textContent = "✔ コピー済"; 
          setTimeout(() => { copyBtn.textContent = originalText; }, 2000); 
      }).catch(err => { 
          alert('コピーに失敗しました。'); 
      }); 
  }
  
  function saveAsImage() {
    const target = document.getElementById('game-container'); 
    const shareGroup = document.getElementById('share-group-buttons'); 
    const btnBack = document.getElementById('btn-result-back'); 
    const btnRestart = document.getElementById('btn-restart'); 
    const btnTrueEnding = document.getElementById('btn-true-ending'); 
    const godGroup = document.getElementById('god-powers-group'); 
    const switchBtn = document.getElementById('btn-switch-mode');
    
    shareGroup.style.display = 'none'; 
    godGroup.style.display = 'none'; 
    btnBack.style.display = 'none'; 
    btnRestart.style.display = 'none'; 
    if(btnTrueEnding) btnTrueEnding.style.display = 'none'; 
    if(switchBtn) switchBtn.style.display = 'none';
    
    target.classList.add('capture-mode');
    
    html2canvas(target, { backgroundColor: '#000', scale: 3 }).then(canvas => {
      const targetImgUrl = canvas.toDataURL('image/png'); 
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
          showImageModal(targetImgUrl); 
      } else { 
          const link = document.createElement('a'); 
          link.download = `卓分け結果_${realPlayerName || playerName || "名無し"}.png`; 
          link.href = targetImgUrl; 
          link.click(); 
      }
    }).catch(err => { 
        alert("画像の保存に失敗しました。"); 
    }).finally(() => {
      target.classList.remove('capture-mode'); 
      if(finalResultData && finalResultData.main && finalResultData.main.includes('神')) { 
          godGroup.style.display = 'flex'; 
      } else { 
          shareGroup.style.display = 'flex'; 
      }
      btnRestart.style.display = 'block';
      if (finalResultData && finalResultData.main && !['N','V','U','神','Ω'].includes(finalResultData.main[0]) && isCollectionMode) {
          btnBack.style.display = 'block';
      }
      if (finalResultData && finalResultData.main && !finalResultData.main.includes('神') && !finalResultData.main.includes('奈落')) { 
          if(switchBtn) switchBtn.style.display = 'block'; 
      }
      if (canSeeTrueEnding() && btnTrueEnding) btnTrueEnding.style.display = 'block';
    });
  }
  
  function showImageModal(imgUrl) {
    const modal = document.createElement('div'); 
    modal.style.position = 'fixed'; 
    modal.style.top = '0'; 
    modal.style.left = '0'; 
    modal.style.width = '100vw'; 
    modal.style.height = '100vh'; 
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.9)'; 
    modal.style.zIndex = '10000'; 
    modal.style.display = 'flex'; 
    modal.style.flexDirection = 'column'; 
    modal.style.alignItems = 'center'; 
    modal.style.justifyContent = 'center'; 
    modal.style.padding = '20px';
    
    const text = document.createElement('div'); 
    text.textContent = '👇 画像を長押しして保存してください'; 
    text.style.color = '#fff'; 
    text.style.marginBottom = '20px'; 
    text.style.fontSize = '16px'; 
    text.style.fontWeight = 'bold';
    
    const img = document.createElement('img'); 
    img.src = imgUrl; 
    img.style.maxWidth = '100%'; 
    img.style.maxHeight = '70vh'; 
    img.style.border = '2px solid #fff'; 
    img.style.borderRadius = '8px';
    
    const closeBtn = document.createElement('button'); 
    closeBtn.textContent = '✖ 閉じる'; 
    closeBtn.style.marginTop = '20px'; 
    closeBtn.style.padding = '12px 24px'; 
    closeBtn.style.fontSize = '16px'; 
    closeBtn.style.backgroundColor = '#333'; 
    closeBtn.style.color = '#fff'; 
    closeBtn.style.border = '2px solid #fff'; 
    closeBtn.style.borderRadius = '4px'; 
    closeBtn.style.cursor = 'pointer'; 
    closeBtn.style.fontFamily = "'DotGothic16', sans-serif";
    closeBtn.onclick = () => { document.body.removeChild(modal); };
    
    modal.appendChild(text); 
    modal.appendChild(img); 
    modal.appendChild(closeBtn); 
    document.body.appendChild(modal);
  }

  // 🔥 神の座の能力表示
  function explainGodPower(type) {
    if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); }
    const powersBox = document.getElementById('god-powers-group');
    
    if (type === 'sousei') {
      typeWriter("ははっ！そちらは『創生と忘却の力』でありますな。\nこれまでこの館で紡がれたすべての記録（個人の図鑑や称号）を白紙に戻し、世界を再構築する御力でありますぞ。\nただちに行使なさいますか？");
      powersBox.innerHTML = `
        <button class="btn" style="border-color:#ff4444; color:#ffaaaa;" onclick="executeGodPower('sousei')">▶ 世界を創り直す</button>
        <button class="btn btn-back" onclick="cancelGodPower()">▶ 御手を止める</button>
      `;
    } else if (type === 'zenchi') {
      typeWriter("御意。そちらは『次元跳躍の才』であります。\n創造神様が過去に観測された（解放済みの）どの卓の結末へも、時空を超えて直接お赴きになれる御力でありますぞ。\nどちらの次元へ跳躍なさいますか？");
      powersBox.innerHTML = `
        <button class="btn" style="border-color:#00ffff; color:#00ffff;" onclick="executeGodPower('zenchi')">▶ 過去の記録へ跳躍する</button>
        <button class="btn btn-back" onclick="cancelGodPower()">▶ 御手を止める</button>
      `;
    } else if (type === 'yuukyuu') {
      typeWriter("恐れ入ります、そちらは『理破りの力』でありますな。\n深淵での失敗による「15分のペナルティ」という館の理を強制的に破壊し、今すぐ再び深淵への挑戦を可能とする御力でありますぞ。\n制約を解除なさいますか？");
      powersBox.innerHTML = `
        <button class="btn" style="border-color:#ffaaaa; color:#ffaaaa;" onclick="executeGodPower('yuukyuu')">▶ 深淵の制約を解除する</button>
        <button class="btn btn-back" onclick="cancelGodPower()">▶ 御手を止める</button>
      `;
    } else if (type === 'muku') {
      typeWriter("ははっ！そちらは『透視の才』でありますな。\nオンライン上の『卓選択モード』の来訪者の記録（名簿）を、この神の座から直接確認する御力でありますぞ。\nただちに行使なさいますか？");
      powersBox.innerHTML = `
        <button class="btn" style="border-color:#eeeeff; color:#eeeeff;" onclick="openRosterForGod()">▶ 卓選択モードの名簿を確認</button>
        <button class="btn btn-back" onclick="cancelGodPower()">▶ 御手を止める</button>
      `;
    } else if (type === 'shinmei') {
      typeWriter("ははっ！そちらは『真名の才』でありますな。\n真なるエンディングの最果てに刻まれる『攻略者』の列に、新たなる御名を追加する御力でありますぞ。\nただちに行使なさいますか？");
      powersBox.innerHTML = `
        <button class="btn" style="border-color:#ff88ff; color:#ff88ff;" onclick="askNameForRoll()">▶ エンドロールに名を追加する</button>
        <button class="btn btn-back" onclick="cancelGodPower()">▶ 御手を止める</button>
      `;
    } else if (type === 'boukyaku_na') {
      typeWriter("ははっ！そちらは『名忘却の才』でありますな。\n真なるエンディングに連なる『攻略者』の名から、指定した者の記録を消し去る御力でありますぞ。\n\n……ただ、ひとつご忠告を。\nこの御力は忘却そのもの。振るえば、貴方様がこれまで集めた秘宝もすべて忘れ去られます。\nそれでもなお、行使なさいますか？");
      askNameForDelete();
    }
  }

  function cancelGodPower() {
    if(soundEnabled){ soundBack.currentTime=0; soundBack.play().catch(()=>{}); }
    typeWriter("ははっ！御力の行使はお控えになるのですね。承知いたしました。");
    resetGodPowerButtons();
  }

  // 対応する秘宝を持たぬ御力には錠がかかる。
  // 何があるかは見えるが、まだ使えない状態が探索の動機になります。
  const GOD_POWERS = [
    { id: 'sousei',      label: '創生と忘却の力', color: '#ffd700' },
    { id: 'zenchi',      label: '次元跳躍の才',   color: '#00ffff' },
    { id: 'yuukyuu',     label: '理破りの力',     color: '#ffaaaa' },
    { id: 'muku',        label: '透視の才',       color: '#eeeeff' },
    { id: 'shinmei',     label: '真名の才',       color: '#ff88ff' },
    { id: 'boukyaku_na', label: '名忘却の才',     color: '#aaaaff' }
  ];

  function treasureForPower(powerId) {
    return Object.keys(TREASURES).find((k) => TREASURES[k].power === powerId);
  }

  function resetGodPowerButtons() {
    grantInkpotIfEarned();
    const box = document.getElementById('god-powers-group');
    box.innerHTML = '';

    GOD_POWERS.forEach((p) => {
      const item = treasureForPower(p.id);
      const b = document.createElement('button');
      b.className = 'btn';
      if (hasTreasure(item)) {
        b.style.borderColor = p.color;
        b.style.color = p.color;
        b.textContent = `▶ 『${p.label}』を行使`;
        b.onclick = () => explainGodPower(p.id);
      } else {
        b.className = 'btn btn-locked';
        b.textContent = `🔒 『${p.label}』（秘宝が足りぬ）`;
        b.onclick = () => {
          if (soundEnabled) { soundNo.currentTime = 0; soundNo.play().catch(() => {}); }
          typeWriter(`……その力を振るうには、対となる秘宝が要る。\n館のどこかに眠っておるはずじゃ。`);
        };
      }
      box.appendChild(b);
    });

    const kumi = document.createElement('button');
    if (hasTreasure('key')) {
      kumi.className = 'btn';
      kumi.style.borderColor = '#aaff00';
      kumi.style.color = '#aaff00';
      kumi.textContent = '▶ 『卓組みの間』へ渡る';
      kumi.onclick = goToKumiRoom;
    } else {
      kumi.className = 'btn btn-locked';
      kumi.textContent = '🔒 『卓組みの間』（鍵が要る）';
      kumi.onclick = () => {
        if (soundEnabled) { soundNo.currentTime = 0; soundNo.play().catch(() => {}); }
        typeWriter('……この扉は館主の鍵でしか開かぬ。\n三たびこの館を訪れた者に、わしが預けよう。');
      };
    }
    box.appendChild(kumi);
  }

  function openRosterForGod() {
      if(soundEnabled){ soundFanfare.currentTime=0; soundFanfare.play().catch(()=>{}); }
      typeWriter("……御意。現在の来訪者の記録（名簿）を映し出しますぞ。");
      document.getElementById('roster-modal').classList.add('active'); 
      document.getElementById('btn-roster-delete').style.display = 'block'; 
      renderRoster(true);
      resetGodPowerButtons();
  }

  function executeGodPower(type) {
    if(soundEnabled && type !== 'shinmei'){ soundFanfare.currentTime=0; soundFanfare.play().catch(()=>{}); }
    
    if (type === 'sousei') {
      localStorage.clear(); 
      unlockedRoutes = []; 
      unlockedTitles = []; 
      heldTreasures = [];          // 画面上のリストも合わせて還す
      tapTotal = 0; abyssTapTotal = 0; undoTotal = 0;
      godMethods = { konami: false, tenkuu: false, gallery: false }; 
      saveGodMethods(); 
      buildGallery(); 
      typeWriter("……おおお！創造神様の手により、個人のすべての記録が無に還り、今再び新たな世界が産声を上げたのでありますな！"); 
      resetGodPowerButtons();
    } else if (type === 'yuukyuu') {
      localStorage.removeItem('takuwake_abyss_penalty');
      typeWriter("……刻（とき）の呪縛が打ち砕かれましたぞ！\n奈落の制約は消え去り、創造神様の御心のままに、再び深淵へ挑むことが可能となりました！"); 
      resetGodPowerButtons();
    } else if (type === 'zenchi') {
      openZenchiModal();
    }
  }

  function askNameForRoll() {
    if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); }
    typeWriter("御意。では真なるエンディングに追加するため、貴方様のお名前をここに入力してくださいませ。");
    const powersBox = document.getElementById('god-powers-group'); 
    
    powersBox.innerHTML = `
      <input type="text" id="roll-name-input" class="name-input" placeholder="なまえをいれるのじゃ" autocomplete="off" value="">
      <div class="input-note">※自由に回答してください</div>
      <button class="btn" style="border-color:#ff88ff; color:#ff88ff;" onclick="executeShinmei()">▶ この名を追加する</button>
      <button class="btn btn-back" onclick="cancelGodPower()">▶ 御手を止める</button>
    `;
  }

  // 墨壺は『名忘却の才』を一度でも振るった者へ。
  // 全消去の直後に渡すと即座に消えてしまうため、次に神の座へ入った時に授けます。
  function grantInkpotIfEarned() {
    if (localStorage.getItem('takuwake_boukyaku_done') === '1') grantTreasure('inkpot');
  }

  function executeShinmei() {
    const nameInput = document.getElementById('roll-name-input').value.trim();
    if(nameInput === "") { 
        if(soundEnabled){ soundNo.currentTime=0; soundNo.play().catch(()=>{}); } 
        return; 
    }
    if(soundEnabled){ soundFanfare.currentTime=0; soundFanfare.play().catch(()=>{}); }
    
    let names = getClearNames();
    names.push(nameInput);
    setClearNames(names);
    
    typeWriter("……おおお！創造神様の手により、真なるエンディングに新たな名が追加されましたぞ！\nすべての謎を解き明かした暁には、その御名が燦然と輝くことでしょう！");
    
    resetGodPowerButtons(); 
    updateStaffRollName();
  }

  function askNameForDelete() {
    if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); }
    const powersBox = document.getElementById('god-powers-group');
    let names = getClearNames();
    
    if(names.length === 0) {
        powersBox.innerHTML = `
          <div style="color:#888; font-size:14px; text-align:center; margin-bottom:10px;">記録されている名はありません。</div>
          <button class="btn btn-back" onclick="cancelGodPower()">▶ 御手を止める</button>
        `;
        return;
    }
    
    let html = '<div style="max-height: 200px; overflow-y: auto; border: 1px solid #555; padding: 8px; border-radius: 4px; margin-bottom: 10px; display:flex; flex-direction:column; gap:6px;">';
    names.forEach((n, idx) => {
        html += `<button class="btn" style="border-color:#8888ff; color:#aaaaff; padding: 10px; font-size:16px;" onclick="executeBoukyaku(${idx})">🗑️ 『${n}』を消去</button>`;
    });
    html += '</div><button class="btn btn-back" onclick="cancelGodPower()">▶ 御手を止める</button>';
    powersBox.innerHTML = html;
  }

  function executeBoukyaku(index) {
    let names = getClearNames();
    let deletedName = names[index];
    if (!confirm(`『${deletedName}』の記録を消します。\n\n同時に、あなたが集めた秘宝もすべて失われます。\nこの操作は取り消せません。よろしいですか。`)) {
      cancelGodPower();
      return;
    }
    if(soundEnabled){ soundNo.currentTime=0; soundNo.play().catch(()=>{}); }

    names.splice(index, 1);
    setClearNames(names);
    updateStaffRollName();

    // 忘却の力は、振るった当人からも記憶を奪う。
    // 一度手にした記録（takuwake_treasures_seen）は残すので、
    // 図鑑には入手法が表示され、取り直すことができます。
    wipeGalleryData();
    localStorage.setItem('takuwake_boukyaku_done', '1');

    typeWriter(`……おおお！創造神様の手により、『${deletedName}』の記録が白紙に戻りましたぞ。\n\n……そして。\n忘却は貴方様にも及びました。手にしておられた秘宝は、すべて館の闇へと還りましたぞ。\n図鑑には入手の道筋が残っております。もう一度、集め直すことも叶いましょう。`);
    resetGodPowerButtons();
  }

  function openZenchiModal() {
    const list = document.getElementById('zenchi-list'); 
    list.innerHTML = '';
    
    if (unlockedRoutes.length === 0) {
      list.innerHTML = '<div style="color:#888; text-align:center;">まだどこにも到達しておらぬようじゃ。</div>';
    } else {
      unlockedRoutes.forEach(key => {
        const btn = document.createElement('button'); 
        btn.className = 'btn';
        btn.style.padding = '10px'; 
        btn.style.fontSize = '14px';
        btn.style.borderColor = TABLE_DATA[key].color; 
        btn.style.color = TABLE_DATA[key].color;
        btn.textContent = `▶ ${TABLE_DATA[key].main}`;
        btn.onclick = () => askNameForJump(key); 
        list.appendChild(btn);
      });
    }
    document.getElementById('zenchi-modal').classList.add('active');
  }

  function closeZenchiModal() {
    if(soundEnabled){ soundBack.currentTime=0; soundBack.play().catch(()=>{}); }
    document.getElementById('zenchi-modal').classList.remove('active');
    cancelGodPower();
  }

  function askNameForJump(key) {
    if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); }
    document.getElementById('zenchi-modal').classList.remove('active');
    jumpTargetKey = key;
    typeWriter("御意。では跳躍先の記録に刻むため、貴方様のお名前をここに入力してくださいませ。");
    
    const powersBox = document.getElementById('god-powers-group');
    powersBox.innerHTML = `
      <input type="text" id="jump-name-input" class="name-input" placeholder="なまえをいれるのじゃ" autocomplete="off" value="${playerName !== 'HINATA AKIMOTO' && playerName !== '深淵を覗く者' && playerName !== '代償の求道者' ? playerName : ''}">
      <div class="input-note">※自由に回答してください</div>
      <button class="btn" style="border-color:#00ffff; color:#00ffff;" onclick="executeJump()">▶ この名前で跳躍する</button>
      <button class="btn btn-back" onclick="cancelGodPower()">▶ 御手を止める</button>
    `;
  }

  function executeJump() {
    const nameInput = document.getElementById('jump-name-input').value.trim();
    if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); }
    
    playerName = nameInput; 
    realPlayerName = nameInput;
    document.getElementById('result-box').style.display = 'none';
    document.getElementById('quiz-buttons').style.display = 'flex';
    
    resetGodPowerButtons(); 
    showResult(jumpTargetKey, true);
  }
