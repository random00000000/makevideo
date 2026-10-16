// Neon Drift: a tiny arena shooter that exists to be filmed. It plays itself (autopilot) so a
// shot always has action; WASD takes over. The trailer-facing parts are:
//   window.makevideo = { renderer, scene, camera }   ← makevideo needs this one line
//   window.game = { wave, boss, slowmo, reset, calm } ← shot setup code calls these
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#04050b');
scene.fog = new THREE.FogExp2('#04050b', 0.018);
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 400);
camera.position.set(0, 14, 26);

window.makevideo = { renderer, scene, camera };

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.4, 0.35);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- arena
scene.add(new THREE.HemisphereLight('#4060ff', '#100010', 0.5));
const sun = new THREE.DirectionalLight('#ffffff', 1.2);
sun.position.set(10, 30, 10);
scene.add(sun);

const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshStandardMaterial({ color: '#070912', roughness: 0.35, metalness: 0.6 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const grid = new THREE.GridHelper(120, 60, '#1de9ff', '#1a2a66');
grid.material.transparent = true; grid.material.opacity = 0.6;
scene.add(grid);

const neon = (c, i = 3) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.4 });
const pylons = [];
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2;
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 9, 12), neon(i % 2 ? '#ff2bd6' : '#1de9ff', 2.2));
  p.position.set(Math.cos(a) * 38, 4.5, Math.sin(a) * 38);
  scene.add(p);
  pylons.push(p);
}
const ring = new THREE.Mesh(new THREE.TorusGeometry(38, 0.25, 8, 160), neon('#1de9ff', 2));
ring.rotation.x = Math.PI / 2; ring.position.y = 9;
scene.add(ring);

// stars
const starGeo = new THREE.BufferGeometry();
const sp = new Float32Array(3000);
for (let i = 0; i < 1000; i++) { const r = 150 + Math.random() * 100, a = Math.random() * Math.PI * 2, y = Math.random() * 120 + 10; sp.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3); }
starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#8fb4ff', size: 0.7, fog: false })));

// ---------------------------------------------------------------- hero
const hero = new THREE.Group();
hero.name = 'hero';
const hull = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.2, 6), new THREE.MeshStandardMaterial({ color: '#d8e6ff', metalness: 0.8, roughness: 0.25 }));
hull.rotation.x = Math.PI / 2;
hero.add(hull);
const wings = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.12, 1.1), neon('#1de9ff', 1.6));
wings.position.z = 0.5;
hero.add(wings);
const engine = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 12), neon('#7df9ff', 3.5));
engine.position.z = 1.7;
hero.add(engine);
const heroLight = new THREE.PointLight('#1de9ff', 6, 12);
hero.add(heroLight);
hero.position.set(0, 2, 0);
scene.add(hero);

// ---------------------------------------------------------------- enemies, boss, fx
const drones = [];
const droneGeo = new THREE.OctahedronGeometry(0.9);
function spawnDrone(a = Math.random() * Math.PI * 2, r = 30) {
  const d = new THREE.Mesh(droneGeo, neon('#ff2bd6', 2.8));
  d.position.set(Math.cos(a) * r, 2 + Math.random() * 3, Math.sin(a) * r);
  d.userData = { hp: 1, phase: Math.random() * 10 };
  scene.add(d);
  drones.push(d);
}

let titan = null;
function spawnBoss() {
  if (titan) return titan;
  titan = new THREE.Group();
  titan.name = 'titan';
  const body = new THREE.Mesh(new THREE.TorusKnotGeometry(3.2, 0.8, 180, 20), new THREE.MeshStandardMaterial({ color: '#2a0a2a', metalness: 0.9, roughness: 0.3, emissive: '#ff2b6a', emissiveIntensity: 0.6 }));
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), neon('#ffcf33', 5));
  titan.add(body, core);
  titan.add(new THREE.PointLight('#ff3b6a', 120, 40));
  titan.position.set(0, 7, -18);
  titan.userData = { body, core, hp: 60 };
  scene.add(titan);
  return titan;
}

const bolts = [];
const boltGeo = new THREE.CapsuleGeometry(0.12, 1.4, 4, 8);
const boltMat = neon('#9bffef', 6);
function fire(from, to) {
  const b = new THREE.Mesh(boltGeo, boltMat);
  b.position.copy(from);
  const v = to.clone().sub(from).normalize().multiplyScalar(60);
  b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.clone().normalize());
  b.userData = { v, life: 1.2 };
  scene.add(b);
  bolts.push(b);
}

const sparks = [];
const sparkGeo = new THREE.SphereGeometry(0.12, 6, 6);
function explode(pos, color = '#ff2bd6', n = 40) {
  const mat = neon(color, 6);
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(sparkGeo, mat);
    s.position.copy(pos);
    s.userData = { v: new THREE.Vector3().randomDirection().multiplyScalar(8 + Math.random() * 18), life: 0.6 + Math.random() * 0.8 };
    scene.add(s);
    sparks.push(s);
  }
  const flash = new THREE.PointLight(color, 300, 30);
  flash.position.copy(pos);
  flash.userData = { life: 0.25 };
  scene.add(flash);
  sparks.push(flash);
  shake = Math.min(1, shake + 0.35);
}

// ---------------------------------------------------------------- game API (shot setup code calls this)
let timeScale = 1, shake = 0, autopilot = true, quiet = false;
const keys = {};
addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; if ('wasd'.includes(e.key.toLowerCase())) autopilot = false; });
addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));

window.game = {
  /** spawn n drones in a ring */
  wave(n = 12) { quiet = false; for (let i = 0; i < n; i++) spawnDrone((i / n) * Math.PI * 2, 22 + Math.random() * 10); },
  /** bring in the titan */
  boss() { return spawnBoss(); },
  slowmo(x = 0.3) { timeScale = x; },
  /** no enemies, gentle flight: for calm opening shots */
  calm() { quiet = true; for (const o of [...drones.splice(0), ...bolts.splice(0), ...sparks.splice(0)]) scene.remove(o); if (titan) { scene.remove(titan); titan = null; } },
  reset() { this.calm(); quiet = false; timeScale = 1; shake = 0; autopilot = true; },
  explode: (x = 0, y = 3, z = 0) => explode(new THREE.Vector3(x, y, z), '#ffcf33', 80),
};

// ---------------------------------------------------------------- loop
const clock = new THREE.Clock();
let t = 0, fireCd = 0;
function tick() {
  const dt = Math.min(0.05, clock.getDelta()) * timeScale;
  t += dt;

  // hero: autopilot figure-eight, or WASD
  const prev = hero.position.clone();
  if (autopilot) hero.position.set(Math.sin(t * 0.5) * 16, 2.2 + Math.sin(t * 1.3) * 0.6, Math.sin(t) * 9);
  else {
    const sp = 18 * dt;
    if (keys.w) hero.position.z -= sp; if (keys.s) hero.position.z += sp;
    if (keys.a) hero.position.x -= sp; if (keys.d) hero.position.x += sp;
  }
  const vel = hero.position.clone().sub(prev);
  if (vel.lengthSq() > 1e-6) hero.lookAt(hero.position.clone().sub(vel)); // cone points along -z of travel
  hero.rotation.z = THREE.MathUtils.clamp(-vel.x * 4, -0.7, 0.7);
  engine.scale.setScalar(1 + Math.sin(t * 40) * 0.15);

  // drones swarm the hero
  for (const d of drones) {
    const to = hero.position.clone().sub(d.position);
    d.position.addScaledVector(to.normalize(), dt * 5);
    d.position.y = 2.5 + Math.sin(t * 3 + d.userData.phase) * 1.2;
    d.rotation.x += dt * 3; d.rotation.y += dt * 2;
  }
  if (!drones.length && !titan && autopilot && !quiet && t > 2) window.game.wave(10);

  // auto-fire at the nearest target
  fireCd -= dt;
  const target = titan || drones.reduce((b, d) => (!b || d.position.distanceTo(hero.position) < b.position.distanceTo(hero.position) ? d : b), null);
  if (target && fireCd <= 0) { fire(hero.position, target.position.clone()); fireCd = 0.09; }

  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.position.addScaledVector(b.userData.v, dt);
    b.userData.life -= dt;
    let hit = false;
    for (let j = drones.length - 1; j >= 0; j--) if (drones[j].position.distanceTo(b.position) < 1.3) { explode(drones[j].position); scene.remove(drones[j]); drones.splice(j, 1); hit = true; break; }
    if (!hit && titan && titan.position.distanceTo(b.position) < 4) {
      hit = true;
      titan.userData.hp--;
      if (titan.userData.hp <= 0) { explode(titan.position, '#ffcf33', 220); scene.remove(titan); titan = null; }
    }
    if (hit || b.userData.life <= 0) { scene.remove(b); bolts.splice(i, 1); }
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.userData.life -= dt;
    if (s.isLight) s.intensity *= 0.85;
    else { s.position.addScaledVector(s.userData.v, dt); s.userData.v.multiplyScalar(0.94); s.scale.setScalar(Math.max(0.01, s.userData.life)); }
    if (s.userData.life <= 0) { scene.remove(s); sparks.splice(i, 1); }
  }
  if (titan) {
    titan.userData.body.rotation.y += dt * 0.8; titan.userData.body.rotation.x += dt * 0.3;
    titan.userData.core.scale.setScalar(1 + Math.sin(t * 6) * 0.12);
    titan.position.x = Math.sin(t * 0.4) * 8;
  }
  for (const [i, p] of pylons.entries()) p.material.emissiveIntensity = 1.6 + Math.sin(t * 2 + i) * 0.8;
  ring.rotation.z += dt * 0.1;

  // default game camera: chase cam with shake (makevideo overrides it during shots)
  const want = hero.position.clone().add(new THREE.Vector3(0, 10, 20));
  camera.position.lerp(want, 0.06);
  camera.lookAt(hero.position);
  if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake *= 0.9; }

  composer.render();
  requestAnimationFrame(tick);
}

// the composer must follow the drawing-buffer size (makevideo renders shots at 1920x1080)
const sizeComposer = () => {
  const s = renderer.getDrawingBufferSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();
  composer.setPixelRatio(pr);
  composer.setSize(s.x / pr, s.y / pr);
};
const setSize = renderer.setSize.bind(renderer);
renderer.setSize = (w, h, css) => { setSize(w, h, css); sizeComposer(); };
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

window.game.wave(10);
tick();
