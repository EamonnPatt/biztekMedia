/* Biztek Media — Ad Studio */
(() => {
  'use strict';

  const P = window.BiztekPricing;
  const PC = P.CONFIG;
  const money = P.money;

  /* ============================================================ utils */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const round = (n, d = 0) => { const f = 10 ** d; return Math.round(n * f) / f; };
  const uid = (p = 'l') => `${p}_${Math.random().toString(36).slice(2, 10)}`;
  const debounce = (fn, ms) => { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), ms); }; };
  const ease = (p) => 1 - Math.pow(1 - p, 3);
  const easeBack = (p) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
  const isoDate = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const parseIso = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDate = (s) => parseIso(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtTime = (s) => { const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
  const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');
  const fmtBytes = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  const isTyping = (el) => !!(el && el.closest && el.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]'));

  /* ============================================================ constants */
  const SIZES = { landscape: { w: 1920, h: 1080 }, portrait: { w: 1080, h: 1920 } };
  const STORE_KEY = 'biztek-studio-v1';
  const CONTACT_KEY = 'biztek-contact-v1';
  const MAX_FILE = 250 * 1024 * 1024; // until the server says otherwise
  const API = 'api.php?r=';
  const MIN_LEN = 0.3;
  const LAYER_TYPES = ['text', 'image', 'video', 'shape', 'qr'];
  const FILE_TYPES = {
    'video/mp4': 'video', 'video/webm': 'video', 'video/quicktime': 'video',
    'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image', 'image/gif': 'image',
  };
  const EXT_TYPES = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
  const FONTS = [
    { id: 'expanded', label: 'Archivo Expanded', family: "'Archivo', sans-serif", stretch: 125 },
    { id: 'archivo', label: 'Archivo', family: "'Archivo', sans-serif", stretch: 100 },
    { id: 'narrow', label: 'Archivo Condensed', family: "'Archivo', sans-serif", stretch: 62 },
    { id: 'serif', label: 'DM Serif Display', family: "'DM Serif Display', serif", stretch: 100 },
    { id: 'mono', label: 'JetBrains Mono', family: "'JetBrains Mono', monospace", stretch: 100 },
    { id: 'marker', label: 'Permanent Marker', family: "'Permanent Marker', cursive", stretch: 100 },
  ];
  const ANIMS = [['none', 'None'], ['fade', 'Fade'], ['rise', 'Rise'], ['drop', 'Drop'], ['slide-left', 'Slide in from right'], ['slide-right', 'Slide in from left'], ['zoom', 'Zoom'], ['pop', 'Pop'], ['blur', 'Blur'], ['wipe', 'Wipe']];
  const SHAPES = [['rect', 'Rectangle'], ['ellipse', 'Circle'], ['burst', 'Burst'], ['stripes', 'Stripes']];
  const SWATCHES = ['#17130F', '#F4EEE3', '#FFFFFF', '#FF5212', '#D2380A', '#FFC24B', '#1E4D8C', '#2E7D5B'];
  const TYPE_ICON = { text: 'T', image: 'IM', video: '▶', shape: '■', qr: 'QR' };
  const BURST = (() => {
    const pts = [];
    for (let i = 0; i < 24; i++) {
      const a = (i * 15 - 90) * Math.PI / 180;
      const r = i % 2 ? 41 : 50;
      pts.push(`${round(50 + r * Math.cos(a), 2)}% ${round(50 + r * Math.sin(a), 2)}%`);
    }
    return `polygon(${pts.join(', ')})`;
  })();

  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: svg('<path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.7 17.7 0 0 1-3.3 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
    lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
    unlock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>'),
    copy: svg('<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>'),
    trash: svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>'),
    swap: svg('<path d="M4 7h13l-3-3M20 17H7l3 3"/>'),
    play: svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none"/>'),
    alignL: svg('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
    alignC: svg('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
    alignR: svg('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'),
  };

  /* ============================================================ state */
  const defaultDoc = () => ({
    orientation: 'landscape',
    duration: 15,
    background: { type: 'solid', color1: '#17130F', color2: '#D2380A', angle: 135 },
    layers: [],
  });
  const defaultCampaign = () => ({
    weeks: 4,
    startDate: isoDate(addDays(new Date(), 3)),
    addons: { priority: false, audio: false, designAssist: false, rush: false },
  });

  let doc = defaultDoc();
  let campaign = defaultCampaign();
  const media = new Map(); // id → { id, kind, type, name, size, url, blob, w, h, duration, uploadId }
  const els = new Map();   // layer id → element on stage
  let selectedId = null;
  let editingId = null;
  let t = 0;
  let playing = false;
  let scrubbing = false;
  let loopPreview = true;
  let previewAudio = false;
  let scale = 1;
  let serverConfig = { demo: true, currency: PC.currency, maxUploadBytes: MAX_FILE };
  const hist = { stack: [], index: -1 };

  const dom = {
    stage: $('#stage'), overlay: $('#overlay'), holder: $('#stageHolder'), wrap: $('#stageWrap'), meta: $('#stageMeta'),
    ruler: $('#tlRuler'), tracks: $('#tlTracks'), tlBody: $('#tlBody'), playhead: $('#tlPlayhead'), time: $('#tlTime'),
    durRange: $('#durRange'), durOut: $('#durOut'), playBtn: $('#playBtn'),
    props: $('#propsPane'), campaign: $('#campaignPane'), library: $('#library'), templates: $('#templates'),
    fileInput: $('#fileInput'), replaceInput: $('#replaceInput'), dropzone: $('#dropzone'),
    pcAmt: $('#pcAmt'), pcRate: $('#pcRate'), rfTotal: $('#rfTotal'), rfSummary: $('#rfSummary'),
    modal: $('#checkoutModal'), undo: $('#undoBtn'), redo: $('#redoBtn'),
  };

  const stageSize = (o = doc.orientation) => SIZES[o] || SIZES.landscape;
  const getLayer = (id) => doc.layers.find((l) => l.id === id) || null;
  const selected = () => getLayer(selectedId);
  const isMedia = (l) => l.type === 'image' || l.type === 'video';

  /* ============================================================ layer factories */
  function parseHex(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 };
  }
  function isDark(hex) {
    const c = parseHex(hex);
    return !c || (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255 < 0.55;
  }
  const contrastInk = () => (isDark(doc.background.color1) ? '#F4EEE3' : '#17130F');

  function baseLayer(type, props) {
    return Object.assign({
      id: uid(), type, name: '',
      x: 0, y: 0, w: 400, h: 300, rot: 0, opacity: 1,
      start: 0, end: doc.duration,
      animIn: 'fade', animOut: 'none', animDur: 0.6,
      locked: false, hidden: false,
    }, props);
  }

  const TEXT_PRESETS = {
    heading: { text: 'Your big headline', font: 'expanded', fontSize: 140, weight: 900, upper: true, lineHeight: 0.92, letter: -0.03, wf: 0.8, animIn: 'rise' },
    subhead: { text: 'A short line that sells it', font: 'archivo', fontSize: 64, weight: 700, upper: false, lineHeight: 1.1, letter: -0.01, wf: 0.6, animIn: 'fade' },
    body: { text: 'Add the details: dates, location, how to redeem.', font: 'archivo', fontSize: 40, weight: 500, upper: false, lineHeight: 1.3, letter: 0, wf: 0.5, animIn: 'fade' },
  };

  function makeText(kind, over = {}) {
    const S = stageSize();
    const p = TEXT_PRESETS[kind] || TEXT_PRESETS.body;
    const w = Math.round(S.w * p.wf);
    return baseLayer('text', Object.assign({
      text: p.text, font: p.font, fontSize: p.fontSize, weight: p.weight, color: contrastInk(),
      hl: false, hlColor: '#FF5212', align: 'left', lineHeight: p.lineHeight, letter: p.letter,
      upper: p.upper, italic: false, shadow: false,
      x: Math.round((S.w - w) / 2), y: Math.round(S.h / 2 - p.fontSize * 0.6), w, h: Math.round(p.fontSize * p.lineHeight),
      animIn: p.animIn,
    }, over));
  }

  function makeShape(kind, over = {}) {
    const S = stageSize();
    const size = { rect: [640, 180], ellipse: [360, 360], burst: [380, 380], stripes: [900, 260] }[kind] || [400, 200];
    return baseLayer('shape', Object.assign({
      shape: kind, fill: '#FF5212', fill2: '#D2380A', radius: kind === 'rect' ? 16 : 0,
      stroke: '#17130F', strokeW: 0, band: 44,
      x: Math.round((S.w - size[0]) / 2), y: Math.round((S.h - size[1]) / 2), w: size[0], h: size[1],
      animIn: kind === 'burst' ? 'pop' : 'fade',
    }, over));
  }

  function makeQr(over = {}) {
    const S = stageSize();
    const size = Math.round(Math.min(S.w, S.h) * 0.3);
    return baseLayer('qr', Object.assign({
      url: 'https://example.com', fg: '#17130F', bg: '#FFFFFF',
      x: S.w - size - 80, y: S.h - size - 80, w: size, h: size,
    }, over));
  }

  function makeMediaLayer(m) {
    const S = stageSize();
    const first = !doc.layers.some(isMedia);
    const ar = m.w && m.h ? m.w / m.h : 16 / 9;
    let w = S.w, h = S.h, x = 0, y = 0;
    if (!first) {
      w = S.w * 0.5; h = w / ar;
      if (h > S.h * 0.7) { h = S.h * 0.7; w = h * ar; }
      x = (S.w - w) / 2; y = (S.h - h) / 2;
    }
    const layer = baseLayer(m.kind, {
      mediaId: m.id, name: m.name, fit: 'cover', radius: 0,
      brightness: 100, contrast: 100, saturate: 100, grayscale: 0,
      trimStart: 0, loop: true,
      x: round(x), y: round(y), w: round(w), h: round(h),
      animIn: first ? 'fade' : 'zoom',
    });
    return { layer, first };
  }

  function layerName(l) {
    if (l.name) return l.name;
    if (l.type === 'text') return (l.text || 'Text').split('\n')[0].slice(0, 28) || 'Text';
    if (l.type === 'shape') return (SHAPES.find((s) => s[0] === l.shape) || [0, 'Shape'])[1];
    if (l.type === 'qr') return 'QR code';
    const m = media.get(l.mediaId);
    return m ? m.name : l.type === 'video' ? 'Video' : 'Image';
  }

  /* ============================================================ rendering */
  function bgCss(bg) {
    if (bg.type === 'gradient') return `linear-gradient(${bg.angle}deg, ${bg.color1}, ${bg.color2})`;
    if (bg.type === 'stripes') return `repeating-linear-gradient(${bg.angle}deg, ${bg.color1} 0 90px, ${bg.color2} 90px 180px)`;
    return bg.color1;
  }

  const sigOf = (l) => `${l.type}:${l.mediaId || ''}:${media.has(l.mediaId) ? 1 : 0}`;

  function createLayerEl(layer) {
    const el = document.createElement('div');
    el.className = `layer layer-${layer.type}`;
    el.dataset.id = layer.id;
    el.dataset.sig = sigOf(layer);
    if (layer.type === 'text') {
      const txt = document.createElement('div');
      txt.className = 'txt';
      txt.appendChild(document.createElement('span'));
      el.appendChild(txt);
    } else if (isMedia(layer)) {
      const m = media.get(layer.mediaId);
      if (!m) {
        const miss = document.createElement('div');
        miss.className = 'media-missing';
        miss.textContent = 'Media missing: replace or re-upload';
        el.appendChild(miss);
      } else if (layer.type === 'image') {
        const img = new Image();
        img.src = m.url; img.alt = ''; img.draggable = false;
        el.appendChild(img);
      } else {
        const v = document.createElement('video');
        v.src = m.url; v.muted = true; v.playsInline = true; v.preload = 'auto';
        v.addEventListener('loadeddata', () => syncVideo(layer.id, true));
        el.appendChild(v);
      }
    } else {
      const inner = document.createElement('div');
      inner.className = layer.type === 'qr' ? 'qr' : 'shape';
      el.appendChild(inner);
    }
    return el;
  }

  function styleContent(layer, el) {
    if (!el) return;
    el.classList.toggle('is-locked', !!layer.locked);
    if (layer.type === 'text') {
      const txt = el.firstChild;
      const span = txt.firstChild;
      const f = FONTS.find((x) => x.id === layer.font) || FONTS[0];
      Object.assign(txt.style, {
        fontFamily: f.family, fontStretch: f.stretch + '%', fontSize: layer.fontSize + 'px', fontWeight: layer.weight,
        color: layer.color, textAlign: layer.align, lineHeight: layer.lineHeight, letterSpacing: layer.letter + 'em',
        textTransform: layer.upper ? 'uppercase' : 'none', fontStyle: layer.italic ? 'italic' : 'normal',
        textShadow: layer.shadow ? '0 .06em .3em rgba(0,0,0,.55)' : 'none',
      });
      if (layer.id !== editingId && span.textContent !== layer.text) span.textContent = layer.text;
      span.style.background = layer.hl ? layer.hlColor : 'transparent';
      span.style.padding = layer.hl ? '.02em .16em' : '0';
    } else if (isMedia(layer)) {
      const node = el.querySelector('img, video');
      if (node) node.style.objectFit = layer.fit;
      el.style.borderRadius = layer.radius + 'px';
      el.style.overflow = 'hidden';
    } else if (layer.type === 'shape') {
      const s = el.firstChild;
      s.style.background = layer.shape === 'stripes'
        ? `repeating-linear-gradient(115deg, ${layer.fill} 0 ${layer.band}px, ${layer.fill2} ${layer.band}px ${layer.band * 2}px)`
        : layer.fill;
      s.style.borderRadius = layer.shape === 'ellipse' ? '50%' : layer.shape === 'rect' ? layer.radius + 'px' : '0';
      s.style.clipPath = layer.shape === 'burst' ? BURST : 'none';
      s.style.boxSizing = 'border-box';
      s.style.border = (layer.shape === 'rect' || layer.shape === 'ellipse') && layer.strokeW > 0 ? `${layer.strokeW}px solid ${layer.stroke}` : '0';
    } else if (layer.type === 'qr') {
      const q = el.firstChild;
      const key = [layer.url, layer.fg, layer.bg].join('|');
      if (q.dataset.key !== key) { q.dataset.key = key; q.innerHTML = qrSvg(layer.url, layer.fg, layer.bg); }
    }
  }

  function qrSvg(text, fg, bg) {
    const safeFg = parseHex(fg) ? fg : '#000000';
    const safeBg = parseHex(bg) ? bg : '#FFFFFF';
    const fallback = (msg) => `<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="${safeBg}"/><text x="50" y="54" font-size="11" text-anchor="middle" fill="${safeFg}" font-family="monospace">${msg}</text></svg>`;
    if (typeof window.qrcode !== 'function') return fallback('QR');
    try {
      const qr = window.qrcode(0, 'M');
      qr.addData(text || ' ');
      qr.make();
      const n = qr.getModuleCount();
      const m = 2;
      const size = n + m * 2;
      let d = '';
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
      return `<svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${safeBg}"/><path d="${d}" fill="${safeFg}"/></svg>`;
    } catch {
      return fallback('Link too long');
    }
  }

  function mediaFilter(l) {
    if (!isMedia(l)) return '';
    const f = [];
    if (l.brightness !== 100) f.push(`brightness(${l.brightness}%)`);
    if (l.contrast !== 100) f.push(`contrast(${l.contrast}%)`);
    if (l.saturate !== 100) f.push(`saturate(${l.saturate}%)`);
    if (l.grayscale) f.push(`grayscale(${l.grayscale}%)`);
    return f.join(' ');
  }

  /* motion: p goes 0 → 1 as the layer settles; dir mirrors movement for exits */
  function fxOf(type, p, dir) {
    const e = ease(p);
    const inv = 1 - e;
    switch (type) {
      case 'fade': return { o: e };
      case 'rise': return { o: e, ty: inv * 120 * dir };
      case 'drop': return { o: e, ty: -inv * 120 * dir };
      case 'slide-left': return { o: e, tx: inv * 320 * dir };
      case 'slide-right': return { o: e, tx: -inv * 320 * dir };
      case 'zoom': return { o: e, s: 0.6 + 0.4 * e };
      case 'pop': return { o: Math.min(1, p * 3), s: Math.max(0, easeBack(p)) };
      case 'blur': return { o: e, blur: inv * 30 };
      case 'wipe': return { clip: inv * 100, dir };
      default: return {};
    }
  }

  function motionAt(layer, time) {
    const d = Math.min(layer.animDur || 0.6, (layer.end - layer.start) / 2);
    const pin = layer.animIn !== 'none' && d > 0 ? clamp((time - layer.start) / d, 0, 1) : 1;
    const pout = layer.animOut !== 'none' && d > 0 ? clamp((layer.end - time) / d, 0, 1) : 1;
    const a = pin < 1 ? fxOf(layer.animIn, pin, 1) : {};
    const b = pout < 1 ? fxOf(layer.animOut, pout, -1) : {};
    const tx = (a.tx || 0) + (b.tx || 0);
    const ty = (a.ty || 0) + (b.ty || 0);
    const s = (a.s ?? 1) * (b.s ?? 1);
    let transform = '';
    if (tx || ty) transform += `translate(${tx}px, ${ty}px) `;
    if (s !== 1) transform += `scale(${s}) `;
    const w = a.clip != null ? a : b.clip != null ? b : null;
    return {
      o: (a.o ?? 1) * (b.o ?? 1),
      transform,
      blur: (a.blur || 0) + (b.blur || 0),
      clip: w ? (w.dir > 0 ? `inset(0 ${w.clip}% 0 0)` : `inset(0 0 0 ${w.clip}%)`) : 'none',
    };
  }

  function applyLayer(layer) {
    const el = els.get(layer.id);
    if (!el) return;
    if (layer.hidden) { el.style.display = 'none'; return; }
    el.style.display = '';
    const active = t >= layer.start - 1e-4 && t <= layer.end + 1e-4;
    let opacity = layer.opacity;
    let extra = '';
    let blur = 0;
    let clip = 'none';
    let visible = true;
    if (playing || scrubbing) {
      if (!active) visible = false;
      else {
        const fx = motionAt(layer, t);
        opacity *= fx.o; extra = fx.transform; blur = fx.blur; clip = fx.clip;
      }
    } else if (!active) {
      opacity *= 0.22; // ghost: not on screen at the playhead, still editable
    }
    const s = el.style;
    s.visibility = visible ? 'visible' : 'hidden';
    s.left = layer.x + 'px';
    s.top = layer.y + 'px';
    s.width = layer.w + 'px';
    s.height = layer.type === 'text' ? 'auto' : layer.h + 'px';
    s.transform = `${extra}rotate(${layer.rot}deg)`;
    s.opacity = opacity;
    s.filter = (mediaFilter(layer) + (blur ? ` blur(${blur}px)` : '')).trim() || 'none';
    s.clipPath = clip;
  }

  function measureText() {
    for (const l of doc.layers) {
      if (l.type !== 'text' || l.hidden) continue;
      const el = els.get(l.id);
      if (el && el.offsetHeight) l.h = el.offsetHeight;
    }
  }

  function buildStage() {
    const S = stageSize();
    dom.stage.style.width = S.w + 'px';
    dom.stage.style.height = S.h + 'px';
    dom.stage.style.background = bgCss(doc.background);
    const ids = new Set(doc.layers.map((l) => l.id));
    for (const [id, el] of els) if (!ids.has(id)) { el.remove(); els.delete(id); }
    doc.layers.forEach((layer, i) => {
      let el = els.get(layer.id);
      if (!el || el.dataset.sig !== sigOf(layer)) {
        const fresh = createLayerEl(layer);
        if (el) el.replaceWith(fresh);
        el = fresh;
        els.set(layer.id, el);
      }
      el.style.zIndex = String(i + 1);
      if (el.parentNode !== dom.stage) dom.stage.appendChild(el);
      styleContent(layer, el);
      applyLayer(layer);
      if (layer.type === 'video') syncVideo(layer.id, true);
    });
    measureText();
    dom.wrap.classList.toggle('is-empty', doc.layers.length === 0);
    fitStage();
  }

  function fitStage() {
    const S = stageSize();
    const r = dom.wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const pad = r.width < 640 ? 22 : 56;
    scale = Math.max(0.05, Math.min((r.width - pad * 2) / S.w, (r.height - pad * 2) / S.h));
    dom.holder.style.width = S.w * scale + 'px';
    dom.holder.style.height = S.h * scale + 'px';
    dom.stage.style.transform = `scale(${scale})`;
    dom.meta.textContent = `${S.w} × ${S.h} · ${Math.round(scale * 100)}%`;
    renderOverlay();
  }

  function renderOverlay(guides = []) {
    const l = selected();
    let html = '';
    if (l && !l.hidden) {
      const handles = l.locked ? '' :
        ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((k) => `<span class="h h-${k}" data-h="${k}"></span>`).join('') +
        '<span class="h h-rot" data-h="rot" title="Rotate (Shift snaps to 15°)"></span>';
      const cls = ['sel', l.type === 'text' && 'is-text', l.locked && 'is-locked', l.rot && 'has-rot'].filter(Boolean).join(' ');
      html += `<div class="${cls}" style="left:${l.x * scale}px;top:${l.y * scale}px;width:${l.w * scale}px;height:${l.h * scale}px;transform:rotate(${l.rot}deg)">${handles}<span class="sel-tag">${esc(layerName(l))}</span></div>`;
    }
    for (const g of guides) {
      html += g.v != null ? `<div class="guide v" style="left:${g.v * scale}px"></div>` : `<div class="guide h" style="top:${g.h * scale}px"></div>`;
    }
    dom.overlay.innerHTML = html;
    dom.overlay.classList.toggle('is-editing', !!editingId);
  }

  /* ============================================================ selection & editing */
  function select(id) {
    if (editingId && editingId !== id) stopTextEdit();
    if (selectedId === id) { renderOverlay(); return; }
    selectedId = id;
    renderOverlay();
    $$('.tl-row', dom.tracks).forEach((r) => r.classList.toggle('is-sel', r.dataset.id === id));
    buildProps();
    if (id) switchRightTab('design');
  }

  function startTextEdit(layer) {
    if (!layer || layer.type !== 'text' || layer.locked || layer.hidden) return;
    pause();
    editingId = layer.id;
    const el = els.get(layer.id);
    const span = el.querySelector('.txt span');
    el.classList.add('is-editing');
    try { span.contentEditable = 'plaintext-only'; } catch { /* older Firefox */ }
    if (span.contentEditable !== 'plaintext-only') span.contentEditable = 'true';
    span.focus();
    const range = document.createRange();
    range.selectNodeContents(span);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    renderOverlay();
  }

  function stopTextEdit(commitIt = true) {
    if (!editingId) return;
    const l = getLayer(editingId);
    const el = els.get(editingId);
    editingId = null;
    if (el) {
      el.classList.remove('is-editing');
      const span = el.querySelector('.txt span');
      if (span) span.removeAttribute('contenteditable');
    }
    window.getSelection()?.removeAllRanges();
    if (l && el) { styleContent(l, el); measureText(); updateTimelineRow(l); }
    renderOverlay();
    syncBinds(dom.props);
    if (commitIt) commit();
  }

  /* --- pointer: move / resize / rotate */
  let drag = null;

  function startDrag(e, mode, layer, handle) {
    drag = { mode, handle, id: layer.id, sx: e.clientX, sy: e.clientY, o: { ...layer }, moved: false };
    if (mode === 'rotate') {
      const hr = dom.holder.getBoundingClientRect();
      drag.cx = hr.left + (layer.x + layer.w / 2) * scale;
      drag.cy = hr.top + (layer.y + layer.h / 2) * scale;
      drag.a0 = Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx);
    }
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd, { once: true });
    window.addEventListener('pointercancel', onDragEnd, { once: true });
    document.body.classList.add('is-dragging');
  }

  function onDragMove(e) {
    if (!drag) return;
    const layer = getLayer(drag.id);
    if (!layer) return;
    const dxs = e.clientX - drag.sx;
    const dys = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dxs, dys) < 3) return;
    drag.moved = true;
    const dx = dxs / scale;
    const dy = dys / scale;
    const o = drag.o;
    let guides = [];

    if (drag.mode === 'move') {
      let nx = o.x + dx;
      let ny = o.y + dy;
      if (!e.altKey) ({ nx, ny, guides } = snapMove(layer, nx, ny));
      layer.x = round(nx, 1);
      layer.y = round(ny, 1);
    } else if (drag.mode === 'resize') {
      resizeLayer(layer, o, drag.handle, dx, dy, e.shiftKey);
      styleContent(layer, els.get(layer.id));
    } else if (drag.mode === 'rotate') {
      const a = Math.atan2(e.clientY - drag.cy, e.clientX - drag.cx);
      let r = o.rot + ((a - drag.a0) * 180) / Math.PI;
      r = ((r + 540) % 360) - 180;
      if (e.shiftKey) r = Math.round(r / 15) * 15;
      else for (const snap of [-180, -90, 0, 90, 180]) if (Math.abs(r - snap) < 3) r = snap;
      layer.rot = round(r, 1);
    }
    applyLayer(layer);
    if (layer.type === 'text') measureText();
    renderOverlay(guides);
    syncBinds(dom.props);
  }

  function onDragEnd() {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    window.removeEventListener('pointercancel', onDragEnd);
    document.body.classList.remove('is-dragging');
    if (drag && drag.moved) { renderOverlay(); commit(); if (drag.mode === 'rotate') buildProps(); }
    drag = null;
  }

  function snapMove(layer, nx, ny) {
    const S = stageSize();
    const th = 7 / scale;
    const guides = [];
    const xs = [0, S.w / 2, S.w];
    const ys = [0, S.h / 2, S.h];
    for (const o of doc.layers) {
      if (o.id === layer.id || o.hidden) continue;
      xs.push(o.x, o.x + o.w / 2, o.x + o.w);
      ys.push(o.y, o.y + o.h / 2, o.y + o.h);
    }
    const best = (pos, size, targets) => {
      let b = null;
      for (const off of [0, size / 2, size]) {
        for (const tg of targets) {
          const d = tg - (pos + off);
          if (Math.abs(d) < th && (!b || Math.abs(d) < Math.abs(b.d))) b = { d, line: tg };
        }
      }
      return b;
    };
    const bx = best(nx, layer.w, xs);
    if (bx) { nx += bx.d; guides.push({ v: bx.line }); }
    const by = best(ny, layer.h, ys);
    if (by) { ny += by.d; guides.push({ h: by.line }); }
    return { nx, ny, guides };
  }

  function resizeLayer(layer, o, handle, dx, dy, shift) {
    const hx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
    const hy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
    const rad = (o.rot * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // pointer delta in the layer's own (rotated) axes
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    const corner = hx !== 0 && hy !== 0;
    const ratioByDefault = isMedia(layer) || layer.type === 'text' || layer.type === 'qr';
    const lock = layer.type === 'qr' || (corner && ratioByDefault !== shift);

    let w = o.w;
    let h = o.h;
    if (lock && corner) {
      const k = Math.max(0.02, ((o.w + hx * lx) * o.w + (o.h + hy * ly) * o.h) / (o.w * o.w + o.h * o.h));
      w = o.w * k; h = o.h * k;
    } else if (lock) {
      const k = hx ? (o.w + hx * lx) / o.w : (o.h + hy * ly) / o.h;
      w = o.w * k; h = o.h * k;
    } else {
      if (hx) w = o.w + hx * lx;
      if (hy) h = o.h + hy * ly;
    }
    w = Math.max(20, w);
    h = Math.max(20, h);
    if (layer.type === 'text' && corner) layer.fontSize = clamp(round(o.fontSize * (w / o.w), 1), 8, 800);

    // keep the opposite corner / edge pinned in place
    const ax = (-hx * o.w) / 2;
    const ay = (-hy * o.h) / 2;
    const awx = o.x + o.w / 2 + ax * cos - ay * sin;
    const awy = o.y + o.h / 2 + ax * sin + ay * cos;
    const bx = (hx * w) / 2;
    const by = (hy * h) / 2;
    const cx = awx + bx * cos - by * sin;
    const cy = awy + bx * sin + by * cos;
    layer.w = round(w, 1);
    layer.h = round(h, 1);
    layer.x = round(cx - w / 2, 1);
    layer.y = round(cy - h / 2, 1);
  }

  /* ============================================================ layers: add / remove / order */
  function addLayer(layer, { atBottom = false } = {}) {
    if (atBottom) doc.layers.unshift(layer); else doc.layers.push(layer);
    afterStructureChange();
    select(layer.id);
    commit();
  }

  function afterStructureChange() {
    buildStage();
    buildTimeline();
    updatePrice();
  }

  function addPreset(kind) {
    if (TEXT_PRESETS[kind]) return addLayer(makeText(kind));
    if (kind === 'qr') return addLayer(makeQr());
    if (kind === 'badge') {
      const S = stageSize();
      const size = Math.round(Math.min(S.w, S.h) * 0.36);
      const x = Math.round(S.w - size - S.w * 0.06);
      const y = Math.round(S.h * 0.08);
      const fs = Math.round(size * 0.22);
      const burst = makeShape('burst', { x, y, w: size, h: size, rot: -12, name: 'Badge' });
      const txt = makeText('heading', {
        text: '20%\nOFF', fontSize: fs, align: 'center', color: '#17130F',
        x, y: Math.round(y + size / 2 - fs * 0.92), w: size, rot: -12, animIn: 'pop', start: 0.15,
      });
      doc.layers.push(burst, txt);
      afterStructureChange();
      select(txt.id);
      commit();
      return;
    }
    if (SHAPES.some((s) => s[0] === kind)) addLayer(makeShape(kind));
  }

  function duplicateSelected() {
    const l = selected();
    if (!l) return;
    const c = JSON.parse(JSON.stringify(l));
    c.id = uid();
    c.x += 40; c.y += 40;
    c.name = l.name ? `${l.name} copy` : '';
    doc.layers.splice(doc.layers.indexOf(l) + 1, 0, c);
    afterStructureChange();
    select(c.id);
    commit();
  }

  function removeSelected() {
    const i = doc.layers.findIndex((l) => l.id === selectedId);
    if (i < 0) return;
    if (editingId) stopTextEdit(false);
    doc.layers.splice(i, 1);
    selectedId = null;
    afterStructureChange();
    buildProps();
    renderOverlay();
    commit();
  }

  function reorder(kind) {
    const i = doc.layers.findIndex((l) => l.id === selectedId);
    if (i < 0) return;
    const [l] = doc.layers.splice(i, 1);
    const n = doc.layers.length;
    const j = kind === 'front' ? n : kind === 'back' ? 0 : kind === 'forward' ? Math.min(n, i + 1) : Math.max(0, i - 1);
    doc.layers.splice(j, 0, l);
    buildStage();
    buildTimeline();
    commit();
  }

  function setDuration(v) {
    const old = doc.duration;
    v = clamp(Math.round(v), PC.duration.min, PC.duration.max);
    if (v === old) return;
    doc.duration = v;
    for (const l of doc.layers) {
      if (Math.abs(l.end - old) < 0.01) l.end = v; // full-length layers follow the spot length
      l.end = round(clamp(l.end, MIN_LEN, v), 2);
      l.start = round(clamp(l.start, 0, l.end - MIN_LEN), 2);
    }
    t = Math.min(t, v);
    syncDurationUI();
    buildTimeline();
    renderFrame();
    updatePrice();
    syncBinds(dom.props);
    syncBinds(dom.campaign);
  }

  function setOrientation(o) {
    if (o === doc.orientation || !SIZES[o]) return;
    const A = stageSize();
    const B = SIZES[o];
    for (const l of doc.layers) {
      const full = Math.abs(l.x) < 2 && Math.abs(l.y) < 2 && Math.abs(l.w - A.w) < 4 && Math.abs(l.h - A.h) < 4;
      if (full) { l.x = 0; l.y = 0; l.w = B.w; l.h = B.h; continue; }
      const cx = ((l.x + l.w / 2) / A.w) * B.w;
      const cy = ((l.y + l.h / 2) / A.h) * B.h;
      const k = Math.min(1, (B.w * 0.92) / l.w);
      l.w = round(l.w * k);
      if (l.type === 'text') l.fontSize = round(l.fontSize * Math.sqrt(k), 1);
      else l.h = round(l.h * k);
      // keep what fits fully on the new screen
      l.x = round(l.w <= B.w ? clamp(cx - l.w / 2, 0, B.w - l.w) : cx - l.w / 2);
      l.y = round(l.h <= B.h ? clamp(cy - l.h / 2, 0, B.h - l.h) : cy - l.h / 2);
    }
    doc.orientation = o;
    buildStage();
    buildProps();
    syncOrientationUI();
    commit();
  }

  /* ============================================================ timeline */
  const barLabel = (l) => `${l.start.toFixed(1)}s → ${l.end.toFixed(1)}s`;

  function buildTimeline() {
    const d = doc.duration;
    let ticks = '';
    for (let s = 0; s <= d; s++) {
      const major = s % 5 === 0;
      ticks += `<span class="tick${major ? ' major' : ''}" style="left:${(s / d) * 100}%">${major ? `<b>${s}s</b>` : ''}</span>`;
    }
    dom.ruler.innerHTML = ticks;
    dom.tracks.innerHTML = doc.layers.length
      ? doc.layers.slice().reverse().map((l) => `
        <div class="tl-row t-${l.type}${l.id === selectedId ? ' is-sel' : ''}${l.hidden ? ' is-hidden' : ''}" data-id="${l.id}">
          <div class="tl-label" data-act="select">
            <span class="tl-icon">${TYPE_ICON[l.type]}</span>
            <span class="tl-name">${esc(layerName(l))}</span>
            <button type="button" class="tl-eye" data-act="hide" aria-pressed="${!!l.hidden}" title="${l.hidden ? 'Show' : 'Hide'} layer" aria-label="${l.hidden ? 'Show' : 'Hide'} layer">${ICONS[l.hidden ? 'eyeOff' : 'eye']}</button>
            <button type="button" class="tl-lock" data-act="lock" aria-pressed="${!!l.locked}" title="${l.locked ? 'Unlock' : 'Lock'} layer" aria-label="${l.locked ? 'Unlock' : 'Lock'} layer">${ICONS[l.locked ? 'lock' : 'unlock']}</button>
          </div>
          <div class="tl-track">
            <div class="tl-bar" style="left:${(l.start / d) * 100}%;width:${((l.end - l.start) / d) * 100}%" title="Drag to move · drag the ends to trim">
              <span class="tl-grip tl-grip--l" data-grip="start"></span>
              <span class="tl-bar-label">${barLabel(l)}</span>
              <span class="tl-grip tl-grip--r" data-grip="end"></span>
            </div>
          </div>
        </div>`).join('')
      : '<p class="tl-empty">Layers you add appear here. Drag a bar to change when it shows up, or drag its ends to trim it.</p>';
    updatePlayhead();
  }

  function updateTimelineRow(l) {
    const row = dom.tracks.querySelector(`.tl-row[data-id="${l.id}"]`);
    if (!row) { buildTimeline(); return; }
    const d = doc.duration;
    const bar = row.querySelector('.tl-bar');
    bar.style.left = (l.start / d) * 100 + '%';
    bar.style.width = ((l.end - l.start) / d) * 100 + '%';
    bar.querySelector('.tl-bar-label').textContent = barLabel(l);
    row.querySelector('.tl-name').textContent = layerName(l);
    row.classList.toggle('is-hidden', !!l.hidden);
  }

  function updatePlayhead() {
    const x = dom.ruler.offsetLeft + (t / doc.duration) * dom.ruler.offsetWidth;
    dom.playhead.style.left = x + 'px';
    dom.playhead.style.height = dom.tlBody.scrollHeight + 'px';
    dom.time.textContent = `${fmtTime(t)} / ${fmtTime(doc.duration)}`;
  }

  function startScrub(e, refEl) {
    const rect = refEl.getBoundingClientRect();
    pause();
    if (editingId) stopTextEdit();
    scrubbing = true;
    const seek = (ev) => {
      t = clamp((ev.clientX - rect.left) / rect.width, 0, 1) * doc.duration;
      renderFrame();
    };
    const up = () => {
      scrubbing = false;
      window.removeEventListener('pointermove', seek);
      document.body.classList.remove('is-dragging');
      renderFrame();
    };
    seek(e);
    window.addEventListener('pointermove', seek);
    window.addEventListener('pointerup', up, { once: true });
    document.body.classList.add('is-dragging');
  }

  function startBarDrag(e, layer, mode, row) {
    const track = row.querySelector('.tl-track');
    const bar = row.querySelector('.tl-bar');
    const label = bar.querySelector('.tl-bar-label');
    const width = track.getBoundingClientRect().width;
    const d = doc.duration;
    const o = { start: layer.start, end: layer.end };
    const len = o.end - o.start;
    const sx = e.clientX;
    let moved = false;
    const edges = [0, d, t];
    for (const l of doc.layers) if (l.id !== layer.id) edges.push(l.start, l.end);
    const snapT = (v, free) => {
      if (free) return round(v, 2);
      let best = null;
      for (const s of edges) if (Math.abs(s - v) < d * 0.012 && (best === null || Math.abs(s - v) < Math.abs(best - v))) best = s;
      return best !== null ? round(best, 2) : Math.round(v * 10) / 10;
    };
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientX - sx) < 2) return;
      moved = true;
      const dt = ((ev.clientX - sx) / width) * d;
      if (mode === 'move') {
        const raw = o.start + dt;
        const a = snapT(raw, ev.altKey);
        const b = snapT(raw + len, ev.altKey) - len;
        const s = clamp(Math.abs(a - raw) <= Math.abs(b - raw) ? a : b, 0, d - len);
        layer.start = round(s, 2);
        layer.end = round(s + len, 2);
      } else if (mode === 'start') {
        layer.start = round(clamp(snapT(o.start + dt, ev.altKey), 0, layer.end - MIN_LEN), 2);
      } else {
        layer.end = round(clamp(snapT(o.end + dt, ev.altKey), layer.start + MIN_LEN, d), 2);
      }
      bar.style.left = (layer.start / d) * 100 + '%';
      bar.style.width = ((layer.end - layer.start) / d) * 100 + '%';
      label.textContent = barLabel(layer);
      applyLayer(layer);
      syncBinds(dom.props);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      document.body.classList.remove('is-dragging');
      if (moved) commit();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    document.body.classList.add('is-dragging');
  }

  /* ============================================================ playback */
  let rafId = 0;
  let lastTs = 0;

  function play() {
    if (playing) return;
    if (editingId) stopTextEdit();
    if (!doc.layers.some((l) => !l.hidden)) { toast('Add something to your ad to preview it.'); return; }
    if (t >= doc.duration - 0.05) t = 0;
    playing = true;
    lastTs = performance.now();
    document.body.classList.add('is-playing');
    dom.wrap.classList.add('is-playing');
    dom.playBtn.setAttribute('aria-label', 'Pause preview');
    rafId = requestAnimationFrame(tick);
  }

  function pause() {
    if (!playing) return;
    playing = false;
    cancelAnimationFrame(rafId);
    document.body.classList.remove('is-playing');
    dom.wrap.classList.remove('is-playing');
    dom.playBtn.setAttribute('aria-label', 'Play preview');
    renderFrame();
    renderOverlay();
  }

  function tick(now) {
    if (!playing) return;
    t += Math.min(0.1, (now - lastTs) / 1000);
    lastTs = now;
    if (t >= doc.duration) {
      if (loopPreview) t %= doc.duration;
      else { t = doc.duration; pause(); return; }
    }
    renderFrame();
    rafId = requestAnimationFrame(tick);
  }

  function renderFrame() {
    for (const l of doc.layers) {
      applyLayer(l);
      if (l.type === 'video') syncVideo(l.id);
    }
    updatePlayhead();
  }

  function syncVideo(id, force) {
    const layer = getLayer(id);
    const el = els.get(id);
    const v = el && el.querySelector('video');
    if (!layer || !v || v.readyState < 1) return;
    const m = media.get(layer.mediaId);
    const vd = (m && m.duration) || (Number.isFinite(v.duration) ? v.duration : 0);
    if (!vd) return;
    v.muted = !previewAudio;
    const active = !layer.hidden && t >= layer.start && t <= layer.end;
    const trim = clamp(layer.trimStart || 0, 0, Math.max(0, vd - 0.1));
    const local = Math.max(0, t - layer.start);
    const ended = !layer.loop && trim + local >= vd - 0.05;
    const target = layer.loop ? trim + (local % Math.max(0.1, vd - trim)) : Math.min(trim + local, vd - 0.05);
    if (playing && active && !ended) {
      if (v.paused) {
        if (Math.abs(v.currentTime - target) > 0.05) v.currentTime = target;
        v.play().catch(() => {});
      } else if (Math.abs(v.currentTime - target) > 0.3) {
        v.currentTime = target;
      }
    } else {
      if (!v.paused) v.pause();
      if ((force || Math.abs(v.currentTime - target) > 0.04) && !v.seeking) v.currentTime = target;
    }
  }

  const togglePlay = () => (playing ? pause() : play());

  // A playhead position where the whole design is on screen, so nothing opens ghosted.
  function settleTime() {
    const shown = doc.layers.filter((l) => !l.hidden);
    if (!shown.length) return 0;
    const latestStart = Math.max(...shown.map((l) => l.start));
    const earliestEnd = Math.min(...shown.map((l) => l.end));
    return latestStart < earliestEnd ? round(latestStart, 2) : 0;
  }

  /* ============================================================ history & persistence */
  const snapshot = () => JSON.stringify(doc);

  const saveNow = () => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, doc, campaign })); } catch { /* storage full or blocked */ }
  };
  const save = debounce(saveNow, 250);
  window.addEventListener('pagehide', saveNow);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });

  function commit() {
    const s = snapshot();
    if (hist.stack[hist.index] !== s) {
      hist.stack = hist.stack.slice(0, hist.index + 1);
      hist.stack.push(s);
      if (hist.stack.length > 80) hist.stack.shift();
      hist.index = hist.stack.length - 1;
      updateUndoButtons();
    }
    save();
  }
  const commitSoon = debounce(commit, 400);

  function restoreSnapshot(s) {
    stopTextEdit(false);
    pause();
    doc = JSON.parse(s);
    if (!getLayer(selectedId)) selectedId = null;
    refreshAll();
    updateUndoButtons();
    save();
  }
  function undo() { if (hist.index > 0) restoreSnapshot(hist.stack[--hist.index]); }
  function redo() { if (hist.index < hist.stack.length - 1) restoreSnapshot(hist.stack[++hist.index]); }
  function updateUndoButtons() {
    dom.undo.disabled = hist.index <= 0;
    dom.redo.disabled = hist.index >= hist.stack.length - 1;
  }

  function restoreState() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { /* ignore */ }
    if (saved && saved.doc && Array.isArray(saved.doc.layers)) {
      const d = defaultDoc();
      doc = {
        orientation: SIZES[saved.doc.orientation] ? saved.doc.orientation : d.orientation,
        duration: clamp(Math.round(Number(saved.doc.duration) || 15), PC.duration.min, PC.duration.max),
        background: { ...d.background, ...(saved.doc.background || {}) },
        layers: saved.doc.layers.filter((l) => l && typeof l.id === 'string' && LAYER_TYPES.includes(l.type)),
      };
    }
    if (saved && saved.campaign) {
      const c = defaultCampaign();
      campaign = { ...c, ...saved.campaign, addons: { ...c.addons, ...(saved.campaign.addons || {}) } };
      if (!/^\d{4}-\d{2}-\d{2}$/.test(campaign.startDate) || campaign.startDate < isoDate(new Date())) campaign.startDate = c.startDate;
    }
  }

  /* media blobs live in IndexedDB so a refresh doesn't lose uploads */
  const idb = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('biztek-studio', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('media', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    }));
    const run = async (mode, fn) => {
      const db = await open();
      return new Promise((res, rej) => {
        const tx = db.transaction('media', mode);
        const req = fn(tx.objectStore('media'));
        tx.oncomplete = () => res(req && req.result);
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error);
      });
    };
    return {
      put: (rec) => run('readwrite', (s) => s.put(rec)).catch(() => {}),
      del: (id) => run('readwrite', (s) => s.delete(id)).catch(() => {}),
      all: () => run('readonly', (s) => s.getAll()).catch(() => []),
    };
  })();

  async function restoreMedia() {
    const recs = (await idb.all()) || [];
    for (const r of recs) {
      if (!r || !r.blob) continue;
      media.set(r.id, { ...r, url: URL.createObjectURL(r.blob) });
    }
  }

  /* ============================================================ media */
  function probe(kind, url) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 20000);
      const done = (fn) => (v) => { clearTimeout(timer); fn(v); };
      if (kind === 'image') {
        const img = new Image();
        img.onload = done(() => resolve({ w: img.naturalWidth, h: img.naturalHeight }));
        img.onerror = done(reject);
        img.src = url;
      } else {
        const v = document.createElement('video');
        v.preload = 'metadata';
        v.muted = true;
        v.onloadedmetadata = () => {
          if (!v.videoWidth) { done(reject)(new Error('no video track')); return; }
          const finish = done(() => resolve({ w: v.videoWidth, h: v.videoHeight, duration: Number.isFinite(v.duration) ? v.duration : 0 }));
          if (Number.isFinite(v.duration)) { finish(); return; }
          // Some WebM files (e.g. screen recordings) don't store a duration; seeking far ahead makes the browser work it out.
          v.ontimeupdate = () => { v.ontimeupdate = null; finish(); };
          v.currentTime = 1e101;
        };
        v.onerror = done(reject);
        v.src = url;
      }
    });
  }

  async function ingestFiles(fileList, { replaceLayerId = null } = {}) {
    for (const file of [...fileList]) {
      const type = FILE_TYPES[file.type] ? file.type : EXT_TYPES[(file.name.split('.').pop() || '').toLowerCase()];
      const kind = type && FILE_TYPES[type];
      if (!kind) { toast(`“${file.name}” isn't supported. Use MP4, WEBM, MOV, JPG, PNG, WEBP or GIF.`, 'error'); continue; }
      const maxBytes = serverConfig.maxUploadBytes || MAX_FILE;
      if (file.size > maxBytes) { toast(`“${file.name}” is over ${Math.round(maxBytes / 1048576)} MB.`, 'error'); continue; }
      const url = URL.createObjectURL(file);
      let meta;
      try {
        meta = await probe(kind, url);
      } catch {
        URL.revokeObjectURL(url);
        toast(kind === 'video' ? `Your browser can't play “${file.name}”. Try exporting it as MP4 (H.264).` : `Couldn't read “${file.name}”.`, 'error');
        continue;
      }
      const m = { id: uid('m'), kind, type, name: file.name, size: file.size, blob: file, ...meta };
      idb.put({ ...m });
      m.url = url;
      media.set(m.id, m);

      if (replaceLayerId) {
        const l = getLayer(replaceLayerId);
        if (l) {
          l.type = kind; l.mediaId = m.id; l.name = m.name;
          afterStructureChange();
          buildProps();
          commit();
        }
        replaceLayerId = null;
      } else {
        const { layer, first } = makeMediaLayer(m);
        addLayer(layer, { atBottom: first });
        if (kind === 'video') suggestLength(m);
      }
    }
    renderLibrary();
  }

  function suggestLength(m) {
    if (!m.duration) return;
    if (m.duration > PC.duration.max + 0.5) {
      toast(`This clip is ${Math.round(m.duration)}s long. Spots max out at ${PC.duration.max}s, so pick where it starts under Video.`);
      return;
    }
    const len = clamp(Math.round(m.duration), PC.duration.min, PC.duration.max);
    if (len !== doc.duration) {
      toast(`Your clip is ${m.duration.toFixed(1)}s long.`, '', { label: `Make spot ${len}s`, fn: () => { setDuration(len); commit(); } });
    }
  }

  function renderLibrary() {
    if (!media.size) {
      dom.library.innerHTML = '<p class="empty">Uploads appear here. Click one to add it to your ad again.</p>';
      return;
    }
    dom.library.innerHTML = [...media.values()].map((m) => `
      <div class="lib-item" role="button" tabindex="0" data-media="${m.id}" title="Add ${esc(m.name)}">
        ${m.kind === 'video' ? `<video src="${m.url}" muted preload="metadata"></video>` : `<img src="${m.url}" alt="">`}
        <span class="lib-badge">${m.kind === 'video' ? fmtDur(m.duration) : 'IMG'}</span>
        <button type="button" class="lib-del" data-del="${m.id}" aria-label="Remove ${esc(m.name)}">×</button>
      </div>`).join('');
  }

  function removeMedia(id) {
    const used = doc.layers.filter((l) => l.mediaId === id);
    if (used.length && !confirm(`Remove this file? ${used.length === 1 ? 'The layer using it' : `The ${used.length} layers using it`} will be deleted too.`)) return;
    const m = media.get(id);
    if (m) URL.revokeObjectURL(m.url);
    media.delete(id);
    idb.del(id);
    if (used.length) {
      doc.layers = doc.layers.filter((l) => l.mediaId !== id);
      if (!getLayer(selectedId)) selectedId = null;
      afterStructureChange();
      buildProps();
      renderOverlay();
      commit();
    }
    renderLibrary();
  }

  /* ============================================================ templates */
  const TEMPLATES = [
    {
      id: 'deal', name: 'Member Deal', tag: 'TEXT RATE',
      build: (S) => {
        const m = Math.min(S.w, S.h);
        return {
          background: { type: 'solid', color1: '#FF5212', color2: '#D2380A', angle: 135 },
          layers: [
            makeShape('stripes', { x: -S.w * 0.1, y: S.h * 0.64, w: S.w * 1.2, h: S.h * 0.12, rot: -4, fill: '#D2380A', fill2: '#17130F', band: 40, animIn: 'wipe', start: 0.2, name: 'Stripe band' }),
            makeText('body', { text: 'MEMBERS ONLY', font: 'mono', fontSize: 40, weight: 700, letter: 0.2, color: '#17130F', x: S.w * 0.07, y: S.h * 0.1, w: S.w * 0.6 }),
            makeText('heading', { text: '20% OFF', fontSize: Math.round(m * 0.26), color: '#17130F', x: S.w * 0.065, y: S.h * 0.17, w: S.w * 0.86, animIn: 'pop', start: 0.3 }),
            makeText('subhead', { text: 'your first month of meal prep', color: '#17130F', x: S.w * 0.07, y: S.h * 0.47, w: S.w * 0.8, animIn: 'rise', start: 0.8 }),
            makeText('body', { text: 'Show your gym tag in store →', color: '#F4EEE3', hl: true, hlColor: '#17130F', weight: 700, x: S.w * 0.07, y: S.h * 0.84, w: S.w * 0.8, animIn: 'slide-left', start: 1.3 }),
          ],
        };
      },
    },
    {
      id: 'open', name: 'Grand Opening', tag: 'TEXT RATE',
      build: (S) => {
        const m = Math.min(S.w, S.h);
        const b = Math.round(m * 0.4);
        const bx = S.w - b - S.w * 0.06;
        const by = S.h * 0.1;
        const fs = Math.round(b * 0.24);
        return {
          background: { type: 'solid', color1: '#17130F', color2: '#3A342C', angle: 135 },
          layers: [
            makeShape('rect', { x: 0, y: S.h - 28, w: S.w, h: 28, radius: 0, animIn: 'wipe', name: 'Bottom bar' }),
            makeShape('burst', { x: bx, y: by, w: b, h: b, rot: 12, animIn: 'pop', start: 0.6 }),
            makeText('heading', { text: 'NEW', fontSize: fs, align: 'center', color: '#17130F', x: bx, y: by + b / 2 - fs * 0.46, w: b, rot: 12, animIn: 'pop', start: 0.8 }),
            makeText('heading', { text: 'Now open', fontSize: Math.round(m * 0.2), color: '#F4EEE3', x: S.w * 0.06, y: S.h * 0.2, w: S.w * 0.58 }),
            makeText('subhead', { text: 'Physio · Massage · Chiro', color: '#FF5212', x: S.w * 0.06, y: S.h * 0.6, w: S.w * 0.7, animIn: 'rise', start: 0.5 }),
            makeText('body', { text: 'Two minutes from the gym · 123 Main St', color: '#F4EEE3', opacity: 0.8, x: S.w * 0.06, y: S.h * 0.72, w: S.w * 0.7, start: 1 }),
          ],
        };
      },
    },
    {
      id: 'scan', name: 'Scan to Book', tag: 'TEXT RATE',
      build: (S) => {
        const pw = S.w * 0.38;
        const px = S.w - pw;
        const q = Math.round(Math.min(pw * 0.64, S.h * 0.42));
        const qy = Math.round((S.h - q) / 2 - 30);
        return {
          background: { type: 'solid', color1: '#F4EEE3', color2: '#EAE1D1', angle: 135 },
          layers: [
            makeShape('rect', { x: px, y: 0, w: pw, h: S.h, radius: 0, fill: '#17130F', animIn: 'slide-left', name: 'Panel' }),
            makeQr({ x: px + (pw - q) / 2, y: qy, w: q, h: q, fg: '#17130F', bg: '#F4EEE3', start: 0.4 }),
            makeText('body', { text: 'SCAN TO BOOK', font: 'mono', fontSize: 34, weight: 700, letter: 0.2, align: 'center', color: '#F4EEE3', x: px, y: qy + q + 34, w: pw, start: 0.6 }),
            makeText('body', { text: 'YOUR BUSINESS', font: 'mono', fontSize: 36, weight: 700, letter: 0.2, color: '#D2380A', x: S.w * 0.06, y: S.h * 0.14, w: S.w * 0.5 }),
            makeText('heading', { text: 'Sore? Book a sports massage.', fontSize: Math.round(Math.min(S.w, S.h) * 0.1), color: '#17130F', x: S.w * 0.06, y: S.h * 0.24, w: S.w * 0.5, start: 0.2 }),
            makeText('subhead', { text: 'First visit 25% off for members', fontSize: 52, color: '#D2380A', x: S.w * 0.06, y: S.h * 0.74, w: S.w * 0.5, animIn: 'rise', start: 0.9 }),
          ],
        };
      },
    },
    {
      id: 'lower', name: 'Video Lower Third', tag: 'ADD YOUR VIDEO', keepMedia: true,
      build: (S) => {
        const bh = Math.round(S.h * 0.13);
        const by = Math.round(S.h * 0.7);
        const fs = Math.round(bh * 0.52);
        return {
          background: { type: 'gradient', color1: '#17130F', color2: '#5A2A14', angle: 135 },
          layers: [
            makeShape('rect', { x: S.w * 0.05, y: by, w: S.w * 0.56, h: bh, radius: 0, animIn: 'wipe', start: 0.2, name: 'Name bar' }),
            makeText('heading', { text: 'YOUR BRAND', fontSize: fs, color: '#17130F', x: S.w * 0.05 + 36, y: by + (bh - fs * 0.92) / 2, w: S.w * 0.56 - 72, animIn: 'fade', start: 0.5 }),
            makeText('body', { text: 'Your offer or tagline goes here', color: '#F4EEE3', hl: true, hlColor: '#17130F', weight: 700, fontSize: 42, x: S.w * 0.05, y: by + bh + 18, w: S.w * 0.7, animIn: 'rise', start: 0.8 }),
          ],
        };
      },
    },
  ];

  function applyTemplate(tpl, skipConfirm) {
    const replaced = doc.layers.filter((l) => !(tpl.keepMedia && isMedia(l)));
    if (!skipConfirm && replaced.length && !confirm('Replace your current design with this template? You can undo afterwards.')) return;
    const built = tpl.build(stageSize());
    const kept = tpl.keepMedia ? doc.layers.filter(isMedia) : [];
    doc.background = built.background;
    doc.layers = kept.concat(built.layers.map((l) => ({
      ...l, x: round(l.x), y: round(l.y), w: round(l.w), h: round(l.h), end: Math.min(l.end, doc.duration),
    })));
    selectedId = null;
    t = settleTime();
    refreshAll();
    commit();
    if (tpl.keepMedia && !kept.length) {
      switchLeftTab('add');
      toast('Now drop in your video. It goes behind the text automatically.');
    } else {
      toast(`“${tpl.name}” applied. Click any layer to edit it.`);
    }
  }

  let templatesRendered = false;
  function renderTemplates() {
    dom.templates.innerHTML = TEMPLATES.map((tp) => `
      <button type="button" class="tpl" data-tpl="${tp.id}">
        <div class="tpl-preview"></div>
        <div class="tpl-meta">${esc(tp.name)}<span>${esc(tp.tag)}</span></div>
      </button>`).join('');
    const saved = doc;
    doc = { ...defaultDoc(), duration: saved.duration }; // build against a landscape screen
    const S = SIZES.landscape;
    for (const btn of $$('.tpl', dom.templates)) {
      const tp = TEMPLATES.find((x) => x.id === btn.dataset.tpl);
      const box = btn.querySelector('.tpl-preview');
      const built = tp.build(S);
      const mini = document.createElement('div');
      mini.className = 'mini-stage';
      Object.assign(mini.style, { width: S.w + 'px', height: S.h + 'px', transform: `scale(${box.clientWidth / S.w})`, background: bgCss(built.background) });
      built.layers.forEach((l, i) => {
        const el = createLayerEl(l);
        styleContent(l, el);
        Object.assign(el.style, {
          left: l.x + 'px', top: l.y + 'px', width: l.w + 'px', height: l.type === 'text' ? 'auto' : l.h + 'px',
          transform: `rotate(${l.rot}deg)`, opacity: l.opacity, zIndex: i + 1,
        });
        mini.appendChild(el);
      });
      box.appendChild(mini);
    }
    doc = saved;
    templatesRendered = true;
  }

  /* ============================================================ properties panel */
  const H = {
    section: (title, body, extra = '') => `<section class="psec"><h3 class="psec-h"><span>${title}</span>${extra}</h3>${body}</section>`,
    num: (bind, label, o = {}) => `<label class="f f-num${o.full ? ' full' : ''}"><span>${label}</span><input type="number" data-bind="${bind}" step="${o.step ?? 1}"${o.min != null ? ` min="${o.min}"` : ''}${o.max != null ? ` max="${o.max}"` : ''}${o.disabled ? ' disabled' : ''}>${o.unit ? `<i>${o.unit}</i>` : ''}</label>`,
    range: (bind, label, min, max, step, o = {}) => `<label class="f full"><span>${label}<output data-out="${bind}" data-fmt="${o.fmt || ''}"></output></span><input type="range" class="rng" data-bind="${bind}" min="${min}" max="${max}" step="${step}"></label>`,
    color: (bind, label, o = {}) => `<div class="f${o.full ? ' full' : ''}"><span>${label}</span><span class="cwrap"><input type="color" data-bind="${bind}" aria-label="${esc(label)}"><input type="text" data-bind="${bind}" data-kind="hex" maxlength="7" spellcheck="false" aria-label="${esc(label)} hex code"></span>${o.swatches ? `<span class="swatches">${SWATCHES.map((c) => `<button type="button" data-swatch="${bind}" data-value="${c}" style="background:${c}" title="${c}" aria-label="Use ${c}"></button>`).join('')}</span>` : ''}</div>`,
    select: (bind, label, options, o = {}) => `<label class="f${o.full ? ' full' : ''}"><span>${label}</span><select data-bind="${bind}"${o.num ? ' data-kind="num"' : ''}>${options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label>`,
    toggle: (bind, label, o = {}) => `<label class="f-toggle${o.disabled ? ' is-disabled' : ''}"${o.id ? ` id="${o.id}"` : ''}><input type="checkbox" data-bind="${bind}"${o.disabled ? ' disabled' : ''}><span class="sw"></span><span class="ft-text">${label}${o.sub ? `<small>${o.sub}</small>` : ''}</span>${o.price ? `<span class="ft-price">${o.price}</span>` : ''}</label>`,
    seg: (bind, options, o = {}) => `<div class="seg seg-full" data-seg="${bind}"${o.num ? ' data-kind="num"' : ''} role="group">${options.map(([v, l, title]) => `<button type="button" data-value="${esc(v)}"${title ? ` title="${esc(title)}" aria-label="${esc(title)}"` : ''}>${l}</button>`).join('')}</div>`,
    text: (bind, label, o = {}) => `<label class="f full"><span>${label}</span><input type="${o.type || 'text'}" data-bind="${bind}" placeholder="${esc(o.placeholder || '')}" spellcheck="false"></label>`,
    textarea: (bind, label) => `<label class="f full"><span>${label}</span><textarea data-bind="${bind}" rows="3"></textarea></label>`,
    btn: (action, label, o = {}) => `<button type="button" class="mini-btn${o.cls ? ' ' + o.cls : ''}" data-action="${action}"${o.title ? ` title="${esc(o.title)}" aria-label="${esc(o.title)}"` : ''}>${o.icon ? ICONS[o.icon] : ''}${label}</button>`,
  };

  const KEYS_HTML = `<dl class="keys">
    <dt><kbd>Space</kbd></dt><dd>Play / pause</dd>
    <dt>Double-click</dt><dd>Edit text in place</dd>
    <dt><kbd>Del</kbd></dt><dd>Delete layer</dd>
    <dt><kbd>Ctrl</kbd> <kbd>D</kbd></dt><dd>Duplicate layer</dd>
    <dt><kbd>Ctrl</kbd> <kbd>Z</kbd></dt><dd>Undo (add <kbd>Shift</kbd> to redo)</dd>
    <dt><kbd>←</kbd><kbd>→</kbd><kbd>↑</kbd><kbd>↓</kbd></dt><dd>Nudge (<kbd>Shift</kbd> for 10px)</dd>
    <dt><kbd>[</kbd> <kbd>]</kbd></dt><dd>Send backward / bring forward</dd>
    <dt><kbd>Shift</kbd></dt><dd>Resize freely or keep ratio · rotate in 15° steps</dd>
    <dt><kbd>Alt</kbd></dt><dd>Drag without snapping</dd>
  </dl>`;

  function detectFormat() {
    const kinds = doc.layers.filter((l) => !l.hidden).map((l) => l.type);
    return kinds.includes('video') ? 'video' : kinds.includes('image') ? 'image' : 'text';
  }

  function tierExplain(fmt) {
    if (fmt === 'video') return 'Your ad has a video layer, so it\'s billed at the video rate.';
    if (fmt === 'image') return 'Your ad has an image, so it\'s billed at the image rate. Adding a video moves it to the video rate.';
    return 'Text, shapes and QR codes only, so you pay the lowest rate. Adding an image or video changes the rate.';
  }

  function buildProps() {
    const l = selected();
    dom.props.innerHTML = l ? layerPropsHtml(l) : canvasPropsHtml();
    syncBinds(dom.props);
  }

  function canvasPropsHtml() {
    const bg = doc.background;
    const fmt = detectFormat();
    return `
      <div class="layer-head"><span class="tl-icon" style="--c:var(--ink);--fg:var(--cream)">▭</span><b style="font-size:15px;font-weight:800">Screen</b></div>
      ${H.section('Ad type', `<div class="tier-card"><b>${PC.formats[fmt].label} rate</b><p>${tierExplain(fmt)}</p></div>`)}
      ${H.section('Spot length', `${H.range('D.duration', 'Seconds each time it plays', PC.duration.min, PC.duration.max, 1, { fmt: 's' })}<p class="hint">Longer spots cost more, but less per second.</p>`)}
      ${H.section('Screen', H.seg('D.orientation', [['landscape', 'Landscape 16:9'], ['portrait', 'Portrait 9:16']]))}
      ${H.section('Background', `<div class="pgrid">
        ${H.seg('D.background.type', [['solid', 'Solid'], ['gradient', 'Gradient'], ['stripes', 'Stripes']])}
        ${H.color('D.background.color1', bg.type === 'solid' ? 'Colour' : 'Colour 1', { full: true, swatches: true })}
        ${bg.type !== 'solid' ? H.color('D.background.color2', 'Colour 2', { full: true, swatches: true }) : ''}
        ${bg.type !== 'solid' ? H.range('D.background.angle', 'Angle', 0, 360, 1, { fmt: 'deg' }) : ''}
      </div>`)}
      ${H.section('Shortcuts', KEYS_HTML)}`;
  }

  function layerPropsHtml(l) {
    let html = `<div class="layer-head t-${l.type}">
      <span class="tl-icon">${TYPE_ICON[l.type]}</span>
      <input type="text" data-bind="L.name" placeholder="${esc(layerName({ ...l, name: '' }))}" aria-label="Layer name">
      ${H.btn('duplicate', '', { icon: 'copy', title: 'Duplicate (Ctrl+D)' })}
      ${H.btn('delete', '', { icon: 'trash', cls: 'danger', title: 'Delete (Del)' })}
    </div>`;
    if (l.type === 'text') html += textProps(l);
    if (isMedia(l)) html += mediaProps(l);
    if (l.type === 'shape') html += shapeProps(l);
    if (l.type === 'qr') html += qrProps();

    html += H.section('Timing & motion', `<div class="pgrid">
      ${H.num('L.start', 'Appears at', { step: 0.1, min: 0, max: doc.duration, unit: 's' })}
      ${H.num('L.end', 'Leaves at', { step: 0.1, min: 0, max: doc.duration, unit: 's' })}
      ${H.select('L.animIn', 'Animate in', ANIMS)}
      ${H.select('L.animOut', 'Animate out', ANIMS)}
      ${H.range('L.animDur', 'Motion length', 0.2, 2, 0.1, { fmt: 's' })}
      <div class="btn-row">${H.btn('full-length', 'Whole spot')}${H.btn('from-playhead', 'Start at playhead')}${H.btn('preview-layer', 'Preview', { icon: 'play' })}</div>
    </div>`);

    html += H.section('Position & size', `<div class="pgrid">
      ${H.num('L.x', 'X', { unit: 'px' })}${H.num('L.y', 'Y', { unit: 'px' })}
      ${H.num('L.w', 'Width', { unit: 'px', min: 10 })}${H.num('L.h', 'Height', { unit: 'px', min: 10, disabled: l.type === 'text' })}
      ${H.range('L.rot', 'Rotation', -180, 180, 1, { fmt: 'deg' })}
      ${H.range('L.opacity', 'Opacity', 0, 1, 0.01, { fmt: 'pct' })}
      <div class="btn-row">${H.btn('center-h', 'Center ↔')}${H.btn('center-v', 'Center ↕')}${l.type !== 'text' && l.type !== 'qr' ? H.btn('fill-stage', 'Fill screen') : ''}${l.rot ? H.btn('reset-rot', 'Straighten') : ''}</div>
    </div>`);

    html += H.section('Arrange', `<div class="btn-row">${H.btn('front', 'To front')}${H.btn('forward', 'Forward')}${H.btn('backward', 'Backward')}${H.btn('back', 'To back')}</div>
      <div style="margin-top:10px">${H.toggle('L.locked', 'Lock position')}</div>`);
    return html;
  }

  function textProps(l) {
    return H.section('Text', `<div class="pgrid">
      ${H.textarea('L.text', 'Content')}
      ${H.select('L.font', 'Font', FONTS.map((f) => [f.id, f.label]), { full: true })}
      ${H.num('L.fontSize', 'Size', { min: 8, max: 800, unit: 'px' })}
      ${H.select('L.weight', 'Weight', [[300, 'Light'], [400, 'Regular'], [500, 'Medium'], [700, 'Bold'], [800, 'Extra bold'], [900, 'Black']], { num: true })}
      ${H.color('L.color', 'Colour', { full: true, swatches: true })}
      ${H.seg('L.align', [['left', ICONS.alignL, 'Align left'], ['center', ICONS.alignC, 'Align center'], ['right', ICONS.alignR, 'Align right']])}
      ${H.range('L.lineHeight', 'Line height', 0.7, 2, 0.02, { fmt: 'x' })}
      ${H.range('L.letter', 'Letter spacing', -0.1, 0.4, 0.005, { fmt: 'em' })}
      ${H.toggle('L.upper', 'All caps')}
      ${H.toggle('L.italic', 'Italic')}
      ${H.toggle('L.shadow', 'Drop shadow')}
      ${H.toggle('L.hl', 'Highlight behind text')}
      ${l.hl ? H.color('L.hlColor', 'Highlight colour', { full: true, swatches: true }) : ''}
    </div><p class="hint">Tip: double-click text on the screen to type straight onto it.</p>`);
  }

  function mediaProps(l) {
    const m = media.get(l.mediaId);
    const info = m
      ? `<div class="media-info"><div class="mi-thumb">${m.kind === 'video' ? `<video src="${m.url}" muted preload="metadata"></video>` : `<img src="${m.url}" alt="">`}</div>
         <div class="mi-text"><b>${esc(m.name)}</b><span>${m.w}×${m.h}${m.duration ? ` · ${m.duration.toFixed(1)}s` : ''} · ${fmtBytes(m.size)}</span></div></div>`
      : '<p class="hint warn">This file is missing. Replace it to keep this layer.</p>';
    let video = '';
    if (l.type === 'video' && m && m.duration) {
      const vd = m.duration;
      const playable = vd - (l.trimStart || 0);
      const matchLen = clamp(Math.round(playable), PC.duration.min, PC.duration.max);
      video = `<div class="pgrid" style="margin-top:12px">
        ${H.range('L.trimStart', 'Start the clip at', 0, Math.max(0, round(vd - 0.5, 1)), 0.1, { fmt: 's' })}
        ${H.toggle('L.loop', 'Loop if the clip is shorter than its time on screen')}
        <div class="btn-row">${H.btn('match-video', `Make spot ${matchLen}s to match clip`)}</div>
      </div>
      ${!l.loop && playable < l.end - l.start - 0.05 ? '<p class="hint warn">The clip ends before this layer does, so it will hold on the last frame.</p>' : ''}
      ${vd > PC.duration.max ? `<p class="hint">Only ${PC.duration.max}s can play. Use “Start the clip at” to choose which part.</p>` : ''}`;
    }
    return H.section(l.type === 'video' ? 'Video' : 'Image', `${info}<div class="pgrid">
        ${H.seg('L.fit', [['cover', 'Fill'], ['contain', 'Fit'], ['fill', 'Stretch']])}
        ${H.range('L.radius', 'Corner radius', 0, 400, 1, { fmt: 'px' })}
        <div class="btn-row">${H.btn('replace-media', 'Replace file', { icon: 'swap' })}</div>
      </div>${video}`) +
      H.section('Adjust', `<div class="pgrid">
        ${H.range('L.brightness', 'Brightness', 40, 160, 1, { fmt: '%' })}
        ${H.range('L.contrast', 'Contrast', 40, 160, 1, { fmt: '%' })}
        ${H.range('L.saturate', 'Saturation', 0, 200, 1, { fmt: '%' })}
        ${H.range('L.grayscale', 'Black & white', 0, 100, 1, { fmt: '%' })}
        <div class="btn-row">${H.btn('reset-adjust', 'Reset')}</div>
      </div>`);
  }

  function shapeProps(l) {
    const outline = l.shape === 'rect' || l.shape === 'ellipse';
    return H.section('Shape', `<div class="pgrid">
      ${H.seg('L.shape', SHAPES)}
      ${H.color('L.fill', l.shape === 'stripes' ? 'Colour 1' : 'Fill', { full: true, swatches: true })}
      ${l.shape === 'stripes' ? H.color('L.fill2', 'Colour 2', { full: true, swatches: true }) + H.range('L.band', 'Stripe width', 8, 200, 1, { fmt: 'px' }) : ''}
      ${l.shape === 'rect' ? H.range('L.radius', 'Corner radius', 0, 300, 1, { fmt: 'px' }) : ''}
      ${outline ? H.range('L.strokeW', 'Outline', 0, 40, 1, { fmt: 'px' }) + H.color('L.stroke', 'Outline colour', { full: true }) : ''}
    </div>`);
  }

  function qrProps() {
    return H.section('QR code', `<div class="pgrid">
      ${H.text('L.url', 'Link', { type: 'url', placeholder: 'https://yourbusiness.com' })}
      ${H.color('L.fg', 'Code colour', { full: true })}
      ${H.color('L.bg', 'Background', { full: true })}
    </div><p class="hint">Keep strong contrast (a dark code on a light background) so phones can scan it from across the room.</p>`);
  }

  /* --- binding: data-bind="L.x" (selected layer), "D.…" (design), "C.…" (campaign) */
  function bindTarget(path) {
    const [root, ...keys] = path.split('.');
    let obj = root === 'L' ? selected() : root === 'D' ? doc : root === 'C' ? campaign : null;
    for (let i = 0; i < keys.length - 1 && obj; i++) obj = obj[keys[i]];
    return obj ? { obj, key: keys[keys.length - 1] } : null;
  }
  const getBind = (path) => { const b = bindTarget(path); return b ? b.obj[b.key] : undefined; };
  const setBind = (path, v) => { const b = bindTarget(path); if (b) b.obj[b.key] = v; };

  function fmtOut(v, fmt) {
    if (v == null || Number.isNaN(v)) return '';
    switch (fmt) {
      case 'pct': return Math.round(v * 100) + '%';
      case '%': return Math.round(v) + '%';
      case 'deg': return Math.round(v) + '°';
      case 's': return (Number.isInteger(v) ? v : v.toFixed(1)) + 's';
      case 'x': return v.toFixed(2) + '×';
      case 'em': return v.toFixed(3) + 'em';
      case 'px': return Math.round(v) + 'px';
      default: return String(v);
    }
  }

  function setRangeFill(r) {
    const min = Number(r.min);
    const max = Number(r.max);
    r.style.setProperty('--p', (max > min ? ((Number(r.value) - min) / (max - min)) * 100 : 0) + '%');
  }

  function syncBinds(scope) {
    if (!scope) return;
    $$('[data-bind]', scope).forEach((inp) => {
      const v = getBind(inp.dataset.bind);
      if (v === undefined) return;
      if (inp.type === 'checkbox') { inp.checked = !!v; return; }
      if (inp === document.activeElement && inp.type !== 'range') return;
      if (inp.type === 'color') inp.value = parseHex(v) ? String(v).toLowerCase() : '#000000';
      else if (inp.type === 'number') inp.value = typeof v === 'number' ? round(v, 2) : v;
      else inp.value = v ?? '';
      if (inp.type === 'range') setRangeFill(inp);
    });
    $$('[data-out]', scope).forEach((o) => { o.textContent = fmtOut(getBind(o.dataset.out), o.dataset.fmt); });
    $$('[data-seg]', scope).forEach((seg) => {
      const v = String(getBind(seg.dataset.seg));
      $$('button', seg).forEach((b) => b.classList.toggle('is-on', b.dataset.value === v));
    });
  }

  const REBUILD_ON_CHANGE = new Set(['hl', 'shape', 'trimStart', 'loop', 'type']);

  function applyBind(path, v, isChange) {
    const parts = path.split('.');
    const root = parts[0];
    const key = parts[parts.length - 1];

    if (root === 'C') {
      setBind(path, v);
      updatePrice();
      syncCampaign();
      save();
      return;
    }

    if (root === 'D') {
      if (path === 'D.duration') setDuration(v);
      else if (path === 'D.orientation') setOrientation(v);
      else {
        setBind(path, v);
        dom.stage.style.background = bgCss(doc.background);
        if (path === 'D.background.type') buildProps();
      }
    } else if (root === 'L') {
      const layer = selected();
      if (!layer) return;
      if (key === 'start') v = round(clamp(v, 0, layer.end - MIN_LEN), 2);
      if (key === 'end') v = round(clamp(v, layer.start + MIN_LEN, doc.duration), 2);
      if (key === 'w' || key === 'h') v = Math.max(10, v);
      setBind(path, v);
      if (layer.type === 'qr' && (key === 'w' || key === 'h')) { layer.w = v; layer.h = v; }
      styleContent(layer, els.get(layer.id));
      applyLayer(layer);
      if (layer.type === 'text') measureText();
      if (['start', 'end', 'name', 'text', 'hidden'].includes(key)) updateTimelineRow(layer);
      if (key === 'locked') { buildTimeline(); }
      if (layer.type === 'video' && (key === 'trimStart' || key === 'loop')) syncVideo(layer.id, true);
      renderOverlay();
      if (isChange && REBUILD_ON_CHANGE.has(key)) buildProps();
    }
    syncBinds(dom.props);
    syncBinds(dom.campaign);
    if (isChange) commit();
  }

  function onBindInput(e) {
    const inp = e.target;
    const isChange = e.type === 'change';
    let v;
    if (inp.type === 'checkbox') v = inp.checked;
    else if (inp.type === 'number' || inp.type === 'range') {
      v = parseFloat(inp.value);
      if (!Number.isFinite(v)) return;
      const min = inp.min !== '' ? Number(inp.min) : -Infinity;
      const max = inp.max !== '' ? Number(inp.max) : Infinity;
      if (!isChange && inp.type === 'number' && (v < min || v > max)) return; // let people finish typing
      v = clamp(v, min, max);
    } else if (inp.dataset.kind === 'hex') {
      let s = inp.value.trim();
      if (!s.startsWith('#')) s = '#' + s;
      if (!parseHex(s)) { if (isChange) syncBinds(inp.closest('.pane')); return; }
      v = s.toUpperCase();
    } else if (inp.type === 'color') v = inp.value.toUpperCase();
    else if (inp.dataset.kind === 'num') v = parseFloat(inp.value);
    else v = inp.value;
    if (inp.type === 'checkbox' && !isChange) return; // checkboxes: act once, on change
    applyBind(inp.dataset.bind, v, isChange);
  }

  function runAction(action) {
    if (action === 'duplicate') return duplicateSelected();
    if (action === 'delete') return removeSelected();
    if (['front', 'back', 'forward', 'backward'].includes(action)) return reorder(action);
    if (action === 'replace-media') return dom.replaceInput.click();

    const l = selected();
    if (!l) return;
    const S = stageSize();
    switch (action) {
      case 'full-length': l.start = 0; l.end = doc.duration; break;
      case 'from-playhead': {
        const len = l.end - l.start;
        l.start = round(Math.min(t, doc.duration - MIN_LEN), 2);
        l.end = round(Math.min(doc.duration, l.start + len), 2);
        break;
      }
      case 'preview-layer': t = Math.max(0, l.start - 0.2); play(); return;
      case 'center-h': l.x = round((S.w - l.w) / 2); break;
      case 'center-v': l.y = round((S.h - l.h) / 2); break;
      case 'fill-stage': Object.assign(l, { x: 0, y: 0, w: S.w, h: S.h, rot: 0 }); if (l.fit) l.fit = 'cover'; break;
      case 'reset-rot': l.rot = 0; break;
      case 'reset-adjust': Object.assign(l, { brightness: 100, contrast: 100, saturate: 100, grayscale: 0 }); break;
      case 'match-video': {
        const m = media.get(l.mediaId);
        if (!m || !m.duration) return;
        const len = clamp(Math.round(m.duration - (l.trimStart || 0)), PC.duration.min, PC.duration.max);
        setDuration(len);
        l.start = 0;
        l.end = doc.duration;
        toast(`Spot length set to ${len}s.`);
        break;
      }
      default: return;
    }
    styleContent(l, els.get(l.id));
    applyLayer(l);
    measureText();
    renderOverlay();
    updateTimelineRow(l);
    buildProps();
    commit();
  }

  /* ============================================================ campaign & price */
  function addonPrice(a) {
    if (a.percent) return `+${Math.round(a.percent * 100)}%`;
    if (a.perWeek) return `${money(a.perWeek)}/wk`;
    return money(a.flat);
  }

  function buildCampaign() {
    const today = isoDate(new Date());
    dom.campaign.innerHTML = `
      ${H.section('Your booking', '<div class="tier-card booking-sum" id="bookingSummary"></div>')}
      ${H.section('Spot length', H.range('D.duration', 'Seconds each time it plays', PC.duration.min, PC.duration.max, 1, { fmt: 's' }))}
      ${H.section('Schedule', `<div class="pgrid">
          <label class="f full"><span>Start date</span><input type="date" data-bind="C.startDate" min="${today}"></label>
          <label class="f full"><span>Run length</span><input type="range" class="rng" data-bind="C.weeks" min="${PC.weeks.min}" max="${PC.weeks.max}" step="1"></label>
        </div>
        <div class="weeks-line"><span><b id="weeksOut"></b> <span id="weeksWord">weeks</span></span><span id="endDate"></span></div>
        <div class="term-chips" id="termChips">${PC.termDiscounts.slice().reverse().map((td) => `<span data-min="${td.minWeeks}">${td.minWeeks}+ wk −${Math.round(td.rate * 100)}%</span>`).join('')}</div>`)}
      ${H.section('Add-ons', `<div class="choice-grid">${Object.entries(PC.addons).map(([k, a]) =>
        H.toggle(`C.addons.${k}`, esc(a.label), { sub: esc(a.detail) + (a.formats ? ' · video only' : ''), price: addonPrice(a), id: `addon-${k}` })).join('')}</div>`)}
      <div class="quote-wrap"><div class="receipt-shadow"><div class="receipt" id="quoteReceipt"></div></div></div>`;
    syncCampaign();
  }

  function syncCampaign() {
    syncBinds(dom.campaign);
    const weeks = campaign.weeks;
    const wo = $('#weeksOut');
    if (wo) {
      wo.textContent = weeks;
      $('#weeksWord').textContent = weeks === 1 ? 'week' : 'weeks';
      if (campaign.startDate) $('#endDate').textContent = `${fmtDate(campaign.startDate)} → ${fmtDate(runEnd())}`;
      const rate = P.termDiscountRate(weeks);
      const active = PC.termDiscounts.find((td) => td.rate === rate);
      $$('#termChips span').forEach((s) => s.classList.toggle('is-on', !!active && Number(s.dataset.min) === active.minWeeks));
    }
    const audio = $('#addon-audio');
    if (audio) {
      const ok = PC.addons.audio.formats.includes(detectFormat());
      audio.classList.toggle('is-disabled', !ok);
      audio.querySelector('input').disabled = !ok;
      if (!ok && campaign.addons.audio) { campaign.addons.audio = false; save(); }
      if (!ok) audio.querySelector('input').checked = false;
    }
  }

  const currentQuote = () => P.quote({ ...campaign, format: detectFormat(), duration: doc.duration });
  const runEnd = () => isoDate(addDays(parseIso(campaign.startDate), campaign.weeks * 7 - 1));

  // What the customer is buying, in plain words, above the controls that change it.
  function bookingSummaryHtml(q) {
    const fmt = PC.formats[q.input.format].label;
    const weeks = `${q.input.weeks} week${q.input.weeks === 1 ? '' : 's'}`;
    const extras = Object.keys(PC.addons).filter((k) => q.input.addons[k]).map((k) => esc(PC.addons[k].label));
    return `
      <b>${fmt} ad on every screen</b>
      <dl>
        <dt>Your ad</dt><dd>${fmt}, ${q.input.duration} seconds each time it plays</dd>
        <dt>Where</dt><dd>Every screen in the gym</dd>
        <dt>Runs</dt><dd>${campaign.startDate ? `${fmtDate(campaign.startDate)} → ${fmtDate(runEnd())} (${weeks})` : `${weeks}, once you pick a start date`}</dd>
        <dt>Extras</dt><dd>${extras.join(', ') || 'None'}</dd>
        <dt>Review</dt><dd>We check your ad within ${q.input.addons.rush ? '24 hours (rush)' : '48 hours'} before it goes live</dd>
        <dt>Total</dt><dd class="bs-total">${money(q.total)} ${esc(q.currency)}</dd>
      </dl>`;
  }

  function receiptHtml(q, title = 'Your quote') {
    const f = q.factors;
    const fmt = PC.formats[q.input.format].label;
    const lines = q.lines.map((l) => `
      <div class="r-row${l.amount < 0 ? ' is-neg' : ''}">
        <span class="r-label">${esc(l.label)}<span class="r-detail">${esc(l.detail)}</span></span>
        <span class="r-amt">${money(l.amount)}</span>
      </div>`).join('');
    const tax = PC.taxRate > 0
      ?`<div class="r-row"><span class="r-label">Subtotal</span><span class="r-amt">${money(q.subtotal)}</span></div>
         <div class="r-row"><span class="r-label">${esc(PC.taxLabel)} (${round(PC.taxRate * 100, 2)}%)</span><span class="r-amt">${money(q.tax)}</span></div><hr>`
      : '';
    return `
      <p class="receipt-title">${esc(title)}</p>
      <p class="receipt-sub">${fmt} · ${q.input.duration}s · every screen</p>
      <hr>
      <ul class="factor-list">
        <li><span>${fmt} base, 10s</span><span>${money(f.base)}</span></li>
        <li><span>× length ${q.input.duration}s</span><span>${f.durationMult.toFixed(3)}</span></li>
      </ul>
      <div class="r-row" style="margin-top:6px"><span class="r-label">Weekly rate</span><span class="r-amt">${money(q.weekly)}</span></div>
      <hr>
      ${lines}
      <hr>
      ${tax}
      <div class="r-row r-total"><span>Total</span><span class="r-amt">${money(q.total)}</span></div>
      <p class="r-meta" style="text-align:center;margin:12px 0 0">All prices in ${esc(q.currency)}</p>`;
  }

  let shownTotal = 0;
  let tweenRaf = 0;
  function tweenTotal(to) {
    const from = shownTotal;
    const t0 = performance.now();
    cancelAnimationFrame(tweenRaf);
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 380);
      shownTotal = p < 1 ? from + (to - from) * ease(p) : to;
      dom.pcAmt.textContent = money(shownTotal);
      dom.rfTotal.textContent = money(shownTotal);
      if (p < 1) tweenRaf = requestAnimationFrame(step);
    };
    tweenRaf = requestAnimationFrame(step);
  }

  function updatePrice() {
    const q = currentQuote();
    tweenTotal(q.total);
    const fmt = PC.formats[q.input.format].label;
    dom.pcRate.textContent = `${fmt.toUpperCase()} RATE`;
    dom.rfSummary.textContent = `${fmt} · ${q.input.duration}s · every screen · ${q.input.weeks} wk`;
    const receipt = $('#quoteReceipt');
    if (receipt) receipt.innerHTML = receiptHtml(q);
    const summary = $('#bookingSummary');
    if (summary) summary.innerHTML = bookingSummaryHtml(q);
    const tier = $('.tier-card', dom.props);
    if (tier) {
      tier.querySelector('b').textContent = `${fmt} rate`;
      tier.querySelector('p').textContent = tierExplain(q.input.format);
    }
    syncCampaign();
  }

  /* ============================================================ checkout */
  let order = null;

  function showStep(name) {
    $$('.co-step', dom.modal).forEach((s) => { s.hidden = s.dataset.step !== name; });
    dom.modal.dataset.step = name;
  }

  function openCheckout() {
    pause();
    if (editingId) stopTextEdit();
    const visible = doc.layers.filter((l) => !l.hidden);
    if (!visible.length) { toast('Your ad is empty. Add a video, image or some text first.', 'error'); return; }
    const missing = visible.find((l) => isMedia(l) && !media.has(l.mediaId));
    if (missing) { select(missing.id); toast('One of your media files is missing. Replace or delete that layer first.', 'error'); return; }
    const q = currentQuote();
    if (!campaign.startDate || campaign.startDate < isoDate(new Date())) {
      switchRightTab('campaign');
      toast('Pick a start date from today onward.', 'error');
      return;
    }
    $('#coReceipt').innerHTML = receiptHtml(q, 'Order summary');
    $('#coPay').textContent = serverConfig.demo ? `Continue with ${money(q.total)} (demo)` : `Pay ${money(q.total)} securely`;
    $('#coError').textContent = '';
    const form = $('#contactForm');
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(CONTACT_KEY) || '{}'); } catch { /* ignore */ }
    for (const k of ['business', 'name', 'email', 'phone', 'website']) if (saved[k] && !form.elements[k].value) form.elements[k].value = saved[k];
    showStep('details');
    if (!dom.modal.open) dom.modal.showModal();
  }

  function readContact() {
    const form = $('#contactForm');
    const f = form.elements;
    const data = {
      business: f.business.value.trim(), name: f.name.value.trim(), email: f.email.value.trim(),
      phone: f.phone.value.trim(), website: f.website.value.trim(), notes: f.notes.value.trim(),
    };
    const problems = [];
    const mark = (el, bad) => el.closest('.fld, .chk').classList.toggle('is-invalid', bad);
    mark(f.business, !data.business); if (!data.business) problems.push('business name');
    mark(f.name, !data.name); if (!data.name) problems.push('your name');
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email);
    mark(f.email, !emailOk); if (!emailOk) problems.push('a valid email');
    mark(f.guidelines, !f.guidelines.checked);
    mark(f.approval, !f.approval.checked);
    if (problems.length) return { error: `Please add ${problems.join(', ')}.` };
    if (!f.guidelines.checked || !f.approval.checked) return { error: 'Please tick both boxes to continue.' };
    try { localStorage.setItem(CONTACT_KEY, JSON.stringify({ ...data, notes: undefined })); } catch { /* ignore */ }
    return { data };
  }

  const OFFLINE_MSG = location.protocol === 'file:'
    ? 'Checkout only works when the site is opened from your web host, not from a file on this computer.'
    : 'Network error. Check your connection and try again.';

  async function api(route, body) {
    let r;
    try {
      r = await fetch(API + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    } catch {
      throw new Error(OFFLINE_MSG);
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Request failed (${r.status}).`);
    return data;
  }

  // Files go up in small pieces so they fit under shared-hosting size limits, and a
  // dropped connection only costs one piece: the server says where to carry on from.
  async function uploadFile(m, onProgress) {
    const start = await api('uploads', { name: m.name, type: m.type, size: m.size });
    const pieceSize = start.chunkBytes || 2 * 1024 * 1024;
    let offset = 0;
    let failures = 0;
    while (offset < m.size) {
      const end = Math.min(m.size, offset + pieceSize);
      try {
        const res = await sendPiece(start.id, offset, m.blob.slice(offset, end), (sent) => onProgress((offset + sent) / m.size));
        offset = res.received;
        failures = 0;
      } catch (err) {
        if (err.received != null && err.received !== offset) { offset = err.received; continue; }
        if (err.fatal || ++failures > 4) throw err;
        await new Promise((r) => setTimeout(r, 800 * failures));
      }
    }
    onProgress(1);
    return start.id;
  }

  function sendPiece(id, offset, blob, onProgress) {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('chunk', blob, 'chunk');
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API}upload-chunk&id=${id}&offset=${offset}`);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.min(blob.size, e.loaded)); };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
        if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
        const err = new Error(data.error || `Upload failed (${xhr.status}).`);
        if (xhr.status === 409) err.received = data.received;
        else if (xhr.status < 500 && xhr.status !== 408 && xhr.status !== 429) err.fatal = true;
        reject(err);
      };
      xhr.onerror = () => reject(new Error(location.protocol === 'file:' ? OFFLINE_MSG : 'Upload failed. Check your connection and try again.'));
      xhr.send(form);
    });
  }

  async function runCheckout(contact) {
    showStep('working');
    $('#workTitle').textContent = 'Uploading your media…';
    const status = $('#workStatus');
    const list = $('#uploadList');
    const visible = doc.layers.filter((l) => !l.hidden);
    const needed = [...new Set(visible.filter(isMedia).map((l) => l.mediaId))].map((id) => media.get(id));
    list.innerHTML = needed.map((m) => `
      <div class="up-item" data-up="${m.id}">
        <span>${esc(m.name)}</span><span>${m.uploadId ? 'Uploaded' : fmtBytes(m.size)}</span>
        <div class="up-bar"><i style="width:${m.uploadId ? 100 : 0}%"></i></div>
      </div>`).join('');
    status.textContent = needed.length ? '' : 'No files to upload.';
    try {
      for (const m of needed) {
        if (m.uploadId) continue;
        const row = list.querySelector(`[data-up="${m.id}"]`);
        m.uploadId = await uploadFile(m, (p) => {
          row.querySelector('i').style.width = Math.round(p * 100) + '%';
          row.children[1].textContent = p >= 1 ? 'Uploaded' : Math.round(p * 100) + '%';
        });
      }
      $('#workTitle').textContent = 'Booking your spot…';
      status.textContent = 'Confirming your price with our server…';
      const composition = {
        orientation: doc.orientation,
        duration: doc.duration,
        background: doc.background,
        layers: visible.map((l) => {
          const c = { ...l };
          if (isMedia(l)) { const m = media.get(l.mediaId); c.uploadId = m.uploadId; c.mediaName = m.name; }
          return c;
        }),
      };
      const res = await api('checkout', { contact, campaign, composition });
      order = { ...res, contact, paid: false, confirming: false };
      if (Math.abs(res.amount - currentQuote().total) > 0.005) toast(`Your final total is ${money(res.amount)}.`);
      if (res.demo) {
        $('#demoOrder').textContent = res.orderId;
        $('#demoAmt').textContent = `${money(res.amount)} ${res.currency}`;
        showStep('demo');
      } else {
        status.textContent = 'Opening Helcim secure checkout…';
        await openHelcim(res.checkoutToken);
      }
    } catch (err) {
      showStep('details');
      $('#coError').textContent = err.message || 'Something went wrong. Please try again.';
    }
  }

  function loadHelcim() {
    if (typeof window.appendHelcimPayIframe === 'function') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://secure.helcim.app/helcim-pay/services/start.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('The secure payment window could not load. Check your connection and try again.'));
      document.head.appendChild(s);
    });
  }

  async function openHelcim(token) {
    await loadHelcim();
    if (typeof window.appendHelcimPayIframe !== 'function') throw new Error('The secure payment window could not load.');
    dom.modal.close(); // our dialog sits in the top layer and would cover Helcim's window
    document.body.classList.add('helcim-open');
    // start.js puts phone/email into the URL as-is, so encode them here
    window.appendHelcimPayIframe(token, true, encodeURIComponent(order.contact.phone || ''), encodeURIComponent(order.contact.email || ''));
  }

  function removeHelcim() {
    document.body.classList.remove('helcim-open');
    try { if (typeof window.removeHelcimPayIframe === 'function') window.removeHelcimPayIframe(); } catch { /* already gone */ }
  }

  window.addEventListener('message', async (event) => {
    if (!order || !order.checkoutToken) return;
    const data = event.data;
    if (!data || data.eventName !== `helcim-pay-js-${order.checkoutToken}`) return;

    if (data.eventStatus === 'ABORTED') {
      toast('The payment didn\'t go through. Please check your card details or try another card.', 'error');
      return;
    }
    if (data.eventStatus === 'HIDE') {
      if (order.paid || order.confirming) return;
      removeHelcim();
      dom.modal.showModal();
      showStep('details');
      $('#coError').textContent = 'Payment window closed. You have not been charged.';
      return;
    }
    if (data.eventStatus === 'SUCCESS') {
      order.confirming = true;
      try {
        await api('confirm', { orderId: order.orderId, eventMessage: data.eventMessage });
        order.paid = true;
        removeHelcim();
        showDone();
      } catch (err) {
        removeHelcim();
        if (!dom.modal.open) dom.modal.showModal();
        showStep('details');
        $('#coError').textContent = `${err.message} (Order ${order.orderId})`;
      } finally {
        order.confirming = false;
      }
    }
  });

  function showDone() {
    $('#doneOrder').textContent = order.orderId;
    $('#doneAmt').textContent = `${money(order.amount)} ${order.currency}`;
    $('#doneEmail').textContent = order.contact.email;
    $('#doneStart').textContent = fmtDate(campaign.startDate);
    $('#doneReview').textContent = campaign.addons.rush ? 'We check your ad within 24 hours (rush).' : 'We check your ad within 48 hours.';
    $('#doneKicker').textContent = order.demo ? 'Demo order saved · no charge' : 'Payment received';
    if (!dom.modal.open) dom.modal.showModal();
    showStep('done');
  }

  /* ============================================================ UI: tabs, toasts, sync */
  function switchLeftTab(name) {
    $$('[data-ltab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.ltab === name)));
    $$('[data-lpane]').forEach((p) => { p.hidden = p.dataset.lpane !== name; });
    if (name === 'templates' && !templatesRendered) renderTemplates();
  }
  function switchRightTab(name) {
    $$('[data-rtab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.rtab === name)));
    $$('[data-rpane]').forEach((p) => { p.hidden = p.dataset.rpane !== name; });
  }

  function toast(msg, type = '', action) {
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' is-error' : '');
    const span = document.createElement('span');
    span.textContent = msg;
    el.appendChild(span);
    const dismiss = () => { el.classList.add('is-out'); setTimeout(() => el.remove(), 300); };
    if (action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'toast-btn';
      b.textContent = action.label;
      b.addEventListener('click', () => { action.fn(); dismiss(); });
      el.appendChild(b);
    }
    $('#toasts').appendChild(el);
    setTimeout(dismiss, action ? 8000 : 4200);
  }

  function syncDurationUI() {
    dom.durRange.value = doc.duration;
    setRangeFill(dom.durRange);
    dom.durOut.textContent = doc.duration + 's';
  }
  function syncOrientationUI() {
    $$('#orientSeg button').forEach((b) => b.classList.toggle('is-on', b.dataset.orient === doc.orientation));
  }

  function refreshAll() {
    buildStage();
    buildTimeline();
    buildProps();
    updatePrice();
    syncDurationUI();
    syncOrientationUI();
    renderOverlay();
  }

  /* ============================================================ events */
  // stage: select + drag
  dom.stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const el = e.target.closest('.layer');
    if (editingId) {
      if (el && el.dataset.id === editingId) return; // clicking inside the text being edited
      stopTextEdit();
    }
    if (!el) { select(null); return; }
    const layer = getLayer(el.dataset.id);
    if (!layer) return;
    pause();
    select(layer.id);
    if (!layer.locked) { e.preventDefault(); startDrag(e, 'move', layer); }
  });
  dom.stage.addEventListener('dblclick', (e) => {
    const el = e.target.closest('.layer-text');
    if (el) startTextEdit(getLayer(el.dataset.id));
  });
  dom.stage.addEventListener('input', (e) => {
    if (!editingId) return;
    const l = getLayer(editingId);
    if (!l) return;
    l.text = e.target.innerText.replace(/\n$/, '');
    measureText();
    renderOverlay();
    updateTimelineRow(l);
    syncBinds(dom.props);
  });
  dom.stage.addEventListener('focusout', (e) => { if (editingId && e.target.closest('.is-editing')) stopTextEdit(); });
  dom.stage.addEventListener('keydown', (e) => {
    if (!editingId) return;
    if (e.key === 'Escape') { e.preventDefault(); e.target.blur(); }
    e.stopPropagation();
  });

  dom.overlay.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const layer = selected();
    if (!layer || layer.locked) return;
    const h = e.target.closest('[data-h]');
    if (h) {
      e.preventDefault();
      e.stopPropagation();
      startDrag(e, h.dataset.h === 'rot' ? 'rotate' : 'resize', layer, h.dataset.h);
    } else if (e.target.closest('.sel')) {
      e.preventDefault();
      startDrag(e, 'move', layer);
    }
  });
  dom.overlay.addEventListener('dblclick', (e) => {
    const l = selected();
    if (l && l.type === 'text' && e.target.closest('.sel')) startTextEdit(l);
  });
  dom.wrap.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.stage-holder, .stage-empty-inner')) return;
    if (editingId) stopTextEdit();
    select(null);
  });
  new ResizeObserver(() => { fitStage(); updatePlayhead(); }).observe(dom.wrap);
  new ResizeObserver(() => updatePlayhead()).observe(dom.tlBody);

  // timeline
  dom.ruler.addEventListener('pointerdown', (e) => { e.preventDefault(); startScrub(e, dom.ruler); });
  dom.tracks.addEventListener('pointerdown', (e) => {
    const row = e.target.closest('.tl-row');
    if (!row || e.button !== 0) return;
    const layer = getLayer(row.dataset.id);
    if (!layer) return;
    const bar = e.target.closest('.tl-bar');
    if (bar) {
      e.preventDefault();
      select(layer.id);
      const grip = e.target.closest('[data-grip]');
      startBarDrag(e, layer, grip ? grip.dataset.grip : 'move', row);
    } else if (e.target.closest('.tl-track')) {
      e.preventDefault();
      startScrub(e, row.querySelector('.tl-track'));
    }
  });
  dom.tracks.addEventListener('click', (e) => {
    const row = e.target.closest('.tl-row');
    const act = e.target.closest('[data-act]');
    if (!row || !act) return;
    const layer = getLayer(row.dataset.id);
    if (!layer) return;
    if (act.dataset.act === 'hide') {
      layer.hidden = !layer.hidden;
      applyLayer(layer);
      if (!layer.hidden) { styleContent(layer, els.get(layer.id)); measureText(); }
      buildTimeline();
      renderOverlay();
      updatePrice();
      if (!selectedId) buildProps();
      commit();
    } else if (act.dataset.act === 'lock') {
      layer.locked = !layer.locked;
      styleContent(layer, els.get(layer.id));
      buildTimeline();
      renderOverlay();
      if (selectedId === layer.id) buildProps();
      commit();
    } else if (act.dataset.act === 'select') {
      select(layer.id);
    }
  });

  dom.playBtn.addEventListener('click', togglePlay);
  dom.durRange.addEventListener('input', () => setDuration(Number(dom.durRange.value)));
  dom.durRange.addEventListener('change', commit);
  $('#loopBtn').addEventListener('click', (e) => {
    loopPreview = !loopPreview;
    e.currentTarget.setAttribute('aria-pressed', String(loopPreview));
  });
  $('#audioBtn').addEventListener('click', (e) => {
    previewAudio = !previewAudio;
    e.currentTarget.setAttribute('aria-pressed', String(previewAudio));
    e.currentTarget.title = previewAudio ? 'Mute preview' : 'Preview sound';
    els.forEach((el) => { const v = el.querySelector('video'); if (v) v.muted = !previewAudio; });
  });

  // top bar
  dom.undo.addEventListener('click', undo);
  dom.redo.addEventListener('click', redo);
  $$('#orientSeg button').forEach((b) => b.addEventListener('click', () => setOrientation(b.dataset.orient)));
  $('#priceChip').addEventListener('click', () => switchRightTab('campaign'));
  $('#checkoutBtn').addEventListener('click', openCheckout);
  $('#checkoutBtn2').addEventListener('click', openCheckout);

  // panels
  $$('[data-ltab]').forEach((b) => b.addEventListener('click', () => switchLeftTab(b.dataset.ltab)));
  $$('[data-rtab]').forEach((b) => b.addEventListener('click', () => switchRightTab(b.dataset.rtab)));
  $$('[data-add]').forEach((b) => b.addEventListener('click', () => addPreset(b.dataset.add)));
  $$('[data-empty]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.empty === 'upload') dom.fileInput.click();
    else switchLeftTab('templates');
  }));
  dom.templates.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tpl]');
    if (b) applyTemplate(TEMPLATES.find((x) => x.id === b.dataset.tpl));
  });
  dom.fileInput.addEventListener('change', () => { ingestFiles(dom.fileInput.files); dom.fileInput.value = ''; });
  dom.replaceInput.addEventListener('change', () => {
    if (dom.replaceInput.files.length) ingestFiles([dom.replaceInput.files[0]], { replaceLayerId: selectedId });
    dom.replaceInput.value = '';
  });
  dom.library.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) { e.stopPropagation(); removeMedia(del.dataset.del); return; }
    const item = e.target.closest('[data-media]');
    const m = item && media.get(item.dataset.media);
    if (m) { const { layer, first } = makeMediaLayer(m); addLayer(layer, { atBottom: first }); }
  });
  dom.library.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-media]')) { e.preventDefault(); e.target.click(); }
  });

  for (const pane of [dom.props, dom.campaign]) {
    const onInput = (e) => { if (e.target.dataset.bind) onBindInput(e); };
    pane.addEventListener('input', onInput);
    pane.addEventListener('change', onInput);
    pane.addEventListener('click', (e) => {
      const segBtn = e.target.closest('[data-seg] button');
      if (segBtn) {
        const seg = segBtn.parentElement;
        const v = seg.dataset.kind === 'num' ? parseFloat(segBtn.dataset.value) : segBtn.dataset.value;
        applyBind(seg.dataset.seg, v, true);
        return;
      }
      const sw = e.target.closest('[data-swatch]');
      if (sw) { applyBind(sw.dataset.swatch, sw.dataset.value, true); return; }
      const act = e.target.closest('[data-action]');
      if (act) runAction(act.dataset.action);
    });
  }

  // files: drag & drop anywhere, paste
  let dragDepth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { dragDepth++; dom.wrap.classList.add('is-dragover'); dom.dropzone.classList.add('is-over'); } });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) { dom.wrap.classList.remove('is-dragover'); dom.dropzone.classList.remove('is-over'); }
  });
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    dom.wrap.classList.remove('is-dragover');
    dom.dropzone.classList.remove('is-over');
    ingestFiles(e.dataTransfer.files);
  });
  document.addEventListener('paste', (e) => {
    if (isTyping(e.target) || dom.modal.open) return;
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); ingestFiles(files); }
  });

  // keyboard
  document.addEventListener('keydown', (e) => {
    if (dom.modal.open) return;
    const mod = e.ctrlKey || e.metaKey;
    const typing = isTyping(e.target);
    const k = e.key.toLowerCase();
    if (mod && k === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && k === 'y' && !typing) { e.preventDefault(); redo(); return; }
    if (typing) return;
    if (e.key === ' ' && !e.target.closest('button, a, [role="button"]')) { e.preventDefault(); togglePlay(); return; }
    const l = selected();
    if (!l) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); return; }
    if (mod && k === 'd') { e.preventDefault(); duplicateSelected(); return; }
    if (e.key === 'Escape') { select(null); return; }
    if (e.key === '[' || e.key === ']') { reorder(e.key === ']' ? 'forward' : 'backward'); return; }
    const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (nudge && !l.locked) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      l.x = round(l.x + nudge[0] * step, 1);
      l.y = round(l.y + nudge[1] * step, 1);
      applyLayer(l);
      renderOverlay();
      syncBinds(dom.props);
      commitSoon();
    }
  });

  // checkout dialog
  $('#modalClose').addEventListener('click', () => { if (dom.modal.dataset.step !== 'working') dom.modal.close(); });
  dom.modal.addEventListener('cancel', (e) => { if (dom.modal.dataset.step === 'working') e.preventDefault(); });
  $('#contactForm').addEventListener('input', (e) => {
    const field = e.target.closest('.fld, .chk');
    if (field) field.classList.remove('is-invalid');
    $('#coError').textContent = '';
  });
  $('#contactForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const { data, error } = readContact();
    $('#coError').textContent = error || '';
    if (data) runCheckout(data);
  });
  $('#demoPay').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await api('demo-confirm', { orderId: order.orderId });
      order.paid = true;
      showDone();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  });
  $('#newAdBtn').addEventListener('click', () => {
    doc = defaultDoc();
    campaign = defaultCampaign();
    selectedId = null;
    t = 0;
    order = null;
    $('#contactForm').elements.notes.value = '';
    hist.stack = [snapshot()];
    hist.index = 0;
    buildCampaign();
    refreshAll();
    updateUndoButtons();
    save();
    dom.modal.close();
  });

  /* ============================================================ init */
  async function init() {
    restoreState();
    await restoreMedia();
    hist.stack = [snapshot()];
    hist.index = 0;
    t = settleTime();
    buildCampaign();
    refreshAll();
    renderLibrary();
    updateUndoButtons();

    const start = new URLSearchParams(location.search).get('start');
    if (start) {
      window.history.replaceState(null, '', location.pathname);
      if (start === 'text' && !doc.layers.length) applyTemplate(TEMPLATES[0], true);
      if (start === 'video' || start === 'image') {
        switchLeftTab('add');
        dom.dropzone.classList.add('is-flash');
        setTimeout(() => dom.dropzone.classList.remove('is-flash'), 2800);
        toast(start === 'video' ? 'Drop in your video to get started. MP4 works best.' : 'Drop in your image to get started.');
      }
    }

    fetch(API + 'config').then((r) => (r.ok ? r.json() : null)).then((c) => { if (c) serverConfig = c; }).catch(() => {});
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measureText(); renderOverlay(); });
  }

  init();
})();
