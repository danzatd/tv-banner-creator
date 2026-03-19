// ─── Constants ───────────────────────────────────────────────────────────────

const BANNER_W = 1920;
const BANNER_H = 1080;

const LOGO_W = 1000;
const LOGO_H = 552;

// Logo container: flush to bottom-right corner of banner
const LOGO_X = BANNER_W - LOGO_W;  // 920
const LOGO_Y = BANNER_H - LOGO_H;  // 528

// Padding for the logo image inside the container
const INNER_PAD_RIGHT  = 76;
const INNER_PAD_BOTTOM = 70;

// Gradient: 225deg (top-right → bottom-left), clipped to triangle
const GRADIENT_ANGLE_DEG = 225;

// Preview render scale (480×270)
const PREVIEW_SCALE = 0.25;

// Debounce delay for slider updates (ms)
const SLIDER_DEBOUNCE = 120;

// ─── State ───────────────────────────────────────────────────────────────────

let coverFiles = [];
let logoFiles  = [];

// pairs[i] = { cover: File, logo: File, scale: Number, previewUrl: String }
let pairs = [];

// ─── DOM refs ────────────────────────────────────────────────────────────────

const coversInput    = document.getElementById('covers-input');
const logosInput     = document.getElementById('logos-input');
const coversList     = document.getElementById('covers-list');
const logosList      = document.getElementById('logos-list');
const coversCard     = document.getElementById('covers-card');
const logosCard      = document.getElementById('logos-card');
const previewSection = document.getElementById('preview-section');
const previewGrid    = document.getElementById('preview-grid');
const previewCount   = document.getElementById('preview-count');
const renderingNotice = document.getElementById('rendering-notice');
const downloadBtn    = document.getElementById('download-btn');

const previewCanvas  = document.getElementById('preview-canvas');
const renderCanvas   = document.getElementById('render-canvas');
const pCtx           = previewCanvas.getContext('2d');
const rCtx           = renderCanvas.getContext('2d');

// ─── File inputs ─────────────────────────────────────────────────────────────

coversInput.addEventListener('change', e => {
  coverFiles = Array.from(e.target.files);
  renderFileList(coversList, coverFiles);
  coversCard.classList.toggle('has-files', coverFiles.length > 0);
  maybeAutoPreview();
});

logosInput.addEventListener('change', e => {
  logoFiles = Array.from(e.target.files);
  renderFileList(logosList, logoFiles);
  logosCard.classList.toggle('has-files', logoFiles.length > 0);
  maybeAutoPreview();
});

document.querySelectorAll('input[name="mode"]').forEach(radio => {
  radio.addEventListener('change', maybeAutoPreview);
});

function renderFileList(listEl, files) {
  listEl.innerHTML = files.map(f =>
    `<div class="file-item">${f.name}</div>`
  ).join('');
}

// ─── Auto preview ─────────────────────────────────────────────────────────────

function maybeAutoPreview() {
  if (coverFiles.length > 0 && logoFiles.length > 0) {
    buildPairs();
    renderAllPreviews();
  }
}

function buildPairs() {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  // Preserve existing scales if pair still exists
  const prevScales = {};
  pairs.forEach((p, i) => { prevScales[pairKey(p)] = p.scale; });

  pairs = [];
  if (mode === 'pairs') {
    const len = Math.min(coverFiles.length, logoFiles.length);
    for (let i = 0; i < len; i++) {
      const p = { cover: coverFiles[i], logo: logoFiles[i], scale: 1.0, previewUrl: null };
      p.scale = prevScales[pairKey(p)] ?? 1.0;
      pairs.push(p);
    }
  } else {
    for (const cover of coverFiles) {
      for (const logo of logoFiles) {
        const p = { cover, logo, scale: 1.0, previewUrl: null };
        p.scale = prevScales[pairKey(p)] ?? 1.0;
        pairs.push(p);
      }
    }
  }
}

function pairKey(p) {
  return `${p.cover.name}__${p.logo.name}`;
}

// ─── Render all previews ──────────────────────────────────────────────────────

async function renderAllPreviews() {
  previewSection.classList.remove('hidden');
  previewGrid.innerHTML = '';
  previewCount.textContent = pairs.length;
  downloadBtn.disabled = true;
  renderingNotice.classList.remove('hidden');

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const blob = await renderBanner(pair.cover, pair.logo, pair.scale, PREVIEW_SCALE, pCtx, previewCanvas);
    const url = URL.createObjectURL(blob);
    if (pair.previewUrl) URL.revokeObjectURL(pair.previewUrl);
    pair.previewUrl = url;
    addPreviewCard(i);
  }

  renderingNotice.classList.add('hidden');
  downloadBtn.disabled = false;
}

// ─── Preview card ─────────────────────────────────────────────────────────────

function addPreviewCard(index) {
  const pair = pairs[index];
  const scalePercent = Math.round(pair.scale * 100);
  const label = `${pair.cover.name.replace(/\.[^/.]+$/, '')} + ${pair.logo.name.replace(/\.[^/.]+$/, '')}`;

  const item = document.createElement('div');
  item.className = 'preview-item';
  item.dataset.index = index;

  item.innerHTML = `
    <img src="${pair.previewUrl}" alt="Banner ${index + 1}" id="pimg-${index}" loading="lazy">
    <div class="preview-controls">
      <div class="preview-label" title="${label}">${label}</div>
      <div class="card-slider-row">
        <input type="range" id="pslider-${index}" min="20" max="150" value="${scalePercent}" step="1">
        <span class="scale-label" id="pval-${index}">${scalePercent}%</span>
      </div>
    </div>
  `;

  previewGrid.appendChild(item);

  // Attach slider listener with debounce
  const slider = item.querySelector(`#pslider-${index}`);
  const valEl  = item.querySelector(`#pval-${index}`);
  let timer = null;

  slider.addEventListener('input', () => {
    const v = parseInt(slider.value);
    valEl.textContent = v + '%';
    pairs[index].scale = v / 100;
    clearTimeout(timer);
    timer = setTimeout(() => updateCardPreview(index), SLIDER_DEBOUNCE);
  });
}

async function updateCardPreview(index) {
  const pair = pairs[index];
  const blob = await renderBanner(pair.cover, pair.logo, pair.scale, PREVIEW_SCALE, pCtx, previewCanvas);
  const url = URL.createObjectURL(blob);
  if (pair.previewUrl) URL.revokeObjectURL(pair.previewUrl);
  pair.previewUrl = url;
  const img = document.getElementById(`pimg-${index}`);
  if (img) img.src = url;
}

// ─── Download ZIP ─────────────────────────────────────────────────────────────

downloadBtn.addEventListener('click', async () => {
  if (typeof JSZip === 'undefined') {
    alert('JSZip не загружен. Проверьте интернет-соединение.');
    return;
  }

  downloadBtn.disabled = true;
  downloadBtn.textContent = '⏳ Рендеринг...';

  const zip = new JSZip();

  for (let i = 0; i < pairs.length; i++) {
    const { cover, logo, scale } = pairs[i];
    downloadBtn.textContent = `⏳ ${i + 1} / ${pairs.length}`;
    const blob = await renderBanner(cover, logo, scale, 1, rCtx, renderCanvas);
    const name = buildFileName(cover.name, logo.name, i);
    const buf = await blob.arrayBuffer();
    zip.file(name, buf);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(zipBlob);
  a.download = 'banners.zip';
  a.click();

  downloadBtn.textContent = '⬇️ Скачать все как ZIP';
  downloadBtn.disabled = false;
});

// ─── Core renderer ────────────────────────────────────────────────────────────

async function renderBanner(coverFile, logoFile, logoScale, renderScale, ctx, canvas) {
  const W = Math.round(BANNER_W * renderScale);
  const H = Math.round(BANNER_H * renderScale);

  canvas.width  = W;
  canvas.height = H;

  const s = renderScale; // shorthand

  const [coverImg, logoImg] = await Promise.all([
    loadImage(coverFile),
    loadImage(logoFile),
  ]);

  // 1. Cover
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(coverImg, 0, 0, W, H);

  // 2. Gradient — clipped to triangle (top-right → bottom-right → bottom-left)
  const lx = LOGO_X * s, ly = LOGO_Y * s;
  const lw = LOGO_W * s, lh = LOGO_H * s;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(lx + lw, ly);       // top-right
  ctx.lineTo(lx + lw, ly + lh);  // bottom-right
  ctx.lineTo(lx,      ly + lh);  // bottom-left
  ctx.closePath();
  ctx.clip();

  const grad = makeGradient(ctx, lx, ly, lw, lh, GRADIENT_ANGLE_DEG);
  ctx.fillStyle = grad;
  ctx.fillRect(lx, ly, lw, lh);
  ctx.restore();

  // 3. Logo — anchored to bottom-right of inner padding area
  const innerW = (LOGO_W - INNER_PAD_RIGHT)  * s;
  const innerH = (LOGO_H - INNER_PAD_BOTTOM) * s;

  const { sw: fw, sh: fh } = fitInside(logoImg.width, logoImg.height, innerW, innerH);
  const sw = fw * logoScale;
  const sh = fh * logoScale;

  const anchorX = lx + lw - INNER_PAD_RIGHT  * s;
  const anchorY = ly + lh - INNER_PAD_BOTTOM * s;

  ctx.drawImage(logoImg, anchorX - sw, anchorY - sh, sw, sh);

  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92));
}

// ─── Gradient helper ──────────────────────────────────────────────────────────

function makeGradient(ctx, x, y, w, h, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  const dx  = Math.sin(rad);
  const dy  = -Math.cos(rad);
  const halfLen = Math.abs(dx * w) / 2 + Math.abs(dy * h) / 2;
  const cx = x + w / 2, cy = y + h / 2;

  const grad = ctx.createLinearGradient(
    cx - dx * halfLen, cy - dy * halfLen,
    cx + dx * halfLen, cy + dy * halfLen
  );
  grad.addColorStop(0,   'rgba(0,0,0,1)');  // top-right = black
  grad.addColorStop(0.6, 'rgba(0,0,0,0)');  // fade out
  grad.addColorStop(1,   'rgba(0,0,0,0)');  // bottom-left = transparent
  return grad;
}

// ─── Fit helper ───────────────────────────────────────────────────────────────

function fitInside(srcW, srcH, dstW, dstH) {
  const scale = Math.min(dstW / srcW, dstH / srcH);
  return { sw: srcW * scale, sh: srcH * scale };
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = reject;
    img.src = url;
  });
}

function buildFileName(coverName, logoName, index) {
  return `banner_${String(index + 1).padStart(2, '0')}_${stripExt(coverName)}_${stripExt(logoName)}.jpg`;
}

function stripExt(name) {
  return name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Zа-яА-Я0-9_-]/g, '_');
}
