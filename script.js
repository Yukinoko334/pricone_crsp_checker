const ELEMENTS = ["火", "水", "風", "光", "闇"];
const STORAGE_KEY = "pricone_checker_state_v1";
const OWNER_NAME_KEY = "pricone_checker_owner_name_v1";

let characters = [];
let state = {};

const app = document.getElementById("app");
const searchInput = document.getElementById("searchInput");
const ownershipFilter = document.getElementById("ownershipFilter");
const crRangeFilter = document.getElementById("crRangeFilter");
const spFilter = document.getElementById("spFilter");
const exportMenuBtn = document.getElementById("exportMenuBtn");
const bulkOwnedBtn = document.getElementById("bulkOwnedBtn");
const bulkUnownedBtn = document.getElementById("bulkUnownedBtn");
const bulkApplyBtn = document.getElementById("bulkApplyBtn");
const backupMenuBtn = document.getElementById("backupMenuBtn");
const resetBtn = document.getElementById("resetBtn");
const ownedCount = document.getElementById("ownedCount");
const crCount = document.getElementById("crCount");
const spCount = document.getElementById("spCount");
const toolbarToggleBtn = document.getElementById("toolbarToggleBtn");
const toolbarBottom = document.getElementById("toolbarBottom");
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
    crRangeFilter.addEventListener("change", render);
    spFilter.addEventListener("change", render);
    exportMenuBtn.addEventListener("click", showExportMenu);
    bulkOwnedBtn.addEventListener("click", handleBulkOwned);
    bulkUnownedBtn.addEventListener("click", handleBulkUnowned);
    bulkApplyBtn.addEventListener("click", showBulkApplyModal);
    backupMenuBtn.addEventListener("click", showBackupMenu);
    resetBtn.addEventListener("click", handleReset);
    toolbarToggleBtn.addEventListener("click", toggleToolbarMenu);
    modalCloseBtn.addEventListener("click", closeModal);
    modalBackdrop.addEventListener("click", (e) => {
      if (e.target === modalBackdrop) closeModal();
    });

    syncToolbarMenuForViewport();
    window.addEventListener("resize", syncToolbarMenuForViewport);

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

function encodeShareDataCompactV2() {
  const raw = characters.map((char) => {
    const s = state[char.id];

    const ownedCrValue = s.owned ? (Number(s.cr ?? 0) + 1) : 0;
    const ownedCrChar = ownedCrValue.toString(36);
    const spChar = Number(s.sp ?? 0).toString(36);

    return `${ownedCrChar}${spChar}`;
  }).join("");

  return LZString.compressToEncodedURIComponent(raw);
}

function decodeShareDataCompactV2(encoded) {
  const raw = LZString.decompressFromEncodedURIComponent(encoded);
  if (!raw) {
    throw new Error("圧縮データの復元に失敗しました");
  }

  const fresh = createDefaultState();

  characters.forEach((char, index) => {
    const pos = index * 2;
    const ownedCrChar = raw[pos] ?? "0";
    const spChar = raw[pos + 1] ?? "0";

    const ownedCrValue = parseInt(ownedCrChar, 36);
    const sp = parseInt(spChar, 36);

    if (ownedCrValue === 0 || Number.isNaN(ownedCrValue)) {
      fresh[char.id] = {
        owned: false,
        cr: 0,
        sp: 0,
      };
      return;
    }

    fresh[char.id] = {
      owned: true,
      cr: ownedCrValue - 1,
      sp: sp === 1 ? 1 : 0,
    };
  });

  return fresh;
}

function initializeFromUrl() {
  const params = new URLSearchParams(location.search);
  const compressed = params.get("z");
  const legacy = params.get("data");

  if (!compressed && !legacy) return;

  try {
    if (compressed) {
      state = decodeShareDataCompactV2(compressed);
    } else {
      const decoded = decodeURIComponent(escape(atob(legacy)));
      const parsed = JSON.parse(decoded);
      const fresh = createDefaultState();

      for (const [charId, values] of Object.entries(parsed)) {
        if (!fresh[charId]) continue;

        const cr = Array.isArray(values) ? Number(values[0] ?? 0) : 0;
        const sp = Array.isArray(values) ? Number(values[1] ?? 0) : 0;

        fresh[charId] = {
          owned: true,
          cr: Number.isInteger(cr) ? Math.max(0, Math.min(35, cr)) : 0,
          sp: sp === 1 ? 1 : 0,
        };
      }

      state = fresh;
    }

    saveState();
  } catch (error) {
    console.warn("共有URLの復元に失敗しました", error);
  }
}

function getVisibleCharacters() {
  const keyword = searchInput.value.trim().toLowerCase();
  const ownership = ownershipFilter.value;
  const crRange = crRangeFilter.value;
  const sp = spFilter.value;

  return characters.filter((char) => {
    const s = state[char.id];

    const nameMatch = !keyword || char.name.toLowerCase().includes(keyword);
    if (!nameMatch) return false;

    if (ownership === "owned" && !s.owned) return false;
    if (ownership === "unowned" && s.owned) return false;

    if (crRange !== "all") {
      const cr = Number(s.cr ?? 0);

      if (crRange === "0") {
        if (cr !== 0) return false;
      } else {
        const [min, max] = crRange.split("-").map(Number);
        if (cr < min || cr > max) return false;
      }
    }

    if (sp !== "all") {
      const spValue = Number(s.sp ?? 0);
      if (spValue !== Number(sp)) return false;
    }

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
  const encoded = encodeShareDataCompactV2();
  const url = `${location.origin}${location.pathname}?z=${encoded}`;

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <p>圧縮共有URLです。</p>
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
  try {
    const grouped = {};

    for (const element of ELEMENTS) {
      grouped[element] = characters
        .filter((c) => c.element === element)
        .filter((c) => state[c.id].cr > 0)
        .sort((a, b) =>
          state[b.id].cr - state[a.id].cr ||
          a.sort - b.sort ||
          a.name.localeCompare(b.name, "ja")
        );
    }

    const totalCount = Object.values(grouped).reduce((sum, list) => sum + list.length, 0);
    const wrapper = document.createElement("div");

    if (totalCount === 0) {
      wrapper.innerHTML = `
        <p>現在は画像出力対象がありません。</p>
        <div class="note">CR が 1 以上のキャラを登録すると、画像を出力できます。</div>
      `;
      showModal("CR&専用SP画像出力", wrapper);
      return;
    }

    const pageGroups = buildExportPageGroups(ELEMENTS, 2);
    const pages = [];

    for (const pageElements of pageGroups) {
      const pageHasAny = pageElements.some((element) => (grouped[element] || []).length > 0);
      if (!pageHasAny) continue;

      const url = await drawExportPageCanvas(grouped, pageElements);
      pages.push({
        pageNo: pages.length + 1,
        elements: pageElements,
        url,
      });
    }

    const wrapperPreview = document.createElement("div");
    wrapperPreview.className = "export-preview";

    const images = document.createElement("div");
    images.className = "preview-images";

    for (const page of pages) {
      const block = document.createElement("div");
      block.className = "preview-block";
      block.innerHTML = `
        <h3>画像${page.pageNo} (${page.elements.join("・")}属性)</h3>
        <img src="${page.url}" alt="画像${page.pageNo}">
      `;

      const dl = document.createElement("a");
      dl.className = "button primary";
      dl.textContent = `画像${page.pageNo}を保存`;
      dl.href = page.url;
      dl.download = `pricone_export_page${page.pageNo}.png`;
      dl.style.display = "inline-flex";
      dl.style.alignItems = "center";
      dl.style.justifyContent = "center";
      dl.style.marginTop = "10px";

      block.appendChild(dl);
      images.appendChild(block);
    }

    wrapperPreview.appendChild(images);
    wrapper.appendChild(wrapperPreview);
    wrapper.insertAdjacentHTML(
      "beforeend",
      `<div class="note">CR 1 以上のキャラを属性ごとに画像出力しています。</div>`
    );

    showModal("CR&専用SP画像出力", wrapper);
  } catch (error) {
    console.error("画像出力エラー:", error);
    alert("画像出力でエラーが発生しました。F12 の Console を確認してください。");
  }
}

async function handleExportUnownedImages() {
  try {
    const grouped = {};

    for (const element of ELEMENTS) {
      grouped[element] = characters
        .filter((c) => c.element === element)
        .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "ja"))
        .filter((c) => !state[c.id].owned);
    }

    const totalCount = Object.values(grouped).reduce((sum, list) => sum + list.length, 0);

    const wrapper = document.createElement("div");

    if (totalCount === 0) {
      wrapper.innerHTML = `
        <p>現在は未所持キャラがいません。</p>
        <div class="note">すべてのキャラが所持済みです。</div>
      `;
      showModal("未所持キャラ画像出力", wrapper);
      return;
    }

    const pageGroups = buildExportPageGroups(ELEMENTS, 2);
    const pages = [];

    for (const pageElements of pageGroups) {
      const pageHasAny = pageElements.some((element) => (grouped[element] || []).length > 0);
      if (!pageHasAny) continue;

      const url = await drawUnownedExportPageCanvas(grouped, pageElements);
      pages.push({
        pageNo: pages.length + 1,
        elements: pageElements,
        url,
      });
    }

    const preview = document.createElement("div");
    preview.className = "export-preview";

    const images = document.createElement("div");
    images.className = "preview-images";

    for (const page of pages) {
      const block = document.createElement("div");
      block.className = "preview-block";
      block.innerHTML = `
        <h3>未所持キャラ画像${page.pageNo} (${page.elements.join("・")}属性)</h3>
        <img src="${page.url}" alt="未所持キャラ画像${page.pageNo}">
      `;

      const dl = document.createElement("a");
      dl.className = "button primary";
      dl.textContent = `未所持キャラ画像${page.pageNo}を保存`;
      dl.href = page.url;
      dl.download = `pricone_unowned_page${page.pageNo}.png`;
      dl.style.display = "inline-flex";
      dl.style.alignItems = "center";
      dl.style.justifyContent = "center";
      dl.style.marginTop = "10px";

      block.appendChild(dl);
      images.appendChild(block);
    }

    preview.appendChild(images);
    wrapper.appendChild(preview);
    wrapper.insertAdjacentHTML(
      "beforeend",
      `<div class="note">未所持キャラのみを属性ごとに画像出力しています。</div>`
    );

    showModal("未所持キャラ画像出力", wrapper);
  } catch (error) {
    console.error("未所持画像出力エラー:", error);
    alert("未所持キャラ画像出力でエラーが発生しました。F12 の Console を確認してください。");
  }
}

async function handleExportOwnedImages() {
  try {
    const grouped = {};

    for (const element of ELEMENTS) {
      grouped[element] = characters
        .filter((c) => c.element === element)
        .filter((c) => state[c.id].owned)
        .sort((a, b) =>
          state[b.id].cr - state[a.id].cr ||
          a.sort - b.sort ||
          a.name.localeCompare(b.name, "ja")
        );
    }

    const totalCount = Object.values(grouped).reduce((sum, list) => sum + list.length, 0);
    const wrapper = document.createElement("div");

    if (totalCount === 0) {
      wrapper.innerHTML = `
        <p>現在は所持キャラがありません。</p>
        <div class="note">所持チェックがONのキャラを登録すると、画像を出力できます。</div>
      `;
      showModal("所持キャラ画像出力", wrapper);
      return;
    }

    const pageGroups = buildExportPageGroups(ELEMENTS, 2);
    const pages = [];

    for (const pageElements of pageGroups) {
      const pageHasAny = pageElements.some((element) => (grouped[element] || []).length > 0);
      if (!pageHasAny) continue;

      const url = await drawOwnedExportPageCanvas(grouped, pageElements);
      pages.push({
        pageNo: pages.length + 1,
        elements: pageElements,
        url,
      });
    }

    const preview = document.createElement("div");
    preview.className = "export-preview";

    const images = document.createElement("div");
    images.className = "preview-images";

    for (const page of pages) {
      const block = document.createElement("div");
      block.className = "preview-block";
      block.innerHTML = `
        <h3>所持画像${page.pageNo} (${page.elements.join("・")}属性)</h3>
        <img src="${page.url}" alt="所持画像${page.pageNo}">
      `;

      const dl = document.createElement("a");
      dl.className = "button primary";
      dl.textContent = `所持画像${page.pageNo}を保存`;
      dl.href = page.url;
      dl.download = `pricone_owned_page${page.pageNo}.png`;
      dl.style.display = "inline-flex";
      dl.style.alignItems = "center";
      dl.style.justifyContent = "center";
      dl.style.marginTop = "10px";

      block.appendChild(dl);
      images.appendChild(block);
    }

    preview.appendChild(images);
    wrapper.appendChild(preview);
    wrapper.insertAdjacentHTML(
      "beforeend",
      `<div class="note">所持チェックがONのキャラを属性ごとに画像出力しています。CR 0 の場合はバッジを表示しません。</div>`
    );

    showModal("所持キャラ画像出力", wrapper);
  } catch (error) {
    console.error("所持キャラ画像出力エラー:", error);
    alert("所持キャラ画像出力でエラーが発生しました。F12 の Console を確認してください。");
  }
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

  ctx.font = "bold 16px 'Segoe UI', sans-serif";
  const textWidth = ctx.measureText(text).width;

  const badgeW = Math.max(24, textWidth + 12);
  const badgeH = 22;

  const x = rightX - badgeW;
  const y = bottomY - badgeH;

  ctx.fillStyle = "rgba(17, 24, 39, 0.92)";
  roundRect(ctx, x, y, badgeW, badgeH, 10, true, false);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + badgeW / 2, y + badgeH / 2 + 0.5);

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
  crRangeFilter.value = "all";
  spFilter.value = "all";
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

async function drawExportPageCanvas(grouped, pageElements) {
  const pagePaddingX = 28;
  const pagePaddingTop = 24;
  const pagePaddingBottom = 28;
  const headerH = 96;

  const blockGapX = 20;
  const blockGapY = 18;
  const blockWidth = 360;

  const rows = buildRowsForPage(pageElements);

  const blockHeights = rows.map(([left, right]) => {
    const leftHeight = left ? getElementBlockHeight(grouped[left] || []) : 0;
    const rightHeight = right ? getElementBlockHeight(grouped[right] || []) : 0;
    return Math.max(leftHeight, rightHeight);
  });

  const width = pagePaddingX * 2 + blockWidth * 2 + blockGapX;
  const totalBlocksHeight =
    blockHeights.reduce((sum, h) => sum + h, 0) + blockGapY * Math.max(0, rows.length - 1);
  const height = pagePaddingTop + headerH + 20 + totalBlocksHeight + pagePaddingBottom;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f9fafb";
  ctx.fillRect(0, 0, width, height);

  drawExportHeader(ctx, width, pagePaddingX, pagePaddingTop, headerH);

  let currentY = pagePaddingTop + headerH + 20;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const [leftElement, rightElement] = rows[rowIndex];
    const rowHeight = blockHeights[rowIndex];

    const leftX = pagePaddingX;
    const rightX = pagePaddingX + blockWidth + blockGapX;

    if (leftElement) {
      await drawElementBlock(ctx, leftElement, grouped[leftElement] || [], leftX, currentY, blockWidth);
    }

    if (rightElement) {
      await drawElementBlock(ctx, rightElement, grouped[rightElement] || [], rightX, currentY, blockWidth);
    }

    currentY += rowHeight + blockGapY;
  }

  return canvas.toDataURL("image/png");
}

async function drawUnownedExportPageCanvas(grouped, pageElements) {
  const pagePaddingX = 28;
  const pagePaddingTop = 24;
  const pagePaddingBottom = 28;
  const headerH = 96;

  const blockGapX = 20;
  const blockGapY = 18;
  const blockWidth = 360;

  const rows = buildRowsForPage(pageElements);

  const blockHeights = rows.map(([left, right]) => {
    const leftHeight = left ? getUnownedElementBlockHeight(grouped[left] || []) : 0;
    const rightHeight = right ? getUnownedElementBlockHeight(grouped[right] || []) : 0;
    return Math.max(leftHeight, rightHeight);
  });

  const width = pagePaddingX * 2 + blockWidth * 2 + blockGapX;
  const totalBlocksHeight =
    blockHeights.reduce((sum, h) => sum + h, 0) + blockGapY * Math.max(0, rows.length - 1);
  const height = pagePaddingTop + headerH + 20 + totalBlocksHeight + pagePaddingBottom;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f9fafb";
  ctx.fillRect(0, 0, width, height);

  drawUnownedExportHeader(ctx, width, pagePaddingX, pagePaddingTop, headerH);

  let currentY = pagePaddingTop + headerH + 20;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const [leftElement, rightElement] = rows[rowIndex];
    const rowHeight = blockHeights[rowIndex];

    const leftX = pagePaddingX;
    const rightX = pagePaddingX + blockWidth + blockGapX;

    if (leftElement) {
      await drawUnownedElementBlock(ctx, leftElement, grouped[leftElement] || [], leftX, currentY, blockWidth);
    }

    if (rightElement) {
      await drawUnownedElementBlock(ctx, rightElement, grouped[rightElement] || [], rightX, currentY, blockWidth);
    }

    currentY += rowHeight + blockGapY;
  }

  return canvas.toDataURL("image/png");
}

async function drawUnownedElementBlock(ctx, element, list, x, y, blockWidth) {
  const sectionTitleH = 42;
  const sectionInnerTop = 12;
  const sectionInnerBottom = 14;
  const iconAreaTop = 6;

  const cols = 5;
  const iconSize = 56;
  const cellW = 64;
  const cellH = 72;

  const blockHeight = getUnownedElementBlockHeight(list);

  ctx.fillStyle = "#ffffff";
  roundRect(ctx, x, y, blockWidth, blockHeight, 16, true, false);

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, blockWidth, blockHeight, 16, false, true);

  drawSectionHeaderInBlock(ctx, element, x + 14, y + 10, blockWidth - 28);

  if (list.length === 0) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = "14px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("該当キャラなし", x + blockWidth / 2, y + 68);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
    return;
  }

  const images = await Promise.all(list.map(loadIconImage));

  const gridStartX = x + 18;
  const gridStartY = y + sectionTitleH + sectionInnerTop + iconAreaTop;

  images.forEach((img, index) => {
    const char = list[index];

    const col = index % cols;
    const row = Math.floor(index / cols);

    const drawX = gridStartX + col * cellW;
    const drawY = gridStartY + row * cellH;

    drawRoundedImageOrPlaceholder(ctx, img, char, drawX, drawY, iconSize, iconSize);
  });
}

function drawUnownedExportHeader(ctx, canvasWidth, paddingX, topY, headerH) {
  const values = Object.values(state);
  const unownedCount = values.filter((v) => !v.owned).length;
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
  ctx.fillText("プリコネ未所持キャラ一覧", leftX, titleY);

  ctx.fillStyle = "#4b5563";
  ctx.font = "15px 'Segoe UI', 'Hiragino Sans', 'Yu Gothic UI', sans-serif";
  ctx.fillText(`未所持 ${unownedCount}`, leftX, infoY);

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

function showExportMenu() {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `<p>外部出力の方法を選択してください。</p>`;

  const urlBtn = document.createElement("button");
  urlBtn.className = "button";
  urlBtn.textContent = "共有URL生成";
  urlBtn.addEventListener("click", () => {
    closeModal();
    handleShareUrl();
  });

  const crSpImageBtn = document.createElement("button");
  crSpImageBtn.className = "button primary";
  crSpImageBtn.textContent = "CR&専用SP画像出力";
  crSpImageBtn.addEventListener("click", () => {
    closeModal();
    handleExportImages();
  });

  const ownedImageBtn = document.createElement("button");
  ownedImageBtn.className = "button primary";
  ownedImageBtn.textContent = "所持キャラ画像出力";
  ownedImageBtn.addEventListener("click", () => {
    closeModal();
    handleExportOwnedImages();
  });

  const unownedImageBtn = document.createElement("button");
  unownedImageBtn.className = "button primary";
  unownedImageBtn.textContent = "未所持キャラ画像出力";
  unownedImageBtn.addEventListener("click", () => {
    closeModal();
    handleExportUnownedImages();
  });

  showModal("外部出力", wrapper, [
    urlBtn,
    crSpImageBtn,
    ownedImageBtn,
    unownedImageBtn,
  ]);
}

function handleBulkOwned() {
  const ok = confirm("全キャラを所持状態にします。よろしいですか？");
  if (!ok) return;

  for (const char of characters) {
    state[char.id] = {
      owned: true,
      cr: state[char.id]?.cr ?? 0,
      sp: state[char.id]?.sp ?? 0,
    };
  }

  saveState();
  render();
}

function handleBulkUnowned() {
  const ok = confirm("全キャラを未所持状態にします。よろしいですか？");
  if (!ok) return;

  for (const char of characters) {
    state[char.id] = {
      owned: false,
      cr: 0,
      sp: 0,
    };
  }

  saveState();
  render();
}

function showBulkApplyModal() {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <p>所持中キャラに対して一括設定を適用します。</p>
    <div style="display:grid; gap:12px; margin-top:12px;">
      <label>
        CR
        <select id="bulkCrSelect" class="control" style="width:100%; margin-top:6px;">
          ${Array.from({ length: 16 }, (_, i) => `<option value="${i}">${i}</option>`).join("")}
        </select>
      </label>
      <label>
        専用SP
        <select id="bulkSpSelect" class="control" style="width:100%; margin-top:6px;">
          <option value="0">なし</option>
          <option value="1">あり</option>
        </select>
      </label>
    </div>
  `;

  const applyBtn = document.createElement("button");
  applyBtn.className = "button primary";
  applyBtn.textContent = "適用";
  applyBtn.addEventListener("click", () => {
    const cr = Number(document.getElementById("bulkCrSelect").value);
    const sp = Number(document.getElementById("bulkSpSelect").value);

    for (const char of characters) {
      if (!state[char.id]?.owned) continue;
      state[char.id].cr = cr;
      state[char.id].sp = sp;
    }

    saveState();
    closeModal();
    render();
  });

  showModal("一括設定", wrapper, [applyBtn]);
}

function showBackupMenu() {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = `<p>バックアップの方法を選択してください。</p>`;

  const saveBtn = document.createElement("button");
  saveBtn.className = "button primary";
  saveBtn.textContent = "バックアップ保存";
  saveBtn.addEventListener("click", () => {
    closeModal();
    handleBackupExport();
  });

  const loadBtn = document.createElement("button");
  loadBtn.className = "button";
  loadBtn.textContent = "バックアップ読込";
  loadBtn.addEventListener("click", () => {
    closeModal();
    handleBackupImport();
  });

  showModal("バックアップ", wrapper, [saveBtn, loadBtn]);
}

function handleBackupExport() {
  const backupData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    ownerName: ownerNameInput ? ownerNameInput.value.trim() : "",
    state: state,
  };

  const json = JSON.stringify(backupData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");

  const owner = (ownerNameInput?.value.trim() || "player").replace(/[\\\\/:*?\"<>|]/g, "_");
  const fileName = `pricone_backup_${owner}_${y}${m}${d}_${hh}${mm}.json`;

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function handleBackupImport() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!parsed || typeof parsed !== "object") {
        throw new Error("JSON形式が不正です。");
      }

      if (!parsed.state || typeof parsed.state !== "object") {
        throw new Error("バックアップ内に state がありません。");
      }

      const normalized = normalizeState(parsed.state);
      state = normalized;
      saveState();

      if (typeof parsed.ownerName === "string" && ownerNameInput) {
        ownerNameInput.value = parsed.ownerName;
        saveOwnerName();
      }

      render();
      alert("バックアップを読み込みました。");
    } catch (error) {
      console.error("バックアップ読込エラー:", error);
      alert("バックアップ読込に失敗しました。JSONファイルの内容を確認してください。");
    }
  });

  input.click();
}

function getElementBlockHeight(list) {
  const sectionTitleH = 42;
  const sectionInnerTop = 12;
  const sectionInnerBottom = 14;
  const iconAreaTop = 6;
  const cols = 5;
  const cellH = 92;

  const count = list.length;
  const rows = Math.max(1, Math.ceil(count / cols));

  return sectionTitleH + sectionInnerTop + iconAreaTop + rows * cellH + sectionInnerBottom;
}

function getUnownedElementBlockHeight(list) {
  const sectionTitleH = 42;
  const sectionInnerTop = 12;
  const sectionInnerBottom = 14;
  const iconAreaTop = 6;
  const cols = 5;
  const cellH = 72;

  const count = list.length;
  const rows = Math.max(1, Math.ceil(count / cols));

  return sectionTitleH + sectionInnerTop + iconAreaTop + rows * cellH + sectionInnerBottom;
}

async function drawElementBlock(ctx, element, list, x, y, blockWidth) {
  const sectionTitleH = 42;
  const sectionInnerTop = 12;
  const sectionInnerBottom = 14;
  const iconAreaTop = 6;

  const cols = 5;
  const iconSize = 56;
  const cellW = 64;
  const cellH = 92;

  const rows = Math.max(1, Math.ceil(list.length / cols));
  const blockHeight = getElementBlockHeight(list);

  ctx.fillStyle = "#ffffff";
  roundRect(ctx, x, y, blockWidth, blockHeight, 16, true, false);

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, blockWidth, blockHeight, 16, false, true);

  drawSectionHeaderInBlock(ctx, element, x + 14, y + 10, blockWidth - 28);

  if (list.length === 0) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = "14px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("該当キャラなし", x + blockWidth / 2, y + 68);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
    return;
  }

  const images = await Promise.all(list.map(loadIconImage));

  const gridStartX = x + 18;
  const gridStartY = y + sectionTitleH + sectionInnerTop + iconAreaTop;

  images.forEach((img, index) => {
    const char = list[index];
    const s = state[char.id];

    const col = index % cols;
    const row = Math.floor(index / cols);

    const drawX = gridStartX + col * cellW;
    const drawY = gridStartY + row * cellH;

    drawRoundedImageOrPlaceholder(ctx, img, char, drawX, drawY, iconSize, iconSize);
    drawCrBadge(ctx, drawX + iconSize - 1, drawY + iconSize - 1, s.cr);

    if (s.sp === 1) {
      drawSpBadge(ctx, drawX + iconSize - 2, drawY + 2);
    }
  });
}

function drawSectionHeaderInBlock(ctx, element, x, y, width) {
  const colorMap = {
    "火": "#ef4444",
    "水": "#3b82f6",
    "風": "#10b981",
    "光": "#eab308",
    "闇": "#8b5cf6",
  };

  const color = colorMap[element] || "#6b7280";

  ctx.fillStyle = color;
  roundRect(ctx, x, y, 74, 28, 14, true, false);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`${element}属性`, x + 37, y + 14);

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 88, y + 14);
  ctx.lineTo(x + width, y + 14);
  ctx.stroke();
}

function buildRowsForPage(pageElements) {
  const rows = [];

  for (let i = 0; i < pageElements.length; i += 2) {
    rows.push([pageElements[i] || null, pageElements[i + 1] || null]);
  }

  return rows;
}

function toggleToolbarMenu() {
  const isCollapsed = toolbarBottom.classList.contains("is-collapsed");

  if (isCollapsed) {
    toolbarBottom.classList.remove("is-collapsed");
    toolbarToggleBtn.textContent = "操作メニューを閉じる";
    toolbarToggleBtn.setAttribute("aria-expanded", "true");
  } else {
    toolbarBottom.classList.add("is-collapsed");
    toolbarToggleBtn.textContent = "操作メニューを開く";
    toolbarToggleBtn.setAttribute("aria-expanded", "false");
  }
}

function syncToolbarMenuForViewport() {
  if (window.innerWidth > 720) {
    toolbarBottom.classList.remove("is-collapsed");
    toolbarToggleBtn.setAttribute("aria-expanded", "true");
  } else {
    toolbarBottom.classList.add("is-collapsed");
    toolbarToggleBtn.textContent = "操作メニューを開く";
    toolbarToggleBtn.setAttribute("aria-expanded", "false");
  }
}

function buildExportPageGroups(elements, perPage = 2) {
  const pages = [];
  for (let i = 0; i < elements.length; i += perPage) {
    pages.push(elements.slice(i, i + perPage));
  }
  return pages;
}

async function drawOwnedExportPageCanvas(grouped, pageElements) {
  const pagePaddingX = 28;
  const pagePaddingTop = 24;
  const pagePaddingBottom = 28;
  const headerH = 96;

  const blockGapX = 20;
  const blockGapY = 18;
  const blockWidth = 360;

  const rows = buildRowsForPage(pageElements);

  const blockHeights = rows.map(([left, right]) => {
    const leftHeight = left ? getElementBlockHeight(grouped[left] || []) : 0;
    const rightHeight = right ? getElementBlockHeight(grouped[right] || []) : 0;
    return Math.max(leftHeight, rightHeight);
  });

  const width = pagePaddingX * 2 + blockWidth * 2 + blockGapX;
  const totalBlocksHeight =
    blockHeights.reduce((sum, h) => sum + h, 0) + blockGapY * Math.max(0, rows.length - 1);
  const height = pagePaddingTop + headerH + 20 + totalBlocksHeight + pagePaddingBottom;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f9fafb";
  ctx.fillRect(0, 0, width, height);

  drawOwnedExportHeader(ctx, width, pagePaddingX, pagePaddingTop, headerH);

  let currentY = pagePaddingTop + headerH + 20;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const [leftElement, rightElement] = rows[rowIndex];
    const rowHeight = blockHeights[rowIndex];

    const leftX = pagePaddingX;
    const rightX = pagePaddingX + blockWidth + blockGapX;

    if (leftElement) {
      await drawOwnedElementBlock(ctx, leftElement, grouped[leftElement] || [], leftX, currentY, blockWidth);
    }

    if (rightElement) {
      await drawOwnedElementBlock(ctx, rightElement, grouped[rightElement] || [], rightX, currentY, blockWidth);
    }

    currentY += rowHeight + blockGapY;
  }

  return canvas.toDataURL("image/png");
}

function drawOwnedExportHeader(ctx, canvasWidth, paddingX, topY, headerH) {
  const values = Object.values(state);
  const ownedCount = values.filter((v) => v.owned).length;
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
  ctx.fillText("プリコネ所持キャラ一覧", leftX, titleY);

  ctx.fillStyle = "#4b5563";
  ctx.font = "15px 'Segoe UI', 'Hiragino Sans', 'Yu Gothic UI', sans-serif";
  ctx.fillText(`所持 ${ownedCount}`, leftX, infoY);

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

async function drawOwnedElementBlock(ctx, element, list, x, y, blockWidth) {
  const sectionTitleH = 42;
  const sectionInnerTop = 12;
  const sectionInnerBottom = 14;
  const iconAreaTop = 6;

  const cols = 5;
  const iconSize = 56;
  const cellW = 64;
  const cellH = 92;

  const blockHeight = getElementBlockHeight(list);

  ctx.fillStyle = "#ffffff";
  roundRect(ctx, x, y, blockWidth, blockHeight, 16, true, false);

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, blockWidth, blockHeight, 16, false, true);

  drawSectionHeaderInBlock(ctx, element, x + 14, y + 10, blockWidth - 28);

  if (list.length === 0) {
    ctx.fillStyle = "#9ca3af";
    ctx.font = "14px 'Segoe UI', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("該当キャラなし", x + blockWidth / 2, y + 68);
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";
    return;
  }

  const images = await Promise.all(list.map(loadIconImage));

  const gridStartX = x + 18;
  const gridStartY = y + sectionTitleH + sectionInnerTop + iconAreaTop;

  images.forEach((img, index) => {
    const char = list[index];
    const s = state[char.id];

    const col = index % cols;
    const row = Math.floor(index / cols);

    const drawX = gridStartX + col * cellW;
    const drawY = gridStartY + row * cellH;

    drawRoundedImageOrPlaceholder(ctx, img, char, drawX, drawY, iconSize, iconSize);

    if (s.cr > 0) {
      drawCrBadge(ctx, drawX + iconSize - 1, drawY + iconSize - 1, s.cr);
    }

    if (s.sp === 1) {
      drawSpBadge(ctx, drawX + iconSize - 2, drawY + 2);
    }
  });
}

initializeApp();