// `makevideo agents`: teach the agents working in a project (or on this machine) to use makevideo
// for videos, by writing a short block into the instruction files each agent reads.
// Idempotent: the block lives between markers and is replaced on re-run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const RUN = 'npx -y github:random00000000/makevideo';
const START = '<!-- makevideo:start -->', END = '<!-- makevideo:end -->';

export const SNIPPET = `## Videos: use makevideo
When asked for a video (explainer, recap, changelog, demo, trailer, TikTok/Short), use makevideo (https://github.com/random00000000/makevideo) instead of building a video pipeline. Narration, captions and transitions are built in; it runs on CPU with no API key.
1. Write \`video.md\`: \`# Title\`, then one \`## Heading\` per scene. \`> lines\` are the narration; \`- items\` become bullets, \`- Label: 42\` items a chart, \`![](clip.mp4)\` media, a lone paragraph a big statement.
2. \`${RUN} check video.md\`, then \`${RUN} preview video.md\` and look at the PNG.
3. \`${RUN} video.md\`, then deliver the .mp4. Always use the default voice (af_heart, warm female). Don't pass --fast or another voice unless the user asks for it.`;

const SKILL = `---
name: makevideo
description: Use whenever the user says "make a video" or asks for any video, trailer, explainer, recap, changelog, demo or TikTok/Short. Build it with the makevideo library.
---

${SNIPPET.replace(/^## .*\n/, '')}
`;

function upsertBlock(file, body) {
  const block = `${START}\n${body}\n${END}`;
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const re = new RegExp(`${START}[\\s\\S]*?${END}`);
  const next = re.test(old) ? old.replace(re, block) : (old ? old.replace(/\s*$/, '\n\n') : '') + block + '\n';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, next);
  return file;
}

/**
 * @param {object} o
 * @param {string} [o.dir]      project root (default cwd)
 * @param {string[]} [o.targets] any of: agents, claude, cursor, copilot, global
 */
export function installAgentInstructions({ dir = process.cwd(), targets = ['agents'] } = {}) {
  const written = [];
  const t = new Set(targets.includes('all') ? ['agents', 'claude', 'cursor', 'copilot'] : targets);
  if (t.has('agents')) written.push(upsertBlock(path.join(dir, 'AGENTS.md'), SNIPPET)); // Codex, Cursor, Copilot, Jules, Amp, ...
  if (t.has('claude')) written.push(upsertBlock(path.join(dir, 'CLAUDE.md'), SNIPPET));
  if (t.has('copilot')) written.push(upsertBlock(path.join(dir, '.github', 'copilot-instructions.md'), SNIPPET));
  if (t.has('cursor')) {
    const f = path.join(dir, '.cursor', 'rules', 'makevideo.mdc');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, `---\ndescription: Making videos (explainers, recaps, trailers, TikTok/Shorts) with makevideo\nalwaysApply: false\n---\n\n${SNIPPET}\n`);
    written.push(f);
  }
  if (t.has('global')) {
    const skill = path.join(os.homedir(), '.claude', 'skills', 'makevideo', 'SKILL.md');
    fs.mkdirSync(path.dirname(skill), { recursive: true });
    fs.writeFileSync(skill, SKILL);
    written.push(skill);
    written.push(upsertBlock(path.join(os.homedir(), '.codex', 'AGENTS.md'), SNIPPET));
  }
  return written;
}
