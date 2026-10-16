// makevideo/electron: film trailer shots from inside an Electron + Three.js game.
//
//   main process:   require('makevideo/electron').attach(win)            // one line
//   renderer:       window.makevideo = { renderer, scene, camera }       // one line
//
// What you get:
//   - Shot runner: `npx makevideo shoot trailer.md` launches the game, runs each shot's setup code,
//     drives the camera (orbit / dolly / push / fly / follow) and records the game canvas (no UI).
//   - Instant replay: press F8 while playing and the last 15 s are saved to makevideo-clips/.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

// ---------------------------------------------------------------- injected into the renderer
const RENDERER = String.raw`(() => {
  if (window.__mv) return true;
  const mv = (window.__mv = { shotCam: null, segments: [], replayOn: false });
  const ready = () => window.makevideo && window.makevideo.renderer && window.makevideo.scene && window.makevideo.camera;
  const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const lerp = (a, b, p) => a + (b - a) * p;
  const vec = (s) => String(s).split(',').map(Number);
  // a target is an object name in the scene, or "x,y,z"
  function where(target) {
    if (/^-?[\d.]+,-?[\d.]+,-?[\d.]+$/.test(target)) return vec(target);
    const o = window.makevideo.scene.getObjectByName(target);
    if (!o) throw new Error('makevideo: no object named "' + target + '" in the scene (set obj.name)');
    o.updateMatrixWorld(true);
    const e = o.matrixWorld.elements;
    return [e[12], e[13], e[14]];
  }
  // camera move grammar (all degrees / world units):
  //   orbit <target> <radius> <height> <fromDeg> <toDeg>
  //   push  <target> <fromDist> <toDist> <height> [angleDeg]
  //   dolly <x,y,z> <x,y,z> look <target>
  //   fly   <x,y,z> <x,y,z> look <target>        (same as dolly, eased harder)
  //   follow <target> <dx,dy,dz>
  //   hold  <x,y,z> look <target>
  function camera(spec) {
    const p = String(spec || '').trim().split(/\s+/);
    const kind = p[0];
    if (!kind) return null;
    if (kind === 'orbit') {
      const [, t, r, h, a0, a1] = p;
      return (cam, k) => { const c = where(t), a = (lerp(+a0, +a1, ease(k)) * Math.PI) / 180; cam.position.set(c[0] + +r * Math.cos(a), c[1] + +h, c[2] + +r * Math.sin(a)); cam.lookAt(c[0], c[1], c[2]); };
    }
    if (kind === 'push') {
      const [, t, d0, d1, h, ang = 30] = p;
      return (cam, k) => { const c = where(t), d = lerp(+d0, +d1, ease(k)), a = (+ang * Math.PI) / 180; cam.position.set(c[0] + d * Math.cos(a), c[1] + +h, c[2] + d * Math.sin(a)); cam.lookAt(c[0], c[1], c[2]); };
    }
    if (kind === 'dolly' || kind === 'fly') {
      const a = vec(p[1]), b = vec(p[2]), t = p[4];
      const e = kind === 'fly' ? (x) => ease(ease(x)) : (x) => x;
      return (cam, k) => { const q = e(k), c = where(t); cam.position.set(lerp(a[0], b[0], q), lerp(a[1], b[1], q), lerp(a[2], b[2], q)); cam.lookAt(c[0], c[1], c[2]); };
    }
    if (kind === 'follow') {
      const t = p[1], off = vec(p[2] || '0,6,14');
      return (cam) => { const c = where(t); cam.position.set(c[0] + off[0], c[1] + off[1], c[2] + off[2]); cam.lookAt(c[0], c[1], c[2]); };
    }
    if (kind === 'hold') {
      const a = vec(p[1]), t = p[3];
      return (cam) => { const c = where(t); cam.position.set(a[0], a[1], a[2]); cam.lookAt(c[0], c[1], c[2]); };
    }
    throw new Error('makevideo: unknown camera move "' + kind + '"');
  }
  // apply the shot camera right before every render, so it wins over the game's own camera code
  function hookRender() {
    if (mv.hooked || !ready()) return;
    const r = window.makevideo.renderer, orig = r.render.bind(r);
    r.render = (scene, cam) => { if (mv.shotCam && cam === window.makevideo.camera) { try { mv.shotCam.fn(cam, Math.min(1, (performance.now() - mv.shotCam.t0) / mv.shotCam.ms)); } catch (e) { console.error(e); } } return orig(scene, cam); };
    mv.hooked = true;
  }
  function stream(fps) {
    const s = window.makevideo.renderer.domElement.captureStream(fps);
    const audio = window.makevideo.audio; // optional: an AudioNode carrying the game's master mix
    if (audio && audio.context) { const d = audio.context.createMediaStreamDestination(); audio.connect(d); d.stream.getAudioTracks().forEach((t) => s.addTrack(t)); }
    return s;
  }
  function recorder(fps) {
    const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
    return new MediaRecorder(stream(fps), { mimeType: type, videoBitsPerSecond: 24e6 });
  }
  const b64 = async (blob) => { const u = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitReady() { for (let i = 0; i < 600 && !ready(); i++) await sleep(50); if (!ready()) throw new Error('makevideo: set window.makevideo = { renderer, scene, camera } in your game'); hookRender(); }

  // ---- frame-stepped capture: the game runs on virtual time, exactly 1/fps per frame, so the
  // footage is perfectly smooth even if this machine renders the game at 20 fps.
  const real = { raf: window.requestAnimationFrame.bind(window), now: performance.now.bind(performance), dateNow: Date.now, st: window.setTimeout.bind(window), ct: window.clearTimeout.bind(window), si: window.setInterval.bind(window), ci: window.clearInterval.bind(window) };
  let vt = 0, tid = 0, rafQ = [], timers = [];
  function virtualTime(on) {
    if (on) {
      vt = real.now(); const base = real.dateNow() - vt;
      window.requestAnimationFrame = (cb) => (rafQ.push(cb), rafQ.length);
      performance.now = () => vt;
      Date.now = () => Math.round(base + vt);
      window.setTimeout = (fn, ms = 0, ...a) => (timers.push({ id: ++tid, at: vt + ms, fn: () => fn(...a) }), tid);
      window.setInterval = (fn, ms = 0, ...a) => (timers.push({ id: ++tid, at: vt + ms, every: Math.max(1, ms), fn: () => fn(...a) }), tid);
      window.clearTimeout = window.clearInterval = (id) => { timers = timers.filter((t) => t.id !== id); };
    } else {
      window.requestAnimationFrame = real.raf; performance.now = real.now; Date.now = real.dateNow;
      window.setTimeout = real.st; window.clearTimeout = real.ct; window.setInterval = real.si; window.clearInterval = real.ci;
      const q = rafQ.splice(0); for (const cb of q) real.raf(cb);
      for (const t of timers.splice(0)) real.st(t.fn, Math.max(0, t.at - vt));
    }
  }
  function step(ms) {
    vt += ms;
    for (const t of timers.filter((x) => x.at <= vt)) { try { t.fn(); } catch (e) { console.error(e); } if (t.every) t.at += t.every; else timers = timers.filter((x) => x !== t); }
    const q = rafQ.splice(0);
    for (const cb of q) { try { cb(vt); } catch (e) { console.error(e); } }
  }
  let shotState = null;
  /** Start a frame-stepped shot: resize, freeze time, run setup, settle. */
  mv.begin = async (shot) => {
    await waitReady();
    const { renderer: r, camera: cam } = window.makevideo;
    const w = shot.width || 1920, h = shot.height || 1080, fps = shot.fps || 30;
    shotState = { fps, before: { ratio: r.getPixelRatio(), w: r.domElement.width / r.getPixelRatio(), h: r.domElement.height / r.getPixelRatio(), aspect: cam.aspect } };
    r.setPixelRatio(1); r.setSize(w, h, false);
    if (cam.isPerspectiveCamera) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
    await new Promise((res) => real.raf(res)); // let the game queue its next frame
    virtualTime(true);
    if (shot.setup) await new Function('return (async () => {' + shot.setup + '\n})()')();
    const settle = Math.round((shot.wait ?? 0.5) * fps);
    for (let i = 0; i < settle; i++) step(1000 / fps);
    const fn = camera(shot.camera);
    mv.shotCam = fn ? { fn, t0: vt, ms: (shot.seconds ?? 4) * 1000 } : null;
    return true;
  };
  /** Advance n frames and return them as base64 JPEGs. */
  mv.frames = (n) => {
    const c = window.makevideo.renderer.domElement, out = [];
    for (let i = 0; i < n; i++) { step(1000 / shotState.fps); out.push(c.toDataURL('image/jpeg', 0.95).slice(23)); }
    return out;
  };
  mv.end = () => {
    mv.shotCam = null;
    virtualTime(false);
    const { renderer: r, camera: cam } = window.makevideo, b = shotState.before;
    r.setPixelRatio(b.ratio); r.setSize(b.w, b.h, false);
    if (cam.isPerspectiveCamera) { cam.aspect = b.aspect; cam.updateProjectionMatrix(); }
    return true;
  };

  /** Real-time shot (keeps game audio): setup code, settle, camera move, record. Returns base64 webm. */
  mv.shoot = async (shot) => {
    await waitReady();
    if (shot.setup) await new Function('return (async () => {' + shot.setup + '\n})()')();
    // render at the trailer's resolution regardless of the window size, then put it back
    const { renderer: r, camera: cam } = window.makevideo;
    const w = shot.width || 1920, h = shot.height || 1080;
    const before = { ratio: r.getPixelRatio(), w: r.domElement.width / r.getPixelRatio(), h: r.domElement.height / r.getPixelRatio(), aspect: cam.aspect };
    r.setPixelRatio(1); r.setSize(w, h, false);
    if (cam.isPerspectiveCamera) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
    await sleep((shot.wait ?? 0.5) * 1000);
    const ms = (shot.seconds ?? 4) * 1000;
    const fn = camera(shot.camera);
    const rec = recorder(shot.fps ?? 60), chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((res) => (rec.onstop = res));
    mv.shotCam = fn ? { fn, t0: performance.now(), ms } : null;
    rec.start(250);
    await sleep(ms);
    rec.stop();
    await done;
    mv.shotCam = null;
    r.setPixelRatio(before.ratio); r.setSize(before.w, before.h, false);
    if (cam.isPerspectiveCamera) { cam.aspect = before.aspect; cam.updateProjectionMatrix(); }
    return b64(new Blob(chunks, { type: 'video/webm' }));
  };

  /** Instant replay: keep rolling 5 s segments; save the last few on demand. */
  mv.startReplay = async (seconds) => {
    await waitReady();
    mv.replayOn = true; mv.keep = Math.ceil(seconds / 5) + 1;
    (async function loop() {
      while (mv.replayOn) {
        const rec = recorder(60), chunks = [];
        rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
        const done = new Promise((r) => (rec.onstop = r));
        rec.start(1000);
        await sleep(5000);
        rec.stop(); await done;
        mv.segments.push(new Blob(chunks, { type: 'video/webm' }));
        while (mv.segments.length > mv.keep) mv.segments.shift();
      }
    })();
  };
  mv.replay = async () => Promise.all(mv.segments.map(b64));
  return true;
})()`;

function ffmpegPath() {
  try { return require('ffmpeg-static'); } catch { return 'ffmpeg'; }
}

/**
 * Attach makevideo to a BrowserWindow.
 * @param {Electron.BrowserWindow} win
 * @param {object} [o]
 * @param {number} [o.port=7377]          control port for `makevideo shoot` (only when MAKEVIDEO_SHOTS=1)
 * @param {string|false} [o.replayKey='F8']  instant-replay hotkey (false disables)
 * @param {number} [o.replaySeconds=15]
 * @param {string} [o.dir='makevideo-clips']  where replays are saved
 */
function attach(win, o = {}) {
  const { port = Number(process.env.MAKEVIDEO_PORT) || 7377, replayKey = 'F8', replaySeconds = 15, dir = 'makevideo-clips' } = o;
  const wc = win.webContents;
  const inject = () => wc.executeJavaScript(RENDERER).catch((e) => console.error('[makevideo]', e));
  wc.on('did-finish-load', async () => {
    await inject();
    if (replayKey && !process.env.MAKEVIDEO_SHOTS) wc.executeJavaScript(`window.__mv.startReplay(${replaySeconds})`).catch(() => {});
  });

  if (replayKey) {
    wc.on('before-input-event', async (_e, input) => {
      if (input.type !== 'keyDown' || input.key !== replayKey) return;
      try {
        const segs = await wc.executeJavaScript('window.__mv.replay()');
        if (!segs.length) return;
        fs.mkdirSync(dir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const parts = segs.map((b, i) => { const f = path.join(dir, `.seg-${stamp}-${i}.webm`); fs.writeFileSync(f, Buffer.from(b, 'base64')); return f; });
        const list = path.join(dir, `.list-${stamp}.txt`);
        fs.writeFileSync(list, parts.map((f) => `file '${path.resolve(f).replace(/\\/g, '/')}'`).join('\n'));
        const out = path.join(dir, `replay-${stamp}.mp4`);
        const p = spawn(ffmpegPath(), ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-c:a', 'aac', out]);
        p.on('close', () => { for (const f of [...parts, list]) fs.rmSync(f, { force: true }); console.log('[makevideo] replay saved:', out); });
      } catch (e) { console.error('[makevideo] replay failed:', e); }
    });
  }

  if (process.env.MAKEVIDEO_SHOTS) {
    wc.setBackgroundThrottling(false); // keep rendering at full rate even if the window is covered
    const server = http.createServer(async (req, res) => {
      const reply = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (req.url === '/ping') return reply(200, { ok: true });
      if (req.url !== '/shot' || req.method !== 'POST') return reply(404, { ok: false });
      let body = '';
      req.on('data', (d) => (body += d));
      req.on('end', async () => {
        try {
          const shot = JSON.parse(body);
          await inject();
          fs.mkdirSync(path.dirname(shot.file), { recursive: true });
          if (shot.mode === 'realtime') {
            const b64 = await wc.executeJavaScript(`window.__mv.shoot(${JSON.stringify(shot)})`);
            fs.writeFileSync(shot.file, Buffer.from(b64, 'base64'));
            return reply(200, { ok: true, file: shot.file, mode: 'realtime' });
          }
          // frame-stepped: pull JPEG frames in batches and pipe them straight into ffmpeg
          const fps = shot.fps || 30, total = Math.round((shot.seconds ?? 4) * fps);
          await wc.executeJavaScript(`window.__mv.begin(${JSON.stringify(shot)})`);
          const ff = spawn(ffmpegPath(), ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'fast', '-crf', '14', '-pix_fmt', 'yuv420p', '-f', 'matroska', shot.file]);
          let ffErr = '';
          ff.stderr.on('data', (d) => (ffErr += d));
          const closed = new Promise((r) => ff.on('close', r));
          try {
            for (let i = 0; i < total; i += 10) {
              const batch = await wc.executeJavaScript(`window.__mv.frames(${Math.min(10, total - i)})`);
              for (const b of batch) if (!ff.stdin.write(Buffer.from(b, 'base64'))) await new Promise((r) => ff.stdin.once('drain', r));
            }
          } finally {
            ff.stdin.end();
            await wc.executeJavaScript('window.__mv.end()').catch(() => {});
          }
          const code = await closed;
          if (code !== 0) throw new Error('ffmpeg: ' + ffErr.slice(-500));
          reply(200, { ok: true, file: shot.file, frames: total, mode: 'frames' });
        } catch (e) { reply(500, { ok: false, error: String((e && e.message) || e) }); }
      });
    });
    server.listen(port, '127.0.0.1');
    win.on('closed', () => server.close());
  }
}

module.exports = { attach, RENDERER };
