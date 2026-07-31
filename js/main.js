const CHECKED_STORAGE_KEY = "shinsotsu-hub-checked-articles";
const BOOKMARK_STORAGE_KEY = "shinsotsu-hub-bookmarks";
const COMMENT_STORAGE_KEY = "shinsotsu-hub-comments";

function formatDate(value) {
  return value || "";
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

function setChecked(url, checked) {
  const state = loadJsonState(CHECKED_STORAGE_KEY);
  if (checked) {
    state[url] = true;
  } else {
    delete state[url];
  }
  saveJsonState(CHECKED_STORAGE_KEY, state);
}

function setBookmarked(url, bookmarked) {
  const state = loadJsonState(BOOKMARK_STORAGE_KEY);
  if (bookmarked) {
    state[url] = true;
  } else {
    delete state[url];
    const comments = loadJsonState(COMMENT_STORAGE_KEY);
    delete comments[url];
    saveJsonState(COMMENT_STORAGE_KEY, comments);
  }
  saveJsonState(BOOKMARK_STORAGE_KEY, state);
}

function setComment(url, text) {
  const comments = loadJsonState(COMMENT_STORAGE_KEY);
  if (text) {
    comments[url] = text;
  } else {
    delete comments[url];
  }
  saveJsonState(COMMENT_STORAGE_KEY, comments);
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
  const isChecked = Boolean(state.checked[item.url]);
  const isBookmarked = Boolean(state.bookmarked[item.url]);

  const comment = opts.withComment
    ? `
      <div class="comment-block">
        <label class="comment-label" for="comment-${escapeAttr(item.url)}">メモ（あとで見返すためのコメント）</label>
        <textarea class="comment-box" id="comment-${escapeAttr(item.url)}" data-url="${escapeAttr(item.url)}" placeholder="なぜ気になったか、後で使いたい点などを書いておく…">${escapeHtml(state.comments[item.url] || "")}</textarea>
        <div class="comment-status" data-status-for="${escapeAttr(item.url)}"></div>
      </div>`
    : "";

  return `
    <article class="card ${isChecked ? "is-checked" : ""}">
      <div class="card-head">
        <div class="card-head-left">
          <label class="check-label">
            <input type="checkbox" class="check-box" data-url="${escapeAttr(item.url)}" ${isChecked ? "checked" : ""}>
            確認済み
          </label>
          <button type="button" class="bookmark-btn ${isBookmarked ? "is-bookmarked" : ""}" data-url="${escapeAttr(item.url)}" title="ブックマーク" aria-pressed="${isBookmarked}">${isBookmarked ? "★" : "☆"}</button>
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
  const bookmarkedUrls = new Set(Object.keys(state.bookmarked));
  const items = allItems.filter((item) => bookmarkedUrls.has(item.url));

  document.getElementById("bookmark-count").textContent = items.length;

  if (!items.length) {
    panelList.innerHTML = '<div class="empty-state">まだブックマークがありません。各記事の☆ボタンから追加できます。</div>';
    return;
  }

  const sorted = [...items].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  panelList.innerHTML = sorted.map((item) => renderCard(item, state, { withComment: true })).join("");
}

async function fetchItems(src) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadPanel(panelList, allItemsAccumulator) {
  const src = panelList.dataset.source;
  try {
    const items = await fetchItems(src);
    allItemsAccumulator.push(...items);
    if (!items.length) {
      panelList.innerHTML = '<div class="empty-state">まだ登録された情報がありません。</div>';
      return;
    }
    const state = currentState();
    const sorted = [...items].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    panelList.innerHTML = sorted.map((item) => renderCard(item, state)).join("");
  } catch (err) {
    panelList.innerHTML = `<div class="error-state">データの読み込みに失敗しました（${src}）</div>`;
  }
}

function handleCardClick(event) {
  const bookmarkBtn = event.target.closest(".bookmark-btn");
  if (bookmarkBtn) {
    const url = bookmarkBtn.dataset.url;
    const state = currentState();
    const nowBookmarked = !state.bookmarked[url];
    setBookmarked(url, nowBookmarked);
    renderEverything();
  }
}

function handleCardChange(event) {
  const checkbox = event.target.closest(".check-box");
  if (checkbox) {
    const url = checkbox.dataset.url;
    setChecked(url, checkbox.checked);
    checkbox.closest(".card").classList.toggle("is-checked", checkbox.checked);
  }
}

const commentTimers = {};
function handleCardInput(event) {
  const box = event.target.closest(".comment-box");
  if (!box) return;
  const url = box.dataset.url;
  const statusEl = document.querySelector(`[data-status-for="${CSS.escape(url)}"]`);
  if (statusEl) statusEl.textContent = "入力中…";
  clearTimeout(commentTimers[url]);
  commentTimers[url] = setTimeout(() => {
    setComment(url, box.value);
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
      const isBookmarked = Boolean(state.bookmarked[btn.dataset.url]);
      btn.classList.toggle("is-bookmarked", isBookmarked);
      btn.textContent = isBookmarked ? "★" : "☆";
      btn.setAttribute("aria-pressed", String(isBookmarked));
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  initTabs();
  initInteractions();

  const sourcedPanels = document.querySelectorAll(".panel-list[data-source]");
  const allItems = [];
  await Promise.all(Array.from(sourcedPanels).map((panelList) => loadPanel(panelList, allItems)));
  cachedAllItems = allItems;
  renderBookmarkPanel(cachedAllItems);
});
