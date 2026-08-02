const ELEMENTS = ["火", "水", "風", "光", "闇"];
const STORAGE_KEY = "pricone_checker_state_v1";
const OWNER_NAME_KEY = "pricone_checker_owner_name_v1";
const CLAN_BATTLE_FORMATION_KEY = "pricone_checker_clan_battle_formation_v1";
const CLAN_BATTLE_BOSS_CONFIG_PATH = "./data/clan_battle_bosses.json";

let characters = [];
let state = {};
let clanBattleBossConfig = null;

const app = document.getElementById("app");
const searchInput = document.getElementById("searchInput");
const ownershipFilter = document.getElementById("ownershipFilter");
const crRangeFilter = document.getElementById("crRangeFilter");
const spFilter = document.getElementById("spFilter");
const exportMenuBtn = document.getElementById("exportMenuBtn");
const clanBattleBtn = document.getElementById("clanBattleBtn");
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
    clanBattleBtn.addEventListener("click", showClanBattleFormationModal);
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
    specialSp: char.specialSp === true,
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

  const modal = modalBackdrop.querySelector(".modal");
  const isClanBattleModal =
    typeof content !== "string" &&
    (content.classList?.contains("clan-battle-form") ||
      content.classList?.contains("clan-battle-result-preview"));
  modal?.classList.toggle("clan-battle-modal", isClanBattleModal);

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
  modalBackdrop.querySelector(".modal")?.classList.remove("clan-battle-modal");
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
  return `${y}-${m}-${d}`;
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

  const sheetCsvBtn = document.createElement("button");
  sheetCsvBtn.className = "button primary";
  sheetCsvBtn.textContent = "スプレッドシート読込データ出力";
  sheetCsvBtn.addEventListener("click", () => {
    closeModal();
    handleSpreadsheetCsvExport();
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
    sheetCsvBtn,
    crSpImageBtn,
    ownedImageBtn,
    unownedImageBtn,
  ]);
}

function handleSpreadsheetCsvExport() {
  try {
    const csvText = buildSpreadsheetCsvText();
    const fileName = buildSpreadsheetCsvFileName();
    downloadCsvFile(csvText, fileName);
  } catch (error) {
    console.error("スプレッドシート読込データ出力エラー:", error);
    alert("スプレッドシート読込データ出力でエラーが発生しました。");
  }
}

function buildSpreadsheetCsvText() {
  const header = [
    "表示名",
    "更新日",
    "総所持数",
    "CR1以上数",
    "SP所持数",
    "キャラ名",
    "コネクトランク",
    "専用SP",
    "共有URL"
  ];

  const rows = buildSpreadsheetCsvRows();

  return [header, ...rows]
    .map(row => row.map(escapeCsvCell).join(","))
    .join("\r\n");
}

function buildSpreadsheetCsvRows() {
  const ownerName = (ownerNameInput?.value || "").trim();
  const displayName = ownerName || "未設定";
  const updateDate = getTodayString();
  const summary = getSummaryCounts();
  const shareUrl = buildCurrentShareUrl();

  const allCharacters = [...characters].sort((a, b) =>
    a.sort - b.sort ||
    a.name.localeCompare(b.name, "ja")
  );

  return allCharacters.map(char => {
    const s = state[char.id] || { owned: false, cr: 0, sp: 0 };
    const owned = !!s.owned;

    return [
      displayName,
      updateDate,
      summary.owned,
      summary.crPositive,
      summary.spPositive,
      char.name,
      owned ? Number(s.cr || 0) : "未所持",
      owned && Number(s.sp || 0) === 1 ? "あり" : "なし",
      shareUrl
    ];
  });
}

function buildCurrentShareUrl() {
  const encoded = encodeShareDataCompactV2();
  return `${location.origin}${location.pathname}?z=${encoded}`;
}

function buildSpreadsheetCsvFileName() {
  const ownerName = (ownerNameInput?.value || "player").trim() || "player";
  const safeOwner = ownerName.replace(/[\\/:*?"<>|]/g, "_");
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");

  return `pricone_sheet_import_${safeOwner}_${y}${m}${d}_${hh}${mm}.csv`;
}

function escapeCsvCell(value) {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function downloadCsvFile(csvText, fileName) {
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvText], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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


async function loadClanBattleBossConfig() {
  if (clanBattleBossConfig) return clanBattleBossConfig;

  try {
    const response = await fetch(CLAN_BATTLE_BOSS_CONFIG_PATH, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const raw = await response.json();
    const bosses = Array.isArray(raw?.bosses) ? raw.bosses : [];
    if (bosses.length !== 5) {
      throw new Error("bosses は5件必要です");
    }

    clanBattleBossConfig = {
      year: Number(raw.year),
      month: Number(raw.month),
      bosses: bosses.map((boss, index) => ({
        number: Number(boss.number ?? index + 1),
        name: String(boss.name ?? `${index + 1}ボス`),
        image: String(boss.image ?? ""),
      })),
    };
    return clanBattleBossConfig;
  } catch (error) {
    console.error("クラバトボス設定の読み込みに失敗しました:", error);
    throw new Error("クラバトボス設定を読み込めませんでした。data/clan_battle_bosses.json を確認してください。");
  }
}

function createEmptyClanBattleFormation(config) {
  return {
    year: config.year,
    month: config.month,
    bosses: Object.fromEntries(config.bosses.map((boss) => [String(boss.number), ["", "", "", "", ""]])),
  };
}

function loadClanBattleFormation(config) {
  const empty = createEmptyClanBattleFormation(config);

  try {
    const raw = localStorage.getItem(CLAN_BATTLE_FORMATION_KEY);
    if (!raw) return empty;

    const parsed = JSON.parse(raw);
    if (Number(parsed?.year) !== config.year || Number(parsed?.month) !== config.month) {
      return empty;
    }

    for (const boss of config.bosses) {
      const values = parsed?.bosses?.[String(boss.number)];
      if (!Array.isArray(values)) continue;

      empty.bosses[String(boss.number)] = Array.from({ length: 5 }, (_, index) => {
        const id = String(values[index] ?? "");
        return characters.some((char) => char.id === id) ? id : "";
      });
    }
  } catch (error) {
    console.warn("保存済みクラバト編成の復元に失敗しました:", error);
  }

  return empty;
}

function saveClanBattleFormation(formation) {
  localStorage.setItem(CLAN_BATTLE_FORMATION_KEY, JSON.stringify(formation));
}

function buildCharacterDatalist() {
  const datalist = document.createElement("datalist");
  datalist.id = "clanBattleCharacterCandidates";

  [...characters]
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "ja"))
    .forEach((char) => {
      const option = document.createElement("option");
      option.value = char.name;
      datalist.appendChild(option);
    });

  return datalist;
}

function findCharacterByExactName(name) {
  const normalized = String(name ?? "").trim();
  return characters.find((char) => char.name === normalized) ?? null;
}

async function showClanBattleFormationModal() {
  try {
    const config = await loadClanBattleBossConfig();
    const savedFormation = loadClanBattleFormation(config);
    const wrapper = document.createElement("div");
    wrapper.className = "clan-battle-form";

    const heading = document.createElement("div");
    heading.className = "clan-battle-form-heading";
    heading.innerHTML = `
      <p>${escapeHtml(config.year)}年${escapeHtml(config.month)}月の1～5ボス編成を入力してください。</p>
      <div class="note">キャラ名を入力すると候補が表示されます。同じボス内では同一キャラを重複登録できません。</div>
    `;
    wrapper.appendChild(heading);
    wrapper.appendChild(buildCharacterDatalist());

    const rows = document.createElement("div");
    rows.className = "clan-battle-boss-list";

    for (const boss of config.bosses) {
      const row = document.createElement("section");
      row.className = "clan-battle-boss-row";
      row.dataset.bossNumber = String(boss.number);

      const values = savedFormation.bosses[String(boss.number)] ?? ["", "", "", "", ""];
      const inputsHtml = values.map((charId, index) => {
        const char = characters.find((item) => item.id === charId);
        return `
          <label class="clan-battle-slot">
            <span>キャラ${index + 1}</span>
            <input
              class="control clan-battle-character-input"
              type="text"
              list="clanBattleCharacterCandidates"
              autocomplete="off"
              placeholder="キャラ名"
              value="${escapeHtml(char?.name ?? "")}"
              data-slot-index="${index}"
            >
          </label>
        `;
      }).join("");

      row.innerHTML = `
        <div class="clan-battle-boss-info">
          <div class="clan-battle-boss-label">${escapeHtml(boss.name)}</div>
          <div class="clan-battle-boss-image-wrap">
            ${boss.image
              ? `<img src="${escapeHtml(boss.image)}" alt="${escapeHtml(boss.name)}">`
              : `<span>画像未設定</span>`}
          </div>
        </div>
        <div class="clan-battle-slots">${inputsHtml}</div>
      `;

      rows.appendChild(row);
    }

    wrapper.appendChild(rows);

    const message = document.createElement("div");
    message.className = "clan-battle-message";
    message.setAttribute("aria-live", "polite");
    wrapper.appendChild(message);

    const saveBtn = document.createElement("button");
    saveBtn.className = "button primary";
    saveBtn.textContent = "入力値を保存";
    saveBtn.addEventListener("click", () => {
      const result = collectClanBattleFormation(wrapper, config, false);
      if (!result.ok) {
        message.textContent = result.message;
        message.classList.add("error");
        return;
      }

      saveClanBattleFormation(result.formation);
      message.textContent = "編成入力値を保存しました。";
      message.classList.remove("error");
    });

    const outputBtn = document.createElement("button");
    outputBtn.className = "button primary";
    outputBtn.textContent = "CR一致状況出力";
    outputBtn.addEventListener("click", async () => {
      const result = collectClanBattleFormation(wrapper, config, true);
      if (!result.ok) {
        message.textContent = result.message;
        message.classList.add("error");
        return;
      }

      const ownerName = ownerNameInput.value.trim();
      if (!ownerName) {
        message.textContent = "プレイヤー名を入力してから出力してください。";
        message.classList.add("error");
        ownerNameInput.focus();
        return;
      }

      saveClanBattleFormation(result.formation);
      message.textContent = "画像を生成しています…";
      message.classList.remove("error");
      outputBtn.disabled = true;

      try {
        const imageUrl = await drawClanBattleResultCanvas(config, result.formation, ownerName);
        showClanBattleResultPreview(config, imageUrl, ownerName);
      } catch (error) {
        console.error("クラバトCR一致状況画像出力エラー:", error);
        message.textContent = "画像生成に失敗しました。画像パスやブラウザのConsoleを確認してください。";
        message.classList.add("error");
      } finally {
        outputBtn.disabled = false;
      }
    });

    showModal("クラバトCR一致状況", wrapper, [saveBtn, outputBtn]);
  } catch (error) {
    console.error(error);
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    showModal("クラバトCR一致状況", wrapper);
  }
}

function collectClanBattleFormation(wrapper, config, requireAll) {
  wrapper.querySelectorAll(".clan-battle-character-input").forEach((input) => input.classList.remove("input-error"));

  const formation = createEmptyClanBattleFormation(config);
  const errors = [];

  for (const boss of config.bosses) {
    const row = wrapper.querySelector(`[data-boss-number="${boss.number}"]`);
    const inputs = [...row.querySelectorAll(".clan-battle-character-input")];
    const selectedIds = [];

    inputs.forEach((input, index) => {
      const name = input.value.trim();
      if (!name) {
        if (requireAll) {
          input.classList.add("input-error");
          errors.push(`${boss.name}のキャラ${index + 1}が未入力です`);
        }
        selectedIds.push("");
        return;
      }

      const char = findCharacterByExactName(name);
      if (!char) {
        input.classList.add("input-error");
        errors.push(`${boss.name}のキャラ${index + 1}は候補から選択してください`);
        selectedIds.push("");
        return;
      }

      selectedIds.push(char.id);
    });

    const duplicateIds = selectedIds.filter((id, index) => id && selectedIds.indexOf(id) !== index);
    if (duplicateIds.length > 0) {
      inputs.forEach((input, index) => {
        if (selectedIds[index] && duplicateIds.includes(selectedIds[index])) input.classList.add("input-error");
      });
      errors.push(`${boss.name}内で同じキャラが重複しています`);
    }

    formation.bosses[String(boss.number)] = selectedIds;
  }

  if (errors.length > 0) {
    return { ok: false, message: errors[0] + (errors.length > 1 ? `（ほか${errors.length - 1}件）` : "") };
  }

  return { ok: true, formation };
}


function loadImageByUrl(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function getClanBattleDuplicateCharacterIds(config, formation) {
  const bossCountByCharacterId = new Map();

  for (const boss of config.bosses) {
    const ids = formation.bosses[String(boss.number)] || [];
    const uniqueIdsInBoss = new Set(ids.filter(Boolean));

    for (const id of uniqueIdsInBoss) {
      bossCountByCharacterId.set(id, (bossCountByCharacterId.get(id) || 0) + 1);
    }
  }

  return new Set(
    [...bossCountByCharacterId.entries()]
      .filter(([, count]) => count >= 2)
      .map(([id]) => id)
  );
}

async function drawClanBattleResultCanvas(config, formation, ownerName) {
  const canvasWidth = 920;
  const paddingX = 34;
  const paddingTop = 28;
  const paddingBottom = 24;
  const headerHeight = 104;
  const cardGap = 16;
  const cardHeight = 230;
  const legendHeight = 170;

  const canvasHeight =
    paddingTop +
    headerHeight +
    config.bosses.length * cardHeight +
    (config.bosses.length - 1) * cardGap +
    legendHeight +
    paddingBottom;

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f3f4f6";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.fillStyle = "#111827";
  ctx.font = "bold 28px 'Segoe UI', 'Hiragino Sans', 'Yu Gothic UI', sans-serif";
  ctx.textAlign = "start";
  ctx.textBaseline = "middle";
  ctx.fillText(
    `${config.year}年${config.month}月 クラバトCR一致状況`,
    paddingX,
    paddingTop + 24
  );

  ctx.fillStyle = "#111827";
  ctx.font = "bold 20px 'Segoe UI', 'Hiragino Sans', 'Yu Gothic UI', sans-serif";
  ctx.fillText(`プレイヤー名：${ownerName}`, paddingX, paddingTop + 62);

  ctx.fillStyle = "#6b7280";
  ctx.font = "14px 'Segoe UI', 'Hiragino Sans', 'Yu Gothic UI', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(getTodayString(), canvasWidth - paddingX, paddingTop + 62);
  ctx.textAlign = "start";

  const duplicateCharacterIds = getClanBattleDuplicateCharacterIds(config, formation);
  const bossImages = await Promise.all(
    config.bosses.map((boss) => loadImageByUrl(boss.image))
  );

  let cardY = paddingTop + headerHeight;

  for (let bossIndex = 0; bossIndex < config.bosses.length; bossIndex++) {
    const boss = config.bosses[bossIndex];
    const ids = [...(formation.bosses[String(boss.number)] || [])].reverse();
    const selectedChars = ids.map(
      (id) => characters.find((char) => char.id === id) || null
    );
    const charImages = await Promise.all(
      selectedChars.map((char) =>
        char ? loadIconImage(char) : Promise.resolve(null)
      )
    );

    drawClanBattleBossCard(ctx, {
      boss,
      bossImage: bossImages[bossIndex],
      selectedChars,
      charImages,
      duplicateCharacterIds,
      x: paddingX,
      y: cardY,
      width: canvasWidth - paddingX * 2,
      height: cardHeight,
    });

    cardY += cardHeight + cardGap;
  }

  drawClanBattleLegend(
    ctx,
    paddingX,
    cardY - cardGap + 18,
    canvasWidth - paddingX * 2
  );

  return canvas.toDataURL("image/png");
}

function drawClanBattleBossCard(ctx, options) {
  const {
    boss,
    bossImage,
    selectedChars,
    charImages,
    duplicateCharacterIds,
    x,
    y,
    width,
    height,
  } = options;

  ctx.fillStyle = "#ffffff";
  roundRect(ctx, x, y, width, height, 20, true, false);

  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, width, height, 20, false, true);

  ctx.fillStyle = "#111827";
  ctx.font =
    "bold 20px 'Segoe UI', 'Hiragino Sans', 'Yu Gothic UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(boss.name, x + width / 2, y + 20);

  const bossSize = 68;
  const bossX = x + (width - bossSize) / 2;
  const bossY = y + 28;

  drawRoundedImageOrPlaceholder(
    ctx,
    bossImage,
    { name: boss.name },
    bossX,
    bossY,
    bossSize,
    bossSize
  );

  const iconSize = 72;
  const gap = 16;
  const totalWidth = iconSize * 5 + gap * 4;
  const startX = x + (width - totalWidth) / 2;
  const iconY = bossY + bossSize + 8;

  selectedChars.forEach((char, index) => {
    const drawX = startX + index * (iconSize + gap);
    const img = charImages[index];

    drawRoundedImageOrPlaceholder(
      ctx,
      img,
      char || { name: "未入力" },
      drawX,
      iconY,
      iconSize,
      iconSize
    );

    if (!char) return;

    const charState = state[char.id] || {
      owned: false,
      cr: 0,
      sp: 0,
    };

    const isDuplicate = duplicateCharacterIds.has(char.id);
    const isSpecialSpMissing =
      char.specialSp === true &&
      charState.owned &&
      charState.sp !== 1;

    if (!charState.owned) {
      ctx.save();
      ctx.fillStyle = "rgba(17, 24, 39, 0.48)";
      roundRect(ctx, drawX, iconY, iconSize, iconSize, 16, true, false);
      ctx.restore();

      drawCrBadge(
        ctx,
        drawX + iconSize - 2,
        iconY + iconSize - 2,
        "未"
      );
    } else {
      drawCrBadge(
        ctx,
        drawX + iconSize - 2,
        iconY + iconSize - 2,
        charState.cr
      );

      if (charState.sp === 1) {
        drawSpBadge(ctx, drawX + iconSize - 2, iconY + 2);
      }

      if (isSpecialSpMissing) {
        drawClanBattleWarningIcon(ctx, drawX + 4, iconY + 4);
        drawClanBattleSpecialSpWarningText(
          ctx,
          drawX + iconSize / 2,
          iconY + iconSize + 15
        );
      }
    }

    if (isDuplicate) {
      drawClanBattleDuplicateBorder(
        ctx,
        drawX,
        iconY,
        iconSize,
        iconSize
      );
    }
  });

  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

function drawClanBattleDuplicateBorder(ctx, x, y, width, height) {
  ctx.save();
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = 3;
  roundRect(ctx, x + 1.5, y + 1.5, width - 3, height - 3, 15, false, true);
  ctx.restore();
}

function drawClanBattleWarningIcon(ctx, x, y) {
  ctx.save();

  const size = 22;
  ctx.beginPath();
  ctx.moveTo(x + size / 2, y);
  ctx.lineTo(x + size, y + size);
  ctx.lineTo(x, y + size);
  ctx.closePath();

  ctx.fillStyle = "#facc15";
  ctx.fill();
  ctx.strokeStyle = "#111827";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "#111827";
  ctx.font = "bold 15px 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", x + size / 2, y + size * 0.63);

  ctx.restore();
}

function drawClanBattleSpecialSpWarningText(ctx, centerX, y) {
  ctx.save();
  ctx.fillStyle = "#dc2626";
  ctx.font =
    "bold 10px 'Segoe UI', 'Hiragino Sans', 'Yu Gothic UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("専用SP未装備", centerX, y);
  ctx.restore();
}

function drawClanBattleLegend(ctx, x, y, width) {
  ctx.save();

  const legendHeight = 150;
  const outerPadding = 18;
  const titleHeight = 30;
  const columnGap = 14;
  const rowGap = 12;
  const cardHeight = 42;
  const cardWidth = (width - outerPadding * 2 - columnGap) / 2;

  ctx.fillStyle = "#ffffff";
  roundRect(ctx, x, y, width, legendHeight, 14, true, false);

  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, width, legendHeight, 14, false, true);

  const titleX = x + outerPadding;
  const titleY = y + 19;

  ctx.fillStyle = "#111827";
  ctx.font =
    "bold 13px 'Segoe UI', 'Hiragino Sans', 'Yu Gothic UI', sans-serif";
  ctx.textAlign = "start";
  ctx.textBaseline = "middle";
  ctx.fillText("表示内容", titleX, titleY);

  const titleWidth = ctx.measureText("表示内容").width;
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(titleX + titleWidth + 12, titleY);
  ctx.lineTo(x + width - outerPadding, titleY);
  ctx.stroke();

  const leftX = x + outerPadding;
  const rightX = leftX + cardWidth + columnGap;
  const row1Y = y + titleHeight + 12;
  const row2Y = row1Y + cardHeight + rowGap;

  drawClanBattleLegendCard(ctx, {
    x: leftX,
    y: row1Y,
    width: cardWidth,
    height: cardHeight,
    type: "duplicate",
    label: "複数ボスで採用",
  });

  drawClanBattleLegendCard(ctx, {
    x: rightX,
    y: row1Y,
    width: cardWidth,
    height: cardHeight,
    type: "sp",
    label: "専用SP装備済み",
  });

  drawClanBattleLegendCard(ctx, {
    x: leftX,
    y: row2Y,
    width: cardWidth,
    height: cardHeight,
    type: "warning",
    label: "専用SP未装備",
  });

  drawClanBattleLegendCard(ctx, {
    x: rightX,
    y: row2Y,
    width: cardWidth,
    height: cardHeight,
    type: "cr",
    label: "コネクトランク",
  });

  ctx.restore();
}

function drawClanBattleLegendCard(ctx, options) {
  const {
    x,
    y,
    width,
    height,
    type,
    label,
  } = options;

  ctx.save();

  ctx.fillStyle = "#ffffff";
  roundRect(ctx, x, y, width, height, 10, true, false);

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, width, height, 10, false, true);

  const iconBoxWidth = 44;
  const iconCenterX = x + iconBoxWidth / 2 + 8;
  const centerY = y + height / 2;
  const labelX = x + iconBoxWidth + 18;

  if (type === "duplicate") {
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 3;
    roundRect(
      ctx,
      iconCenterX - 11,
      centerY - 11,
      22,
      22,
      5,
      false,
      true
    );
  } else if (type === "warning") {
    drawClanBattleWarningIcon(
      ctx,
      iconCenterX - 11,
      centerY - 11
    );
  } else if (type === "sp") {
    drawSpBadge(
      ctx,
      iconCenterX + 17,
      centerY - 12
    );
  } else if (type === "cr") {
    drawCrBadge(
      ctx,
      iconCenterX + 14,
      centerY + 11,
      15
    );
  }

  ctx.fillStyle = "#374151";
  ctx.font =
    "bold 12px 'Segoe UI', 'Hiragino Sans', 'Yu Gothic UI', sans-serif";
  ctx.textAlign = "start";
  ctx.textBaseline = "middle";
  ctx.fillText(label, labelX, centerY);

  ctx.restore();
}

function drawClanBattleUnownedBadge(ctx, rightX, bottomY) {
  const text = "未";
  ctx.font = "bold 16px 'Segoe UI', 'Hiragino Sans', 'Yu Gothic UI', sans-serif";
  const badgeW = 30;
  const badgeH = 24;
  const x = rightX - badgeW;
  const y = bottomY - badgeH;

  ctx.fillStyle = "rgba(190, 18, 60, 0.95)";
  roundRect(ctx, x, y, badgeW, badgeH, 11, true, false);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + badgeW / 2, y + badgeH / 2 + 0.5);
}

function showClanBattleResultPreview(config, imageUrl, ownerName) {
  const wrapper = document.createElement("div");
  wrapper.className = "clan-battle-result-preview";

  const preview = document.createElement("div");
  preview.className = "export-preview clan-battle-result-scroll";
  preview.innerHTML = `<img class="clan-battle-result-image" src="${imageUrl}" alt="クラバトCR一致状況">`;
  wrapper.appendChild(preview);

  const note = document.createElement("div");
  note.className = "note";
  note.textContent = "CRは右下、専用SPありは右上に表示します。未所持キャラは暗く表示されます。重複採用や専用SP未装備は出力画像で警告表示されます。";
  wrapper.appendChild(note);

  const backBtn = document.createElement("button");
  backBtn.className = "button";
  backBtn.textContent = "編成入力に戻る";
  backBtn.addEventListener("click", () => showClanBattleFormationModal());

  const downloadBtn = document.createElement("a");
  downloadBtn.className = "button primary";
  downloadBtn.textContent = "画像を保存";
  downloadBtn.href = imageUrl;
  const safeOwner = ownerName.replace(/[\/:*?"<>|]/g, "_");
  downloadBtn.download = `pricone_clanbattle_cr_${config.year}-${String(config.month).padStart(2, "0")}_${safeOwner}.png`;

  showModal("クラバトCR一致状況プレビュー", wrapper, [backBtn, downloadBtn]);
}

initializeApp();