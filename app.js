const STORAGE_KEY = "dac_tracker_v3";
const OLD_STORAGE_KEY = "dac_tracker_v2";
const QUESTIONS_KEY = "dac_questions_v1";

let state = {};
let questionsIndex = {};  // taskId -> question[]
let questionsState = {};  // questionId -> { user_answer, ai_eval, eval_date, score, show_model_answer }
let questionsLoaded = false;
let saveTimer = null;
let questSaveTimer = null;
let availableModels = [];
let evalMode = "integration";
const EVAL_MODE_KEY = "dac_eval_mode";

const EVAL_PROMPT_TEMPLATE =
`Ты — экзаменатор по технологии Docs as Code. Оцени ответ ученика на открытый вопрос и дай развёрнутый комментарий на русском языке.

ВОПРОС: {question}

КЛЮЧЕВЫЕ МОМЕНТЫ, которые должны быть в полном ответе:
{key_points}

ЭТАЛОННЫЙ ОТВЕТ (для сравнения):
{model_answer}

ОТВЕТ УЧЕНИКА:
{user_answer}

Дай оценку строго в формате:

ОЦЕНКА: [0 | 1 | 2 | 3]
- 0: ответ неверный, отсутствует понимание
- 1: базовое понимание, много пробелов
- 2: хороший ответ, упущены 1–2 важных момента
- 3: исчерпывающий ответ

ЧТО ПРАВИЛЬНО: ...

ЧТО УПУЩЕНО ИЛИ НЕТОЧНО: ...

РЕКОМЕНДАЦИЯ: что изучить дополнительно (1–2 предложения).`;

// === Storage abstraction ===
const appStorage = {
  async get(key) {
    try {
      if (typeof window.storage !== "undefined") return window.storage.get(key);
    } catch (e) { /* fall through */ }
    const value = localStorage.getItem(key);
    return value ? { value } : null;
  },
  async set(key, value) {
    try {
      if (typeof window.storage !== "undefined") return window.storage.set(key, value);
    } catch (e) { /* fall through */ }
    localStorage.setItem(key, value);
  }
};

// === Task state ===
async function loadState() {
  try {
    const result = await appStorage.get(STORAGE_KEY);
    if (result && result.value) {
      state = JSON.parse(result.value);
    } else {
      try {
        const old = await appStorage.get(OLD_STORAGE_KEY);
        if (old && old.value) {
          state = migrateFromV2(JSON.parse(old.value));
          await appStorage.set(STORAGE_KEY, JSON.stringify(state));
        }
      } catch (e) { /* no old data */ }
    }
  } catch (e) { state = {}; }
  PHASES.forEach(phase => {
    if (!state[phase.id]) state[phase.id] = { tasks: {} };
    phase.tasks.forEach(task => {
      if (!state[phase.id].tasks[task.id]) {
        state[phase.id].tasks[task.id] = { done: false, comment: "" };
      }
    });
  });
}

function migrateFromV2(oldState) {
  const s = {};
  ["phase1", "phase2", "phase3", "phase4"].forEach(pid => { if (oldState[pid]) s[pid] = oldState[pid]; });
  if (oldState.phase5) {
    s.phase6 = { tasks: {} };
    for (let i = 1; i <= 8; i++) {
      if (oldState.phase5.tasks[`p5t${i}`]) s.phase6.tasks[`p6t${i}`] = oldState.phase5.tasks[`p5t${i}`];
    }
  }
  if (oldState.phase6) {
    s.phase7 = { tasks: {} };
    const map = { p6t1:"p7t1", p6t2:"p7t2", p6t3:"p7t3", p6t4:"p7t4", p6t5:"p7t5", p6t6:"p7t7", p6t7:"p7t8", p6t8:"p7t11" };
    Object.entries(map).forEach(([o, n]) => { if (oldState.phase6.tasks[o]) s.phase7.tasks[n] = oldState.phase6.tasks[o]; });
  }
  return s;
}

async function saveState() {
  try { await appStorage.set(STORAGE_KEY, JSON.stringify(state)); showSaveIndicator(); }
  catch (e) { console.error("Save failed:", e); }
}

function debouncedSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 400);
}

function showSaveIndicator(msg) {
  const el = document.getElementById("save-indicator");
  if (msg) el.textContent = msg;
  el.classList.add("show");
  clearTimeout(showSaveIndicator._t);
  showSaveIndicator._t = setTimeout(() => {
    el.classList.remove("show");
    el.textContent = "✓ Сохранено";
  }, 2000);
}

// === Questions state ===
async function loadQuestionsState() {
  try {
    const result = await appStorage.get(QUESTIONS_KEY);
    if (result && result.value) questionsState = JSON.parse(result.value);
  } catch (e) { questionsState = {}; }
}

async function saveQuestionsState() {
  try { await appStorage.set(QUESTIONS_KEY, JSON.stringify(questionsState)); }
  catch (e) { console.error("Questions save failed:", e); }
}

function debouncedSaveQuestions() {
  clearTimeout(questSaveTimer);
  questSaveTimer = setTimeout(saveQuestionsState, 400);
}

// === Backend init: fetch /api/config and /api/models ===
async function initBackend() {
  try {
    const [cfgRes, modRes] = await Promise.allSettled([
      fetch("/api/config"),
      fetch("/api/models")
    ]);
    if (cfgRes.status === "fulfilled" && cfgRes.value.ok) {
      const cfg = await cfgRes.value.json();
      if (cfg.googleClientId) {
        window.APP_CONFIG = window.APP_CONFIG || {};
        window.APP_CONFIG.googleClientId = cfg.googleClientId;
      }
    }
    if (modRes.status === "fulfilled" && modRes.value.ok) {
      const data = await modRes.value.json();
      availableModels = data.models || [];
    }
  } catch (e) { /* backend not available, static mode */ }
}

// === Eval mode (Integration / Manual) ===
function applyEvalMode(mode) {
  evalMode = mode;
  document.body.classList.toggle("eval-integration", mode === "integration");
  document.body.classList.toggle("eval-manual",      mode === "manual");
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.classList.toggle("mode-btn-active", btn.dataset.mode === mode);
  });
}

function initEvalMode() {
  const saved = localStorage.getItem(EVAL_MODE_KEY) || "integration";
  applyEvalMode(saved);
  document.querySelectorAll(".mode-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      localStorage.setItem(EVAL_MODE_KEY, mode);
      applyEvalMode(mode);
    });
  });
}

// === Migrate questionsState: old ai_eval/score → history array ===
function migrateQuestionsStateToV2() {
  let changed = false;
  Object.keys(questionsState).forEach(qid => {
    const qs = questionsState[qid];
    if (!qs.history) {
      qs.history = [];
      if (qs.ai_eval) {
        qs.history.push({
          date:        qs.eval_date || new Date().toLocaleDateString("ru-RU"),
          model_label: "ручной ввод",
          score:       qs.score ?? null,
          text:        qs.ai_eval
        });
      }
      changed = true;
    }
  });
  if (changed) saveQuestionsState();
}

// === Load questions.json ===
async function loadQuestions() {
  try {
    const res = await fetch("questions.json");
    if (!res.ok) return;
    const data = await res.json();
    questionsIndex = buildQuestionsIndex(data);
    questionsLoaded = Object.keys(questionsIndex).length > 0;
  } catch (e) {
    questionsLoaded = false;
  }
}

function buildQuestionsIndex(data) {
  const index = {};
  (data.phases || []).forEach(phase => {
    (phase.questions || []).forEach(q => {
      if (!index[q.task_id]) index[q.task_id] = [];
      index[q.task_id].push(q);
    });
  });
  return index;
}

function mergeQuestionsData(data) {
  const newIndex = buildQuestionsIndex(data);
  Object.assign(questionsIndex, newIndex);
  questionsLoaded = Object.keys(questionsIndex).length > 0;
}

// === Score logic ===

const TASK_PASS_SCORE = 1.5;

// Weighted average: difficulty is the weight (1/2/3). Returns null if no scores set.
function calcWeightedScore(taskQuestions) {
  let weightedSum = 0, totalWeight = 0;
  taskQuestions.forEach(q => {
    const s = questionsState[q.id];
    if (s != null && s.score != null) {
      weightedSum += s.score * q.difficulty;
      totalWeight += q.difficulty;
    }
  });
  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

// Tasks with questions require all scores and a passing weighted average.
function canCheckTask(taskQuestions) {
  if (!taskQuestions.length) return true;
  const allScored = taskQuestions.every(q => {
    const s = questionsState[q.id];
    return s != null && s.score != null;
  });
  if (!allScored) return false;
  const ws = calcWeightedScore(taskQuestions);
  return ws !== null && ws >= TASK_PASS_SCORE;
}

// Update the ⌀ badge in the task row
function updateTaskWeightedScore(taskId) {
  const el = document.getElementById(`wscore-${taskId}`);
  if (!el) return;
  const qs = questionsIndex[taskId] || [];
  const score = calcWeightedScore(qs);
  if (score === null) {
    el.textContent = "";
    el.className = "task-wscore";
    return;
  }
  const str = Number.isInteger(score * 10) ? score.toFixed(1) : score.toFixed(1);
  el.textContent = `⌀ ${str}`;
  el.className = "task-wscore" + (score >= TASK_PASS_SCORE ? " wscore-hi" : score >= 1 ? " wscore-mid" : " wscore-lo");
}

// Temporarily show a notice under the task
function showTaskNotice(taskEl, message) {
  const el = taskEl.querySelector(".task-notice");
  if (!el) return;
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("visible"), 5000);
}

// === Questions progress per phase ===
function countPhaseQuestions(phase) {
  let total = 0, answered = 0;
  phase.tasks.forEach(task => {
    const qs = questionsIndex[task.id] || [];
    total += qs.length;
    qs.forEach(q => {
      const s = questionsState[q.id];
      if (s && s.user_answer && s.user_answer.trim()) answered++;
    });
  });
  return { total, answered };
}

function calcPhaseKnowledgeScore(phase) {
  let sum = 0, count = 0;
  phase.tasks.forEach(task => {
    (questionsIndex[task.id] || []).forEach(q => {
      const s = questionsState[q.id];
      if (s?.score != null) { sum += s.score; count++; }
    });
  });
  return count > 0 ? { avg: sum / count, count } : null;
}

function formatPhaseKnowledge(k) {
  if (!k) return "";
  const word = k.count === 1 ? "вопрос" : k.count < 5 ? "вопроса" : "вопросов";
  return `Знания: ${k.avg.toFixed(1)} / 3 · ${k.count} ${word}`;
}

// === Render questions block (lazy) ===
function renderQuestionsBlock(container, taskQuestions, taskId) {
  const diffLabel = { 1: "① Базовый", 2: "② Средний", 3: "③ Продвинутый" };
  const diffClass = { 1: "diff-1", 2: "diff-2", 3: "diff-3" };

  const header = document.createElement("div");
  header.className = "questions-header";
  header.textContent = `Вопросы для самопроверки · ${taskQuestions.length}`;
  container.appendChild(header);

  taskQuestions.forEach((q, i) => {
    const qs = questionsState[q.id] || {};
    const history = qs.history || [];
    const latest = history[history.length - 1] || null;

    const qEl = document.createElement("div");
    qEl.className = "question-item";

    const keyPointsHtml = q.key_points.map(p => `<li>${escHtml(p)}</li>`).join("");
    const modelOptions = buildModelOptions();

    qEl.innerHTML = `
      <div class="q-header">
        <span class="diff-badge ${diffClass[q.difficulty]}">${diffLabel[q.difficulty]}</span>
        <span class="q-num">${i + 1} / ${taskQuestions.length}</span>
      </div>
      <div class="q-text">${escHtml(q.question)}</div>
      <div class="q-answer-wrap">
        <div class="q-label">Ваш ответ</div>
        <textarea class="q-answer-ta" placeholder="Напишите ответ своими словами...">${escHtml(qs.user_answer || "")}</textarea>
      </div>
      <div class="q-actions">
        <div class="q-check-integration">
          <select class="q-model-select"${!modelOptions.hasAvailable ? " disabled" : ""}>${modelOptions.html}</select>
          <button class="btn-check"${!modelOptions.hasAvailable ? " disabled" : ""}>🤖 Проверить</button>
          ${!modelOptions.hasAvailable ? `<button class="btn-connect-server">↻ Подключиться</button>` : ""}
        </div>
        <div class="q-check-manual">
          <button class="btn-copy-prompt">📋 Скопировать промпт</button>
        </div>
        <button class="btn-model-toggle">${qs.show_model_answer ? "Скрыть эталон ▲" : "Эталонный ответ ▼"}</button>
      </div>
      <div class="q-checking" style="display:none">
        <span class="q-checking-spinner"></span> Проверяем ответ…
      </div>
      <div class="q-eval-result" style="display:${latest ? "block" : "none"}">
        ${latest ? buildEvalEntryHtml(latest) : ""}
        ${history.length > 1 ? `<button class="q-history-toggle">История попыток (${history.length}) ▼</button>` : ""}
      </div>
      <div class="q-history" style="display:none">
        ${history.slice(0, -1).reverse().map(e => buildEvalEntryHtml(e, true)).join("")}
      </div>
      <div class="model-answer-block" style="display:${qs.show_model_answer ? "block" : "none"}">
        <div class="q-label">Ключевые моменты</div>
        <ul class="key-points-list">${keyPointsHtml}</ul>
        <div class="q-label" style="margin-top:10px">Эталонный ответ</div>
        <div class="model-answer-text">${escHtml(q.model_answer)}</div>
      </div>
    `;

    if (modelOptions.firstId) qEl.querySelector(".q-model-select").value = modelOptions.firstId;

    const answerTa    = qEl.querySelector(".q-answer-ta");
    const checkBtn    = qEl.querySelector(".btn-check");
    const modelSelect = qEl.querySelector(".q-model-select");
    const modelToggle = qEl.querySelector(".btn-model-toggle");
    const modelBlock  = qEl.querySelector(".model-answer-block");
    const checkingEl  = qEl.querySelector(".q-checking");
    const evalResult  = qEl.querySelector(".q-eval-result");
    const historyEl   = qEl.querySelector(".q-history");

    answerTa.addEventListener("input", () => {
      if (!questionsState[q.id]) questionsState[q.id] = {};
      questionsState[q.id].user_answer = answerTa.value;
      debouncedSaveQuestions();
      updateQuestionsProgress();
    });

    checkBtn.addEventListener("click", async () => {
      const answer = answerTa.value.trim();
      if (!answer) { alert("Сначала напишите ответ"); return; }
      const modelId = modelSelect.value;
      if (!modelId) { alert("Выберите модель"); return; }

      checkBtn.disabled = true;
      modelSelect.disabled = true;
      checkingEl.style.display = "flex";
      evalResult.style.display = "none";

      try {
        const result = await callEvaluateApi(modelId, buildEvalPrompt(q, answer));
        const score  = parseEvalScore(result.text);
        const entry  = {
          date:        new Date().toLocaleDateString("ru-RU"),
          model_label: result.model_label,
          score,
          text:        result.text
        };

        if (!questionsState[q.id]) questionsState[q.id] = {};
        const qst = questionsState[q.id];
        if (!qst.history) qst.history = [];
        qst.history.push(entry);
        qst.score = score;

        debouncedSaveQuestions();

        const allHistory = qst.history;
        evalResult.innerHTML =
          buildEvalEntryHtml(entry) +
          (allHistory.length > 1
            ? `<button class="q-history-toggle">История попыток (${allHistory.length}) ▼</button>`
            : "");
        evalResult.style.display = "block";

        historyEl.innerHTML = allHistory.slice(0, -1).reverse().map(e => buildEvalEntryHtml(e, true)).join("");

        wireHistoryToggle(evalResult, historyEl, allHistory.length);
        updateTaskWeightedScore(taskId);
        updateQuestionsProgress();
      } catch (e) {
        alert("Ошибка проверки: " + e.message);
      } finally {
        checkBtn.disabled = false;
        modelSelect.disabled = false;
        checkingEl.style.display = "none";
      }
    });

    modelToggle.addEventListener("click", () => {
      const visible = modelBlock.style.display !== "none";
      modelBlock.style.display = visible ? "none" : "block";
      modelToggle.textContent = visible ? "Эталонный ответ ▼" : "Скрыть эталон ▲";
      if (!questionsState[q.id]) questionsState[q.id] = {};
      questionsState[q.id].show_model_answer = !visible;
      debouncedSaveQuestions();
    });

    wireHistoryToggle(evalResult, historyEl, history.length);

    const connectBtn = qEl.querySelector(".btn-connect-server");
    if (connectBtn) {
      connectBtn.addEventListener("click", async () => {
        connectBtn.disabled = true;
        connectBtn.textContent = "Подключение…";
        await initBackend();
        if (availableModels.length) {
          const opts = buildModelOptions();
          const sel = qEl.querySelector(".q-model-select");
          sel.innerHTML = opts.html;
          sel.disabled = !opts.hasAvailable;
          if (opts.firstId) sel.value = opts.firstId;
          const btn = qEl.querySelector(".btn-check");
          btn.disabled = !opts.hasAvailable;
          connectBtn.remove();
        } else {
          connectBtn.disabled = false;
          connectBtn.textContent = "↻ Нет ответа";
        }
      });
    }

    const copyPromptBtn = qEl.querySelector(".btn-copy-prompt");
    if (copyPromptBtn) {
      copyPromptBtn.addEventListener("click", async () => {
        const answer = answerTa.value.trim() || "(ответ не написан)";
        const prompt = buildEvalPrompt(q, answer);
        try {
          await navigator.clipboard.writeText(prompt);
          const orig = copyPromptBtn.textContent;
          copyPromptBtn.textContent = "✓ Скопировано";
          setTimeout(() => { copyPromptBtn.textContent = orig; }, 1500);
        } catch (e) {
          alert("Не удалось скопировать.");
        }
      });
    }

    container.appendChild(qEl);
  });
}

function buildModelOptions() {
  if (!availableModels.length) {
    return { html: `<option value="" disabled selected>Сервер недоступен</option>`, hasAvailable: false, firstId: null };
  }
  const html = availableModels.map(m =>
    `<option value="${m.id}"${!m.available ? " disabled" : ""}>${escHtml(m.label)}${!m.available ? " (нет ключа)" : ""}</option>`
  ).join("");
  const first = availableModels.find(m => m.available);
  return { html, hasAvailable: !!first, firstId: first?.id ?? null };
}

function buildEvalEntryHtml(entry, isHistory = false) {
  const sc = entry.score;
  const scoreClass = sc >= 3 ? "s3" : sc >= 2 ? "s2" : sc >= 1 ? "s1" : "s0";
  const scoreText  = sc != null ? `${sc}/3` : "?/3";
  return `
    <div class="q-eval-entry${isHistory ? " q-eval-entry-history" : ""}">
      <div class="q-eval-entry-header">
        <span class="q-eval-score-badge ${scoreClass}">${scoreText}</span>
        <span class="q-eval-meta">${escHtml(entry.model_label)} · ${entry.date}</span>
      </div>
      <div class="q-eval-text">${escHtml(entry.text)}</div>
    </div>`;
}

function wireHistoryToggle(evalResult, historyEl, count) {
  const btn = evalResult.querySelector(".q-history-toggle");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const open = historyEl.style.display !== "none";
    historyEl.style.display = open ? "none" : "block";
    btn.textContent = open ? `История попыток (${count}) ▼` : `История попыток (${count}) ▲`;
  });
}

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function callEvaluateApi(modelId, prompt) {
  const resp = await fetch("/api/evaluate", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ model_id: modelId, prompt })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || `HTTP ${resp.status}`);
  }
  return resp.json(); // { text, model_label }
}

function parseEvalScore(text) {
  const m = text.match(/ОЦЕНКА:\s*([0-3])/i);
  return m ? parseInt(m[1]) : null;
}

function buildEvalPrompt(q, userAnswer) {
  const keyPointsText = q.key_points.map((p, i) => `${i + 1}. ${p}`).join("\n");
  return EVAL_PROMPT_TEMPLATE
    .replace("{question}", q.question)
    .replace("{key_points}", keyPointsText)
    .replace("{model_answer}", q.model_answer)
    .replace("{user_answer}", userAnswer);
}

// === Google Calendar link ===
function buildGoogleCalendarUrl(phaseTitle, taskText) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);
  const end = new Date(tomorrow.getTime() + 60 * 60 * 1000);
  const fmt = d => {
    const p = n => String(n).padStart(2, "0");
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "T" + p(d.getHours()) + p(d.getMinutes()) + "00";
  };
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `[Docs as Code] ${taskText}`,
    dates: `${fmt(tomorrow)}/${fmt(end)}`,
    details: `Задача из плана изучения Docs as Code.\n\nЭтап: ${phaseTitle}\n\nПодробности: задача из персонального трекера. Перенесите время и длительность под себя.`
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// === Google Tasks OAuth + API ===
let _gTokenClient = null;
let _gTokenResolve = null;
let _gTokenReject = null;
let _gAccessToken = null;
let _gTokenExpiry = 0;

function ensureGisTokenClient() {
  if (_gTokenClient) return;
  _gTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: window.APP_CONFIG.googleClientId,
    scope: "https://www.googleapis.com/auth/tasks",
    callback: (resp) => {
      if (resp.error) {
        _gTokenReject?.(new Error(resp.error_description || resp.error));
      } else {
        _gAccessToken = resp.access_token;
        _gTokenExpiry = Date.now() + (resp.expires_in - 60) * 1000;
        _gTokenResolve?.(resp.access_token);
      }
      _gTokenResolve = null;
      _gTokenReject = null;
    }
  });
}

function getGoogleToken() {
  return new Promise((resolve, reject) => {
    if (_gAccessToken && Date.now() < _gTokenExpiry) { resolve(_gAccessToken); return; }
    ensureGisTokenClient();
    _gTokenResolve = resolve;
    _gTokenReject = reject;
    _gTokenClient.requestAccessToken({ prompt: "" });
  });
}

async function addGoogleTask(phaseTitle, taskText) {
  const token = await getGoogleToken();
  const due = new Date();
  due.setDate(due.getDate() + 1);
  due.setHours(0, 0, 0, 0);
  const resp = await fetch(
    "https://tasks.googleapis.com/tasks/v1/lists/@default/tasks",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `[Docs as Code] ${taskText}`,
        notes: `Этап: ${phaseTitle}`,
        due: due.toISOString()
      })
    }
  );
  if (!resp.ok) throw new Error(`Tasks API: ${resp.status}`);
  return resp.json();
}

// === Google-add popup ===
let _popupAnchor = null; // { phaseTitle, taskText, btn }

function createGoogleAddPopup() {
  const el = document.createElement("div");
  el.id = "google-add-popup";
  el.className = "google-add-popup";
  el.innerHTML = `
    <button class="gap-option" data-target="calendar">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.75 0a.75.75 0 01.75.75V2h5V.75a.75.75 0 011.5 0V2h1.25c.97 0 1.75.78 1.75 1.75v10.5A1.75 1.75 0 0113.25 16H2.75A1.75 1.75 0 011 14.25V3.75C1 2.78 1.78 2 2.75 2H4V.75A.75.75 0 014.75 0zM2.5 6v8.25c0 .14.11.25.25.25h10.5a.25.25 0 00.25-.25V6h-11z"/></svg>
      Google Календарь
    </button>
    <button class="gap-option" data-target="tasks">
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2.75 2.5h10.5a.25.25 0 01.25.25v10.5a.25.25 0 01-.25.25H2.75a.25.25 0 01-.25-.25V2.75a.25.25 0 01.25-.25zM1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0113.25 15H2.75A1.75 1.75 0 011 13.25V2.75zm9.22 3.47a.75.75 0 010 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-1.5-1.5a.75.75 0 011.06-1.06l.97.97 2.97-2.97a.75.75 0 011.06 0z"/></svg>
      Google Задачи
    </button>
    <div class="gap-notice" id="gap-notice"></div>
  `;
  document.body.appendChild(el);

  el.querySelector('[data-target="calendar"]').addEventListener("click", () => {
    if (!_popupAnchor) return;
    const { phaseTitle, taskText } = _popupAnchor;
    closeGoogleAddPopup();
    const a = document.createElement("a");
    a.href = buildGoogleCalendarUrl(phaseTitle, taskText);
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  });

  el.querySelector('[data-target="tasks"]').addEventListener("click", async () => {
    const clientId = window.APP_CONFIG?.googleClientId;
    if (!clientId) {
      showPopupNotice("Заполните googleClientId в config.js — инструкция внутри файла.");
      return;
    }
    if (typeof google === "undefined" || !google.accounts) {
      showPopupNotice("Google Identity Services ещё загружается, попробуйте снова.");
      return;
    }
    const btn = el.querySelector('[data-target="tasks"]');
    btn.disabled = true;
    btn.textContent = "Добавляем…";
    try {
      await addGoogleTask(_popupAnchor.phaseTitle, _popupAnchor.taskText);
      closeGoogleAddPopup();
      showSaveIndicator("✓ Добавлено в Google Задачи");
    } catch (e) {
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M2.75 2.5h10.5a.25.25 0 01.25.25v10.5a.25.25 0 01-.25.25H2.75a.25.25 0 01-.25-.25V2.75a.25.25 0 01.25-.25zM1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0113.25 15H2.75A1.75 1.75 0 011 13.25V2.75zm9.22 3.47a.75.75 0 010 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-1.5-1.5a.75.75 0 011.06-1.06l.97.97 2.97-2.97a.75.75 0 011.06 0z"/></svg> Google Задачи`;
      showPopupNotice(e.message.includes("popup") ? "Разрешите всплывающие окна для авторизации." : `Ошибка: ${e.message}`);
    }
  });

  document.addEventListener("click", (e) => {
    if (!el.classList.contains("visible")) return;
    if (!el.contains(e.target) && !e.target.closest('[data-action="google-add"]')) closeGoogleAddPopup();
  });

  return el;
}

function getGoogleAddPopup() {
  return document.getElementById("google-add-popup") || createGoogleAddPopup();
}

function showGoogleAddPopup(btn, phaseTitle, taskText) {
  _popupAnchor = { phaseTitle, taskText, btn };
  const popup = getGoogleAddPopup();
  // reset tasks button state
  const tb = popup.querySelector('[data-target="tasks"]');
  tb.disabled = false;
  tb.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M2.75 2.5h10.5a.25.25 0 01.25.25v10.5a.25.25 0 01-.25.25H2.75a.25.25 0 01-.25-.25V2.75a.25.25 0 01.25-.25zM1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0113.25 15H2.75A1.75 1.75 0 011 13.25V2.75zm9.22 3.47a.75.75 0 010 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-1.5-1.5a.75.75 0 011.06-1.06l.97.97 2.97-2.97a.75.75 0 011.06 0z"/></svg> Google Задачи`;
  document.getElementById("gap-notice").textContent = "";
  popup.classList.remove("visible");
  // position below the button
  const rect = btn.getBoundingClientRect();
  popup.style.top = `${rect.bottom + window.scrollY + 6}px`;
  popup.style.left = `${rect.left + window.scrollX}px`;
  popup.classList.add("visible");
}

function closeGoogleAddPopup() {
  const popup = document.getElementById("google-add-popup");
  if (popup) popup.classList.remove("visible");
  _popupAnchor = null;
}

function showPopupNotice(msg) {
  const el = document.getElementById("gap-notice");
  if (el) { el.textContent = msg; el.style.display = "block"; }
}

// === Main render ===
function render() {
  const container = document.getElementById("phases-container");
  container.innerHTML = "";

  PHASES.forEach((phase, idx) => {
    const ps = state[phase.id];
    const completed = phase.tasks.filter(t => ps.tasks[t.id].done).length;
    const total = phase.tasks.length;
    const pct = total ? Math.round((completed / total) * 100) : 0;
    const isComplete = completed === total && total > 0;

    const { total: qTotal, answered: qAnswered } = questionsLoaded
      ? countPhaseQuestions(phase)
      : { total: 0, answered: 0 };
    const qPct = qTotal > 0 ? Math.round((qAnswered / qTotal) * 100) : 0;

    const phaseEl = document.createElement("div");
    phaseEl.className = "phase" + (isComplete ? " completed" : "");
    phaseEl.dataset.phaseId = phase.id;

    phaseEl.innerHTML = `
      <div class="phase-header">
        <div class="phase-title-wrap">
          <span class="phase-badge">${phase.badge}</span>
          <span class="phase-title">${phase.title}</span>
        </div>
        <div class="phase-meta">
          <span class="phase-progress-mini">${completed}/${total} · ${pct}%</span>
          <svg class="chevron" viewBox="0 0 16 16" fill="currentColor"><path d="M6 4l4 4-4 4V4z"/></svg>
        </div>
      </div>
      <div class="phase-body">
        <div class="phase-mini-bar"><div class="phase-mini-fill" style="width: ${pct}%"></div></div>
        ${qTotal > 0 ? `
        <div class="phase-q-bar">
          <div class="q-bar-header">
            <span class="q-bar-label">Вопросов отвечено</span>
            <span class="q-bar-value" id="${phase.id}-q-val">${qAnswered}/${qTotal} · ${qPct}%</span>
          </div>
          <div class="q-mini-bar"><div class="q-mini-fill" id="${phase.id}-q-fill" style="width:${qPct}%"></div></div>
          <div class="phase-knowledge" id="${phase.id}-knowledge">${formatPhaseKnowledge(calcPhaseKnowledgeScore(phase))}</div>
        </div>
        ` : ""}
        <div class="section-label">Задачи</div>
        <div class="tasks"></div>
      </div>
    `;

    phaseEl.querySelector(".phase-header").addEventListener("click", () => {
      phaseEl.classList.toggle("open");
    });

    const tasksContainer = phaseEl.querySelector(".tasks");

    phase.tasks.forEach(task => {
      const taskState = ps.tasks[task.id];
      const hasComment = taskState.comment && taskState.comment.trim().length > 0;
      const taskQuestions = questionsLoaded ? (questionsIndex[task.id] || []) : [];
      const hasQuestions = taskQuestions.length > 0;

      const taskEl = document.createElement("div");
      taskEl.className = "task" + (taskState.done ? " done" : "") + (hasComment ? " has-comment" : "");
      taskEl.dataset.taskId = task.id;

      taskEl.innerHTML = `
        <div class="task-row">
          <input type="checkbox" id="${task.id}" ${taskState.done ? "checked" : ""}>
          <label for="${task.id}">${task.text}</label>
          <div class="task-actions">
            <button class="icon-btn" data-action="comment" data-tooltip="Комментарий">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2.75 2.5h10.5a.75.75 0 01.75.75v7.5a.75.75 0 01-.75.75H8.61l-2.69 2.69a.75.75 0 01-1.28-.53V11.5H2.75a.75.75 0 01-.75-.75v-7.5a.75.75 0 01.75-.75z"/></svg>
            </button>
            <button class="icon-btn" data-action="google-add" data-tooltip="Добавить в Google">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.75 0a.75.75 0 01.75.75V2h5V.75a.75.75 0 011.5 0V2h1.25c.97 0 1.75.78 1.75 1.75v10.5A1.75 1.75 0 0113.25 16H2.75A1.75 1.75 0 011 14.25V3.75C1 2.78 1.78 2 2.75 2H4V.75A.75.75 0 014.75 0zM2.5 6v8.25c0 .14.11.25.25.25h10.5a.25.25 0 00.25-.25V6h-11z"/></svg>
            </button>
            ${hasQuestions ? `
            <button class="icon-btn" data-action="questions" data-tooltip="Вопросы (${taskQuestions.length})">
              <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zM6.5 7.5A1.5 1.5 0 018 6a1.5 1.5 0 011.5 1.5c0 .576-.31.99-.706 1.332C8.49 9.1 8.25 9.38 8.25 9.75v.5a.75.75 0 01-1.5 0v-.5c0-.848.607-1.45 1.042-1.742.218-.143.458-.414.458-.758A1.5 1.5 0 016.5 7.5zM8 11a1 1 0 100 2 1 1 0 000-2z"/></svg>
            </button>
            <span class="task-wscore" id="wscore-${task.id}"></span>
            ` : ""}
          </div>
        </div>
        <div class="task-comment">
          <textarea placeholder="Заметки по задаче: ссылки, мысли, что получилось, что не получилось..." data-task-id="${task.id}">${taskState.comment || ""}</textarea>
        </div>
        <div class="task-notice"></div>
        ${hasQuestions ? '<div class="task-questions"></div>' : ""}
      `;

      const cb = taskEl.querySelector('input[type="checkbox"]');
      cb.addEventListener("change", () => {
        if (cb.checked && hasQuestions) {
          if (!canCheckTask(taskQuestions)) {
            cb.checked = false;
            const ws = calcWeightedScore(taskQuestions);
            const allScored = taskQuestions.every(q => questionsState[q.id]?.score != null);
            const passScore = TASK_PASS_SCORE.toLocaleString("ru-RU");
            showTaskNotice(taskEl,
              !allScored
                ? `Сначала оцените все вопросы. Средневзвешенная оценка должна быть не ниже ${passScore}.`
                : `Средневзвешенная оценка ${ws.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}. Для зачёта нужно не менее ${passScore}.`
            );
            return;
          }
        }
        state[phase.id].tasks[task.id].done = cb.checked;
        taskEl.classList.toggle("done", cb.checked);
        debouncedSave();
        updateProgress();
      });

      taskEl.querySelector('[data-action="comment"]').addEventListener("click", (e) => {
        e.stopPropagation();
        taskEl.classList.toggle("comment-open");
        if (taskEl.classList.contains("comment-open")) taskEl.querySelector(".task-comment textarea").focus();
      });

      taskEl.querySelector('[data-action="google-add"]').addEventListener("click", (e) => {
        e.stopPropagation();
        showGoogleAddPopup(e.currentTarget, phase.title, task.text);
      });

      const ta = taskEl.querySelector(".task-comment textarea");
      ta.addEventListener("input", () => {
        state[phase.id].tasks[task.id].comment = ta.value;
        taskEl.classList.toggle("has-comment", ta.value.trim().length > 0);
        debouncedSave();
      });

      if (hasQuestions) {
        taskEl.querySelector('[data-action="questions"]').addEventListener("click", (e) => {
          e.stopPropagation();
          const qBlock = taskEl.querySelector(".task-questions");
          if (!qBlock.dataset.rendered) {
            renderQuestionsBlock(qBlock, taskQuestions, task.id);
            qBlock.dataset.rendered = "1";
          }
          taskEl.classList.toggle("questions-open");
        });
      }

      tasksContainer.appendChild(taskEl);
    });

    if (idx === 0 && completed < total) phaseEl.classList.add("open");
    container.appendChild(phaseEl);
  });

  // Initialize wscore badges (must run after elements are in the DOM)
  if (questionsLoaded) {
    PHASES.forEach(phase => {
      phase.tasks.forEach(task => {
        if (questionsIndex[task.id]?.length) updateTaskWeightedScore(task.id);
      });
    });
  }

  updateProgress();
}

function updateProgress() {
  let total = 0, done = 0;
  PHASES.forEach(phase => {
    total += phase.tasks.length;
    done += phase.tasks.filter(t => state[phase.id].tasks[t.id].done).length;
  });
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById("overall-value").textContent = `${done} / ${total} · ${pct}%`;
  document.getElementById("overall-fill").style.width = pct + "%";

  PHASES.forEach(phase => {
    const phaseEl = document.querySelector(`[data-phase-id="${phase.id}"]`);
    if (!phaseEl) return;
    const completed = phase.tasks.filter(t => state[phase.id].tasks[t.id].done).length;
    const totalP = phase.tasks.length;
    const pctP = totalP ? Math.round((completed / totalP) * 100) : 0;
    phaseEl.querySelector(".phase-mini-fill").style.width = pctP + "%";
    phaseEl.querySelector(".phase-progress-mini").textContent = `${completed}/${totalP} · ${pctP}%`;
    phaseEl.classList.toggle("completed", completed === totalP && totalP > 0);
  });
}

function updateQuestionsProgress() {
  PHASES.forEach(phase => {
    const valEl  = document.getElementById(`${phase.id}-q-val`);
    const fillEl = document.getElementById(`${phase.id}-q-fill`);
    const knowEl = document.getElementById(`${phase.id}-knowledge`);
    if (!valEl || !fillEl) return;
    const { total, answered } = countPhaseQuestions(phase);
    const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
    valEl.textContent  = `${answered}/${total} · ${pct}%`;
    fillEl.style.width = pct + "%";
    if (knowEl) knowEl.textContent = formatPhaseKnowledge(calcPhaseKnowledgeScore(phase));
  });
}

// === Export ===
function exportJSON() {
  return JSON.stringify({
    exported_at: new Date().toISOString(),
    phases: PHASES.map(phase => ({
      id: phase.id,
      title: phase.title,
      badge: phase.badge,
      tasks: phase.tasks.map(t => ({
        text: t.text,
        completed: !!state[phase.id].tasks[t.id].done,
        comment: state[phase.id].tasks[t.id].comment || ""
      }))
    }))
  }, null, 2);
}

function exportMarkdown() {
  let total = 0, done = 0;
  PHASES.forEach(p => { total += p.tasks.length; done += p.tasks.filter(t => state[p.id].tasks[t.id].done).length; });
  const pct = total ? Math.round((done / total) * 100) : 0;
  const now = new Date().toLocaleDateString("ru-RU");

  let allScore = 0, allCount = 0;
  PHASES.forEach(phase => {
    const k = calcPhaseKnowledgeScore(phase);
    if (k) { allScore += k.avg * k.count; allCount += k.count; }
  });
  const overallKnowledge = allCount > 0
    ? ` · Знания: ${(allScore / allCount).toFixed(1)}/3 (${allCount} вопр.)`
    : "";

  let md = `# Docs as Code — мой прогресс\n\n_Экспортировано: ${now}_\n\n**Общий прогресс:** ${done} / ${total} (${pct}%)${overallKnowledge}\n\n---\n\n`;

  PHASES.forEach(phase => {
    const ps = state[phase.id];
    const completed = phase.tasks.filter(t => ps.tasks[t.id].done).length;
    const k = calcPhaseKnowledgeScore(phase);
    const kStr = k ? ` · Знания: ${k.avg.toFixed(1)}/3 (${k.count} вопр.)` : "";
    md += `## ${phase.title}\n\n_${phase.badge} · ${completed}/${phase.tasks.length} выполнено${kStr}_\n\n`;
    phase.tasks.forEach(t => {
      const ts = ps.tasks[t.id];
      md += `- [${ts.done ? "x" : " "}] ${t.text}\n`;
      if (ts.comment && ts.comment.trim()) {
        md += ts.comment.trim().split("\n").map(l => `      > ${l}`).join("\n") + "\n";
      }
      const qs = questionsIndex[t.id];
      if (qs?.length) {
        qs.forEach(q => {
          const qst = questionsState[q.id];
          if (qst?.score != null) {
            md += `  - Q${q.difficulty}: ${q.question.substring(0, 60)}… → ${qst.score}/3\n`;
          }
        });
      }
    });
    md += "\n";
  });
  return md;
}

// === Import tasks ===
function importFromJSON(jsonStr) {
  const data = JSON.parse(jsonStr);
  if (!data.phases || !Array.isArray(data.phases)) throw new Error("Неверный формат файла");
  const newState = {};
  data.phases.forEach(phaseData => {
    const phase = PHASES.find(p => p.id === phaseData.id);
    if (!phase) return;
    newState[phaseData.id] = { tasks: {} };
    (phaseData.tasks || []).forEach((taskData, idx) => {
      if (idx < phase.tasks.length) {
        newState[phaseData.id].tasks[phase.tasks[idx].id] = {
          done: !!taskData.completed,
          comment: taskData.comment || ""
        };
      }
    });
  });
  PHASES.forEach(phase => {
    if (!newState[phase.id]) newState[phase.id] = { tasks: {} };
    phase.tasks.forEach(task => {
      if (!newState[phase.id].tasks[task.id]) {
        newState[phase.id].tasks[task.id] = { done: false, comment: "" };
      }
    });
  });
  return newState;
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function showModal(title, content, filename, mime) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-content").textContent = content;
  document.getElementById("modal").classList.add("show");
  document.getElementById("modal-copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(content);
      document.getElementById("modal-copy").textContent = "✓ Скопировано";
      setTimeout(() => { document.getElementById("modal-copy").textContent = "📋 Копировать"; }, 1500);
    } catch (e) { alert("Не удалось скопировать. Используйте кнопку «Скачать»."); }
  };
  document.getElementById("modal-download").onclick = () => downloadFile(content, filename, mime);
}

// === Event listeners ===
document.getElementById("btn-export-json").addEventListener("click", () => {
  showModal("Экспорт JSON", exportJSON(), "docs-as-code-progress.json", "application/json");
});
document.getElementById("btn-export-md").addEventListener("click", () => {
  showModal("Экспорт Markdown", exportMarkdown(), "docs-as-code-progress.md", "text/markdown");
});

document.getElementById("btn-import-json").addEventListener("click", () => {
  document.getElementById("file-import").click();
});
document.getElementById("file-import").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    state = importFromJSON(await file.text());
    await saveState();
    render();
  } catch (err) { alert("Ошибка импорта: " + err.message); }
  e.target.value = "";
});

document.getElementById("btn-import-questions").addEventListener("click", () => {
  document.getElementById("file-import-questions").click();
});
document.getElementById("file-import-questions").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data.phases || !Array.isArray(data.phases)) throw new Error("Неверный формат файла вопросов");
    mergeQuestionsData(data);
    render();
  } catch (err) { alert("Ошибка загрузки вопросов: " + err.message); }
  e.target.value = "";
});

document.getElementById("modal-close").addEventListener("click", () => {
  document.getElementById("modal").classList.remove("show");
});
document.getElementById("modal").addEventListener("click", e => {
  if (e.target.id === "modal") document.getElementById("modal").classList.remove("show");
});

// === Init ===
(async () => {
  await initBackend();
  initEvalMode();
  await loadState();
  await loadQuestionsState();
  migrateQuestionsStateToV2();
  await loadQuestions();
  render();
})();
