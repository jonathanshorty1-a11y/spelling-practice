/* =========================================================================
   Spelling Practice — app.js
   Plain JS, no build step. State lives in localStorage.
   ========================================================================= */

(function () {
  "use strict";

  var STORAGE_KEY = "spellingPracticeData.v1";

  var DEFAULT_DATA = {
    profiles: {
      hillary: {
        name: "Hillary",
        weekName: "Week of September 28",
        words: ["climb", "minding", "pies", "die", "height", "sigh", "fright", "slight", "drive", "file", "kite", "prime", "pride", "slice", "twice", "wipe", "pry", "sly", "shy", "spy", "chief", "zebra", "sleek", "highway", "wildlife"],
        history: [],
        results: []
      },
      jeimy: {
        name: "Jeimy",
        weekName: "Week of September 28",
        words: ["cat", "dog", "sun", "fish", "book", "tree", "milk", "star", "frog", "home"],
        history: [],
        results: []
      }
    }
  };

  /* ---------------------------- Storage layer ---------------------------- */

  function loadData() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_DATA));
      var parsed = JSON.parse(raw);
      if (!parsed.profiles || !parsed.profiles.hillary || !parsed.profiles.jeimy) {
        return JSON.parse(JSON.stringify(DEFAULT_DATA));
      }
      return parsed;
    } catch (e) {
      console.warn("Could not read saved data, starting fresh.", e);
      return JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
    } catch (e) {
      console.error("Could not save data", e);
    }
  }

  /* ------------------------------ App state ------------------------------ */

  var state = {
    data: loadData(),
    currentProfileId: null, // 'hillary' | 'jeimy'
    parentProfileId: "hillary",

    study: { index: 0, words: [], showWord: false, showSlow: false },

    test: {
      words: [],
      index: 0,
      attempts: 0,
      maxAttempts: 3,
      answered: false, // current word resolved (correct or revealed)
      correctCount: 0,
      missed: [], // words missed this round
      isMistakesRound: false
    },

    pendingExit: null // fn to call if user confirms leaving a test
  };

  function currentProfile() {
    return state.data.profiles[state.currentProfileId];
  }

  /* ------------------------------ Utilities ------------------------------- */

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function normalize(str) {
    return (str || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function formatDateHuman(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  function parseWordsInput(text) {
    return text
      .split(/[\n,]/)
      .map(function (w) { return w.trim(); })
      .filter(function (w) { return w.length > 0; });
  }

  /* ------------------------------ Navigation ------------------------------ */

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(function (el) {
      el.classList.toggle("active", el.id === id);
    });
    window.scrollTo(0, 0);
  }

  function goHome() {
    state.currentProfileId = null;
    document.body.removeAttribute("data-profile");
    showScreen("screen-home");
  }

  function goToMenu(profileId) {
    state.currentProfileId = profileId;
    document.body.setAttribute("data-profile", profileId);
    var p = currentProfile();
    document.getElementById("menu-title").textContent = p.name;
    document.getElementById("menu-week-label").textContent = p.weekName || "";
    showScreen("screen-menu");
  }

  /* ============================== SPEECH ================================== */

  var speechState = {
    voices: [],
    selectedVoice: null,
    ready: false
  };

  function pickBestVoice(voices) {
    var enUS = voices.filter(function (v) { return v.lang === "en-US" || v.lang === "en_US"; });
    var pool = enUS.length ? enUS : voices.filter(function (v) { return /^en/i.test(v.lang); });
    if (!pool.length) pool = voices;
    if (!pool.length) return null;

    // Known good, natural-sounding en-US voices across platforms (iOS/macOS/Chrome).
    var preferredNames = [
      "Samantha", "Ava", "Allison", "Susan", "Nicky", "Zoe", "Evan",
      "Google US English", "Microsoft Zira", "Microsoft David", "Microsoft Aria"
    ];
    for (var i = 0; i < preferredNames.length; i++) {
      var match = pool.find(function (v) { return v.name.indexOf(preferredNames[i]) !== -1; });
      if (match) return match;
    }
    // Prefer any voice flagged "enhanced"/"premium" if present.
    var enhanced = pool.find(function (v) { return /enhanced|premium/i.test(v.name); });
    if (enhanced) return enhanced;

    return pool[0];
  }

  function refreshVoices() {
    if (!("speechSynthesis" in window)) return;
    var voices = window.speechSynthesis.getVoices();
    if (voices && voices.length) {
      speechState.voices = voices;
      speechState.selectedVoice = pickBestVoice(voices);
      speechState.ready = true;
    }
  }

  if ("speechSynthesis" in window) {
    refreshVoices();
    window.speechSynthesis.onvoiceschanged = refreshVoices;
  }

  // Chain of {text, rate} steps spoken in sequence via onend.
  function speakSequence(steps, onAllDone) {
    if (!("speechSynthesis" in window)) {
      if (onAllDone) onAllDone();
      return;
    }
    if (!speechState.ready) refreshVoices();

    window.speechSynthesis.cancel();

    var i = 0;
    function speakNext() {
      if (i >= steps.length) {
        if (onAllDone) onAllDone();
        return;
      }
      var step = steps[i++];
      var utter = new SpeechSynthesisUtterance(step.text);
      utter.lang = "en-US";
      utter.rate = step.rate || 0.8;
      utter.pitch = 1;
      if (speechState.selectedVoice) utter.voice = speechState.selectedVoice;
      utter.onend = speakNext;
      utter.onerror = speakNext;
      window.speechSynthesis.speak(utter);
    }
    speakNext();
  }

  function speakWord(word, times) {
    times = times || 1;
    var steps = [];
    for (var i = 0; i < times; i++) steps.push({ text: word, rate: 0.78 });
    speakSequence(steps);
  }

  function speakLetters(word) {
    var steps = word.split("").map(function (ch) {
      return { text: ch.toUpperCase(), rate: 0.65 };
    });
    speakSequence(steps);
  }

  /* ============================== HOME / MENU ============================== */

  document.querySelectorAll(".profile-card").forEach(function (btn) {
    btn.addEventListener("click", function () {
      goToMenu(btn.getAttribute("data-profile"));
    });
  });

  document.querySelectorAll("[data-nav]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = btn.getAttribute("data-nav");
      if (target === "home") goHome();
      else if (target === "menu") goToMenu(state.currentProfileId);
    });
  });

  document.getElementById("btn-parent-settings").addEventListener("click", function () {
    openParentSettings();
  });

  document.getElementById("btn-study").addEventListener("click", function () {
    startStudy();
  });

  document.getElementById("btn-practice-test").addEventListener("click", function () {
    startTest(currentProfile().words, false);
  });

  document.getElementById("btn-results").addEventListener("click", function () {
    openResultsHistory();
  });

  /* ============================== STUDY MODE =============================== */

  function startStudy() {
    var p = currentProfile();
    state.study = { index: 0, words: p.words.slice(), showWord: false, showSlow: false };
    showScreen("screen-study");
    renderStudy();
  }

  function renderStudy() {
    var s = state.study;
    var total = s.words.length;
    var word = s.words[s.index] || "";

    document.getElementById("study-progress").textContent = "Word " + (s.index + 1) + " of " + total;
    document.getElementById("study-progress-fill").style.width = (((s.index + 1) / total) * 100) + "%";

    var display = document.getElementById("study-word-display");
    if (s.showWord) {
      display.innerHTML = '<span>' + escapeHtml(word) + "</span>";
    } else {
      display.innerHTML = '<span class="word-hidden-hint">Tap "Listen" to hear the word</span>';
    }

    var slow = document.getElementById("study-spell-slowly");
    if (s.showSlow) {
      slow.textContent = word.toUpperCase().split("").join(" - ");
    } else {
      slow.textContent = "";
    }

    document.getElementById("btn-study-prev").disabled = s.index === 0;
    var nextBtn = document.getElementById("btn-study-next");
    nextBtn.textContent = s.index === total - 1 ? "Restart ↺" : "Next Word ▶";
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  document.getElementById("btn-study-listen").addEventListener("click", function () {
    var word = state.study.words[state.study.index];
    speakWord(word, 1);
  });

  document.getElementById("btn-study-repeat").addEventListener("click", function () {
    var word = state.study.words[state.study.index];
    speakWord(word, 1);
  });

  document.getElementById("btn-study-show").addEventListener("click", function () {
    state.study.showWord = !state.study.showWord;
    renderStudy();
  });

  document.getElementById("btn-study-spell-slowly").addEventListener("click", function () {
    var word = state.study.words[state.study.index];
    state.study.showSlow = true;
    renderStudy();
    speakLetters(word);
  });

  document.getElementById("btn-study-next").addEventListener("click", function () {
    var s = state.study;
    if (s.index >= s.words.length - 1) {
      s.index = 0;
    } else {
      s.index++;
    }
    s.showWord = false;
    s.showSlow = false;
    renderStudy();
  });

  document.getElementById("btn-study-prev").addEventListener("click", function () {
    var s = state.study;
    if (s.index > 0) s.index--;
    s.showWord = false;
    s.showSlow = false;
    renderStudy();
  });

  document.getElementById("btn-study-shuffle").addEventListener("click", function () {
    state.study.words = shuffle(state.study.words);
    state.study.index = 0;
    state.study.showWord = false;
    state.study.showSlow = false;
    renderStudy();
  });

  /* ============================== PRACTICE TEST ============================= */

  function startTest(words, isMistakesRound) {
    state.test = {
      words: shuffle(words),
      index: 0,
      attempts: 0,
      maxAttempts: 3,
      answered: false,
      correctCount: 0,
      missed: [],
      isMistakesRound: !!isMistakesRound
    };
    showScreen("screen-test");
    renderTestQuestion(true);
  }

  function renderTestQuestion(playAudio) {
    var t = state.test;
    var total = t.words.length;

    document.getElementById("test-progress").textContent = "Word " + (t.index + 1) + " of " + total;
    document.getElementById("test-progress-fill").style.width = (((t.index + 1) / total) * 100) + "%";
    document.getElementById("test-number").textContent = "Number " + (t.index + 1);

    var feedback = document.getElementById("test-feedback");
    feedback.textContent = " ";
    feedback.className = "test-feedback";

    document.getElementById("test-answer-reveal").textContent = "";

    var input = document.getElementById("test-input");
    input.value = "";
    input.className = "test-input";
    input.disabled = false;

    document.getElementById("btn-test-show-answer").hidden = true;
    document.getElementById("btn-test-check").hidden = false;
    document.getElementById("btn-test-next").hidden = true;

    t.attempts = 0;
    t.answered = false;

    if (playAudio) {
      var word = t.words[t.index];
      speakSequence([
        { text: "Number " + (t.index + 1), rate: 0.85 },
        { text: word, rate: 0.78 },
        { text: word, rate: 0.78 }
      ]);
    }

    setTimeout(function () { input.focus(); }, 50);
  }

  function checkAnswer() {
    var t = state.test;
    if (t.answered) return;
    var input = document.getElementById("test-input");
    var word = t.words[t.index];
    var feedback = document.getElementById("test-feedback");

    if (normalize(input.value) === normalize(word)) {
      t.answered = true;
      t.correctCount++;
      input.className = "test-input correct";
      input.disabled = true;
      feedback.textContent = "✅ Correct!";
      feedback.className = "test-feedback correct";
      document.getElementById("btn-test-check").hidden = true;
      document.getElementById("btn-test-show-answer").hidden = true;
      document.getElementById("btn-test-next").hidden = false;
    } else {
      t.attempts++;
      input.className = "test-input incorrect";
      feedback.textContent = "❌ Try again";
      feedback.className = "test-feedback incorrect";
      if (t.attempts >= t.maxAttempts) {
        document.getElementById("btn-test-show-answer").hidden = false;
      }
      input.select();
    }
  }

  function showTestAnswer() {
    var t = state.test;
    if (t.answered) return;
    t.answered = true;
    var word = t.words[t.index];
    t.missed.push(word);

    var input = document.getElementById("test-input");
    input.disabled = true;
    document.getElementById("test-answer-reveal").textContent = "The word was: " + word;

    var feedback = document.getElementById("test-feedback");
    feedback.textContent = "❌ Marked incorrect";
    feedback.className = "test-feedback incorrect";

    document.getElementById("btn-test-check").hidden = true;
    document.getElementById("btn-test-show-answer").hidden = true;
    document.getElementById("btn-test-next").hidden = false;
  }

  function goToNextTestQuestion() {
    var t = state.test;
    // If word was answered incorrectly via exhausting attempts without explicit
    // "show answer" click, still record as missed (safety net).
    if (t.answered && document.getElementById("test-input").className.indexOf("incorrect") !== -1) {
      var word = t.words[t.index];
      if (t.missed.indexOf(word) === -1) t.missed.push(word);
    }

    if (t.index >= t.words.length - 1) {
      finishTest();
    } else {
      t.index++;
      renderTestQuestion(true);
    }
  }

  function finishTest() {
    var t = state.test;
    var p = currentProfile();
    var total = t.words.length;
    var percent = Math.round((t.correctCount / total) * 100);

    var result = {
      date: new Date().toISOString(),
      weekName: p.weekName,
      totalWords: total,
      correctCount: t.correctCount,
      missed: t.missed.slice(),
      isMistakesRound: t.isMistakesRound
    };
    p.results.unshift(result);
    saveData();

    document.getElementById("score-fraction").textContent = t.correctCount + " / " + total;
    document.getElementById("score-percent").textContent = percent + "%";
    document.getElementById("score-week-label").textContent = p.weekName || "";

    var missedBox = document.getElementById("missed-words-box");
    var missedList = document.getElementById("missed-words-list");
    missedList.innerHTML = "";
    if (t.missed.length === 0) {
      missedBox.classList.add("empty");
      missedBox.querySelector("h3").textContent = "Perfect score! ✨ No words to practice.";
    } else {
      missedBox.classList.remove("empty");
      missedBox.querySelector("h3").textContent = "Words to practice again";
      t.missed.forEach(function (w) {
        var li = document.createElement("li");
        li.textContent = w;
        missedList.appendChild(li);
      });
    }

    document.getElementById("btn-practice-mistakes").hidden = t.missed.length === 0;

    showScreen("screen-test-results");
  }

  document.getElementById("btn-test-check").addEventListener("click", checkAnswer);
  document.getElementById("btn-test-show-answer").addEventListener("click", showTestAnswer);
  document.getElementById("btn-test-next").addEventListener("click", goToNextTestQuestion);
  document.getElementById("btn-test-listen-again").addEventListener("click", function () {
    var word = state.test.words[state.test.index];
    speakWord(word, 2);
  });

  document.getElementById("test-input").addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (state.test.answered) {
        goToNextTestQuestion();
      } else {
        checkAnswer();
      }
    }
  });

  document.getElementById("btn-test-exit").addEventListener("click", function () {
    confirmExitTest(function () {
      goToMenu(state.currentProfileId);
    });
  });

  function confirmExitTest(onConfirmed) {
    state.pendingExit = onConfirmed;
    document.getElementById("modal-confirm-exit").hidden = false;
  }

  document.getElementById("btn-cancel-exit").addEventListener("click", function () {
    document.getElementById("modal-confirm-exit").hidden = true;
    state.pendingExit = null;
  });

  document.getElementById("btn-confirm-exit").addEventListener("click", function () {
    document.getElementById("modal-confirm-exit").hidden = true;
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    var fn = state.pendingExit;
    state.pendingExit = null;
    if (fn) fn();
  });

  /* ------------------------- Test results screen actions ------------------- */

  document.getElementById("btn-practice-mistakes").addEventListener("click", function () {
    var missed = state.test.missed.slice();
    startTest(missed, true);
  });

  document.getElementById("btn-retake-test").addEventListener("click", function () {
    startTest(currentProfile().words, false);
  });

  document.getElementById("btn-results-done").addEventListener("click", function () {
    goToMenu(state.currentProfileId);
  });

  /* ============================== MY RESULTS =============================== */

  function openResultsHistory() {
    var p = currentProfile();
    var container = document.getElementById("results-history-content");
    container.innerHTML = "";

    if (!p.results.length) {
      var empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No test results yet. Take a Practice Test to see your progress here!";
      container.appendChild(empty);
    } else {
      p.results.forEach(function (r, idx) {
        var item = document.createElement("div");
        item.className = "result-item";

        var top = document.createElement("div");
        top.className = "result-item-top";

        var left = document.createElement("div");
        var weekEl = document.createElement("div");
        weekEl.className = "result-week";
        weekEl.textContent = (r.weekName || "Spelling List") + (r.isMistakesRound ? " (mistakes retry)" : "");
        var dateEl = document.createElement("div");
        dateEl.className = "result-date";
        dateEl.textContent = formatDateHuman(r.date);
        left.appendChild(weekEl);
        left.appendChild(dateEl);

        var scoreEl = document.createElement("div");
        scoreEl.className = "result-score";
        var percent = Math.round((r.correctCount / r.totalWords) * 100);
        scoreEl.textContent = r.correctCount + "/" + r.totalWords + " (" + percent + "%)";

        top.appendChild(left);
        top.appendChild(scoreEl);
        item.appendChild(top);

        if (r.missed && r.missed.length) {
          var missedRow = document.createElement("div");
          missedRow.className = "result-missed";
          r.missed.forEach(function (w) {
            var span = document.createElement("span");
            span.textContent = w;
            missedRow.appendChild(span);
          });
          item.appendChild(missedRow);

          var practiceBtn = document.createElement("button");
          practiceBtn.className = "result-practice-btn";
          practiceBtn.textContent = "Practice these words";
          practiceBtn.addEventListener("click", function () {
            startTest(r.missed.slice(), true);
          });
          item.appendChild(practiceBtn);
        }

        container.appendChild(item);
      });
    }

    showScreen("screen-results");
  }

  /* ============================== PARENT SETTINGS =========================== */

  function openParentSettings() {
    // Default to whichever profile is currently open, else Hillary.
    state.parentProfileId = state.currentProfileId || "hillary";
    renderParentSettings();
    showScreen("screen-parent");
  }

  function renderParentSettings() {
    var p = state.data.profiles[state.parentProfileId];

    document.querySelectorAll(".parent-profile-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-parent-profile") === state.parentProfileId);
    });

    document.getElementById("parent-week-name").value = p.weekName || "";
    document.getElementById("parent-words-textarea").value = p.words.join("\n");
    document.getElementById("parent-save-confirm").textContent = "";

    renderParentHistory();
  }

  function renderParentHistory() {
    var p = state.data.profiles[state.parentProfileId];
    var list = document.getElementById("parent-history-list");
    list.innerHTML = "";

    if (!p.history.length) {
      var empty = document.createElement("p");
      empty.className = "empty-state";
      empty.style.marginTop = "8px";
      empty.textContent = "Aún no hay semanas guardadas.";
      list.appendChild(empty);
      return;
    }

    p.history.forEach(function (h) {
      var item = document.createElement("div");
      item.className = "parent-history-item";

      var info = document.createElement("div");
      var name = document.createElement("div");
      name.className = "parent-history-item-name";
      name.textContent = h.weekName;
      var meta = document.createElement("div");
      meta.className = "parent-history-item-meta";
      meta.textContent = h.words.length + " palabras · guardado " + formatDateHuman(h.savedAt);
      info.appendChild(name);
      info.appendChild(meta);

      var restoreBtn = document.createElement("button");
      restoreBtn.className = "parent-history-restore";
      restoreBtn.textContent = "Ver / Usar";
      restoreBtn.addEventListener("click", function () {
        document.getElementById("parent-week-name").value = h.weekName;
        document.getElementById("parent-words-textarea").value = h.words.join("\n");
      });

      item.appendChild(info);
      item.appendChild(restoreBtn);
      list.appendChild(item);
    });
  }

  document.querySelectorAll(".parent-profile-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.parentProfileId = btn.getAttribute("data-parent-profile");
      renderParentSettings();
    });
  });

  document.getElementById("btn-save-words").addEventListener("click", function () {
    var p = state.data.profiles[state.parentProfileId];
    var weekName = document.getElementById("parent-week-name").value.trim() || p.weekName;
    var words = parseWordsInput(document.getElementById("parent-words-textarea").value);

    if (!words.length) {
      document.getElementById("parent-save-confirm").textContent = "Agrega al menos una palabra.";
      document.getElementById("parent-save-confirm").style.color = "var(--red)";
      return;
    }

    // Archive the previous list into history if it's different from the new one.
    var previousIsDifferent =
      p.weekName !== weekName || JSON.stringify(p.words) !== JSON.stringify(words);

    if (previousIsDifferent && p.words.length) {
      p.history.unshift({
        weekName: p.weekName,
        words: p.words.slice(),
        savedAt: new Date().toISOString()
      });
      // Keep history reasonable in size.
      if (p.history.length > 52) p.history.length = 52;
    }

    p.weekName = weekName;
    p.words = words;
    saveData();

    document.getElementById("parent-save-confirm").style.color = "var(--green)";
    document.getElementById("parent-save-confirm").textContent = "✅ Saved! " + words.length + " words for " + p.name + ".";
    renderParentHistory();

    // Keep menu screen in sync if it's the profile currently being viewed.
    if (state.currentProfileId === state.parentProfileId) {
      document.getElementById("menu-week-label").textContent = p.weekName;
    }
  });

  /* ================================ INIT ==================================== */

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("service-worker.js").catch(function (err) {
          console.warn("Service worker registration failed:", err);
        });
      });
    }
  }

  function init() {
    goHome();
    registerServiceWorker();
  }

  init();
})();
