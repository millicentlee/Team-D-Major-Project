// particle-mechanic.js
// after a line dissolves, the bits stay in the glass.
// inside they flow with the curl, outside they drift or sit on the attractor.
// the mouse pushes them, the hand drags a bunch.

// ----- settings -----
const GRAVITY = 0.0;       // TEMP: zero gravity to inspect pure curl circulation
const PARTICLE_DRAG = 0.98; // velocity kept each frame inside the glass
const CURL_FORCE = 60;    // strength of the curl-noise current inside the glass
const SURFACE_BAND = 70;   // band below the rim where the surface pushes back
const SURFACE_FORCE = 0.5; // downward push keeping particles inside the rim
const DISTURB_RADIUS = 60;  // how far the mouse pushes particles
const DISTURB_FORCE = 2.5;  // how hard the mouse pushes
const GRAB_RADIUS = 90;     // range of particles grabbed by the hand tool
const PARTICLE_SIZE = 5;
const MIN_DIST = 9;        // closest allowed spacing between inside particles
const CONSTRAINT_ITERS = 1; // how many times overlap is resolved each frame
const INITIAL_SPEED_CAP = 4; // max momentum carried over when a dissolve ends

// mask of the inside of the glass, one entry per wall-image pixel
let insideMask;
// rim (cup opening) position in collision-image coordinates
let rimInfo;

// [OUT OF SCOPE] curl of a noise field, so the flow swirls instead of clumping
function curlNoise(x, y, t) {
  const eps = 1.0;
  const n = function (px, py) {
    return noise(px * 0.004, py * 0.004, t * 0.005);
  };
  const ddx = (n(x + eps, y) - n(x - eps, y)) / (2 * eps);
  const ddy = (n(x, y + eps) - n(x, y - eps)) / (2 * eps);
  return { x: ddy, y: -ddx };
}

class ParticleController {
  constructor() {
    this.particles = [];
    this.grabbed = [];   // particles being dragged by the hand tool
    this.maskReady = false;
  }

  // prepare once: empty the list and build the inside mask
  prepare() {
    this.particles = [];
    this.grabbed = [];
    if (!this.maskReady) {
      this.buildInsideMask();
      this.maskReady = true;
    }
  }

  // wipe the drawing, including anything sitting in the cup.
  // a fixed attractor particle only stays if it is still outside.
  clear() {
    const kept = [];
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.fixed && !this.isInside(p.x, p.y)) kept.push(p);
    }
    this.particles = kept;
    this.grabbed = [];
  }

  // add more particles from a later dissolve to the existing ones
  addParticles(particles) {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      this.particles.push(new Particle(p.x, p.y, p.hue, p.vx, p.vy));
    }
  }

  // build a mask that marks pixels inside the glass, plus the rim position
  buildInsideMask() {
    const img = glassCollisionImg;
    const W = img.width;
    const H = img.height;
    const px = img.pixels;
    // 1 on the glass wall pixels
    // [OUT OF SCOPE] Uint8Array is a byte list for the mask. We didn't use these in class.
    const wall = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      if (px[i * 4 + 3] > 8) wall[i] = 1;
    }
    // find the rim: the first row from the top with two wall points far apart
    let rimY = -1;
    let rimLeft = -1;
    let rimRight = -1;
    for (let y = 0; y < H; y++) {
      let first = -1;
      let last = -1;
      for (let x = 0; x < W; x++) {
        if (wall[y * W + x]) {
          if (first < 0) first = x;
          last = x;
        }
      }
      if (first >= 0 && last - first > W * 0.2) {
        rimY = y;
        rimLeft = first;
        rimRight = last;
        break;
      }
    }
    rimInfo = { y: rimY, left: rimLeft, right: rimRight };
    // inside range is the solid fill of the wall image, sized to that image
    const maskW = glassWallImg.width;
    const maskH = glassWallImg.height;
    const wallPx = glassWallImg.pixels;
    insideMask = new Uint8Array(maskW * maskH);
    for (let i = 0; i < maskW * maskH; i++) {
      if (wallPx[i * 4 + 3] > 8) insideMask[i] = 1;
    }
  }

  // map a canvas point to a wall-image pixel; true if it sits on the solid fill
  isInside(cx, cy) {
    const r = getGlassRect();
    const W = glassWallImg.width;
    const H = glassWallImg.height;
    const mx = ((cx - r.x) / r.w) * W;
    const my = ((cy - r.y) / r.h) * H;
    const ix = floor(mx);
    const iy = floor(my);
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return false;
    return insideMask[iy * W + ix] === 1;
  }

  // canvas y of the rim line
  getRimY() {
    const r = getGlassRect();
    const H = glassCollisionImg.height;
    return r.y + (rimInfo.y / H) * r.h;
  }

  // push particles away from the mouse
  disturb(mx, my) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const d = dist(mx, my, p.x, p.y);
      if (d < DISTURB_RADIUS && d > 0.1) {
        const force = (1 - d / DISTURB_RADIUS) * DISTURB_FORCE;
        const ang = atan2(p.y - my, p.x - mx);
        p.vx += cos(ang) * force;
        p.vy += sin(ang) * force;
      }
    }
  }

  // hand tool: grab every particle in the range around the press point
  grabStart(x, y) {
    this.grabbed = [];
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (dist(x, y, p.x, p.y) < GRAB_RADIUS) {
        // offset keeps each particle's place relative to the grab point
        this.grabbed.push({ particle: p, offX: p.x - x, offY: p.y - y });
      }
    }
    if (tapSound) tapSound.play();
  }

  // hand tool: move the grabbed group, keeping their relative offsets
  grabDrag(x, y) {
    for (let i = 0; i < this.grabbed.length; i++) {
      const g = this.grabbed[i];
      const nx = x + g.offX;
      const ny = y + g.offY;
      // carry the motion as velocity so it continues after release
      g.particle.vx = nx - g.particle.x;
      g.particle.vy = ny - g.particle.y;
      g.particle.x = nx;
      g.particle.y = ny;
    }
  }

  // hand tool: let go of the grabbed group
  grabRelease() {
    this.grabbed = [];
  }

  update() {
    // the mouse disturbs particles only when no button is held, so drawing
    // a line and grabbing are not interrupted by disturbance
    if (!mouseIsPressed) this.disturb(mouseX, mouseY);
    // apply forces and move each particle
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!this.isGrabbed(p)) p.update();
    }
    // separate them when they overlap, so the liquid keeps its volume
    this.resolveOverlaps();
  }

  // [OUT OF SCOPE] split the canvas into cells so we only check neighbours, not every particle
  buildSpatialGrid() {
    const grid = {};
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.inside) continue;
      // [OUT OF SCOPE] Math.floor — we didn't cover the Math object in class
      const gx = Math.floor(p.x / MIN_DIST);
      const gy = Math.floor(p.y / MIN_DIST);
      const key = gx + "," + gy;
      if (!grid[key]) grid[key] = [];
      grid[key].push({ particle: p, index: i });
    }
    return grid;
  }

  // [OUT OF SCOPE] we move them apart directly instead of pushing with a force
  resolveOverlaps() {
    for (let iter = 0; iter < CONSTRAINT_ITERS; iter++) {
      const grid = this.buildSpatialGrid();
      for (let i = 0; i < this.particles.length; i++) {
        const a = this.particles[i];
        if (!a.inside || this.isGrabbed(a)) continue;
        const gx = Math.floor(a.x / MIN_DIST);
        const gy = Math.floor(a.y / MIN_DIST);
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            const cell = grid[(gx + ox) + "," + (gy + oy)];
            if (!cell) continue;
            for (let k = 0; k < cell.length; k++) {
              const entry = cell[k];
              if (entry.index <= i) continue;
              const b = entry.particle;
              if (!b.inside) continue;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const d = Math.hypot(dx, dy);
              if (d < MIN_DIST && d > 0.01) {
                const ux = dx / d;
                const uy = dy / d;
                const overlap = MIN_DIST - d;
                const aFixed = this.isGrabbed(a);
                const bFixed = this.isGrabbed(b);
                // free ones share the move; a grabbed one stays put
                if (!aFixed) {
                  // [OUT OF SCOPE] ? : is a one-line if/else. We didn't use this form in class.
                  const aShare = bFixed ? 1 : 0.5;
                  const nax = a.x - ux * overlap * aShare;
                  const nay = a.y - uy * overlap * aShare;
                  if (this.isInside(nax, nay)) { a.x = nax; a.y = nay; }
                }
                if (!bFixed) {
                  const bShare = aFixed ? 1 : 0.5;
                  const nbx = b.x + ux * overlap * bShare;
                  const nby = b.y + uy * overlap * bShare;
                  if (this.isInside(nbx, nby)) { b.x = nbx; b.y = nby; }
                }
              }
            }
          }
        }
      }
    }
  }

  // true if a particle is currently held by the hand tool
  isGrabbed(p) {
    for (let i = 0; i < this.grabbed.length; i++) {
      const g = this.grabbed[i];
      if (g.particle === p) return true;
    }
    return false;
  }

  render() {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.display();
    }
  }
}

// one particle: its motion depends on whether it is inside the glass
class Particle {
  constructor(x, y, hue, vx, vy) {
    this.x = x;
    this.y = y;
    this.hue = hue;
    this.inside = false;
    // carry the dissolve momentum so the motion continues into the sandbox,
    // but cap it so a fast particle eases into the liquid flow instead of
    // jumping. The drag and current then take over smoothly
    let ivx = vx || 0;
    let ivy = vy || 0;
    const sp = Math.hypot(ivx, ivy);
    if (sp > INITIAL_SPEED_CAP) {
      ivx = (ivx / sp) * INITIAL_SPEED_CAP;
      ivy = (ivy / sp) * INITIAL_SPEED_CAP;
    }
    this.vx = ivx;
    this.vy = ivy;
    // attractor state: drift position, box position, and the blend between them
    this.driftX = x;
    this.driftY = y;
    this.ax = (x - width / 2) / zoom;
    this.ay = (y - height / 2) / zoom;
    this.targetX = x;
    this.targetY = y;
    this.age = 0;
    this.handover = 0;
    this.fixed = false; // set once it is actually following the attractor
    // born outside: pick a mode here. beginOutside picks again each time it leaves
    this.mode = random() < 0.5 ? "drift" : "attractor";
  }

  update() {
    const wasInside = this.inside;
    this.inside = particleCtrl.isInside(this.x, this.y);
    if (this.inside) {
      // gravity settles the liquid toward the bottom
      this.vy += GRAVITY;
      const curl = curlNoise(this.x, this.y, frameCount);
      this.vx += curl.x * CURL_FORCE;
      this.vy += curl.y * CURL_FORCE;
      // surface tension: near the rim a downward push grows stronger, so the
      // current turns before it can reach the open rim
      const rimY = particleCtrl.getRimY();
      if (this.y < rimY + SURFACE_BAND) {
        const depth = (rimY + SURFACE_BAND - this.y) / SURFACE_BAND;
        this.vy += depth * SURFACE_FORCE;
      }
      this.vx *= PARTICLE_DRAG;
      this.vy *= PARTICLE_DRAG;
      // small steps, and only keep a step that is still inside the glass
      const total = Math.hypot(this.vx, this.vy);
      const steps = Math.max(1, Math.ceil(total / 2));
      const sx = this.vx / steps;
      const sy = this.vy / steps;
      for (let i = 0; i < steps; i++) {
        const nx = this.x + sx;
        const ny = this.y + sy;
        if (particleCtrl.isInside(nx, ny)) {
          this.x = nx;
          this.y = ny;
        }
      }
    } else {
      // outside the glass: restart the blend when leaving, then follow the attractor
      if (wasInside) attractorCtrl.beginOutside(this);
      attractorCtrl.updateOutside(this);
    }
  }

  display() {
    noStroke();
    fill(this.hue, 70, 100, 80);
    circle(this.x, this.y, PARTICLE_SIZE);
  }
}
