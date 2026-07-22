function formatDate(value) {
  return value || "";
}

function renderCard(item) {
  const tags = (item.tags || [])
    .map((tag) => `<span class="tag">${tag}</span>`)
    .join("");

  return `
    <article class="card">
      <div class="card-date">${formatDate(item.date)}</div>
      <h3 class="card-title"><a href="${item.url}" target="_blank" rel="noopener noreferrer">${item.title}</a></h3>
      <div class="card-source">${item.source || ""}</div>
      <p class="card-summary">${item.summary || ""}</p>
      <div class="card-tags">${tags}</div>
    </article>
  `;
}

async function loadPanel(panelList) {
  const src = panelList.dataset.source;
  try {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const items = await res.json();
    if (!items.length) {
      panelList.innerHTML = '<div class="empty-state">まだ登録された情報がありません。</div>';
      return;
    }
    const sorted = [...items].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    panelList.innerHTML = sorted.map(renderCard).join("");
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
