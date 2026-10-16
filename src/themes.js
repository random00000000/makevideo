// Built-in themes. Pass `theme: "name"` or `theme: { ...overrides }` (merged over midnight).
const SANS = '"MV Inter", "Inter", "Segoe UI", "SF Pro Display", "Helvetica Neue", Arial, "DejaVu Sans", sans-serif';
const MONO = '"MV JetBrainsMono", "JetBrains Mono", "Cascadia Code", Consolas, "SF Mono", Menlo, "DejaVu Sans Mono", monospace';

const DISPLAY = '"MV Montserrat", ' + SANS;
const SERIF = '"MV Doc Serif", Georgia, "Times New Roman", serif';

const darkSyntax = { keyword: '#ff9fd0', string: '#b5e48c', number: '#ffcf6b', comment: '#6c7693', fn: '#7cc7ff', punct: '#c3cbe0', text: '#eef1f8' };
export const THEMES = {
  midnight: {
    bg: ['#0a0f1f', '#161d3a'], glow: 'rgba(90,120,255,0.18)',
    text: '#f4f6fb', muted: '#9aa5c4', accent: '#ffb547', accent2: '#5ad1ff', onAccent: '#1a1206',
    panel: 'rgba(255,255,255,0.06)', panelStrong: 'rgba(8,12,26,0.82)',
    captionBg: 'rgba(4,7,16,0.82)', captionText: '#ffffff',
    codeBg: '#0b1124', codeHl: 'rgba(255,181,71,0.16)', syntax: darkSyntax, font: SANS, mono: MONO, display: DISPLAY,
  },
  forge: {
    bg: ['#120c09', '#2a1a10'], glow: 'rgba(255,110,30,0.20)',
    text: '#fbf3ea', muted: '#c2a58f', accent: '#ff7a1a', accent2: '#ffd166', onAccent: '#1d0d02',
    panel: 'rgba(255,220,190,0.07)', panelStrong: 'rgba(18,10,6,0.84)',
    captionBg: 'rgba(12,6,3,0.84)', captionText: '#ffffff',
    codeBg: '#170e09', codeHl: 'rgba(255,122,26,0.18)', syntax: darkSyntax, font: SANS, mono: MONO, display: DISPLAY,
  },
  paper: {
    bg: ['#f8f5ef', '#ece5d8'], glow: 'rgba(255,170,90,0.20)',
    text: '#1d1b18', muted: '#6b6459', accent: '#d9480f', accent2: '#1c7ed6', onAccent: '#ffffff',
    panel: 'rgba(0,0,0,0.05)', panelStrong: 'rgba(255,255,255,0.9)',
    captionBg: 'rgba(20,18,15,0.84)', captionText: '#ffffff',
    codeBg: '#1e1d1b', codeHl: 'rgba(217,72,15,0.22)', syntax: darkSyntax, font: SANS, mono: MONO, display: DISPLAY,
  },
  terminal: {
    bg: ['#030806', '#06140d'], glow: 'rgba(40,255,140,0.10)',
    text: '#d8ffe8', muted: '#6fa88a', accent: '#39ff88', accent2: '#4cc9f0', onAccent: '#00140a',
    panel: 'rgba(57,255,136,0.06)', panelStrong: 'rgba(2,10,6,0.86)',
    captionBg: 'rgba(0,0,0,0.85)', captionText: '#d8ffe8',
    codeBg: '#020604', codeHl: 'rgba(57,255,136,0.14)', syntax: darkSyntax, font: SANS, mono: MONO, display: DISPLAY,
  },
  // trailer: near-black, heavy display type, a single warm accent (override with theme: { accent })
  trailer: {
    bg: ['#030303', '#0b0b0d'], glow: 'rgba(255,255,255,0.04)',
    text: '#ffffff', muted: '#b8b8c0', accent: '#f2c14e', accent2: '#e8e8ee', onAccent: '#120d02',
    panel: 'rgba(255,255,255,0.06)', panelStrong: 'rgba(0,0,0,0.75)',
    captionBg: 'rgba(0,0,0,0.75)', captionText: '#ffffff',
    codeBg: '#0b0b0d', codeHl: 'rgba(242,193,78,0.16)', syntax: darkSyntax, font: SANS, mono: MONO, display: DISPLAY, titleFace: 'display',
  },
  // documentary styles: serif titles (titleFace), cinematic palettes
  documentary: {
    bg: ['#0b0a08', '#1d1811'], glow: 'rgba(216,178,110,0.12)',
    text: '#f5efe4', muted: '#b9ad99', accent: '#d8b26e', accent2: '#8fb3c9', onAccent: '#140e04',
    panel: 'rgba(245,239,228,0.06)', panelStrong: 'rgba(10,8,6,0.82)',
    captionBg: 'rgba(0,0,0,0.72)', captionText: '#fbf7f0',
    codeBg: '#0e0c09', codeHl: 'rgba(216,178,110,0.16)', syntax: darkSyntax, font: SANS, mono: MONO, display: SERIF, titleFace: 'display',
  },
  nature: {
    bg: ['#06100c', '#122019'], glow: 'rgba(160,214,110,0.12)',
    text: '#f1f6ee', muted: '#a9bba6', accent: '#e8b93c', accent2: '#8fd16b', onAccent: '#140f02',
    panel: 'rgba(241,246,238,0.06)', panelStrong: 'rgba(5,10,8,0.82)',
    captionBg: 'rgba(0,0,0,0.72)', captionText: '#fbfdf9',
    codeBg: '#07100c', codeHl: 'rgba(232,185,60,0.16)', syntax: darkSyntax, font: SANS, mono: MONO, display: SERIF, titleFace: 'display',
  },
};
