const CHECKED_STORAGE_KEY = "shinsotsu-hub-checked-articles";

function formatDate(value) {
  return value || "";
}

// チェック状態はこのブラウザのlocalStorageだけに保存する。
// 他の端末・他の人が同じサイトを開いても、この一覧は共有されない。
function loadCheckedState() {
  try {
    return JSON.parse(localStorage.getItem(CHECKED_STORAGE_KEY)) || {};
  } catch (err) {
    return {};
  }
}

function setChecked(url, checked) {
  const state = loadCheckedState();
  if (checked) {
    state[url] = true;
  } else {
    delete state[url];
  }
  localStorage.setItem(CHECKED_STORAGE_KEY, JSON.stringify(state));
}

function escapeAttr(value) {
  return String(value || "").replace(/"/g, "&quot;");
}

function renderCard(item, checkedState) {
  const tags = (item.tags || [])
    .map((tag) => `<span class="tag">${tag}</span>`)
    .join("");
  const isChecked = Boolean(checkedState[item.url]);

  return `
    <article class="card ${isChecked ? "is-checked" : ""}">
      <div class="card-head">
        <label class="check-label">
          <input type="checkbox" class="check-box" data-url="${escapeAttr(item.url)}" ${isChecked ? "checked" : ""}>
          確認済み
        </label>
        <div class="card-date">${formatDate(item.date)}</div>
      </div>
      <h3 class="card-title"><a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.title}</a></h3>
      <div class="card-source">${item.source || ""}</div>
      <p class="card-summary">${item.summary || ""}</p>
      <div class="card-tags">${tags}</div>
    </article>
  `;
}

function initCheckboxes(panelList) {
  panelList.addEventListener("change", (event) => {
    const checkbox = event.target.closest(".check-box");
    if (!checkbox) return;
    const url = checkbox.dataset.url;
    setChecked(url, checkbox.checked);
    checkbox.closest(".card").classList.toggle("is-checked", checkbox.checked);
  });
}

async function loadPanel(panelList) {
  const src = panelList.dataset.source;
  initCheckboxes(panelList);
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = await res.json();
    if (!items.length) {
      panelList.innerHTML = '<div class="empty-state">まだ登録された情報がありません。</div>';
      return;
    }
    const checkedState = loadCheckedState();
    const sorted = [...items].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    panelList.innerHTML = sorted.map((item) => renderCard(item, checkedState)).join("");
  } catch (err) {
    panelList.innerHTML = `<div class="error-state">データの読み込みに失敗しました（${src}）</div>`;
  }
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

document.addEventListener("DOMContentLoaded", () => {
  initTabs();
  document.querySelectorAll(".panel-list").forEach(loadPanel);
});
