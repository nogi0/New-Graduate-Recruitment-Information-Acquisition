const CHECKED_STORAGE_KEY = "shinsotsu-hub-checked-articles";
const BOOKMARK_STORAGE_KEY = "shinsotsu-hub-bookmarks";
const COMMENT_STORAGE_KEY = "shinsotsu-hub-comments";
const MIGRATION_FLAG_KEY = "shinsotsu-hub-key-migration-v1-done";
// Discord Webhook URLはこのブラウザのlocalStorageにのみ保存する。
// リポジトリ（公開コード）には絶対に含めない（誰でも見られる場所に秘密のURLを
// 置くと、第三者に勝手にメッセージを送信されてしまうため）。
const DISCORD_WEBHOOK_KEY = "shinsotsu-hub-discord-webhook";
const DISCORD_MESSAGE_LIMIT = 1900;

function formatDate(value) {
  return value || "";
}

// 同じ元記事から複数のカードを起こしている場合にURLが重複することがあるため、
// 確認済み・ブックマーク・コメントの状態は「URL + タイトル」を一意キーとして保存する。
// URLだけをキーにすると、URLが同じ別記事まで一緒に状態が変わってしまう。
function itemKey(item) {
  return `${item.url}::${item.title}`;
}

// チェック状態・ブックマーク・コメントはすべてこのブラウザのlocalStorageだけに保存する。
// 他の端末・他の人が同じサイトを開いても、この一覧は共有されない。
function loadJsonState(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch (err) {
    return {};
  }
}

function saveJsonState(key, state) {
  localStorage.setItem(key, JSON.stringify(state));
}

function setChecked(key, checked) {
  const state = loadJsonState(CHECKED_STORAGE_KEY);
  if (checked) {
    state[key] = true;
  } else {
    delete state[key];
  }
  saveJsonState(CHECKED_STORAGE_KEY, state);
}

function setBookmarked(key, bookmarked) {
  const state = loadJsonState(BOOKMARK_STORAGE_KEY);
  if (bookmarked) {
    state[key] = true;
  } else {
    delete state[key];
    const comments = loadJsonState(COMMENT_STORAGE_KEY);
    delete comments[key];
    saveJsonState(COMMENT_STORAGE_KEY, comments);
  }
  saveJsonState(BOOKMARK_STORAGE_KEY, state);
}

function setComment(key, text) {
  const comments = loadJsonState(COMMENT_STORAGE_KEY);
  if (text) {
    comments[key] = text;
  } else {
    delete comments[key];
  }
  saveJsonState(COMMENT_STORAGE_KEY, comments);
}

// 以前は状態のキーがURLだけだった（"::"を含まない）。複合キー方式への移行時に
// 古い形式のデータがブラウザに残っている場合、初回読み込み時に一度だけ変換する。
// 同じURLを複数記事で共有しているケースは判別できないため、該当URLを持つ
// 全記事に同じ状態を復元する（多少過剰に復元される可能性はあるが、消えるよりはよい）。
function isLegacyKey(key) {
  return !key.includes("::");
}

function migrateLegacyState(allItems) {
  if (localStorage.getItem(MIGRATION_FLAG_KEY)) return;

  const itemsByUrl = new Map();
  allItems.forEach((item) => {
    const list = itemsByUrl.get(item.url) || [];
    list.push(item);
    itemsByUrl.set(item.url, list);
  });

  let migratedAny = false;
  [CHECKED_STORAGE_KEY, BOOKMARK_STORAGE_KEY, COMMENT_STORAGE_KEY].forEach((storageKey) => {
    const state = loadJsonState(storageKey);
    let changed = false;
    Object.keys(state).forEach((legacyKey) => {
      if (!isLegacyKey(legacyKey)) return;
      const matchedItems = itemsByUrl.get(legacyKey) || [];
      matchedItems.forEach((item) => {
        const newKey = itemKey(item);
        if (!(newKey in state)) {
          state[newKey] = state[legacyKey];
        }
      });
      delete state[legacyKey];
      changed = true;
    });
    if (changed) {
      saveJsonState(storageKey, state);
      migratedAny = true;
    }
  });

  if (migratedAny) {
    console.info("[shinsotsu-hub] 旧形式のブックマーク/確認済み/コメントを新形式に移行しました。");
  }
  localStorage.setItem(MIGRATION_FLAG_KEY, "1");
}

function escapeAttr(value) {
  return String(value || "").replace(/"/g, "&quot;");
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]));
}

function renderCard(item, state, opts = {}) {
  const tags = (item.tags || [])
    .map((tag) => `<span class="tag">${tag}</span>`)
    .join("");
  const key = itemKey(item);
  const isChecked = Boolean(state.checked[key]);
  const isBookmarked = Boolean(state.bookmarked[key]);

  const comment = opts.withComment
    ? `
      <div class="comment-block">
        <label class="comment-label" for="comment-${escapeAttr(key)}">メモ（あとで見返すためのコメント）</label>
        <textarea class="comment-box" id="comment-${escapeAttr(key)}" data-key="${escapeAttr(key)}" placeholder="なぜ気になったか、後で使いたい点などを書いておく…">${escapeHtml(state.comments[key] || "")}</textarea>
        <div class="comment-status" data-status-for="${escapeAttr(key)}"></div>
      </div>`
    : "";

  return `
    <article class="card ${isChecked ? "is-checked" : ""}">
      <div class="card-head">
        <div class="card-head-left">
          <label class="check-label">
            <input type="checkbox" class="check-box" data-key="${escapeAttr(key)}" ${isChecked ? "checked" : ""}>
            確認済み
          </label>
          <button type="button" class="bookmark-btn ${isBookmarked ? "is-bookmarked" : ""}" data-key="${escapeAttr(key)}" title="ブックマーク" aria-pressed="${isBookmarked}">${isBookmarked ? "★" : "☆"}</button>
        </div>
        <div class="card-date">${formatDate(item.date)}</div>
      </div>
      <h3 class="card-title"><a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.title}</a></h3>
      <div class="card-source">${item.source || ""}</div>
      <p class="card-summary">${item.summary || ""}</p>
      <div class="card-tags">${tags}</div>
      ${comment}
    </article>
  `;
}

function currentState() {
  return {
    checked: loadJsonState(CHECKED_STORAGE_KEY),
    bookmarked: loadJsonState(BOOKMARK_STORAGE_KEY),
    comments: loadJsonState(COMMENT_STORAGE_KEY),
  };
}

function renderBookmarkPanel(allItems) {
  const panelList = document.getElementById("bookmark-list");
  const state = currentState();
  const bookmarkedKeys = new Set(Object.keys(state.bookmarked));
  const items = allItems.filter((item) => bookmarkedKeys.has(itemKey(item)));

  document.getElementById("bookmark-count").textContent = items.length;

  if (!items.length) {
    panelList.innerHTML = '<div class="empty-state">まだブックマークがありません。各記事の☆ボタンから追加できます。</div>';
    return;
  }

  const sorted = [...items].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  panelList.innerHTML = sorted.map((item) => renderCard(item, state, { withComment: true })).join("");
}

function getBookmarkedItemsWithComments(allItems) {
  const state = currentState();
  const bookmarkedKeys = new Set(Object.keys(state.bookmarked));
  const items = allItems.filter((item) => bookmarkedKeys.has(itemKey(item)));
  const sorted = [...items].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return sorted.map((item) => ({
    title: item.title,
    url: item.url,
    date: item.date || "",
    comment: state.comments[itemKey(item)] || "",
  }));
}

function buildExportText(entries) {
  if (!entries.length) return "ブックマークはまだありません。";
  const header = `# ブックマーク一覧（${new Date().toISOString().slice(0, 10)}時点・${entries.length}件）\n`;
  const body = entries
    .map((e) => {
      const lines = [`## ${e.title}`, `URL: ${e.url}`];
      if (e.comment) lines.push(`メモ: ${e.comment}`);
      return lines.join("\n");
    })
    .join("\n\n");
  return `${header}\n${body}\n`;
}

function setToolsStatus(message) {
  const el = document.getElementById("bookmark-tools-status");
  if (el) el.textContent = message;
}

async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    return false;
  }
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getDiscordWebhook() {
  return localStorage.getItem(DISCORD_WEBHOOK_KEY) || "";
}

function setDiscordWebhook(url) {
  if (url) {
    localStorage.setItem(DISCORD_WEBHOOK_KEY, url);
  } else {
    localStorage.removeItem(DISCORD_WEBHOOK_KEY);
  }
}

function chunkText(text, limit) {
  const chunks = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n\n", limit);
    if (cut <= 0) cut = limit;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

async function sendToDiscord(webhookUrl, text) {
  const chunks = chunkText(text, DISCORD_MESSAGE_LIMIT);
  for (const chunk of chunks) {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: chunk }),
    });
    if (!res.ok) {
      throw new Error(`Discordへの送信に失敗しました（HTTP ${res.status}）`);
    }
  }
}

function initBookmarkTools() {
  const copyBtn = document.getElementById("export-copy-btn");
  const downloadBtn = document.getElementById("export-download-btn");
  const discordSendBtn = document.getElementById("discord-send-btn");
  const settingsToggle = document.getElementById("discord-settings-toggle");
  const settingsPanel = document.getElementById("discord-settings");
  const webhookInput = document.getElementById("discord-webhook-input");
  const webhookSave = document.getElementById("discord-webhook-save");
  const webhookClear = document.getElementById("discord-webhook-clear");

  webhookInput.value = getDiscordWebhook();

  copyBtn.addEventListener("click", async () => {
    const entries = getBookmarkedItemsWithComments(cachedAllItems);
    const ok = await copyTextToClipboard(buildExportText(entries));
    setToolsStatus(ok ? `${entries.length}件をクリップボードにコピーしました。` : "コピーに失敗しました。");
  });

  downloadBtn.addEventListener("click", () => {
    const entries = getBookmarkedItemsWithComments(cachedAllItems);
    const filename = `bookmarks-${new Date().toISOString().slice(0, 10)}.md`;
    downloadTextFile(filename, buildExportText(entries));
    setToolsStatus(`${entries.length}件を ${filename} としてダウンロードしました。`);
  });

  settingsToggle.addEventListener("click", () => {
    settingsPanel.hidden = !settingsPanel.hidden;
  });

  webhookSave.addEventListener("click", () => {
    setDiscordWebhook(webhookInput.value.trim());
    setToolsStatus("Discord Webhook URLを保存しました（このブラウザにのみ保存）。");
  });

  webhookClear.addEventListener("click", () => {
    webhookInput.value = "";
    setDiscordWebhook("");
    setToolsStatus("Discord Webhook URLを削除しました。");
  });

  discordSendBtn.addEventListener("click", async () => {
    const webhookUrl = getDiscordWebhook();
    if (!webhookUrl) {
      setToolsStatus("先に「⚙️ Discord設定」からWebhook URLを保存してください。");
      settingsPanel.hidden = false;
      return;
    }
    const entries = getBookmarkedItemsWithComments(cachedAllItems);
    if (!entries.length) {
      setToolsStatus("ブックマークがまだありません。");
      return;
    }
    setToolsStatus("Discordに送信中…");
    try {
      await sendToDiscord(webhookUrl, buildExportText(entries));
      setToolsStatus(`${entries.length}件をDiscordに送信しました。`);
    } catch (err) {
      setToolsStatus(err.message || "Discordへの送信に失敗しました。");
    }
  });
}

async function fetchItems(src) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadItemsForPanel(panelList) {
  const src = panelList.dataset.source;
  try {
    const items = await fetchItems(src);
    return { panelList, items, error: null };
  } catch (err) {
    return { panelList, items: [], error: err };
  }
}

function renderPanelItems(panelList, items, state) {
  if (!items.length) {
    panelList.innerHTML = '<div class="empty-state">まだ登録された情報がありません。</div>';
    return;
  }
  const sorted = [...items].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  panelList.innerHTML = sorted.map((item) => renderCard(item, state)).join("");
}

function handleCardClick(event) {
  const bookmarkBtn = event.target.closest(".bookmark-btn");
  if (bookmarkBtn) {
    const key = bookmarkBtn.dataset.key;
    const state = currentState();
    const nowBookmarked = !state.bookmarked[key];
    setBookmarked(key, nowBookmarked);
    renderEverything();
  }
}

function handleCardChange(event) {
  const checkbox = event.target.closest(".check-box");
  if (checkbox) {
    const key = checkbox.dataset.key;
    setChecked(key, checkbox.checked);
    checkbox.closest(".card").classList.toggle("is-checked", checkbox.checked);
  }
}

const commentTimers = {};
function handleCardInput(event) {
  const box = event.target.closest(".comment-box");
  if (!box) return;
  const key = box.dataset.key;
  const statusEl = document.querySelector(`[data-status-for="${CSS.escape(key)}"]`);
  if (statusEl) statusEl.textContent = "入力中…";
  clearTimeout(commentTimers[key]);
  commentTimers[key] = setTimeout(() => {
    setComment(key, box.value);
    if (statusEl) statusEl.textContent = "保存しました";
  }, 500);
}

function initInteractions() {
  document.addEventListener("click", handleCardClick);
  document.addEventListener("change", handleCardChange);
  document.addEventListener("input", handleCardInput);
}

function initTabs() {
  const buttons = document.querySelectorAll(".tab-btn");
  const panels = document.querySelectorAll(".panel");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      buttons.forEach((b) => b.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.target).classList.add("active");
    });
  });
}

let cachedAllItems = [];

function renderEverything() {
  renderBookmarkPanel(cachedAllItems);
  document.querySelectorAll(".panel-list[data-source]").forEach((panelList) => {
    const state = currentState();
    const cards = panelList.querySelectorAll(".card");
    cards.forEach((card) => {
      const btn = card.querySelector(".bookmark-btn");
      if (!btn) return;
      const isBookmarked = Boolean(state.bookmarked[btn.dataset.key]);
      btn.classList.toggle("is-bookmarked", isBookmarked);
      btn.textContent = isBookmarked ? "★" : "☆";
      btn.setAttribute("aria-pressed", String(isBookmarked));
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  initTabs();
  initInteractions();
  initBookmarkTools();

  const sourcedPanels = Array.from(document.querySelectorAll(".panel-list[data-source]"));
  const results = await Promise.all(sourcedPanels.map(loadItemsForPanel));

  const allItems = [];
  results.forEach((r) => allItems.push(...r.items));
  migrateLegacyState(allItems);
  cachedAllItems = allItems;

  const state = currentState();
  results.forEach((r) => {
    if (r.error) {
      r.panelList.innerHTML = `<div class="error-state">データの読み込みに失敗しました（${r.panelList.dataset.source}）</div>`;
    } else {
      renderPanelItems(r.panelList, r.items, state);
    }
  });

  renderBookmarkPanel(cachedAllItems);
});
