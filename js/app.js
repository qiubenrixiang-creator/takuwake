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
  const soundBGM = new Audio(AUDIO_FILES.bgmMain); soundBGM.loop = true;
  const soundSecretBGM = new Audio(AUDIO_FILES.bgmSecret); soundSecretBGM.loop = true;
  const soundSeriousBGM = new Audio(AUDIO_FILES.bgmSerious); soundSeriousBGM.loop = true;
  const soundStaffRoll = new Audio(AUDIO_FILES.bgmStaffRoll); soundStaffRoll.loop = true;
  const soundYes = new Audio(AUDIO_FILES.seDecide);
  const soundNo = new Audio(AUDIO_FILES.seCancel);
  const soundBack = new Audio(AUDIO_FILES.seBack);
  const soundTalk = new Audio(AUDIO_FILES.seTalk); soundTalk.loop = true;
  const soundFanfare = new Audio(AUDIO_FILES.seFanfare);
  const soundEyecatch = new Audio(AUDIO_FILES.seEyecatch);
  const soundGlitch = new Audio(AUDIO_FILES.seGlitch);

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

  function updateStaffRollName() {
      const names = getClearNames();
      const rollNameEl = document.getElementById('roll-player-name');
      if (rollNameEl) {
          rollNameEl.innerHTML = names.join('\n');
      }
  }

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
          "お主、考え込んだまま動かんが…どうしたのかえ？ 寝ておるのか？", 
          "む……？ まさか難しすぎて悩んでおるのか？ 気楽に行くのじゃぞ！", 
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
      for (let nameKey in data) { visitorRoster.push(data[nameKey]); }
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
    watchSharedSettings();
    watchConnection();
    bindEnterKeys(); 
  });

  // 通信が切れると名簿が更新されないため、画面に出して気づけるようにする。
  function watchConnection() {
    try {
      db.ref('.info/connected').on('value', (snap) => {
        const el = document.getElementById('net-status');
        if (!el) return;
        el.style.display = (snap.val() === true) ? 'none' : 'block';
      });
    } catch (e) { /* 監視できない環境では何もしない */ }
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

  function preloadAudio(audio) {
    audio.muted = true;
    audio.play().then(() => { audio.pause(); audio.currentTime = 0; audio.muted = false; }).catch(() => {});
  }

  function selectSound(enableAudio) {
    soundEnabled = enableAudio;
    if (soundEnabled) {
      soundYes.currentTime = 0; soundYes.play().catch(()=>{});
      [soundSecretBGM, soundStaffRoll, soundEyecatch, soundBack, soundNo, soundFanfare, soundGlitch].forEach(preloadAudio);
      soundBGM.currentTime = 0; soundBGM.play().catch(()=>{});
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
    if (isTyping || !isCollectionMode) return;
    resetIdleTimer();
    const isAbyss = document.body.classList.contains('serious-mode');
    
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

  // 幹事が入力した人数を、参加者全員の端末に共有する。
  // 以前は全員が同じ数字を手入力する必要があり、ズレると卓数が食い違っていた。
  let sharedPeopleCount = null;

  function watchSharedSettings() {
    try {
      db.ref('config/participantCount').on('value', (snap) => {
        const v = snap.val();
        if (typeof v !== 'number' || v < 2) return;
        sharedPeopleCount = v;
        const note = document.getElementById('shared-people-note');
        if (note) {
          note.textContent = `幹事が共有した人数: ${v}名`;
          note.style.display = 'block';
        }
        const input = document.getElementById('participant-count');
        if (input && !input.value) input.value = v;
      }, () => { /* 読めない設定なら黙って無視し、手入力に任せる */ });
    } catch (e) { /* 同上 */ }
  }

  function shareParticipantCount() {
    const n = parseInt(document.getElementById('participant-count').value);
    if (isNaN(n) || n < 2) {
      if(soundEnabled){ soundNo.currentTime=0; soundNo.play().catch(()=>{}); }
      typeWriter("先に参加人数を入力するのじゃ。2名以上じゃぞ。", null, true);
      return;
    }
    if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); }
    db.ref('config/participantCount').set(n)
      .then(() => {
        typeWriter(`人数【${n}名】を全員の端末に共有したぞい！\nこれで皆が同じ卓数で診断できる。`, null, true);
      })
      .catch(() => {
        typeWriter("共有できんかった……。\nFirebaseのルールで config への書き込みが許可されておらぬようじゃ。\n（READMEの手順を確認するのじゃ）", null, true);
      });
  }

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
        emptyNameCount = 0; stepHistory = [];
        const allKeys = Object.keys(TABLE_DATA).filter(k => k !== 'GOD');
        unlockedRoutes = allKeys;
        localStorage.setItem('takuwake_unlocked', JSON.stringify(unlockedRoutes));
        unlockedTitles = Object.keys(TITLES_DEF);
        localStorage.setItem('takuwake_titles', JSON.stringify(unlockedTitles));
        buildGallery();
        
        if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); }
        document.getElementById('name-input-section').style.display = 'none'; 
        
        isGodMode = true;
        isDirectGodMode = true; 
        showResult('GOD');
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
        const warnings = nameInput === "" ? ["名前を入力するのじゃ！","コラ！名前を入れ忘れておるぞ！","じゃから、人数をちゃんと入力せよと言うておるじゃろ！","……お主、わしをからかっておるのか？次やらなかったらどうなるか分からんぞ！"] : ["お主…なんて下品な言葉を入力しておるのじゃ！まともな名前を入れんか！","コラ！ふざけるでない！やり直しじゃ！","わしを怒らせたいようじゃな…次はないぞ？","……よかろう。お主のその捻くれた根性、最後まで見届けてやろうではないか。"];
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

  function startGameConfirm() {
    if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); }
    emptyNameCount = 0; playerName = tempName; realPlayerName = tempName; stepHistory = []; undoCount = 0; isGodMode = false;
    document.getElementById('name-confirm-section').style.display = 'none';
    document.getElementById('quiz-buttons').style.display = 'flex';
    
    if(isCollectionMode && soundBGM.paused) {
        soundBGM.currentTime=0; soundBGM.play().catch(()=>{}); 
    }
    showQuestion('start');
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
        const specialNames = ["さおとめ", "ゆうご", "しょう", "ひなた", "たかや", "なおまさ", "りりみり"];
        if (specialNames.includes(playerName)) {
            text = `フォッフォッフォ…主がうわさの${playerName}か！いつも世話になっとるのう！まずはわしからの質問に答えるのじゃ。\n\n${text}`;
        } else if (playerName === "ぬし") {
            text = `わしの名前を名乗るとは不届きなやつじゃ！まあよい、まずはわしからの質問に答えるのじゃ。\n\n${text}`;
        } else {
            text = `フォッフォッフォ…${playerName}よ、よく来たな。まずはわしからの質問に答えるのじゃ。\n\n${text}`;
        }
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
              const allKeys = Object.keys(TABLE_DATA).filter(k => k !== 'GOD'); 
              localStorage.removeItem('takuwake_unlocked'); 
              unlockedRoutes = []; 
              buildGallery(); 
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
          typeWriter("我が出す問いに３回連続正解することができればお前の知らない卓に案内してやろう"); 
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
        typeWriter("おぬし、逃げるのではないだろうな 決して逃がさないぞ"); 
        return; 
    }
    
    const isAbyssStep = currentStep.startsWith('q_omega_') || currentStep === 'q_abyss_intro' || currentStep.startsWith('m_abyss_') || currentStep.startsWith('sacrifice_') || currentStep === 'branch_sacrifice' || currentStep === 'q_abyss_battle';
    if (isAbyssStep) { showResult('X'); return; }
    if (stepHistory.length === 0) return;
    
    if (soundEnabled) { soundBack.currentTime=0; soundBack.play().catch(()=>{}); }
    undoCount++; 
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
    undoCount++; 
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
        isCollecting: !!isCollectingMode 
    }).catch(() => {
        showNotice('名簿に登録できませんでした。通信状況を確認して、もう一度診断してください。');
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
      typeWriter("……記録に刻むため、貴様の『真の名』をここに入力せよ。", () => { 
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
      mainTableEl.textContent = `今回のあなたの席は... ${finalResultData.main}`;
      const descEl = document.getElementById('result-desc');
      if (descEl) {
        descEl.textContent = finalResultData.desc || '';
        descEl.style.display = finalResultData.desc ? 'block' : 'none';
      }
      
      let secretMsg = finalResultData.secretMessage;
      if (secretMsg && secretMsg.includes('{STAFF_MSG}')) {
          if (isCollectionMode) {
              if (finalKey === 'S') secretMsg = secretMsg.replace('{STAFF_MSG}', "この偉大なる記録、図鑑の最奥にしかと刻み込もう。");
              else if (finalKey === 'Z') secretMsg = secretMsg.replace('{STAFF_MSG}', "その優しき心、図鑑に確かに刻ませてもらったぞい！");
              else if (finalKey === 'N') secretMsg = secretMsg.replace('{STAFF_MSG}', "図鑑の1ページとして、その反骨精神をしっかりと刻み込んでおこう。");
              else if (finalKey === 'J') secretMsg = secretMsg.replace('{STAFF_MSG}', "その風流な探究心、しかと図鑑に刻み込んでおこう。");
              else if (finalKey === 'U') secretMsg = secretMsg.replace('{STAFF_MSG}', "その類まれなる『天邪鬼』っぷり、しかと図鑑に記録したぞい！");
          } else {
              if (finalKey === 'S') secretMsg = secretMsg.replace('{STAFF_MSG}', "スタッフにこの画面を見せて『マスター』と伝えるのじゃ！");
              else if (finalKey === 'Z') secretMsg = secretMsg.replace('{STAFF_MSG}', "スタッフから特別な景品をもらうが良い！");
              else if (finalKey === 'N') secretMsg = secretMsg.replace('{STAFF_MSG}', "その反骨精神に免じて景品をやろう。スタッフに見せるのじゃ！");
              else if (finalKey === 'J') secretMsg = secretMsg.replace('{STAFF_MSG}', "スタッフにこの画面を見せて『ホトトギス』と合言葉を伝えるのじゃ！");
              else if (finalKey === 'U') secretMsg = secretMsg.replace('{STAFF_MSG}', "その類まれなる『天邪鬼』っぷりを称えよう！スタッフにこの画面を見せるのじゃ！");
          }
      }

      if (finalResultData.isSecret) { 
          dynamicArea.innerHTML = `<div class="secret-message-box">${secretMsg}</div>`; 
      } else {
        const currentTableShort = finalResultData.main.split(' ')[0];
        let sameTableMembers = visitorRoster.filter(v => v.table === currentTableShort && !v.isCollecting).map(v => v.name);
        if (displayName && !isCollectionMode && !sameTableMembers.includes(displayName)) {
            sameTableMembers.push(displayName);
        }
        dynamicArea.innerHTML = `
          <hr style="border-color:#444; margin:12px 0;">
          <div style="font-size: 16px; color: #fff; line-height: 1.8; text-align: center;">
            <strong>【 同じ卓の仲間 】</strong><br>
            <span style="color: #ffffff; font-size: 22px; font-weight: bold; text-shadow: 0 0 8px rgba(255,255,255,0.5);">${sameTableMembers.join('、 ')}</span>
          </div>
        `;
      }

      if (isCollectionMode && finalKey !== 'GOD') {
        const regTable = localStorage.getItem('takuwake_registered_table') || "不明";
        dynamicArea.innerHTML += `
          <div style="font-size: 13px; color: #00ffcc; margin-top: 15px; text-align: center; font-weight: bold; border-top: 1px dashed #444; padding-top: 10px;">
            ※現在は【図鑑収集モード】です。<br>名簿の席は初回の『${regTable}』から動きません。<br>（スタッフへの報告も不要です）
          </div>
        `;
      }

      resultBox.style.display = 'block';
      
      const allKeysForCheck = Object.keys(TABLE_DATA).filter(k => k !== 'GOD');
      const isAllRoutesUnlocked = allKeysForCheck.every(k => unlockedRoutes.includes(k));
      const isAllTitlesUnlocked = Object.keys(TITLES_DEF).every(t => unlockedTitles.includes(t));
      if (isAllRoutesUnlocked && isAllTitlesUnlocked) { 
          if(btnTrueEnding) btnTrueEnding.style.display = 'block'; 
      }
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

  function openRoster() { 
      if(soundEnabled){ soundYes.currentTime=0; soundYes.play().catch(()=>{}); } 
      document.getElementById('roster-modal').classList.add('active'); 
      document.getElementById('btn-roster-delete').style.display = (!isCollectionMode) ? 'block' : 'none';
      renderRoster(); 
  }
  function closeRoster() { 
      if(soundEnabled){ soundBack.currentTime=0; soundBack.play().catch(()=>{}); } 
      document.getElementById('roster-modal').classList.remove('active'); 
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
          godHint.innerHTML = `【創造神の古文書】<br><br>《第一の理》<br>『天使』の導きが先行するとき、『空白』の静寂がその後を追い、言葉は一つとなる。<br>交わりし四つの音を、己の魂に刻み込め。<br>さすれば、見えざる神の座が姿を現すじゃろう。<br><br>《第二の理》<br>表なる十四の運命、すべてを見届けし者のみに道は開かれる。<br>万物の『深』き底より、交わりし『縁』の糸をたぐり寄せ、己の証として二つの音を刻み込め。<br>さすれば偽りの宴は終わり、真なる問いが幕を開けん。`; 
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

  function startStaffRoll() {
    if (soundEnabled) { 
        soundFanfare.pause(); soundEyecatch.pause(); soundSecretBGM.pause(); soundSeriousBGM.pause(); 
        soundStaffRoll.currentTime = 0; soundStaffRoll.play().catch(()=>{}); 
    }
    const rollModal = document.getElementById('staff-roll-modal'); 
    const rollContent = document.getElementById('staff-roll-content'); 
    const closeBtn = document.getElementById('btn-close-staff-roll');
    
    rollModal.style.display = 'flex'; 
    closeBtn.style.display = 'none'; 
    rollContent.classList.remove('scroll'); 
    void rollContent.offsetWidth; 
    rollContent.classList.add('scroll'); 
    setTimeout(() => { closeBtn.style.display = 'block'; }, 15000);
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
      const allKeysForCheck = Object.keys(TABLE_DATA).filter(k => k !== 'GOD'); 
      const isAllRoutesUnlocked = allKeysForCheck.every(k => unlockedRoutes.includes(k)); 
      const isAllTitlesUnlocked = Object.keys(TITLES_DEF).every(t => unlockedTitles.includes(t));
      if (isAllRoutesUnlocked && isAllTitlesUnlocked) { 
          if(btnTrueEnding) btnTrueEnding.style.display = 'block'; 
      }
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
      typeWriter("ははっ！そちらは『名忘却の才』でありますな。\n真なるエンディングに連なる『攻略者』の名から、指定した者の記録を消し去る御力でありますぞ。\nどなたの記録を消し去りますか？");
      askNameForDelete();
    }
  }

  function cancelGodPower() {
    if(soundEnabled){ soundBack.currentTime=0; soundBack.play().catch(()=>{}); }
    typeWriter("ははっ！御力の行使はお控えになるのですね。承知いたしました。");
    resetGodPowerButtons();
  }

  function resetGodPowerButtons() {
    document.getElementById('god-powers-group').innerHTML = `
      <button class="btn" style="border-color:#ffd700; color:#ffd700;" onclick="explainGodPower('sousei')">▶ 『創生と忘却の力』を行使</button>
      <button class="btn" style="border-color:#00ffff; color:#00ffff;" onclick="explainGodPower('zenchi')">▶ 『次元跳躍の才』を行使</button>
      <button class="btn" style="border-color:#ffaaaa; color:#ffaaaa;" onclick="explainGodPower('yuukyuu')">▶ 『理破りの力』を行使</button>
      <button class="btn" style="border-color:#eeeeff; color:#eeeeff;" onclick="explainGodPower('muku')">▶ 『透視の才』を行使</button>
      <button class="btn" style="border-color:#ff88ff; color:#ff88ff;" onclick="explainGodPower('shinmei')">▶ 『真名の才』を行使</button>
      <button class="btn" style="border-color:#8888ff; color:#aaaaff;" onclick="explainGodPower('boukyaku_na')">▶ 『名忘却の才』を行使</button>
    `;
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
    if(soundEnabled){ soundFanfare.currentTime=0; soundFanfare.play().catch(()=>{}); }
    let names = getClearNames();
    let deletedName = names[index];
    names.splice(index, 1);
    setClearNames(names);
    updateStaffRollName();
    
    typeWriter(`……おおお！創造神様の手により、『${deletedName}』の記録が白紙に戻りましたぞ。`);
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
