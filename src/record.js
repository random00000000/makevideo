// Screen recording with the bundled ffmpeg: capture gameplay, a browser tab, or a whole
// desktop, then drop the file into a `clip` scene.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';

const FFMPEG = process.env.NARRATED_FFMPEG || ffmpegPath;

/**
 * Record the screen (or one window on Windows) to an mp4.
 * @param {object} o
 * @param {string} o.output            file to write (.mp4)
 * @param {number} o.seconds           how long to record
 * @param {number} [o.fps=30]
 * @param {string} [o.window]          Windows only: exact window title to capture (e.g. a game)
 * @param {{x:number,y:number,width:number,height:number}} [o.region]  crop to this desktop region
 * @param {string} [o.display]         macOS screen index (default "1") / Linux X display (default $DISPLAY)
 */
export function record({ output, seconds, fps = 30, window: win, region, display } = {}) {
  if (!output || !seconds) throw new Error('record({ output, seconds }) needs both. Example: record({ output: "gameplay.mp4", seconds: 10 })');
  fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
  const input = [];
  if (process.platform === 'win32') {
    input.push('-f', 'gdigrab', '-framerate', String(fps), '-draw_mouse', '1');
    if (region && !win) input.push('-offset_x', String(region.x), '-offset_y', String(region.y), '-video_size', `${region.width}x${region.height}`);
    input.push('-i', win ? `title=${win}` : 'desktop');
  } else if (process.platform === 'darwin') {
    input.push('-f', 'avfoundation', '-framerate', String(fps), '-capture_cursor', '1', '-i', `${display ?? '1'}:none`);
  } else {
    const d = display ?? process.env.DISPLAY ?? ':0';
    if (region) input.push('-video_size', `${region.width}x${region.height}`);
    input.push('-f', 'x11grab', '-framerate', String(fps), '-i', region ? `${d}+${region.x},${region.y}` : d);
  }
  const vf = region && process.platform === 'darwin' ? ['-vf', `crop=${region.width}:${region.height}:${region.x}:${region.y}`] : [];
  const args = ['-y', ...input, '-t', String(seconds), ...vf, '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2', output];
  if (vf.length) args.splice(args.indexOf('-vf', args.indexOf(vf[1]) + 1), 2); // keep the crop filter only
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err = (err + d).slice(-3000)));
    p.on('error', reject);
    p.on('close', (c) => (c === 0 ? resolve({ output: path.resolve(output), seconds }) : reject(new Error('screen recording failed:\n' + err))));
  });
}
