// Scene drawing on a 2D canvas (@napi-rs/canvas, Skia, no browser needed).
// Every drawer is a pure function of (ctx, scene, t, L): same inputs, same pixels.
import { GlobalFonts, createCanvas } from '@napi-rs/canvas';
import './fonts.js';
import path from 'node:path';
import { THEMES } from './themes.js';

export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
/** 0→1 progress of an entrance animation that starts at `start` and lasts `d` seconds. */
export const enter = (t, start, d = 0.55) => easeOut((t - start) / d);
export const easeInOut = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

export function setFont(ctx, L, size, weight = 600, mono = false) {
  ctx.font = `${weight} ${Math.round(size)}px ${mono === 'display' ? L.theme.display || L.theme.font : mono ? L.theme.mono : L.theme.font}`;
}

/** Font face for titles: the theme's display face when it asks for serif titles. */
export const titleFace = (L) => (L.theme.titleFace === 'display' ? 'display' : false);

export function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    const words = para.split(/[^\S ]+/).filter(Boolean); // non-breaking spaces stay inside a "word"
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (line && ctx.measureText(test).width > maxW) { out.push(line); line = w; } else line = test;
    }
    out.push(line);
  }
  return out;
}

/** Shrink text until it fits in `maxLines` lines of width `maxW`. */
export function fit(ctx, L, text, { maxW, maxLines, size, min = size * 0.45, weight = 600, mono = false }) {
  let s = size;
  for (;;) {
    setFont(ctx, L, s, weight, mono);
    const lines = wrap(ctx, text, maxW);
    if (lines.length <= maxLines || s <= min) return { size: s, lines: lines.slice(0, Math.max(maxLines, 1)), lh: s * 1.18 };
    s = Math.max(min, s * 0.92);
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function lines(ctx, ls, x, y, lh, align = 'left') {
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ls.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
}

// ---------------------------------------------------------------- background

export function drawBackground(ctx, L) {
  paintBackground(ctx, L);
}

function paintBackground(ctx, L) {
  const { W, H, theme } = L;
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, theme.bg[0]);
  g.addColorStop(1, theme.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // One radial pass does both the key light (glow) and the vignette: each full-frame
  // gradient costs ~5 ms, so they share one. Static, so frame holding still works.
  const gx = W * (0.72 + 0.06 * ((L.index * 37) % 5) / 4), gy = H * (0.22 + 0.1 * ((L.index * 53) % 3) / 2);
  const r = Math.hypot(W, H) * 0.95;
  const light = /^#f/i.test(theme.bg[0]);
  const rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, r);
  rg.addColorStop(0, theme.glow);
  rg.addColorStop(0.45, 'rgba(0,0,0,0)');
  rg.addColorStop(1, light ? 'rgba(60,40,10,0.12)' : 'rgba(0,0,0,0.5)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);
}

const PANS = ['in', 'right', 'out', 'left', 'up', 'in', 'down'];
/**
 * Slow, eased Ken Burns move across the whole scene: in / out / left / right / up / down.
 * Defaults vary by scene index so consecutive stills never move the same way.
 */
export function drawKenBurns(ctx, img, s, t, L) {
  const p = s.zoom === false ? 0 : easeInOut(t / L.dur) * 0.75 + (t / L.dur) * 0.25;
  const pan = s.pan || PANS[L.index % PANS.length];
  const amt = s.zoom === false ? 0 : 0.09;
  let z = 1.06, ox = 0, oy = 0;
  if (pan === 'in') z = 1.02 + amt * p;
  else if (pan === 'out') z = 1.02 + amt * (1 - p);
  else if (pan === 'left' || pan === 'right') { z = 1.1; ox = (pan === 'left' ? 1 : -1) * (p - 0.5) * 0.07; }
  else if (pan === 'up' || pan === 'down') { z = 1.1; oy = (pan === 'up' ? 1 : -1) * (p - 0.5) * 0.06; }
  if (s.fit === 'contain') {
    ctx.save(); ctx.filter = 'blur(40px)'; drawImageCover(ctx, img, 0, 0, L.W, L.H, 1.2); ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, L.W, L.H);
  }
  drawImageCover(ctx, img, 0, 0, L.W, L.H, z, s.fit, ox, oy, s.focus);
  // readability: darken top (lower thirds) and bottom (captions) a little
  const g = ctx.createLinearGradient(0, 0, 0, L.H);
  g.addColorStop(0, 'rgba(0,0,0,0.38)'); g.addColorStop(0.28, 'rgba(0,0,0,0)');
  g.addColorStop(0.62, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, L.W, L.H);
}

/** Attribution line for stock images (required by CC BY / BY-SA). */
function drawCredit(ctx, s, L) {
  if (!s.credit) return;
  setFont(ctx, L, 17 * L.u, 500);
  ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  ctx.fillText(fitText(ctx, s.credit, L.W * 0.45), L.W - 28 * L.u, L.H - 18 * L.u);
}

function drawImageCover(ctx, img, x, y, w, h, zoom = 1, fit = 'cover', ox = 0, oy = 0, focus = null) {
  const s = (fit === 'contain' ? Math.min : Math.max)(w / img.width, h / img.height) * zoom;
  const iw = img.width * s, ih = img.height * s;
  const fx = focus ? focus[0] : 0.5, fy = focus ? focus[1] : 0.5; // which part of the image stays centred
  const dx = Math.min(0, Math.max(w - iw, w / 2 - iw * fx)) + ox * w, dy = Math.min(0, Math.max(h - ih, h / 2 - ih * fy)) + oy * h;
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.drawImage(img, x + (iw <= w ? (w - iw) / 2 : dx), y + (ih <= h ? (h - ih) / 2 : dy), iw, ih);
  ctx.restore();
}

// ---------------------------------------------------------------- pieces

function kicker(ctx, L, text, x, y, a) {
  if (!text) return 0;
  ctx.globalAlpha = a;
  setFont(ctx, L, 30 * L.u, 700);
  ctx.fillStyle = L.theme.accent;
  ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  ctx.fillText(String(text).toUpperCase().split('').join(' '), x, y);
  ctx.globalAlpha = 1;
  return 56 * L.u;
}

function heading(ctx, L, text, t, y = L.m, maxLines = 2, x = L.m, maxW = L.W - 2 * L.m) {
  if (!text) return y;
  const a = enter(t, 0.05);
  const f = fit(ctx, L, text, { maxW, maxLines, size: 84 * L.u, weight: 800, mono: titleFace(L) });
  ctx.globalAlpha = a;
  ctx.fillStyle = L.theme.text;
  lines(ctx, f.lines, x, y + (1 - a) * 24 * L.u, f.lh);
  const by = y + f.lines.length * f.lh + 18 * L.u;
  ctx.fillStyle = L.theme.accent;
  ctx.fillRect(x, by, 120 * L.u * a, 8 * L.u);
  ctx.globalAlpha = 1;
  return by + 50 * L.u;
}

function lowerThird(ctx, L, title, subtitle, t) {
  if (!title && !subtitle) return;
  const a = enter(t, 0.25);
  const x = L.m, maxW = Math.min(L.W - 2 * L.m, 1200 * L.u);
  const tf = title ? fit(ctx, L, title, { maxW: maxW - 60 * L.u, maxLines: 2, size: 54 * L.u, weight: 800, mono: titleFace(L) }) : null;
  setFont(ctx, L, 32 * L.u, 500);
  const sl = subtitle ? wrap(ctx, subtitle, maxW - 60 * L.u).slice(0, 2) : [];
  const h = 50 * L.u + (tf ? tf.lines.length * tf.lh : 0) + sl.length * 40 * L.u;
  const y = L.m * 0.6;
  ctx.globalAlpha = a;
  ctx.fillStyle = L.theme.panelStrong;
  shadow(ctx, L, () => { roundRect(ctx, x - 30 * L.u * (1 - a), y, maxW, h, 18 * L.u); ctx.fill(); });
  ctx.fillStyle = L.theme.accent;
  ctx.fillRect(x - 30 * L.u * (1 - a), y, 10 * L.u, h);
  let yy = y + 25 * L.u;
  if (tf) { setFont(ctx, L, tf.size, 800, titleFace(L)); ctx.fillStyle = L.theme.text; lines(ctx, tf.lines, x + 36 * L.u, yy, tf.lh); yy += tf.lines.length * tf.lh; }
  if (sl.length) { setFont(ctx, L, 32 * L.u, 500); ctx.fillStyle = L.theme.muted; lines(ctx, sl, x + 36 * L.u, yy, 40 * L.u); }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- scene drawers

const drawers = {
  title(ctx, s, t, L) {
    const a = enter(t, 0.1, 0.8);
    const maxW = L.W - 2 * L.m;
    const f = fit(ctx, L, s.title, { maxW, maxLines: 3, size: (L.portrait ? 110 : 128) * L.u, weight: 800, mono: titleFace(L) });
    setFont(ctx, L, 46 * L.u, 500);
    const sub = s.subtitle ? wrap(ctx, s.subtitle, maxW).slice(0, 3) : [];
    const total = (s.kicker ? 56 * L.u : 0) + f.lines.length * f.lh + 50 * L.u + sub.length * 60 * L.u;
    let y = (L.H - L.captionH - total) / 2;
    y += kicker(ctx, L, s.kicker, L.m, y, enter(t, 0));
    ctx.globalAlpha = a; ctx.fillStyle = L.theme.text; setFont(ctx, L, f.size, 800, titleFace(L));
    lines(ctx, f.lines, L.m, y + (1 - a) * 40 * L.u, f.lh);
    y += f.lines.length * f.lh + 14 * L.u;
    ctx.fillStyle = L.theme.accent; ctx.fillRect(L.m, y, 160 * L.u * enter(t, 0.35, 0.9), 10 * L.u);
    y += 36 * L.u;
    const b = enter(t, 0.45, 0.8);
    ctx.globalAlpha = b; ctx.fillStyle = L.theme.muted; setFont(ctx, L, 46 * L.u, 500);
    lines(ctx, sub, L.m, y + (1 - b) * 20 * L.u, 60 * L.u);
    ctx.globalAlpha = 1;
  },

  bullets(ctx, s, t, L, numbered = false) {
    let y = heading(ctx, L, s.title, t);
    const items = s.items;
    const maxW = L.W - 2 * L.m - 90 * L.u;
    let size = (items.length > 6 ? 46 : items.length > 4 ? 54 : 62) * L.u;
    let blocks;
    for (;;) { // shrink until all items fit above the captions
      setFont(ctx, L, size, 600);
      blocks = items.map((it) => wrap(ctx, it, maxW));
      const h = blocks.reduce((n, b) => n + b.length * size * 1.22 + size * 0.75, 0);
      if (y + h < L.H - L.captionH - 20 * L.u || size < 26 * L.u) break;
      size *= 0.92;
    }
    const current = L.reveals.reduce((c, r, i) => (t >= r ? i : c), -1);
    blocks.forEach((b, i) => {
      const a = enter(t, L.reveals[i]);
      if (a <= 0) { y += b.length * size * 1.22 + size * 0.75; return; }
      const dim = s.highlight === false || i === current ? 1 : 0.62;
      ctx.globalAlpha = a * dim;
      const dx = (1 - a) * 40 * L.u;
      if (numbered) {
        const bx = L.m + dx, bs = size * 1.25;
        ctx.fillStyle = L.theme.accent; roundRect(ctx, bx, y - size * 0.08, bs, bs, 12 * L.u); ctx.fill();
        setFont(ctx, L, size * 0.72, 800); ctx.fillStyle = L.theme.onAccent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), bx + bs / 2, y - size * 0.08 + bs / 2);
      } else {
        ctx.fillStyle = L.theme.accent;
        ctx.beginPath(); ctx.arc(L.m + 16 * L.u + dx, y + size * 0.6, 10 * L.u, 0, Math.PI * 2); ctx.fill();
      }
      setFont(ctx, L, size, 600); ctx.fillStyle = L.theme.text;
      lines(ctx, b, L.m + 90 * L.u + dx, y, size * 1.22);
      y += b.length * size * 1.22 + size * 0.75;
    });
    ctx.globalAlpha = 1;
  },

  decisions(ctx, s, t, L) { drawers.bullets(ctx, s, t, L, true); },
  steps(ctx, s, t, L) { drawers.bullets(ctx, s, t, L, true); },

  image(ctx, s, t, L) {
    drawKenBurns(ctx, L.assets.image, s, t, L);
    drawers.clip(ctx, s, t, L);
    drawCredit(ctx, s, L);
  },

  clip(ctx, s, t, L) {
    // the video itself is composited underneath by ffmpeg; we only draw the overlay
    if (s.title || s.subtitle) lowerThird(ctx, L, s.title, s.subtitle, t);
  },

  code(ctx, s, t, L) {
    let y = heading(ctx, L, s.title, t);
    const src = String(s.code).replace(/\t/g, '  ').replace(/\s+$/, '').split('\n');
    const avail = L.H - L.captionH - y - 40 * L.u;
    const longest = Math.max(...src.map((l) => l.length), 20);
    const size = Math.min(44 * L.u, avail / (src.length * 1.45 + 1.2), (L.W - 2 * L.m - 160 * L.u) / (longest * 0.61));
    const lh = size * 1.45, h = src.length * lh + size * 1.4;
    const a = enter(t, 0.15);
    ctx.globalAlpha = a;
    ctx.fillStyle = L.theme.codeBg; shadow(ctx, L, () => { roundRect(ctx, L.m, y, L.W - 2 * L.m, h, 16 * L.u); ctx.fill(); });
    const hl = new Set((s.highlight || []).flatMap((r) => (Array.isArray(r) ? range(r[0], r[1]) : [r])));
    src.forEach((line, i) => {
      const ly = y + size * 0.7 + i * lh;
      if (hl.has(i + 1)) { ctx.fillStyle = L.theme.codeHl; ctx.fillRect(L.m, ly - size * 0.2, L.W - 2 * L.m, lh); }
      setFont(ctx, L, size, 400, true);
      ctx.fillStyle = L.theme.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
      ctx.fillText(String(i + 1), L.m + 80 * L.u, ly);
      let x = L.m + 110 * L.u;
      ctx.textAlign = 'left';
      for (const [kind, text] of tokenize(line)) {
        ctx.fillStyle = L.theme.syntax[kind] || L.theme.text;
        ctx.fillText(text, x, ly);
        x += ctx.measureText(text).width;
      }
    });
    ctx.globalAlpha = 1;
  },

  stat(ctx, s, t, L) {
    const a = enter(t, 0.1, 0.8);
    const m = /^([^\d-]*)(-?[\d,]*\.?\d+)(.*)$/.exec(String(s.value));
    let shown = String(s.value);
    if (m && s.countUp !== false) {
      const target = parseFloat(m[2].replace(/,/g, ''));
      const dec = (m[2].split('.')[1] || '').length;
      const v = target * easeOut(clamp((t - 0.1) / 1.4));
      shown = m[1] + v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + m[3];
    }
    const f = fit(ctx, L, String(s.value), { maxW: L.W - 2 * L.m, maxLines: 1, size: 300 * L.u, weight: 900 });
    setFont(ctx, L, 46 * L.u, 600);
    const lab = s.label ? wrap(ctx, s.label, L.W - 2 * L.m).slice(0, 3) : [];
    const total = f.size * 1.05 + lab.length * 60 * L.u + 30 * L.u;
    let y = (L.H - L.captionH - total) / 2;
    ctx.globalAlpha = a; setFont(ctx, L, f.size, 900); ctx.fillStyle = L.theme.accent;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(shown, L.W / 2, y);
    y += f.size * 1.05 + 30 * L.u;
    const b = enter(t, 0.5);
    ctx.globalAlpha = b; setFont(ctx, L, 46 * L.u, 600); ctx.fillStyle = L.theme.text;
    lines(ctx, lab, L.W / 2, y, 60 * L.u, 'center');
    ctx.globalAlpha = 1;
  },

  quote(ctx, s, t, L) {
    const a = enter(t, 0.1, 0.9);
    const f = fit(ctx, L, s.text, { maxW: L.W - 2 * L.m - 80 * L.u, maxLines: 6, size: 66 * L.u, weight: 600 });
    const total = f.lines.length * f.lh + 100 * L.u;
    let y = (L.H - L.captionH - total) / 2;
    ctx.globalAlpha = a * 0.9; ctx.fillStyle = L.theme.accent; setFont(ctx, L, 220 * L.u, 900);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('“', L.m - 20 * L.u, y - 120 * L.u);
    ctx.globalAlpha = a; ctx.fillStyle = L.theme.text; setFont(ctx, L, f.size, 600);
    lines(ctx, f.lines, L.m + 60 * L.u, y + (1 - a) * 30 * L.u, f.lh);
    y += f.lines.length * f.lh + 40 * L.u;
    if (s.by) { ctx.globalAlpha = enter(t, 0.6); ctx.fillStyle = L.theme.muted; setFont(ctx, L, 40 * L.u, 500); ctx.fillText('— ' + s.by, L.m + 60 * L.u, y); }
    ctx.globalAlpha = 1;
  },

  compare(ctx, s, t, L) {
    const y0 = heading(ctx, L, s.title, t);
    const gap = 40 * L.u;
    const cols = [s.left, s.right];
    const vertical = L.portrait;
    const cw = vertical ? L.W - 2 * L.m : (L.W - 2 * L.m - gap) / 2;
    const chAvail = L.H - L.captionH - y0 - 20 * L.u;
    const ch = vertical ? (chAvail - gap) / 2 : chAvail;
    cols.forEach((c, i) => {
      const a = enter(t, L.reveals[i] ?? 0.2 + i * 0.4);
      const x = vertical ? L.m : L.m + i * (cw + gap);
      const y = vertical ? y0 + i * (ch + gap) : y0;
      ctx.globalAlpha = a;
      ctx.fillStyle = L.theme.panel; shadow(ctx, L, () => { roundRect(ctx, x, y + (1 - a) * 30 * L.u, cw, ch, 20 * L.u); ctx.fill(); });
      ctx.fillStyle = i ? L.theme.accent2 : L.theme.accent; ctx.fillRect(x, y + (1 - a) * 30 * L.u, cw, 8 * L.u);
      let yy = y + 40 * L.u + (1 - a) * 30 * L.u;
      const hf = fit(ctx, L, c.title || (i ? 'After' : 'Before'), { maxW: cw - 60 * L.u, maxLines: 2, size: 50 * L.u, weight: 800 });
      ctx.fillStyle = L.theme.text; lines(ctx, hf.lines, x + 30 * L.u, yy, hf.lh); yy += hf.lines.length * hf.lh + 24 * L.u;
      let size = 46 * L.u, bl;
      for (;;) {
        setFont(ctx, L, size, 500);
        bl = (c.items || []).map((it) => wrap(ctx, it, cw - 100 * L.u));
        const h = bl.reduce((n, b) => n + b.length * size * 1.25 + size * 0.5, 0);
        if (yy + h < y + ch - 20 * L.u || size < 22 * L.u) break;
        size *= 0.92;
      }
      bl.forEach((b) => {
        ctx.fillStyle = i ? L.theme.accent2 : L.theme.accent;
        ctx.beginPath(); ctx.arc(x + 46 * L.u, yy + size * 0.6, 7 * L.u, 0, Math.PI * 2); ctx.fill();
        setFont(ctx, L, size, 500); ctx.fillStyle = L.theme.text;
        lines(ctx, b, x + 72 * L.u, yy, size * 1.25); yy += b.length * size * 1.25 + size * 0.5;
      });
    });
    ctx.globalAlpha = 1;
  },
};
drawers.outro = drawers.title;

function range(a, b) { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }

const KW = /^(const|let|var|function|return|if|else|for|while|import|export|from|async|await|new|class|extends|def|fn|pub|struct|impl|use|mut|match|true|false|null|undefined|None|True|False|self|this|type|interface|in|of|try|catch|throw)$/;
function tokenize(line) {
  const out = [];
  const re = /(\/\/.*$|#.*$|--\s.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|(.)/g;
  let m;
  while ((m = re.exec(line))) {
    if (m[1]) out.push(['comment', m[1]]);
    else if (m[2]) out.push(['string', m[2]]);
    else if (m[3]) out.push(['number', m[3]]);
    else if (m[4]) out.push([KW.test(m[4]) ? 'keyword' : line[re.lastIndex] === '(' ? 'fn' : 'text', m[4]]);
    else out.push(['punct', m[5] || m[6]]);
  }
  return out;
}

// ---------------------------------------------------------------- chrome (captions, progress, brand, fades)

/** Start time of each word in a cue (character-weighted). */
export function wordTimes(cue) {
  const words = cue.text.split(' ');
  const total = words.reduce((n, w) => n + w.length + 1, 0);
  let acc = 0;
  return words.map((w) => { const at = cue.start + ((cue.end - cue.start) * acc) / total; acc += w.length + 1; return at; });
}

/** TikTok/Reels style: a few huge words, heavy outline, the spoken word lit in accent, pop-in. */
function drawBoldCaption(ctx, L, t, cue) {
  const upper = cue.text.split(' ').map((w) => w.toUpperCase());
  const times = wordTimes(cue);
  const cur = times.reduce((c, at, i) => (t >= at ? i : c), 0);
  const pop = 0.85 + 0.15 * easeOut((t - cue.start) / 0.2);
  const maxW = L.W * 0.86;
  let size = (L.portrait ? 92 : 72) * L.u;
  let rows;
  for (;;) {
    setFont(ctx, L, size, 900, 'display');
    rows = [];
    let line = [];
    for (let i = 0; i < upper.length; i++) {
      const test = [...line.map((j) => upper[j]), upper[i]].join(' ');
      if (line.length && ctx.measureText(test).width > maxW) { rows.push(line); line = [i]; } else line.push(i);
    }
    rows.push(line);
    if (rows.length <= 2 || size < 40 * L.u) break;
    size *= 0.9;
  }
  const lh = size * 1.12;
  const cy = L.portrait ? L.H * 0.66 : L.H - 120 * L.u - rows.length * lh;
  const mid = cy + (rows.length * lh) / 2;
  ctx.save();
  ctx.translate(L.W / 2, mid); ctx.scale(pop, pop); ctx.translate(-L.W / 2, -mid);
  ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
  const space = ctx.measureText(' ').width;
  rows.forEach((line, li) => {
    const widths = line.map((i) => ctx.measureText(upper[i]).width);
    let x = (L.W - (widths.reduce((a, b) => a + b, 0) + space * (line.length - 1))) / 2;
    const y = cy + li * lh;
    line.forEach((i, k) => {
      ctx.lineWidth = size * 0.16; ctx.strokeStyle = 'rgba(0,0,0,0.92)';
      ctx.strokeText(upper[i], x, y);
      ctx.fillStyle = i === cur ? L.theme.accent : '#ffffff';
      ctx.fillText(upper[i], x, y);
      x += widths[k] + space;
    });
  });
  ctx.restore();
}

function drawCaption(ctx, L, t) {
  const cue = L.cues.find((c) => t >= c.start && t < c.end);
  if (!cue) return;
  if (L.captionStyle === 'bold') return drawBoldCaption(ctx, L, t, cue);
  const maxW = Math.min(L.W * 0.86, 1500 * L.u);
  const size = (L.portrait ? 50 : 42) * L.u;
  setFont(ctx, L, size, 600);
  const ls = wrap(ctx, cue.text, maxW - 60 * L.u).slice(0, 3);
  const w = Math.max(...ls.map((l) => ctx.measureText(l).width)) + 60 * L.u;
  const lh = size * 1.3, h = ls.length * lh + 30 * L.u;
  const y = L.H - (L.portrait ? L.H * 0.2 : 60 * L.u) - h;
  ctx.fillStyle = L.theme.captionBg;
  roundRect(ctx, (L.W - w) / 2, y, w, h, 14 * L.u); ctx.fill();
  ctx.fillStyle = L.theme.captionText;
  lines(ctx, ls, L.W / 2, y + 15 * L.u + lh * 0.1, lh, 'center');
}

export const TRANSITIONS = ['auto', 'push', 'slide', 'zoom', 'wipe', 'fade', 'dip', 'cut'];
export const TRANSITION_SECONDS = 0.6;

/** True when the scene's backdrop is live video composited underneath by ffmpeg. */
export const isVideoScene = (s) => s.type === 'clip' || (s.type === 'split' && /\.(mp4|webm|mov|mkv|m4v|avi|gif)$/i.test(s.src || ''));

/** Pick the transition into `scene` (from `prev`). `auto` varies it by content. */
export function chooseTransition(scene, prev, global = 'auto') {
  let t = scene.transition ?? global;
  if (!prev) return 'none';
  if (t === 'auto') {
    if (['title', 'outro', 'statement'].includes(scene.type)) t = 'zoom';
    else if (scene.type === 'image' || prev.type === 'image' || isVideoScene(prev)) t = 'fade';
    else if (scene.type === 'chart' || scene.type === 'compare') t = 'wipe';
    else t = 'push';
  }
  if (isVideoScene(scene) && !['cut', 'dip'].includes(t)) t = 'fade'; // overlay layer can only cross-fade
  return t;
}

function shadow(ctx, L, fn) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.38)';
  ctx.shadowBlur = 44 * L.u;
  ctx.shadowOffsetY = 14 * L.u;
  fn();
  ctx.restore();
}

/** Background + scene content, without captions/brand/progress ("chrome"). */
export function drawContent(ctx, scene, t, L) {
  ctx.clearRect(0, 0, L.W, L.H);
  if (scene.type !== 'clip' && scene.type !== 'image' && !(scene.type === 'chapter' && L.assets.image)) drawBackground(ctx, L);
  (drawers[scene.type] || drawers.title)(ctx, scene, t, L);
}

function drawChrome(ctx, scene, t, L) {
  const { W, H } = L;
  if (L.brand) {
    setFont(ctx, L, 26 * L.u, 700);
    ctx.fillStyle = scene.type === 'clip' || scene.type === 'image' || scene.type === 'chapter' ? 'rgba(255,255,255,0.75)' : L.theme.muted;
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(L.brand.toUpperCase(), W - 40 * L.u, 34 * L.u);
  }
  if (L.captions) drawCaption(ctx, L, t);
  if (L.progress) {
    // chapter bar: one segment per scene, filled up to the current one
    const segW = W / L.count, bh = 6 * L.u;
    for (let i = 0; i < L.count; i++) {
      ctx.fillStyle = i <= L.index ? L.theme.accent : 'rgba(127,127,127,0.28)';
      ctx.fillRect(i * segW + (i ? 2 : 0), H - bh, segW - (i ? 2 : 0), bh);
    }
  }
}

function scratch(L) {
  return (L._scratch ??= createCanvas(L.W, L.H));
}

/** Composite the previous scene's last frame (`prev`) with this scene's content (`cur`). */
function composite(ctx, cur, prev, kind, p, L) {
  const { W, H } = L;
  const draw = (img, alpha, x = 0, y = 0, s = 1) => {
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, x + (W - W * s) / 2, y + (H - H * s) / 2, W * s, H * s);
    ctx.globalAlpha = 1;
  };
  if (kind === 'fade') { draw(prev, 1 - p); return; } // `cur` is already on ctx
  ctx.clearRect(0, 0, W, H);
  if (kind === 'push') { draw(prev, 1, 0, 0, 1 + 0.05 * p); draw(cur, p, 0.07 * W * (1 - p)); }
  else if (kind === 'slide') { draw(prev, 1, -W * p); draw(cur, 1, W * (1 - p)); }
  else if (kind === 'zoom') { draw(cur, 1, 0, 0, 1.08 - 0.08 * p); draw(prev, 1 - p, 0, 0, 1 + 0.22 * p); }
  else if (kind === 'wipe') {
    draw(prev, 1);
    const skew = H * 0.35, edge = -skew + p * (W + skew * 2);
    ctx.save();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(edge + skew, 0); ctx.lineTo(edge - skew, H); ctx.lineTo(0, H); ctx.closePath(); ctx.clip();
    draw(cur, 1);
    ctx.restore();
    if (p > 0 && p < 1) {
      ctx.strokeStyle = L.theme.accent; ctx.lineWidth = 10 * L.u;
      ctx.beginPath(); ctx.moveTo(edge + skew, 0); ctx.lineTo(edge - skew, H); ctx.stroke();
    }
  } else draw(cur, 1);
}

/**
 * Draw one frame of a scene: content → transition from the previous scene → chrome → fades.
 * For video scenes the canvas is an overlay (transparent where the video shows).
 */
export function drawFrame(ctx, scene, t, L) {
  const { W, H } = L;
  const kind = L.prevFrame ? L.transition : 'none';
  const inTr = !['none', 'cut', 'dip'].includes(kind) && t < TRANSITION_SECONDS;
  const sc = inTr && kind !== 'fade' ? scratch(L) : null; // non-fade transitions compose from an offscreen copy
  drawContent(sc ? sc.getContext('2d') : ctx, scene, t, L);
  if (inTr) composite(ctx, sc, L.prevFrame, kind, easeInOut(t / TRANSITION_SECONDS), L);
  if (L.contentOnly) return;
  drawChrome(ctx, scene, t, L);
  let fade = 0;
  if (L.index === 0) fade = 1 - t / 0.45; // open from black
  if (kind === 'dip') fade = Math.max(fade, 1 - t / 0.25);
  if (L.index === L.count - 1) fade = Math.max(fade, 1 - (L.dur - t) / 0.7); // close to black
  if (L.nextDip) fade = Math.max(fade, 1 - (L.dur - t) / 0.25);
  if (fade > 0) {
    ctx.globalAlpha = Math.min(1, fade);
    ctx.fillStyle = L.index === 0 || L.index === L.count - 1 ? '#000' : L.theme.bg[0];
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

export function makeLayout(spec, scene, extra) {
  const { width: W, height: H } = spec;
  const u = Math.min(W, H) / 1080;
  const portrait = H > W;
  return {
    W, H, u, portrait,
    m: (portrait ? 80 : 120) * u,
    captionH: !spec.captions ? 80 * u : spec.captionStyle === 'bold' ? (portrait ? H * 0.42 : 330 * u) : portrait ? H * 0.2 + 200 * u : 230 * u,
    theme: withFont(typeof spec.theme === 'object' ? { ...THEMES.midnight, ...spec.theme } : THEMES[spec.theme], spec.font),
    captionStyle: spec.captionStyle,
    brand: spec.brand,
    captions: spec.captions,
    progress: spec.progressBar,
    ...extra,
  };
}

const registered = new Map();
/** `font` may be an installed family name or a .ttf/.otf/.woff2 path; it becomes the display font. */
function withFont(theme, font) {
  if (!font) return theme;
  let family = font;
  if (/\.(ttf|otf|woff2?)$/i.test(font)) {
    if (!registered.has(font)) {
      const name = 'makevideo ' + path.basename(font).replace(/\.[^.]+$/, '');
      GlobalFonts.registerFromPath(font, name);
      registered.set(font, name);
    }
    family = registered.get(font);
  }
  return { ...theme, font: `"${family}", ${theme.font}` };
}

// ---------------------------------------------------------------- premium scene types

function kickerWidth(ctx, L, text) {
  setFont(ctx, L, 30 * L.u, 700);
  return ctx.measureText(String(text).toUpperCase().split('').join(' ')).width;
}

/** Split `*accent words*` into word tokens with an accent flag. */
function accentTokens(text) {
  const out = [];
  let on = false;
  for (const raw of String(text).split(/\s+/).filter(Boolean)) {
    const starts = raw.startsWith('*'), ends = /\*[.,!?:;]*$/.test(raw);
    if (starts) on = true;
    out.push({ text: raw.replace(/\*/g, ''), accent: on });
    if (ends) on = false;
  }
  return out;
}

/** Kinetic statement: huge display type, words pop in with the voice. Use *stars* for accent words. */
drawers.statement = function statement(ctx, s, t, L) {
  const toks = accentTokens(s.text);
  const maxW = L.W - 2 * L.m;
  let size = (L.portrait ? 130 : 150) * L.u, rows, space;
  for (;;) {
    setFont(ctx, L, size, 900, 'display');
    space = ctx.measureText(' ').width;
    rows = [[]];
    let w = 0;
    toks.forEach((tk, i) => {
      const tw = ctx.measureText(tk.text).width;
      if (rows[rows.length - 1].length && w + space + tw > maxW) { rows.push([]); w = 0; }
      rows[rows.length - 1].push(i);
      w += (w ? space : 0) + tw;
    });
    if (rows.length <= (L.portrait ? 6 : 4) || size < 60 * L.u) break;
    size *= 0.92;
  }
  const lh = size * 1.08;
  const avail = L.H - L.captionH;
  let y = (avail - rows.length * lh) / 2 + (s.kicker ? 30 * L.u : 0);
  if (s.kicker) kicker(ctx, L, s.kicker, s.align === 'left' ? L.m : (L.W - kickerWidth(ctx, L, s.kicker)) / 2, y - 70 * L.u, enter(t, 0));
  setFont(ctx, L, size, 900, 'display'); // the kicker changed the font
  ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  for (const row of rows) {
    const widths = row.map((i) => ctx.measureText(toks[i].text).width);
    const total = widths.reduce((a, b) => a + b, 0) + space * (row.length - 1);
    let x = s.align === 'left' ? L.m : (L.W - total) / 2;
    row.forEach((i, k) => {
      const a = enter(t, L.reveals[i] ?? 0, 0.32);
      if (a > 0) {
        ctx.save();
        ctx.globalAlpha = a;
        const cx = x + widths[k] / 2, cy = y + lh / 2, sc = 0.82 + 0.18 * a;
        ctx.translate(cx, cy + (1 - a) * 26 * L.u); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
        ctx.fillStyle = toks[i].accent ? L.theme.accent : L.theme.text;
        ctx.fillText(toks[i].text, x, y);
        ctx.restore();
      }
      x += widths[k] + space;
    });
    y += lh;
  }
};

/** Animated horizontal bar chart. bars: [{label, value}], unit/prefix, highlight (label). */
drawers.chart = function chart(ctx, s, t, L) {
  const y0 = heading(ctx, L, s.title, t);
  const bars = s.bars;
  const max = Math.max(...bars.map((b) => Math.abs(b.value)), 1e-9);
  const hiLabel = s.highlight ?? bars.reduce((m, b) => (b.value > m.value ? b : m), bars[0]).label;
  const avail = L.H - L.captionH - y0;
  const rowH = Math.min(120 * L.u, avail / bars.length);
  const barH = rowH * 0.56;
  setFont(ctx, L, Math.min(44 * L.u, barH * 0.62), 600);
  const labelW = Math.min(Math.max(...bars.map((b) => ctx.measureText(b.label).width)) + 40 * L.u, L.W * 0.32);
  const x0 = L.m + labelW;
  const valueRoom = 220 * L.u;
  const barMaxW = L.W - L.m - x0 - valueRoom;
  bars.forEach((b, i) => {
    const y = y0 + i * rowH + (rowH - barH) / 2;
    const g = easeOut((t - (L.reveals[i] ?? 0)) / 0.9);
    // labels + empty tracks show from the start (dim), so the chart reads before bars grow
    const a = clamp(g * 3);
    ctx.globalAlpha = enter(t, 0.15) * (0.45 + 0.55 * a);
    setFont(ctx, L, Math.min(44 * L.u, barH * 0.62), 600);
    ctx.fillStyle = L.theme.text; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(fitText(ctx, b.label, labelW - 30 * L.u), x0 - 30 * L.u, y + barH / 2);
    ctx.fillStyle = L.theme.panel; roundRect(ctx, x0, y, barMaxW, barH, barH / 2); ctx.fill();
    ctx.globalAlpha = a;
    const w = Math.max(barH, (Math.abs(b.value) / max) * barMaxW * g);
    const hi = b.label === hiLabel;
    const grad = ctx.createLinearGradient(x0, 0, x0 + w, 0);
    grad.addColorStop(0, hi ? L.theme.accent : L.theme.accent2);
    grad.addColorStop(1, hi ? L.theme.accent2 : L.theme.muted);
    ctx.fillStyle = hi ? L.theme.accent : grad;
    roundRect(ctx, x0, y, w, barH, barH / 2); ctx.fill();
    const dec = (String(b.value).split('.')[1] || '').length;
    const shown = (s.prefix || '') + (b.value * g).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (s.unit || '');
    setFont(ctx, L, Math.min(46 * L.u, barH * 0.66), 800);
    ctx.fillStyle = hi ? L.theme.accent : L.theme.text; ctx.textAlign = 'left';
    ctx.fillText(shown, x0 + w + 22 * L.u, y + barH / 2);
    ctx.globalAlpha = 1;
  });
  if (s.note) {
    ctx.globalAlpha = enter(t, (L.reveals[bars.length - 1] ?? 0) + 0.6);
    setFont(ctx, L, 36 * L.u, 500); ctx.fillStyle = L.theme.muted; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(s.note, L.m, Math.min(y0 + bars.length * rowH + 10 * L.u, L.H - L.captionH));
    ctx.globalAlpha = 1;
  }
};

function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '\u2026').width > maxW) t = t.slice(0, -1);
  return t + '\u2026';
}

/** Where the media sits in a split scene (shared with ffmpeg for video placement). */
export function splitRect(s, L) {
  const media = L.portrait ? { w: L.W - 2 * L.m, h: (L.H - L.captionH) * 0.46 } : { w: L.W * 0.5, h: (L.H - L.captionH - L.m * 0.6) * 0.92 };
  if (!L.portrait && media.h > media.w * 0.75) media.h = media.w * 0.75;
  const x = L.portrait ? L.m : s.side === 'left' ? L.m : L.W - L.m - media.w;
  const y = L.portrait ? L.m * 1.4 : (L.H - L.captionH - media.h) / 2 + L.m * 0.3;
  return { x: Math.round(x / 2) * 2, y: Math.round(y / 2) * 2, w: Math.round(media.w / 2) * 2, h: Math.round(media.h / 2) * 2 };
}

/** Media (image or video) on one side, title + synced points on the other. */
drawers.split = function split(ctx, s, t, L) {
  const r = splitRect(s, L);
  const rad = 22 * L.u;
  const a = enter(t, 0.1, 0.7);
  if (isVideoScene(s)) {
    // punch a rounded hole so the video composited underneath shows through
    ctx.save(); ctx.globalCompositeOperation = 'destination-out';
    roundRect(ctx, r.x, r.y, r.w, r.h, rad); ctx.fill(); ctx.restore();
  } else if (L.assets.image) {
    ctx.save(); ctx.globalAlpha = a;
    shadow(ctx, L, () => { ctx.fillStyle = '#000'; roundRect(ctx, r.x, r.y + (1 - a) * 30 * L.u, r.w, r.h, rad); ctx.fill(); });
    roundRect(ctx, r.x, r.y + (1 - a) * 30 * L.u, r.w, r.h, rad); ctx.clip();
    drawImageCover(ctx, L.assets.image, r.x, r.y + (1 - a) * 30 * L.u, r.w, r.h, 1, s.fit, 0, 0, s.focus);
    ctx.restore();
    if (s.credit) { setFont(ctx, L, 16 * L.u, 500); ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText(fitText(ctx, s.credit, r.w - 20 * L.u), r.x + r.w - 10 * L.u, r.y + r.h + 8 * L.u); }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2 * L.u;
  roundRect(ctx, r.x, r.y, r.w, r.h, rad); ctx.stroke();
  // text column
  const tx = L.portrait ? L.m : s.side === 'left' ? r.x + r.w + 70 * L.u : L.m;
  const tw = L.portrait ? L.W - 2 * L.m : L.W - 2 * L.m - r.w - 70 * L.u;
  let y = L.portrait ? r.y + r.h + 50 * L.u : r.y + 10 * L.u;
  y = heading(ctx, L, s.title, t, y, 3, tx, tw);
  const items = s.items || (s.text ? [s.text] : []);
  let size = 44 * L.u, blocks;
  const bottom = L.H - L.captionH;
  for (;;) {
    setFont(ctx, L, size, 600);
    blocks = items.map((it) => wrap(ctx, it, tw - (s.items ? 60 * L.u : 0)));
    const h = blocks.reduce((n, b) => n + b.length * size * 1.25 + size * 0.6, 0);
    if (y + h < bottom || size < 24 * L.u) break;
    size *= 0.92;
  }
  const current = L.reveals.reduce((c, rv, i) => (t >= rv ? i : c), -1);
  blocks.forEach((b, i) => {
    const ba = enter(t, L.reveals[i] ?? 0.4);
    ctx.globalAlpha = ba * (!s.items || i === current ? 1 : 0.62);
    if (s.items) { ctx.fillStyle = L.theme.accent; ctx.beginPath(); ctx.arc(tx + 12 * L.u, y + size * 0.62, 9 * L.u, 0, Math.PI * 2); ctx.fill(); }
    setFont(ctx, L, size, s.items ? 600 : 500); ctx.fillStyle = s.items ? L.theme.text : L.theme.muted;
    lines(ctx, b, tx + (s.items ? 50 * L.u : 0) + (1 - ba) * 30 * L.u, y, size * 1.25);
    y += b.length * size * 1.25 + size * 0.6;
  });
  ctx.globalAlpha = 1;
};

// ---------------------------------------------------------------- documentary scene types

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/** Chapter card: full-bleed image with a slow push, big serif title. */
drawers.chapter = function chapter(ctx, s, t, L) {
  if (L.assets.image) {
    drawKenBurns(ctx, L.assets.image, { ...s, pan: s.pan || 'in' }, t, L);
    ctx.fillStyle = 'rgba(0,0,0,0.52)'; ctx.fillRect(0, 0, L.W, L.H);
  }
  const a = enter(t, 0.2, 1.0), b = enter(t, 0.6, 1.0);
  const label = s.kicker ?? (s.number ? `Chapter ${ROMAN[s.number] || s.number}` : '');
  const f = fit(ctx, L, s.title, { maxW: L.W - 2 * L.m, maxLines: 2, size: (L.portrait ? 120 : 140) * L.u, weight: 900, mono: titleFace(L) });
  const total = 70 * L.u + f.lines.length * f.lh + (s.subtitle ? 80 * L.u : 0);
  let y = (L.H - (L.captions ? L.captionH * 0.5 : 0) - total) / 2;
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  if (label) {
    ctx.globalAlpha = a; setFont(ctx, L, 34 * L.u, 700); ctx.fillStyle = L.theme.accent;
    ctx.fillText(String(label).toUpperCase().split('').join('\u2009'), L.W / 2, y);
  }
  y += 70 * L.u;
  ctx.globalAlpha = a; setFont(ctx, L, f.size, 900, titleFace(L)); ctx.fillStyle = '#ffffff';
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 30 * L.u;
  f.lines.forEach((ln, i) => ctx.fillText(ln, L.W / 2, y + i * f.lh + (1 - a) * 30 * L.u));
  ctx.restore();
  y += f.lines.length * f.lh + 20 * L.u;
  ctx.globalAlpha = b; ctx.fillStyle = L.theme.accent;
  ctx.fillRect(L.W / 2 - 80 * L.u * b, y, 160 * L.u * b, 6 * L.u);
  if (s.subtitle) { setFont(ctx, L, 40 * L.u, 500); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(s.subtitle, L.W / 2, y + 30 * L.u); }
  ctx.globalAlpha = 1;
  drawCredit(ctx, s, L);
};

/** Timeline: evenly spaced events on a line; each lights up when the voice reaches it. */
drawers.timeline = function timeline(ctx, s, t, L) {
  const y0 = heading(ctx, L, s.title, t);
  const ev = s.events;
  const x0 = L.m + 40 * L.u, x1 = L.W - L.m - 40 * L.u;
  const midY = y0 + (L.H - L.captionH - y0) * 0.48;
  const a = enter(t, 0.1, 0.8);
  ctx.globalAlpha = a; ctx.strokeStyle = L.theme.muted; ctx.lineWidth = 4 * L.u;
  ctx.beginPath(); ctx.moveTo(x0, midY); ctx.lineTo(x0 + (x1 - x0) * a, midY); ctx.stroke();
  const current = L.reveals.reduce((c, r, i) => (t >= r ? i : c), -1);
  const step = ev.length > 1 ? (x1 - x0) / (ev.length - 1) : 0;
  const colW = Math.min(step * 0.95 || (x1 - x0), 420 * L.u);
  ev.forEach((e, i) => {
    const x = ev.length > 1 ? x0 + i * step : (x0 + x1) / 2;
    const r = enter(t, L.reveals[i] ?? 0.3, 0.5);
    if (r <= 0) return;
    const on = i === current;
    ctx.globalAlpha = r;
    ctx.fillStyle = on ? L.theme.accent : L.theme.text;
    ctx.beginPath(); ctx.arc(x, midY, (on ? 15 : 10) * L.u * (0.6 + 0.4 * r), 0, Math.PI * 2); ctx.fill();
    const up = i % 2 === 0;
    ctx.textAlign = 'center';
    setFont(ctx, L, 46 * L.u, 800, titleFace(L)); ctx.fillStyle = on ? L.theme.accent : L.theme.text;
    const when = fitText(ctx, String(e.when ?? ''), colW);
    setFont(ctx, L, 36 * L.u, 500);
    const lab = wrap(ctx, String(e.label ?? ''), colW).slice(0, 3);
    // keep the text block inside the frame: edge events shift inward instead of clipping
    const labW = Math.max(0, ...lab.map((l) => ctx.measureText(l).width));
    setFont(ctx, L, 46 * L.u, 800, titleFace(L));
    const half = Math.max(labW, ctx.measureText(when).width) / 2, pad = L.m * 0.5;
    const tx = Math.min(Math.max(x, pad + half), L.W - pad - half);
    setFont(ctx, L, 36 * L.u, 500);
    if (up) {
      const top = midY - 34 * L.u - lab.length * 44 * L.u;
      ctx.fillStyle = L.theme.muted;
      lines(ctx, lab, tx, top, 44 * L.u, 'center');
      setFont(ctx, L, 46 * L.u, 800, titleFace(L)); ctx.fillStyle = on ? L.theme.accent : L.theme.text;
      ctx.textBaseline = 'bottom'; ctx.fillText(when, tx, top - 8 * L.u);
    } else {
      setFont(ctx, L, 46 * L.u, 800, titleFace(L)); ctx.textBaseline = 'top'; ctx.fillText(when, tx, midY + 34 * L.u);
      setFont(ctx, L, 36 * L.u, 500); ctx.fillStyle = L.theme.muted;
      lines(ctx, lab, tx, midY + 92 * L.u, 44 * L.u, 'center');
    }
  });
  ctx.globalAlpha = 1;
};
