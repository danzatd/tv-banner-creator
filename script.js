// ─── Constants ───────────────────────────────────────────────────────────────

const BANNER_W = 1920;
const BANNER_H = 1080;

// Logo container size
const LOGO_W = 1000;
const LOGO_H = 552;

// Padding from banner edges (right, bottom)
const PAD_RIGHT  = 76;
const PAD_BOTTOM = 70;

// Logo container position (top-left corner)
const LOGO_X = BANNER_W - LOGO_W - PAD_RIGHT;   // 844
const LOGO_Y = BANNER_H - LOGO_H - PAD_BOTTOM;  // 458

// Gradient: 137deg, from transparent (0%) to black (100%)
// Matches CSS: linear-gradient(137deg, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 100%)
const GRADIENT_ANGLE_DEG = 137;

// ─── State ───────────────────────────────────────────────────────────────────

let coverFiles = [];
let logoFiles  = [];
let renderedBlobs = []; // { name, blob }

// ─── DOM refs ────────────────────────────────────────────────────────────────

const coversInput   = document.getElementById('covers-input');
const logosInput    = document.getElementById('logos-input');
const coversList    = document.getElementById('covers-list');
const logosList     = document.getElementById('logos-list');
const coversCard    = document.getElementById('covers-card');
const logosCard     = document.getElementById('logos-card');
const generateBtn   = document.getElementById('generate-btn');
const progressWrap  = document.getElementById('progress-wrap');
const progressFill  = document.getElementById('progress-fill');
const progressText  = document.getElementById('progress-text');
const previewSection = document.getElementById('preview-section');
const previewGrid   = document.getElementById('preview-grid');
const previewCount  = document.getElementById('preview-count');
const downloadBtn   = document.getElementById('download-btn');
const canvas        = document.getElementById('render-canvas');
const ctx           = canvas.getContext('2d');

// ─── File input handlers ──────────────────────────────────────────────────────

coversInput.addEventListener('change', e => {
  coverFiles = Array.from(e.target.files);
  renderFileList(coversList, coverFiles);
  coversCard.classList.toggle('has-files', coverFiles.length > 0);
  updateGenerateBtn();
});

logosInput.addEventListener('change', e => {
  logoFiles = Array.from(e.target.files);
  renderFileList(logosList, logoFiles);
  logosCard.classList.toggle('has-files', logoFiles.length > 0);
  updateGenerateBtn();
});

function renderFileList(listEl, files) {
  listEl.innerHTML = files.map(f =>
    `<div class="file-item">${f.name}</div>`
  ).join('');
}

function updateGenerateBtn() {
  generateBtn.disabled = !(coverFiles.length > 0 && logoFiles.length > 0);
}

// ─── Generate ────────────────────────────────────────────────────────────────

generateBtn.addEventListener('click', generate);

async function generate() {
  const mode = document.querySelector('input[name="mode"]:checked').value;

  // Build pairs list
  const pairs = [];
  if (mode === 'pairs') {
    const len = Math.min(coverFiles.length, logoFiles.length);
    for (let i = 0; i < len; i++) {
      pairs.push({ cover: coverFiles[i], logo: logoFiles[i] });
    }
  } else {
    for (const cover of coverFiles) {
      for (const logo of logoFiles) {
        pairs.push({ cover, logo });
      }
    }
  }

  if (pairs.length === 0) {
    alert('Нет пар для генерации. Проверьте загруженные файлы.');
    return;
  }

  // UI: show progress
  renderedBlobs = [];
  previewGrid.innerHTML = '';
  previewSection.classList.add('hidden');
  progressWrap.classList.remove('hidden');
  generateBtn.disabled = true;

  for (let i = 0; i < pairs.length; i++) {
    const { cover, logo } = pairs[i];
    progressText.textContent = `${i + 1} / ${pairs.length}`;
    progressFill.style.width = `${((i + 1) / pairs.length) * 100}%`;

    const blob = await renderBanner(cover, logo);
    const name = buildFileName(cover.name, logo.name, i);
    renderedBlobs.push({ name, blob });

    // Add preview thumbnail
    addPreview(blob, name);
  }

  progressText.textContent = `${pairs.length} / ${pairs.length}`;

  previewCount.textContent = renderedBlobs.length;
  previewSection.classList.remove('hidden');
  generateBtn.disabled = false;
}

// ─── Canvas renderer ──────────────────────────────────────────────────────────

async function renderBanner(coverFile, logoFile) {
  const [coverImg, logoImg] = await Promise.all([
    loadImage(coverFile),
    loadImage(logoFile),
  ]);

  // Clear canvas
  ctx.clearRect(0, 0, BANNER_W, BANNER_H);

  // 1. Draw cover stretched to full banner
  ctx.drawImage(coverImg, 0, 0, BANNER_W, BANNER_H);

  // 2. Draw gradient overlay on logo container area
  ctx.save();
  ctx.beginPath();
  ctx.rect(LOGO_X, LOGO_Y, LOGO_W, LOGO_H);
  ctx.clip();

  const grad = makeGradient(LOGO_X, LOGO_Y, LOGO_W, LOGO_H, GRADIENT_ANGLE_DEG);
  ctx.fillStyle = grad;
  ctx.fillRect(LOGO_X, LOGO_Y, LOGO_W, LOGO_H);
  ctx.restore();

  // 3. Draw logo inside the container (fit, centered)
  const { sx, sy, sw, sh } = fitInside(logoImg.width, logoImg.height, LOGO_W, LOGO_H);
  ctx.drawImage(logoImg, LOGO_X + sx, LOGO_Y + sy, sw, sh);

  // Export to blob
  return new Promise(resolve => {
    canvas.toBlob(resolve, 'image/jpeg', 0.92);
  });
}

/**
 * Build a canvas linear gradient for the logo container.
 * Converts CSS-style angle (degrees, from top clockwise) to canvas coordinates.
 */
function makeGradient(x, y, w, h, angleDeg) {
  // CSS gradient angle: 0deg = bottom→top, 90deg = left→right
  // Convert to math angle (0 = right, CCW): mathAngle = 90 - cssAngle
  const rad = (angleDeg * Math.PI) / 180;

  // Unit direction vector (CSS: sin for x, -cos for y)
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);

  // Half-diagonal projected onto direction
  const halfLen = Math.abs(dx * w) / 2 + Math.abs(dy * h) / 2;

  const cx = x + w / 2;
  const cy = y + h / 2;

  const x0 = cx - dx * halfLen;
  const y0 = cy - dy * halfLen;
  const x1 = cx + dx * halfLen;
  const y1 = cy + dy * halfLen;

  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  grad.addColorStop(0, 'rgba(0,0,0,0)');   // 0% — transparent
  grad.addColorStop(1, 'rgba(0,0,0,1)');   // 100% — opaque black
  return grad;
}

/**
 * Fit srcW×srcH inside dstW×dstH, centered, preserving aspect ratio.
 * Returns offset and size within the destination box.
 */
function fitInside(srcW, srcH, dstW, dstH) {
  const scale = Math.min(dstW / srcW, dstH / srcH);
  const sw = srcW * scale;
  const sh = srcH * scale;
  const sx = (dstW - sw) / 2;
  const sy = (dstH - sh) / 2;
  return { sx, sy, sw, sh };
}

// ─── Preview ──────────────────────────────────────────────────────────────────

function addPreview(blob, name) {
  const url = URL.createObjectURL(blob);
  const item = document.createElement('div');
  item.className = 'preview-item';
  item.innerHTML = `
    <img src="${url}" alt="${name}" loading="lazy">
    <div class="preview-item-label">${name}</div>
  `;
  previewGrid.appendChild(item);
}

// ─── Download ZIP ─────────────────────────────────────────────────────────────

downloadBtn.addEventListener('click', async () => {
  if (typeof JSZip === 'undefined') {
    alert('JSZip не загружен. Проверьте интернет-соединение.');
    return;
  }

  downloadBtn.textContent = '⏳ Упаковка...';
  downloadBtn.disabled = true;

  const zip = new JSZip();
  for (const { name, blob } of renderedBlobs) {
    const arrayBuffer = await blob.arrayBuffer();
    zip.file(name, arrayBuffer);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'banners.zip';
  a.click();
  URL.revokeObjectURL(url);

  downloadBtn.textContent = '⬇️ Скачать все как ZIP';
  downloadBtn.disabled = false;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

function buildFileName(coverName, logoName, index) {
  const base = stripExt(coverName);
  const logoBase = stripExt(logoName);
  return `banner_${String(index + 1).padStart(2, '0')}_${base}_${logoBase}.jpg`;
}

function stripExt(name) {
  return name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Zа-яА-Я0-9_-]/g, '_');
}
