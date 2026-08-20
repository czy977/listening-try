(() => {
  let lesson = null, cards = [];
  const $ = id => document.getElementById(id);
  const WORD_RE = /[A-Za-z0-9]+(?:[’'][A-Za-z]+)*/g, audio = $("audio");
  const state = { lessonId: null, index: 0, loop: true, loopPasses: 0, loopTimer: null, complete: false, calibration: false, objectUrl: null, revealed: [], timings: {} };
  const progressKey = () => `bbc-listening-index-${state.lessonId}`;
  const timingsKey = () => `bbc-listening-timings-v2-${state.lessonId}`;

  const card = () => cards[state.index];
  const normalise = value => value.toLowerCase().replace(/[’‘]/g, "'").trim();
  const words = () => Array.from(card().fullText.matchAll(WORD_RE), m => ({ text: m[0], normalised: normalise(m[0]) }));
  function timing() { const c = card(), saved = state.timings[c.id]; return saved || { start: c.start, end: c.end }; }
  function clearLoopTimer() { if (state.loopTimer) { clearTimeout(state.loopTimer); state.loopTimer = null; } }
  function stopAudio() { clearLoopTimer(); audio.pause(); }
  function updateLoopButton() {
    const remaining = Math.max(0, 3 - state.loopPasses);
    $("loopBtn").setAttribute("aria-pressed", String(state.loop));
    $("loopBtn").textContent = state.loop ? `↻ 循环：开（剩余 ${remaining} 遍）` : "↻ 循环：关";
  }

  function renderDictation(force = false) {
    const display = $("dictationDisplay"); display.replaceChildren();
    if (!force && !state.revealed.some(Boolean)) return;
    const text = card().fullText, matches = Array.from(text.matchAll(WORD_RE)); let cursor = 0;
    matches.forEach((match, index) => {
      display.append(document.createTextNode(text.slice(cursor, match.index)));
      const span = document.createElement("span");
      span.className = state.revealed[index] ? "dictation-word" : "dictation-blank";
      span.textContent = match[0];
      if (!state.revealed[index]) span.setAttribute("aria-label", "未填写单词");
      display.append(span); cursor = match.index + match[0].length;
    });
    display.append(document.createTextNode(text.slice(cursor)));
  }

  function vocabularyFor(c) {
    if (c.vocabulary?.length) return c.vocabulary;
    return (c.answers || []).slice(0, 3).map(term => ({ term, meaningCn: c.meaningCn, definitionEn: c.definitionEn }));
  }
  function showAnswer(complete, message) {
    const c = card(); state.complete = complete; $("fullSentence").textContent = c.fullText;
    const list = $("vocabularyList"); list.replaceChildren();
    vocabularyFor(c).forEach(item => {
      const box = document.createElement("article"); box.className = "vocabulary-item";
      const term = document.createElement("strong"); term.textContent = item.term;
      const cn = document.createElement("p"); cn.textContent = `中文：${item.meaningCn}`;
      const en = document.createElement("p"); en.textContent = `English: ${item.definitionEn}`;
      box.append(term, cn, en); list.append(box);
    });
    $("answerPanel").classList.remove("hidden"); $("feedback").textContent = message;
    $("feedback").className = `feedback ${complete ? "ok" : ""}`;
  }

  function updateTimingText() { const t = timing(); $("startTime").textContent = t.start.toFixed(2); $("endTime").textContent = t.end.toFixed(2); }
  function playCurrent() {
    if (!audio.src) { $("audioStatus").textContent = `请先选择 ${lesson.audioFileHint}`; return; }
    const t = timing(); audio.playbackRate = Number($("speedSelect").value); audio.currentTime = Math.max(0, t.start);
    audio.play().catch(() => { $("audioStatus").textContent = "浏览器阻止了自动播放，请点击“播放本句”。"; });
  }
  function render({ autoplay = false } = {}) {
    stopAudio(); state.loop = true; state.loopPasses = 0; updateLoopButton(); state.complete = false; state.revealed = words().map(() => false); const c = card();
    $("speaker").textContent = c.speaker; $("progress").textContent = `${state.index + 1} / ${cards.length}`;
    $("answerInput").value = ""; $("feedback").textContent = ""; $("feedback").className = "feedback";
    $("answerPanel").classList.add("hidden"); $("copyStatus").textContent = ""; $("prevBtn").disabled = state.index === 0;
    $("nextBtn").textContent = state.index === cards.length - 1 ? "完成" : "下一句 →";
    $("calibrationPanel").classList.toggle("hidden", !state.calibration); renderDictation(); updateTimingText();
    localStorage.setItem(progressKey(), String(state.index));
    setTimeout(() => { $("answerInput").focus(); if (autoplay && audio.src) playCurrent(); }, 0);
  }

  function submitWords() {
    const guesses = ($("answerInput").value.match(WORD_RE) || []).map(normalise);
    if (!guesses.length) { $("feedback").textContent = "请先输入你听到的单词。"; $("feedback").className = "feedback bad"; return; }
    const target = words(); let found = 0;
    guesses.forEach(guess => { const i = target.findIndex((w, index) => !state.revealed[index] && w.normalised === guess); if (i !== -1) { state.revealed[i] = true; found++; } });
    $("answerInput").value = ""; renderDictation(true); const remaining = state.revealed.filter(v => !v).length;
    if (!remaining) showAnswer(true, "✓ 整句完成！再次按 Enter 可进入下一句。");
    else { $("feedback").textContent = found ? `找到了 ${found} 个正确单词，还有 ${remaining} 个位置。` : "这次没有找到新的正确单词，请再听一次。"; $("feedback").className = `feedback ${found ? "ok" : "bad"}`; }
    $("answerInput").focus();
  }
  function next() { if (state.index < cards.length - 1) { state.index++; render({ autoplay: true }); } else { stopAudio(); $("feedback").textContent = "本期练习完成。"; $("feedback").className = "feedback ok"; } }
  function prev() { if (state.index > 0) { state.index--; render(); } }
  function saveTiming(start, end) { state.timings[card().id] = { start: Math.max(0, Number(start.toFixed(2))), end: Math.max(start + .25, Number(end.toFixed(2))) }; localStorage.setItem(timingsKey(), JSON.stringify(state.timings)); updateTimingText(); }

  $("audioFile").addEventListener("change", event => { const file = event.target.files?.[0]; if (!file) return; if (state.objectUrl) URL.revokeObjectURL(state.objectUrl); state.objectUrl = URL.createObjectURL(file); audio.src = state.objectUrl; $("audioStatus").textContent = `已载入：${file.name}`; });
  $("playBtn").addEventListener("click", playCurrent); $("pauseBtn").addEventListener("click", stopAudio);
  $("loopBtn").addEventListener("click", () => {
    clearLoopTimer();
    if (state.loop) { state.loop = false; updateLoopButton(); return; }
    state.loop = true; state.loopPasses = 0; updateLoopButton(); playCurrent();
  });
  audio.addEventListener("timeupdate", () => {
    const t = timing();
    if (audio.currentTime < t.end) return;
    audio.pause(); audio.currentTime = t.start;
    if (!state.loop) return;
    state.loopPasses += 1; updateLoopButton();
    if (state.loopPasses >= 3) { state.loop = false; updateLoopButton(); return; }
    state.loopTimer = setTimeout(() => { state.loopTimer = null; if (state.loop) audio.play(); }, 2000);
  });
  $("speedSelect").addEventListener("change", () => { audio.playbackRate = Number($("speedSelect").value); });
  $("checkBtn").addEventListener("click", submitWords);
  $("showAnswerBtn").addEventListener("click", () => { state.revealed = state.revealed.map(() => true); renderDictation(true); showAnswer(false, "已显示完整答案。建议重新播放并跟读一遍。"); });
  $("hintBtn").addEventListener("click", () => { const i = state.revealed.findIndex(v => !v); if (i < 0) return; state.revealed[i] = true; renderDictation(true); const remaining = state.revealed.filter(v => !v).length; if (!remaining) showAnswer(true, "✓ 整句完成！"); else { $("feedback").textContent = `已提示一个单词，还有 ${remaining} 个位置。`; $("feedback").className = "feedback"; } });
  $("copySentenceBtn").addEventListener("click", async () => { const text = card().fullText; try { await navigator.clipboard.writeText(text); } catch { const temp = document.createElement("textarea"); temp.value = text; document.body.appendChild(temp); temp.select(); document.execCommand("copy"); temp.remove(); } $("copyStatus").textContent = "已复制完整句子。"; });
  $("prevBtn").addEventListener("click", prev); $("nextBtn").addEventListener("click", next);
  $("answerInput").addEventListener("keydown", event => { if (event.key === "Enter") state.complete ? next() : submitWords(); });
  $("calibrationToggle").addEventListener("click", () => { state.calibration = !state.calibration; $("calibrationPanel").classList.toggle("hidden", !state.calibration); $("calibrationToggle").textContent = state.calibration ? "退出校准" : "校准模式"; });
  document.querySelectorAll("[data-adjust]").forEach(button => button.addEventListener("click", () => { const t = timing(), delta = Number(button.dataset.delta); if (button.dataset.adjust === "start") t.start += delta; else t.end += delta; saveTiming(t.start, t.end); playCurrent(); }));
  $("resetTimingBtn").addEventListener("click", () => { delete state.timings[card().id]; localStorage.setItem(timingsKey(), JSON.stringify(state.timings)); updateTimingText(); });
  $("exportBtn").addEventListener("click", () => { const data = cards.map(c => ({ id: c.id, start: state.timings[c.id]?.start ?? c.start, end: state.timings[c.id]?.end ?? c.end })); const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = "calibrated-timings.json"; a.click(); URL.revokeObjectURL(url); });
  function loadLessonScript(entry) {
    window.LESSON_LIBRARY = window.LESSON_LIBRARY || {};
    if (window.LESSON_LIBRARY[entry.id]) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = entry.script;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`无法载入课程：${entry.title}`));
      document.head.append(script);
    });
  }

  async function activateLesson(id) {
    const entry = window.LESSON_CATALOG.find(item => item.id === id);
    if (!entry) return;
    stopAudio();
    try { await loadLessonScript(entry); } catch (error) { $("audioStatus").textContent = error.message; return; }
    state.lessonId = id; lesson = window.LESSON_LIBRARY[id]; cards = lesson.cards;
    state.index = Math.max(0, Math.min(cards.length - 1, Number(localStorage.getItem(progressKey()) || 0)));
    const saved = localStorage.getItem(timingsKey());
    const legacy = id === "260813" ? localStorage.getItem("bbc-listening-timings-v2") : null;
    state.timings = JSON.parse(saved || legacy || "{}");
    if (state.objectUrl) { URL.revokeObjectURL(state.objectUrl); state.objectUrl = null; }
    audio.removeAttribute("src"); audio.load(); $("audioFile").value = "";
    $("lessonTitle").textContent = lesson.title;
    $("lessonMeta").textContent = `${lesson.series} · ${lesson.episodeDate} · ${cards.length} 句整句精听`;
    $("audioStatus").textContent = `请选择对应音频：${lesson.audioFileHint}`;
    localStorage.setItem("bbc-listening-selected-lesson", id);
    render();
  }

  const catalog = window.LESSON_CATALOG || [];
  catalog.forEach(entry => {
    const option = document.createElement("option");
    option.value = entry.id; option.textContent = `${entry.episodeDate} · ${entry.title}`;
    $("lessonSelect").append(option);
  });
  $("lessonSelect").addEventListener("change", event => activateLesson(event.target.value));
  const preferred = localStorage.getItem("bbc-listening-selected-lesson");
  const initial = catalog.some(item => item.id === preferred) ? preferred : catalog[0]?.id;
  if (initial) { $("lessonSelect").value = initial; activateLesson(initial); }
  else { $("audioStatus").textContent = "课程目录为空，请先添加课程。"; }
})();
