// Builds the GitHub Pages site into docs/: landing page, guides, llms.txt, llms-full.txt, sitemap.
// Usage: node scripts/build-site.mjs
import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT = path.join(ROOT, 'docs');
const SITE = 'https://random00000000.github.io/makevideo/';
const REPO = 'https://github.com/random00000000/makevideo';
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function readGuide(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n/.exec(raw);
  const meta = {};
  for (const line of m[1].split('\n')) { const i = line.indexOf(':'); meta[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
  return { ...meta, slug: path.basename(file, '.md'), body: raw.slice(m[0].length) };
}
const guides = fs.readdirSync(path.join(ROOT, 'site/guides')).filter((f) => f.endsWith('.md')).sort()
  .map((f) => readGuide(path.join(ROOT, 'site/guides', f)));

const CSS = `
:root{--bg:#0a0f1f;--bg2:#121933;--text:#eef1f8;--muted:#a3adc8;--accent:#ffb547;--accent2:#5ad1ff;--panel:rgba(255,255,255,.05);--line:rgba(255,255,255,.1)}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:17px/1.65 Inter,"Segoe UI",system-ui,-apple-system,sans-serif}
a{color:var(--accent2)}a:hover{color:var(--accent)}
.wrap{max-width:980px;margin:0 auto;padding:0 20px}
header.top{border-bottom:1px solid var(--line)}header.top .wrap{display:flex;gap:20px;align-items:center;height:60px}
header.top a.brand{color:var(--text);font-weight:800;text-decoration:none;font-size:19px}header.top nav{margin-left:auto;display:flex;gap:18px;font-size:15px}
header.top nav a{color:var(--muted);text-decoration:none}header.top nav a:hover{color:var(--text)}
.hero{padding:64px 0 32px}.kicker{color:var(--accent);font-weight:700;letter-spacing:.12em;text-transform:uppercase;font-size:13px}
h1{font-size:clamp(34px,6vw,58px);line-height:1.08;margin:.3em 0 .35em;letter-spacing:-.02em}
.lede{font-size:20px;color:var(--muted);max-width:720px}
.cta{display:flex;flex-wrap:wrap;gap:12px;margin:26px 0}
.btn{display:inline-block;padding:11px 18px;border-radius:10px;background:var(--accent);color:#1a1206;font-weight:700;text-decoration:none}
.btn.ghost{background:transparent;color:var(--text);border:1px solid var(--line)}
pre{background:#060a16;border:1px solid var(--line);border-radius:12px;padding:16px;overflow-x:auto;font:14px/1.55 "JetBrains Mono",Consolas,monospace}
code{font-family:"JetBrains Mono",Consolas,monospace;font-size:.92em}p code,li code,td code{background:var(--panel);padding:1px 6px;border-radius:6px}
video{width:100%;border-radius:14px;border:1px solid var(--line);background:#000;display:block}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin:24px 0}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px 20px}
.card h3{margin:.1em 0 .4em;font-size:18px}.card p{margin:0;color:var(--muted);font-size:15px}
.card a.more{display:block;margin-top:10px;font-weight:600;font-size:15px}
h2{font-size:28px;margin:2.2em 0 .6em;letter-spacing:-.01em}
table{border-collapse:collapse;width:100%;font-size:15px;display:block;overflow-x:auto}th,td{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}th{color:var(--muted);font-weight:600}
article{padding:40px 0 60px}article h1{font-size:clamp(30px,5vw,44px)}
footer{border-top:1px solid var(--line);color:var(--muted);font-size:14px;padding:28px 0 48px;margin-top:40px}
`;

function page({ title, description, canonical, body, jsonld }) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${SITE}social-card.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="alternate" type="text/plain" title="llms.txt" href="${SITE}llms.txt">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
<style>${CSS}</style>
</head><body>
<header class="top"><div class="wrap"><a class="brand" href="${SITE}">makevideo</a><nav><a href="${SITE}#guides">Guides</a><a href="${SITE}llms-full.txt">llms-full.txt</a><a href="${REPO}">GitHub</a></nav></div></header>
${body}
<footer><div class="wrap">makevideo ${pkg.version} · MIT · <a href="${REPO}">${REPO.replace('https://', '')}</a> · voice: Kokoro-82M (Apache-2.0), Piper voices (CC0 / public domain) · fonts: Inter, Montserrat, JetBrains Mono (OFL)</div></footer>
</body></html>
`;
}

const RUN = 'npx -y github:random00000000/makevideo';
const landing = `
<section class="hero"><div class="wrap">
<div class="kicker">Open source · CPU-only · no API key</div>
<h1>Fast, standard video generation for AI agents.</h1>
<p class="lede">Write a video as Markdown or JSON. makevideo voices it with a local neural voice, times every scene to the real audio, adds captions and transitions, and renders an MP4 — on a plain CPU, faster than it plays.</p>
<div class="cta"><a class="btn" href="${REPO}">Get it on GitHub</a><a class="btn ghost" href="#start">Quick start</a><a class="btn ghost" href="guides/mcp-video-server.html">MCP server</a></div>
<video controls preload="metadata" poster="showcase.jpg" src="whats-new-0.3.mp4"></video>
</div></section>
<section class="wrap" id="start">
<h2>Quick start</h2>
<pre><code>${esc(`# video.md
# Weekly update
What shipped this week
> Here is what shipped this week.

## Highlights
- Faster builds
- New onboarding
> Two highlights. Builds are faster. And onboarding is new.`)}</code></pre>
<pre><code>${esc(`${RUN} video.md          # → video.mp4 + video.srt + poster + report
${RUN} video.md --fast   # ~10x real-time voice for drafts
${RUN} preview video.md  # contact sheet of every scene in ~1 s`)}</code></pre>
<h2>Put it where your agents are</h2>
<div class="grid">
<div class="card"><h3>Any MCP client</h3><p>Claude Desktop, Cursor, VS Code, Codex: add <code>${RUN} mcp</code>. Tools: make_video, preview_video (returns an image), check_video.</p><a class="more" href="guides/mcp-video-server.html">MCP setup →</a></div>
<div class="card"><h3>Claude Code plugin</h3><p><code>/plugin marketplace add random00000000/makevideo</code> — then just say “make a video about…”.</p><a class="more" href="guides/make-videos-with-ai-agents.html">Agent workflow →</a></div>
<div class="card"><h3>Every agent in a repo</h3><p><code>${RUN} agents --all</code> writes a “use makevideo for videos” block into AGENTS.md, CLAUDE.md, Cursor rules and Copilot instructions.</p><a class="more" href="guides/make-videos-with-ai-agents.html">How it works →</a></div>
</div>
<h2>What you get without asking</h2>
<div class="grid">
<div class="card"><h3>Narration by default</h3><p>Every scene is spoken. Same voice on every video. Symbols like 42%, v1.2 and $3M are read correctly.</p></div>
<div class="card"><h3>Premium look</h3><p>Transitions blended from real frames, kinetic statements, animated charts, split media layouts, bundled fonts.</p></div>
<div class="card"><h3>Hard to get wrong</h3><p>Lint flags walls of text and unsynced lists before rendering. Errors name the scene and show a working example.</p></div>
<div class="card"><h3>Fast on a CPU</h3><p>Frame holding, render processes and cached speech: a 74 s video re-renders in ~28 s on a laptop.</p></div>
</div>
<h2 id="guides">Guides</h2>
<div class="grid">${guides.map((g) => `<div class="card"><h3><a href="guides/${g.slug}.html">${esc(g.title)}</a></h3><p>${esc(g.description)}</p></div>`).join('')}</div>
</section>`;

const ld = {
  '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'makevideo', applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Windows, macOS, Linux', description: pkg.description, url: SITE, codeRepository: REPO, license: 'https://opensource.org/licenses/MIT',
  softwareVersion: pkg.version, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
};

fs.writeFileSync(path.join(OUT, 'index.html'), page({ title: 'makevideo — fast, standard video generation for AI agents', description: pkg.description, canonical: SITE, body: landing, jsonld: ld }));
fs.mkdirSync(path.join(OUT, 'guides'), { recursive: true });
for (const g of guides) {
  const body = `<article class="wrap">${marked.parse(g.body)}<p><a href="${SITE}">← makevideo home</a> · <a href="${REPO}">GitHub</a></p></article>`;
  fs.writeFileSync(path.join(OUT, 'guides', g.slug + '.html'), page({
    title: g.title, description: g.description, canonical: `${SITE}guides/${g.slug}.html`, body,
    jsonld: { '@context': 'https://schema.org', '@type': 'TechArticle', headline: g.title, description: g.description, about: 'makevideo' },
  }));
}

// llms.txt (index) and llms-full.txt (everything an agent needs in one fetch)
fs.copyFileSync(path.join(ROOT, 'llms.txt'), path.join(OUT, 'llms.txt'));
const full = [
  fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8'),
  fs.readFileSync(path.join(ROOT, 'skills/makevideo/SKILL.md'), 'utf8'),
  ...guides.map((g) => g.body),
].join('\n\n---\n\n');
fs.writeFileSync(path.join(OUT, 'llms-full.txt'), full);

const urls = [SITE, ...guides.map((g) => `${SITE}guides/${g.slug}.html`), `${SITE}llms.txt`, `${SITE}llms-full.txt`];
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}sitemap.xml\n`);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log(`site: index + ${guides.length} guides + llms.txt + llms-full.txt (${(full.length / 1024).toFixed(0)} KB) → docs/`);
