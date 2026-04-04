const ELEMENTS = ["火", "水", "風", "光", "闇"];
const STORAGE_KEY = "pricone_checker_state_v1";
const OWNER_NAME_KEY = "pricone_checker_owner_name_v1";

let characters = [];
let state = {};

const app = document.getElementById("app");
const searchInput = document.getElementById("searchInput");
const ownershipFilter = document.getElementById("ownershipFilter");
const shareBtn = document.getElementById("shareBtn");
const exportBtn = document.getElementById("exportBtn");
const resetBtn = document.getElementById("resetBtn");
const ownedCount = document.getElementById("ownedCount");
const crCount = document.getElementById("crCount");
const spCount = document.getElementById("spCount");

const modalBackdrop = document.getElementById("modalBackdrop");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalCloseBtn = document.getElementById("modalCloseBtn");
const ownerNameInput = document.getElementById("ownerNameInput");

async function initializeApp() {
  try {
    characters = await loadCharacters();
    state = normalizeState(loadState());
    initializeFromUrl();
    render();

    ownerNameInput.value = loadOwnerName();
    ownerNameInput.addEventListener("input", saveOwnerName);

    searchInput.addEventListener("input", render);
    ownershipFilter.addEventListener("change", render);
    shareBtn.addEventListener("click", handleShareUrl);
    exportBtn.addEventListener("click", handleExportImages);
    resetBtn.addEventListener("click", handleReset);
    modalCloseBtn.addEventListener("click", closeModal);
    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) closeModal();
    });
  } catch (error) {
    console.error(error);
    app.innerHTML = `
      <div class="empty">
        characters.json の読み込みに失敗しました。<br>
        パスやJSON形式を確認してください。
      </div>
    `;
  }
}

async function loadCharacters() {
  const response = await fetch("./data/characters.json");
  if (!response.ok) {
    throw new Error("characters.json の読み込みに失敗しました");
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("characters.json は配列形式である必要があります");
  }

  return data.map((char, index) => ({
    id: String(char.id ?? ""),
    name: String(char.name ?? ""),
    element: String(char.element ?? ""),
    sort: Number.isFinite(Number(char.sort)) ? Number(char.sort) : index + 1,
    icon: String(char.icon ?? ""),
  }));
}

function createDefaultState() {
  const result = {};
  for (const char of characters) {
    result[char.id] = { owned: false, cr: 0, sp: 0 };
  }
  return result;
}

function normalizeState(raw) {
  const base = createDefaultState();
  if (!raw || typeof raw !== "object") return base;

  for (const char of characters) {
    const row = raw[char.id] || {};
    const owned = !!row.owned;
    let cr = Number(row.cr ?? 0);
    let sp = Number(row.sp ?? 0);

    if (!Number.isInteger(cr) || cr < 0) cr = 0;
    if (cr > 15) cr = 15;
    sp = sp === 1 ? 1 : 0;

    base[char.id] = {
      owned,
      cr: owned ? cr : 0,
      sp: owned ? sp : 0,
    };
  }

  return base;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function initializeFromUrl() {
  const params = new URLSearchParams(location.search);
  const data = params.get("data");
  if (!data) return;

  try {
    const decoded = decodeURIComponent(escape(atob(data)));
    const parsed = JSON.parse(decoded);
    const fresh = createDefaultState();

    for (const [charId, values] of Object.entries(parsed)) {
      if (!fresh[charId]) continue;

      const cr = Array.isArray(values) ? Number(values[0] ?? 0) : 0;
      const sp = Array.isArray(values) ? Number(values[1] ?? 0) : 0;

      fresh[charId] = {
        owned: true,
        cr: Number.isInteger(cr) ? Math.max(0, Math.min(15, cr)) : 0,
        sp: sp === 1 ? 1 : 0,
      };
    }

    state = fresh;
    saveState();
  } catch (error) {
    console.warn("共有URLの復元に失敗しました", error);
  }
}

function getVisibleCharacters() {
  const keyword = searchInput.value.trim().toLowerCase();
  const ownership = ownershipFilter.value;

  return characters.filter((char) => {
    const s = state[char.id];
    const nameMatch = !keyword || char.name.toLowerCase().includes(keyword);
    if (!nameMatch) return false;

    if (ownership === "owned" && !s.owned) return false;
    if (ownership === "unowned" && s.owned) return false;

    return true;
  });
}

function groupedCharacters() {
  const visible = getVisibleCharacters();
  const groups = {};
  for (const element of ELEMENTS) groups[element] = [];

  for (const char of visible) {
    if (!groups[char.element]) groups[char.element] = [];
    groups[char.element].push(char);
  }

  for (const element of Object.keys(groups)) {
    groups[element].sort(
      (a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "ja")
    );
  }

  return groups;
}

function render() {
  const groups = groupedCharacters();
  app.innerHTML = "";

  updateSummary();

  for (const element of ELEMENTS) {
    const section = document.createElement("section");
    section.className = "section";

    const list = groups[element] || [];
    const visibleCount = list.length;
    const ownedInSection = list.filter((c) => state[c.id]?.owned).length;

    section.innerHTML = `
      <div class="section-header">
        <h2 class="section-title">
          <span class="section-badge ${elementClass(element)}">${element}</span>
          ${escapeHtml(element)}属性
        </h2>
        <div class="section-meta">表示 ${visibleCount} / 所持 ${ownedInSection}</div>
      </div>
    `;

    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "該当キャラがいません。";
      section.appendChild(empty);
      app.appendChild(section);
      continue;
    }

    const cards = document.createElement("div");
    cards.className = "cards";

    for (const char of list) {
      cards.appendChild(renderCard(char));
    }

    section.appendChild(cards);
    app.appendChild(section);
  }
}

function renderCard(char) {
  const s = state[char.id];
  const card = document.createElement("div");
  card.className = `card panel ${s.owned ? "" : "unowned"}`;

  const iconHtml = char.icon
    ? `<img src="${escapeHtml(char.icon)}" alt="${escapeHtml(char.name)}">`
    : `<span>${escapeHtml(char.name)}</span>`;

  card.innerHTML = `
    <div class="icon-wrap">${iconHtml}</div>
    <div>
      <h3 class="char-name">${escapeHtml(char.name)}</h3>

      <div class="field">
        <label>所持</label>
        <div>
          <input class="owned-check" type="checkbox" ${s.owned ? "checked" : ""} data-role="owned">
        </div>
      </div>

      <div class="field">
        <label>CR</label>
        <select data-role="cr" ${s.owned ? "" : "disabled"}>
          ${Array.from({ length: 16 }, (_, i) => `<option value="${i}" ${s.cr === i ? "selected" : ""}>${i}</option>`).join("")}
        </select>
      </div>

      <div class="field">
        <label>専用SP</label>
        <select data-role="sp" ${s.owned ? "" : "disabled"}>
          <option value="0" ${s.sp === 0 ? "selected" : ""}>なし</option>
          <option value="1" ${s.sp === 1 ? "selected" : ""}>あり</option>
        </select>
      </div>
    </div>
  `;

  const ownedCheck = card.querySelector('[data-role="owned"]');
  const crSelect = card.querySelector('[data-role="cr"]');
  const spSelect = card.querySelector('[data-role="sp"]');

  ownedCheck.addEventListener("change", () => {
    const owned = ownedCheck.checked;
    if (!owned) {
      state[char.id] = { owned: false, cr: 0, sp: 0 };
    } else {
      state[char.id] = { owned: true, cr: 0, sp: 0 };
    }
    saveState();
    render();
  });

  crSelect.addEventListener("change", () => {
    state[char.id].cr = Number(crSelect.value);
    saveState();
    updateSummary();
  });

  spSelect.addEventListener("change", () => {
    state[char.id].sp = Number(spSelect.value);
    saveState();
    updateSummary();
  });

  return card;
}

function updateSummary() {
  const values = Object.values(state);
  const owned = values.filter((v) => v.owned).length;
  const crPositive = values.filter((v) => v.cr > 0).length;
  const spPositive = values.filter((v) => v.owned && v.sp === 1).length;

  ownedCount.textContent = `所持 ${owned}`;
  crCount.textContent = `CR>0 ${crPositive}`;
  spCount.textContent = `SPあり ${spPositive}`;
}

function getSummaryCounts() {
  const values = Object.values(state);
  return {
    owned: values.filter((v) => v.owned).length,
    crPositive: values.filter((v) => v.cr > 0).length,
    spPositive: values.filter((v) => v.owned && v.sp === 1).length,
  };
}

function handleShareUrl() {
  const compact = {};
  for (const [charId, row] of Object.entries(state)) {
    if (!row.owned) continue;
    compact[charId] = [row.cr, row.sp];
  }

  const json = JSON.stringify(compact);
  const encoded = btoa(unescape(encodeURIComponent(json)));
  const url = `${location.origin}${location.pathname}?data=${encoded}`;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <p>所持キャラのみを軽量化した共有URLです。</p>
    <textarea class="control" style="width:100%; height:110px; padding:12px; resize:vertical;">${url}</textarea>
    <div class="note">URLに含まれないキャラは未所持として復元されます。</div>
  `;

  const copyBtn = document.createElement("button");
  copyBtn.className = "button primary";
  copyBtn.textContent = "URLをコピー";
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url);
      copyBtn.textContent = "コピーしました";
    } catch {
      copyBtn.textContent = "コピー失敗";
    }
  });

  showModal("共有URL生成", wrapper, [copyBtn]);
}

async function handleExportImages() {
  const grouped = {};

  for (const element of ELEMENTS) {
    grouped[element] = characters
      .filter((c) => c.element === element)
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "ja"))
      .filter((c) => state[c.id].cr > 0);
  }

  const totalCount = Object.values(grouped).reduce((sum, list) => sum + list.length, 0);

  const wrapper = document.createElement("div");

  if (totalCount === 0) {
    wrapper.innerHTML = `
      <p>現在は画像出力対象がありません。</p>
      <div class="note">CR が 1 以上のキャラを登録すると、画像を出力できます。</div>
    `;
    showModal("画像出力", wrapper);
    return;
  }

  const url = await drawAllElementsCanvas(grouped);

  const preview = document.createElement("div");
  preview.className = "export-preview";

  const block = document.createElement("div");
  block.className = "preview-block";
  block.innerHTML = `
    <h3>全属性まとめ画像</h3>
    <img src="${url}" alt="全属性まとめ画像">
  `;

  const dl = document.createElement("a");
  dl.className = "button primary";
  dl.textContent = `画像を保存`;
  dl.href = url;
  dl.download = `pricone_all_elements.png`;
  dl.style.display = "inline-flex";
  dl.style.alignItems = "center";
  dl.style.justifyContent = "center";
  dl.style.marginTop = "10px";

  block.appendChild(dl);
  preview.appendChild(block);
  wrapper.appendChild(preview);
  wrapper.insertAdjacentHTML(
    "beforeend",
    `<div class="note">全属性を1枚にまとめたDiscord共有向けPNG画像です。</div>`
  );

  showModal("画像出力", wrapper);
}


async function drawElementCanvas(element, list) {
  const cols = 5;
  const iconSize = 72;
  const cellW = 120;
  const cellH = 148;
  const paddingX = 36;
  const paddingTop = 100;
  const paddingBottom = 28;
  const rows = Math.ceil(list.length / cols);
  const width = paddingX * 2 + cellW * cols;
  const height = paddingTop + rows * cellH + paddingBottom;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f9fafb";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#111827";
  ctx.font = "bold 34px 'Segoe UI', sans-serif";
  ctx.fillText(`${element}属性`, 36, 54);

  ctx.fillStyle = "#6b7280";
  ctx.font = "16px 'Segoe UI', sans-serif";
  ctx.fillText(`CRが1以上のキャラのみ表示`, 36, 80);

  const images = await Promise.all(list.map(loadIconImage));

  images.forEach((img, index) => {
    const char = list[index];
    const cr = state[char.id].cr;
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = paddingX + col * cellW + (cellW - iconSize) / 2;
    const y = paddingTop + row * cellH + 8;

    drawRoundedImageOrPlaceholder(ctx, img, char, x, y, iconSize, iconSize);
    drawCrBadge(ctx, x + iconSize - 4, y + iconSize - 4, cr);
    drawCharacterName(ctx, char.name, x + iconSize / 2, y + iconSize + 24, cellW - 12);
  });

  return canvas.toDataURL("image/png");
}

function drawRoundedImageOrPlaceholder(ctx, img, char, x, y, w, h) {
  roundRect(ctx, x, y, w, h, 16);
  ctx.save();
  ctx.clip();

  if (img) {
    ctx.drawImage(img, x, y, w, h);
  } else {
    const gradient = ctx.createLinearGradient(x, y, x + w, y + h);
    gradient.addColorStop(0, "#eef2ff");
    gradient.addColorStop(1, "#f8fafc");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#4338ca";
    ctx.font = "bold 12px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(char.name, x + w / 2, y + h / 2, w - 8);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
  }

  ctx.restore();

  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 16, false, true);
}

function drawCrBadge(ctx, rightX, bottomY, value) {
  const text = String(value);
  ctx.font = "bold 20px 'Segoe UI', sans-serif";
  const textWidth = ctx.measureText(text).width;
  const badgeW = Math.max(34, textWidth + 18);
  const badgeH = 30;
  const x = rightX - badgeW;
  const y = bottomY - badgeH;

  ctx.fillStyle = "rgba(17, 24, 39, 0.92)";
  roundRect(ctx, x, y, badgeW, badgeH, 14, true, false);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + badgeW / 2, y + badgeH / 2 + 1);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function roundRect(ctx, x, y, w, h, r, fill = true, stroke = false) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function loadIconImage(char) {
  return new Promise((resolve) => {
    if (!char.icon) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = char.icon;
  });
}

function handleReset() {
  const ok = confirm("保存中の状態をすべて初期化します。よろしいですか？");
  if (!ok) return;

  state = createDefaultState();
  saveState();
  searchInput.value = "";
  ownershipFilter.value = "all";
  render();
}

function showModal(title, content, extraButtons = []) {
  modalTitle.textContent = title;
  modalBody.innerHTML = "";

  if (typeof content === "string") {
    modalBody.innerHTML = content;
  } else {
    modalBody.appendChild(content);
  }

  const actions = modalCloseBtn.parentElement;
  [...actions.querySelectorAll(".dynamic-action")].forEach((el) => el.remove());

  for (const btn of extraButtons) {
    btn.classList.add("dynamic-action");
    actions.prepend(btn);
  }

  modalBackdrop.classList.add("show");
}

function closeModal() {
  modalBackdrop.classList.remove("show");
}

function elementClass(element) {
  return {
    "火": "element-fire",
    "水": "element-water",
    "風": "element-wind",
    "光": "element-light",
    "闇": "element-dark",
  }[element] || "";
}

function elementFileName(element) {
  return {
    "火": "fire",
    "水": "water",
    "風": "wind",
    "光": "light",
    "闇": "dark",
  }[element] || "unknown";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function drawCharacterName(ctx, name, centerX, y, maxWidth) {
  ctx.fillStyle = "#374151";
  ctx.font = "13px 'Segoe UI', 'Hiragino Sans', 'Yu Gothic UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const text = fitText(ctx, name, maxWidth);
  ctx.fillText(text, centerX, y);

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  let shortened = text;
  while (shortened.length > 0) {
    shortened = shortened.slice(0, -1);
    const candidate = shortened + "…";
    if (ctx.measureText(candidate).width <= maxWidth) {
      return candidate;
    }
  }

  return "…";
}

async function drawAllElementsCanvas(grouped) {
  const cols = 5;
  const iconSize = 72;
  const cellW = 110;
  const cellH = 110;

  const headerH = 96;
  const sectionTitleH = 44;
  const sectionTopPad = 18;
  const sectionBottomPad = 16;
  const sectionGap = 10;

  const paddingX = 32;
  const paddingTop = 24;
  const paddingBottom = 32;

  const width = paddingX * 2 + cols * cellW;

  let totalHeight = paddingTop + headerH + paddingBottom;

  for (const element of ELEMENTS) {
    const list = grouped[element] || [];
    if (list.length === 0) continue;

    const rows = Math.ceil(list.length / cols);
    totalHeight += sectionTopPad + sectionTitleH + rows * cellH + sectionBottomPad + sectionGap;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = totalHeight;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f9fafb";
  ctx.fillRect(0, 0, width, totalHeight);

  drawExportHeader(ctx, width, paddingX, paddingTop, headerH);

  let currentY = paddingTop + headerH;

  for (const element of ELEMENTS) {
    const list = grouped[element] || [];
    if (list.length === 0) continue;

    const rows = Math.ceil(list.length / cols);

    currentY += sectionTopPad;

    drawSectionHeader(ctx, element, paddingX, currentY, width - paddingX * 2);
    currentY += sectionTitleH;

    const images = await Promise.all(list.map(loadIconImage));

    images.forEach((img, index) => {
      const char = list[index];
      const s = state[char.id];

      const col = index % cols;
      const row = Math.floor(index / cols);

      const x = paddingX + col * cellW + (cellW - iconSize) / 2;
      const y = currentY + row * cellH + 6;

      drawRoundedImageOrPlaceholder(ctx, img, char, x, y, iconSize, iconSize);
      drawCrBadge(ctx, x + iconSize - 4, y + iconSize - 4, s.cr);

      if (s.sp === 1) {
        drawSpBadge(ctx, x + iconSize - 2, y + 2);
      }
    });

    currentY += rows * cellH + sectionBottomPad + sectionGap;
  }

  return canvas.toDataURL("image/png");
}

function drawSectionHeader(ctx, element, x, y, width) {
  const colorMap = {
    "火": "#ef4444",
    "水": "#3b82f6",
    "風": "#10b981",
    "光": "#eab308",
    "闇": "#8b5cf6",
  };

  const color = colorMap[element] || "#6b7280";

  ctx.fillStyle = color;
  roundRect(ctx, x, y, 76, 32, 16, true, false);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 18px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${element}属性`, x + 38, y + 16);

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 92, y + 16);
  ctx.lineTo(x + width - 40, y + 16);
  ctx.stroke();
}

function drawSpBadge(ctx, rightX, topY) {
  const text = "SP";
  ctx.font = "bold 14px 'Segoe UI', sans-serif";

  const textWidth = ctx.measureText(text).width;
  const badgeW = Math.max(32, textWidth + 14);
  const badgeH = 24;
  const x = rightX - badgeW;
  const y = topY;

  ctx.fillStyle = "rgba(245, 158, 11, 0.95)";
  roundRect(ctx, x, y, badgeW, badgeH, 12, true, false);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + badgeW / 2, y + badgeH / 2 + 1);

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function loadOwnerName() {
  try {
    return localStorage.getItem(OWNER_NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveOwnerName() {
  try {
    localStorage.setItem(OWNER_NAME_KEY, ownerNameInput.value.trim());
  } catch {
    // 何もしない
  }
}

function loadOwnerName() {
  try {
    return localStorage.getItem(OWNER_NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveOwnerName() {
  try {
    localStorage.setItem(OWNER_NAME_KEY, ownerNameInput.value.trim());
  } catch {
    // 何もしない
  }
}

function getTodayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

function drawExportHeader(ctx, canvasWidth, paddingX, topY, headerH) {
  const summary = getSummaryCounts();
  const today = getTodayString();
  const ownerName = ownerNameInput.value.trim();

  const leftX = paddingX;
  const rightX = canvasWidth - paddingX;
  const titleY = topY + 24;
  const infoY = topY + 54;
  const ownerY = topY + 78;

  ctx.fillStyle = "#111827";
  ctx.font = "bold 24px 'Segoe UI', 'Hiragino Sans', 'Yu Gothic UI', sans-serif";
  ctx.textAlign = "start";
  ctx.textBaseline = "middle";
  ctx.fillText("プリコネ所持チェッカー", leftX, titleY);

  ctx.fillStyle = "#4b5563";
  ctx.font = "15px 'Segoe UI', 'Hiragino Sans', 'Yu Gothic UI', sans-serif";
  ctx.fillText(
    `総所持 ${summary.owned} / CR>0 ${summary.crPositive} / SPあり ${summary.spPositive}`,
    leftX,
    infoY
  );

  ctx.fillStyle = "#374151";
  ctx.font = "15px 'Segoe UI', 'Hiragino Sans', 'Yu Gothic UI', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(today, rightX, infoY);

  if (ownerName) {
    ctx.fillStyle = "#111827";
    ctx.font = "bold 16px 'Segoe UI', 'Hiragino Sans', 'Yu Gothic UI', sans-serif";
    ctx.fillText(ownerName, rightX, ownerY);
  }

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(leftX, topY + headerH);
  ctx.lineTo(rightX, topY + headerH);
  ctx.stroke();

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

initializeApp();