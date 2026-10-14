// A small pool of render worker processes (one canvas + one ffmpeg each).
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const strip = (tl) => tl && { ...tl, prevFrame: undefined, spoken: tl.spoken.map(({ text, start, end }) => ({ text, start, end })) };

export function createRenderPool(size) {
  const idle = [], queue = [], pending = new Map(), workers = [];
  let seq = 0;
  const spawnOne = () => {
    const w = fork(fileURLToPath(new URL('./render-worker.js', import.meta.url)), [], { serialization: 'advanced', stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    w.on('message', ({ id, error }) => {
      const p = pending.get(id);
      pending.delete(id);
      idle.push(w);
      pump();
      error ? p.reject(new Error(error)) : p.resolve();
    });
    w.on('exit', (c) => { if (c && pending.size) for (const p of pending.values()) p.reject(new Error('render worker exited with code ' + c)); });
    workers.push(w);
    idle.push(w);
  };
  const pump = () => {
    while (queue.length && (idle.length || workers.length < size)) {
      if (!idle.length) spawnOne();
      const w = idle.pop();
      const { job, resolve, reject } = queue.shift();
      const id = ++seq;
      pending.set(id, { resolve, reject });
      w.send({ id, ...job, tl: strip(job.tl), prevTl: strip(job.prevTl) });
    }
  };
  // start every worker now: module + font loading overlaps with speech generation
  for (let i = 0; i < size; i++) spawnOne();
  return {
    /** Render one scene segment; resolves when its mp4 is written. */
    render: (job) => new Promise((resolve, reject) => { queue.push({ job, resolve, reject }); pump(); }),
    close: () => { for (const w of workers) if (w.connected) w.disconnect(); },
  };
}
