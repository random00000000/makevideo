// `makevideo shoot trailer.md`: film every shot in a trailer beat sheet from the running game.
// The game is an Electron app that calls require('makevideo/electron').attach(win). We start it
// with MAKEVIDEO_SHOTS=1, then ask it for each shot: run the setup code, move the camera, record.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { normalize } from './spec.js';
import { trailerMusic, layoutOnBeats, sourceSeconds } from './trailer.js';
import { FFMPEG, run } from './render.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ping(port) {
  try { const r = await fetch(`http://127.0.0.1:${port}/ping`); return r.ok; } catch { return false; }
}

function killTree(proc) {
  if (!proc || proc.exitCode != null) return;
  if (process.platform === 'win32') { try { execFileSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} }
  else { try { process.kill(-proc.pid, 'SIGTERM'); } catch { proc.kill('SIGTERM'); } }
}

/**
 * Film the shots of a trailer spec.
 * @param {object} input   trailer spec (e.g. from fromMarkdown)
 * @param {object} [o]
 * @param {string} [o.baseDir]   folder the beat sheet lives in (shots are saved relative to it)
 * @param {string} [o.game]      command that starts the game (default: spec.game, else "npm start")
 * @param {string} [o.cwd]       folder to run the game command in (default: spec.gameDir or baseDir)
 * @param {boolean} [o.all]      re-film shots that already exist
 * @param {string[]} [o.only]    only these shot labels / file names
 * @param {number} [o.port=7377]
 * @param {(e:{stage:string,message:string})=>void} [o.onProgress]
 */
export async function shoot(input, o = {}) {
  const baseDir = o.baseDir || process.cwd();
  const log = o.onProgress || (() => {});
  const spec = normalize({ style: 'trailer', ...input }, { baseDir, checkFiles: false });
  const port = o.port || Number(process.env.MAKEVIDEO_PORT) || 7377;

  // how long each shot must be: its beats on the music grid, times its speed, plus a safety margin
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'makevideo-shoot-'));
  const music = await trailerMusic(spec, tmp, FFMPEG, { dry: true });
  const layout = layoutOnBeats(spec.scenes, music.map, spec.fps);
  const todo = [];
  spec.scenes.forEach((s, i) => {
    if (s.type !== 'clip' || !s.shot) return;
    if (o.only?.length && !o.only.some((x) => x === s.label || path.basename(s.src).startsWith(x))) return;
    if (!o.all && fs.existsSync(s.srcPath)) return;
    const need = sourceSeconds(s, layout[i].frames / spec.fps) + (typeof s.start === 'number' ? s.start : 0);
    todo.push({ scene: s, seconds: +(Math.max(need + 0.6, s.shot.seconds || 0)).toFixed(2) });
  });
  if (!todo.length) { log({ stage: 'shoot', message: 'every shot is already filmed (use --all to re-film)' }); return { shots: [] }; }

  // start the game unless it is already running in shot mode
  let proc = null;
  if (!(await ping(port))) {
    const cmd = o.game || spec.game || 'npm start';
    const cwd = path.resolve(baseDir, o.cwd || spec.gameDir || '.');
    log({ stage: 'shoot', message: `starting the game: ${cmd} (in ${cwd})` });
    proc = spawn(cmd, { cwd, shell: true, detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, MAKEVIDEO_SHOTS: '1', MAKEVIDEO_PORT: String(port) } });
    let err = '';
    proc.stderr.on('data', (d) => (err = (err + d).slice(-4000)));
    let up = false;
    for (let t = 0; t < 120 && !up; t++) { if (proc.exitCode != null) break; await sleep(500); up = await ping(port); }
    if (!up) { killTree(proc); throw new Error(`the game did not open its makevideo shot port (${port}). In your Electron main process add:\n  require('makevideo/electron').attach(win)\n${err ? 'game output:\n' + err : ''}`); }
  }

  const shots = [];
  try {
    for (const [n, { scene: s, seconds }] of todo.entries()) {
      const sh = s.shot;
      log({ stage: 'shoot', message: `[${n + 1}/${todo.length}] ${s.label || s.src}: ${sh.camera || 'game camera'}, ${seconds}s` });
      const raw = path.join(tmp, `shot-${n}.mkv`);
      const body = { file: raw, seconds, setup: sh.setup, camera: sh.camera, wait: sh.wait, fps: sh.fps || (s.speed < 1 || s.ramp ? 60 : spec.fps), mode: sh.mode || (sh.audio ? 'realtime' : 'frames'), width: spec.width, height: spec.height };
      const res = await fetch(`http://127.0.0.1:${port}/shot`, { method: 'POST', body: JSON.stringify(body) }).then((r) => r.json());
      if (!res.ok) throw new Error(`shot "${s.label || s.src}" failed in the game: ${res.error}`);
      // MediaRecorder output is variable frame rate with no duration: make it a clean, seekable file
      fs.mkdirSync(path.dirname(s.srcPath), { recursive: true });
      if (process.env.MAKEVIDEO_KEEP_RAW) fs.copyFileSync(raw, s.srcPath + '.raw.mkv');
      const mp4 = /\.mp4$/i.test(s.srcPath);
      await run(FFMPEG, ['-y', '-v', 'error', '-i', raw, '-r', String(spec.fps), ...(mp4 ? ['-c:v', 'libx264', '-preset', 'fast', '-crf', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'] : ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '24', '-row-mt', '1', '-deadline', 'realtime']), '-c:a', mp4 ? 'aac' : 'libopus', s.srcPath]);
      shots.push({ label: s.label || null, file: s.srcPath, seconds });
    }
  } finally {
    killTree(proc);
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
  }
  return { shots };
}
