// MCP server (stdio, JSON-RPC 2.0, newline-delimited). Lets any MCP client (Claude Desktop,
// Claude Code, Cursor, Codex, VS Code, ...) make videos:  npx -y makevideo mcp
// stdout carries protocol messages only; everything else goes to stderr.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { video, check, preview, fromMarkdown, SCENE_TYPES, TRANSITIONS, VOICES, THEMES, FORMATS } from './index.js';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const SOURCE = {
  markdown: { type: 'string', description: 'The video as Markdown. "# Title" opens it; each "## Heading" is a scene. "- items" become bullets, "- Label: 42" items a chart, "![](clip.mp4)" media, a lone paragraph a big statement, "**42%** label" a stat, a ``` fence a code scene. Lines starting with ">" are the narration; without them the visible text is read. Optional front matter: theme, format, voice, brand, output.' },
  spec: { type: 'object', description: 'Alternative to markdown: a full JSON spec { title, format, theme, voice, scenes: [{ type, say, ... }] }. Call video_reference for every scene type.' },
  baseDir: { type: 'string', description: 'Directory that relative media paths (src, music, output) resolve against. Default: the server working directory.' },
};

const TOOLS = [
  {
    name: 'make_video',
    description: 'Render a narrated, captioned MP4 from Markdown or a JSON scene spec. Local neural voice, automatic transitions, CPU-only, no API key. Returns the mp4 path plus captions (.srt), poster (.jpg) and a timing report. Takes about 0.5-1x the video length; with fast=true about 0.4x. Call preview_video first to check the layout.',
    inputSchema: {
      type: 'object',
      properties: {
        ...SOURCE,
        output: { type: 'string', description: 'Where to write the .mp4 (relative to baseDir). Default: <title>.mp4' },
        fast: { type: 'boolean', description: 'Use the fast voice (~10x real time) and a quick encode. Good for drafts and long videos.' },
        format: { type: 'string', enum: Object.keys(FORMATS), description: 'landscape (default), portrait/shorts (TikTok, Reels), square, 720p' },
      },
    },
  },
  {
    name: 'preview_video',
    description: 'Fast layout check (about 1 s, no audio): renders one still per scene into a contact sheet and returns it as an image, plus lint suggestions. Use before make_video.',
    inputSchema: { type: 'object', properties: { ...SOURCE } },
  },
  {
    name: 'check_video',
    description: 'Validate a video spec instantly. Returns problems (must fix), warnings (quality suggestions) and the estimated duration.',
    inputSchema: { type: 'object', properties: { ...SOURCE } },
  },
  {
    name: 'video_reference',
    description: 'Reference for writing videos: scene types with examples, transitions, voices, themes, formats and the Markdown syntax.',
    inputSchema: { type: 'object', properties: {} },
  },
];

function loadSource(args) {
  if (args.markdown) return fromMarkdown(args.markdown);
  if (args.spec) return typeof args.spec === 'string' ? JSON.parse(args.spec) : args.spec;
  throw new Error('Pass "markdown" (recommended) or "spec".');
}

const text = (t) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }] });

async function callTool(name, args = {}, progress) {
  const baseDir = path.resolve(args.baseDir || process.cwd());
  if (name === 'video_reference') {
    return text({
      sceneTypes: Object.fromEntries(Object.entries(SCENE_TYPES).map(([k, v]) => [k, v.example])),
      transitions: TRANSITIONS, voices: VOICES, themes: Object.keys(THEMES), formats: Object.keys(FORMATS),
      markdown: SOURCE.markdown.description,
      tips: ['Every scene needs "say" (narration) or a ">" line in Markdown.', 'Write one intro sentence plus one sentence per list item so items appear with the voice.', 'Open with a title or statement; avoid three scenes of the same type in a row.'],
    });
  }
  const spec = loadSource(args);
  if (name === 'check_video') return text(check(spec, { baseDir }));
  if (name === 'preview_video') {
    const r = await preview(spec, { baseDir });
    const img = await loadImage(fs.readFileSync(r.output));
    const scale = Math.min(1, 1400 / img.width);
    const c = createCanvas(Math.round(img.width * scale), Math.round(img.height * scale));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return {
      content: [
        { type: 'image', data: c.toBuffer('image/jpeg', 80).toString('base64'), mimeType: 'image/jpeg' },
        { type: 'text', text: JSON.stringify({ ...r, warnings: check(spec, { baseDir }).warnings }, null, 2) },
      ],
    };
  }
  if (name === 'make_video') {
    if (args.output) spec.output = args.output;
    if (args.format) spec.format = args.format;
    if (args.fast) { spec.voice = 'fast'; spec.quality = 'draft'; }
    let n = 0;
    const r = await video(spec, { baseDir, onProgress: (e) => progress?.(++n, e.message) });
    return text(r);
  }
  throw new Error(`Unknown tool: ${name}`);
}

export async function serveMcp() {
  // anything that tries to print to stdout would corrupt the protocol stream
  console.log = (...a) => console.error(...a);
  const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', async (line) => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return send({ id: null, error: { code: -32700, message: 'Parse error' } }); }
    const { id, method, params = {} } = msg;
    if (id === undefined) return; // notifications (initialized, cancelled) need no reply
    try {
      if (method === 'initialize') {
        return send({ id, result: {
          protocolVersion: params.protocolVersion || '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'makevideo', title: 'makevideo', version: pkg.version },
          instructions: 'Use makevideo whenever the user wants a video: explainers, recaps, changelogs, demos, trailers, TikTok/Shorts. Write Markdown (## heading per scene, > narration), call preview_video, then make_video.',
        } });
      }
      if (method === 'ping') return send({ id, result: {} });
      if (method === 'tools/list') return send({ id, result: { tools: TOOLS } });
      if (method === 'tools/call') {
        const token = params._meta?.progressToken;
        const progress = token === undefined ? null : (p, message) => send({ method: 'notifications/progress', params: { progressToken: token, progress: p, message } });
        try {
          return send({ id, result: await callTool(params.name, params.arguments, progress) });
        } catch (e) {
          return send({ id, result: { isError: true, content: [{ type: 'text', text: e.problems ? 'Invalid spec:\n- ' + e.problems.join('\n- ') : String(e.message || e) }] } });
        }
      }
      send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
    } catch (e) {
      send({ id, error: { code: -32603, message: String(e.message || e) } });
    }
  });
  await new Promise((r) => rl.on('close', r));
}
