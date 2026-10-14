#!/usr/bin/env node
// makevideo CLI — `makevideo video.json` renders. `makevideo help` for everything else.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { video, check, preview, record, setup, fromMarkdown, VOICES, THEMES, SCENE_TYPES, FORMATS, TRANSITIONS, SpecError } from '../src/index.js';

const HELP = `makevideo — fast, standard video generation for AI agents.

  makevideo <spec.json|spec.js|notes.md>   render the video (mp4 + srt + report.json + jpg)
  makevideo check <spec>             validate only, print estimated length (instant)
  makevideo preview <spec>           contact sheet PNG of every scene (about 1 s, no TTS)
  makevideo init [file]              write a starter spec (default: video.json)
  makevideo record <out.mp4> --seconds 10 [--window "Game Title"] [--fps 30]
                                    record the screen (or one window) for clip scenes
  makevideo agents [--claude --cursor --copilot --all --global]
                                    tell this project's agents (AGENTS.md etc.) to use makevideo
  makevideo mcp                     run as an MCP server (stdio) for Claude, Cursor, Codex, VS Code...
  makevideo setup [voices...]       pre-download voice models (do this once in CI/cloud images)
  makevideo voices | themes | types | transitions  list options

Flags:
  -o, --output <file>   override spec.output
  --draft               fastest encode (ultrafast, lower quality) for iteration
  --format <f>          landscape | portrait | square | 720p
  --fast                use the fast voice (~10x real time on CPU) + quick encode
  --voice <id>          override voice    --theme <name>  override theme
  --json                machine-readable output (for agents)

Spec reference: https://github.com/random00000000/makevideo#spec`;

const STARTER = {
  title: 'My makevideo video',
  theme: 'midnight',
  voice: 'af_heart',
  brand: 'My Project',
  scenes: [
    { type: 'title', kicker: 'Update', title: 'My makevideo video', subtitle: 'Made with makevideo', say: 'Here is a quick update, made with makevideo.' },
    { type: 'bullets', title: 'What changed', items: ['Faster builds', 'Cleaner UI', 'Fewer crashes'], say: 'Three things changed. Builds are faster. The UI is cleaner. And it crashes less.' },
    { type: 'stat', value: '3x', label: 'faster than last week', say: 'Overall, about three times faster than last week.' },
    { type: 'decisions', title: 'Decisions for you', items: ['Ship on Friday?', 'Keep the old menu?'], say: 'Two decisions for you. Do we ship on Friday? And do we keep the old menu?' },
  ],
};

const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '-o' || a === '--output') flags.output = argv[++i];
  else if (a.startsWith('--')) {
    const k = a.slice(2);
    if (['format', 'voice', 'theme', 'quality', 'seconds', 'window', 'fps'].includes(k)) flags[k] = argv[++i];
    else flags[k] = true;
  } else pos.push(a);
}
const json = !!flags.json;
const out = (o, text) => console.log(json ? JSON.stringify(o, null, 2) : text);

async function load(file) {
  if (!file) fail('Missing spec file. Try: makevideo init && makevideo video.json');
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) fail(`File not found: ${abs}`);
  let spec;
  if (/\.(m?js|cjs)$/.test(abs)) {
    const mod = await import(pathToFileURL(abs).href);
    spec = mod.default ?? mod.spec;
    if (typeof spec === 'function') spec = await spec();
  } else if (/\.(md|markdown)$/i.test(abs)) spec = fromMarkdown(fs.readFileSync(abs, 'utf8'));
  else spec = JSON.parse(fs.readFileSync(abs, 'utf8'));
  for (const k of ['output', 'format', 'voice', 'theme', 'quality']) if (flags[k]) spec[k] = flags[k];
  if (flags.draft) spec.quality = 'draft';
  if (flags.fast) { spec.voice = 'fast'; spec.quality = 'draft'; }
  if (!spec.output) spec.output = path.basename(abs).replace(/\.[^.]+$/, '') + '.mp4';
  return { spec, baseDir: path.dirname(abs) };
}

function fail(msg, extra = {}) {
  if (json) console.log(JSON.stringify({ ok: false, error: msg, ...extra }, null, 2));
  else console.error('makevideo: ' + msg + (extra.problems ? '\n' + extra.problems.map((p) => '  - ' + p).join('\n') : ''));
  process.exit(1);
}

const [cmd, ...rest] = pos;
try {
  if (!cmd || cmd === 'help' || flags.help || flags.h) console.log(HELP);
  else if (cmd === 'voices') out(VOICES, Object.entries(VOICES).map(([k, v]) => `${k.padEnd(12)} ${v}`).join('\n'));
  else if (cmd === 'themes') out(Object.keys(THEMES), Object.keys(THEMES).join('\n'));
  else if (cmd === 'types') out(SCENE_TYPES, Object.entries(SCENE_TYPES).map(([k, v]) => `${k.padEnd(10)} ${JSON.stringify(v.example)}`).join('\n'));
  else if (cmd === 'agents') {
    const { installAgentInstructions } = await import('../src/agents.js');
    const targets = ['agents', 'claude', 'cursor', 'copilot', 'global', 'all'].filter((k) => flags[k]);
    const files = installAgentInstructions({ dir: rest[0] || process.cwd(), targets: targets.length ? targets : ['agents'] });
    out({ ok: true, files }, 'agents in this project will now use makevideo for videos:\n' + files.map((f) => '  ' + f).join('\n'));
  } else if (cmd === 'mcp') {
    const { serveMcp } = await import('../src/mcp.js');
    await serveMcp();
  } else if (cmd === 'setup') {
    // pre-download voice models so the first render doesn't wait on a ~330 MB download
    await setup({ voices: rest.length ? rest : undefined, log: (m) => !json && console.error(m) });
    out({ ok: true }, 'voices ready');
  } else if (cmd === 'transitions') out(TRANSITIONS, TRANSITIONS.join('\n'));
  else if (cmd === 'formats') out(FORMATS, Object.entries(FORMATS).map(([k, v]) => `${k.padEnd(10)} ${v.join('x')}`).join('\n'));
  else if (cmd === 'record') {
    if (!rest[0] || !flags.seconds) fail('usage: makevideo record <out.mp4> --seconds <n> [--window "Title"] [--fps 30]');
    if (!json) process.stderr.write(`recording ${flags.seconds}s${flags.window ? ` of "${flags.window}"` : ''}...
`);
    const r = await record({ output: rest[0], seconds: Number(flags.seconds), fps: Number(flags.fps || 30), window: flags.window });
    out({ ok: true, ...r }, `recorded ${r.output}`);
  } else if (cmd === 'init') {
    const f = rest[0] || 'video.json';
    if (fs.existsSync(f)) fail(`${f} already exists`);
    fs.writeFileSync(f, JSON.stringify(STARTER, null, 2) + '\n');
    out({ ok: true, file: f }, `wrote ${f} — edit it, then: makevideo ${f}`);
  } else if (cmd === 'check') {
    const { spec, baseDir } = await load(rest[0]);
    const r = check(spec, { baseDir });
    if (!r.ok) fail('invalid spec', { problems: r.problems });
    const tips = r.warnings.map((w) => '  - ' + w).join('\n');
    out(r, `ok: ${r.scenes} scenes, about ${r.estimatedSeconds}s → ${r.output}` + (tips ? `\n${r.warnings.length} suggestion(s):\n${tips}` : ''));
  } else if (cmd === 'preview') {
    const { spec, baseDir } = await load(rest[0]);
    const r = await preview(spec, { baseDir });
    out({ ok: true, ...r }, `preview: ${r.output} (${r.scenes} scenes, about ${r.estimatedSeconds}s)`);
  } else {
    const file = cmd === 'render' ? rest[0] : cmd;
    const { spec, baseDir } = await load(file);
    const r = await video(spec, {
      baseDir,
      onProgress: (e) => !json && process.stderr.write(`[${e.stage}] ${e.message}\n`),
    });
    out({ ok: true, ...r }, `\n✔ ${r.output}\n  ${r.duration}s video rendered in ${r.seconds}s · captions ${path.basename(r.srt)} · report ${path.basename(r.report)}`);
  }
} catch (e) {
  if (e instanceof SpecError) fail('invalid spec', { problems: e.problems });
  fail(e.stack || String(e));
}
