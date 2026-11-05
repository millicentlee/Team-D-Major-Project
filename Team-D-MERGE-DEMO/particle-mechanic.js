// particle-mechanic.js
// ParticleController owns the interactive particle sandbox. After the drawn
// lines dissolve into particles, the glass stays on screen. Particles inside
// the glass fall with gravity and flow along the glass, particles outside
// drift slowly. The mouse pushes particles around and the hand tool drags a
// group of particles.

// ----- settings -----
const GRAVITY = 0.0;       // TEMP: zero gravity to inspect pure curl circulation
const PARTICLE_DRAG = 0.98; // velocity kept each frame inside the glass
const CURL_FORCE = 130;    // strength of the curl-noise current inside the glass
const SURFACE_BAND = 70;   // band below the rim where the surface pushes back
const SURFACE_FORCE = 0.5; // downward push keeping particles inside the rim
const FLOAT_FORCE = 0.06;   // strength of the slow drift outside the glass
const FLOAT_DRAG = 0.95;    // velocity kept each frame outside the glass
const ENTRY_PULL = 0.4;     // downward pull near the open rim
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

// [OUT OF SCOPE] curl noise: the curl (rotation) of a Perlin scalar field gives
// a divergence-free flow, so particles circulate smoothly without bunching on
// one side. The partial derivatives are approximated by sampling noise on each
// side of the point and taking the difference
function curlNoise(x, y, t) {
  const eps = 1.0;
  const n = function (px, py) {
    return noise(px * 0.004, py * 0.004, t * 0.0025);
  };
  // rate of change along x and y (finite difference)
  const ddx = (n(x + eps, y) - n(x - eps, y)) / (2 * eps);
  const ddy = (n(x, y + eps) - n(x, y - eps)) / (2 * eps);
  // curl in 2D: x velocity from the y derivative, y from the x derivative
  return { x: ddy, y: -ddx };
}

class ParticleController {
  constructor() {
    this.particles = [];
    this.grabbed = [];   // particles being dragged by the hand tool
    this.maskReady = false;
  }

  // prepare the sandbox once: empty particles and build the inside mask
  prepare() {
    this.particles = [];
    this.grabbed = [];
    if (!this.maskReady) {
      this.buildInsideMask();
      this.maskReady = true;
    }
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
    // 1 where the collision image is drawn (the glass wall)
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

  // true if a canvas point sits on the rim opening band (just above the rim)
  isAtRim(cx, cy) {
    const r = getGlassRect();
    const W = glassCollisionImg.width;
    const H = glassCollisionImg.height;
    const rimCanvasY = r.y + (rimInfo.y / H) * r.h;
    const rimCanvasLeft = r.x + (rimInfo.left / W) * r.w;
    const rimCanvasRight = r.x + (rimInfo.right / W) * r.w;
    return (
      cx > rimCanvasLeft &&
      cx < rimCanvasRight &&
      cy > rimCanvasY - 50 &&
      cy < rimCanvasY
    );
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
    // position constraint: hard-resolve overlaps so the liquid keeps its volume
    this.resolveOverlaps();
  }

  // [OUT OF SCOPE] spatial grid: the canvas is split into squares the same
  // width as the closest spacing allowed. Each inside particle is dropped
  // into the square it sits in, together with its place in the particle list.
  // The squares are rebuilt every pass because the particles move. To find
  // who is close, you open one square and the eight squares that touch it,
  // instead of comparing every particle with every other. Filling the squares
  // is one walk over the list, and each particle then only meets the ones
  // nearby, so the work stays close to one step per particle instead of the
  // count times itself.
  buildSpatialGrid() {
    const grid = {};
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.inside) continue;
      const gx = Math.floor(p.x / MIN_DIST);
      const gy = Math.floor(p.y / MIN_DIST);
      const key = gx + "," + gy;
      if (!grid[key]) grid[key] = [];
      grid[key].push({ particle: p, index: i });
    }
    return grid;
  }

  // [OUT OF SCOPE] spatial grid lookup: each particle only checks the square
  // it sits in and the eight squares around it. Two particles closer than the
  // minimum spacing must be in the same square or a neighbouring one, so no
  // overlap is missed, and anything farther away needs no correction. Using
  // the higher list index keeps each pair handled once. The grid is one walk
  // over the particles, and the checks stay local, so this pass stays close
  // to one step per particle instead of every particle against every other.
  // [OUT OF SCOPE] position-based constraint: instead of pushing particles with
  // a repulsion force, overlapping particles are moved apart directly in space.
  // This reliably keeps the liquid incompressible so it builds a real volume
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
                // split the correction between the particles that are free to move
                if (!aFixed) {
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
  }

  update() {
    this.inside = particleCtrl.isInside(this.x, this.y);
    if (this.inside) {
      // gravity settles the liquid toward the bottom
      this.vy += GRAVITY;
      // curl noise drives a smooth, divergence-free current so the liquid
      // circulates in swirls without bunching on one side
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
      // move in small steps so a particle cannot jump over the thin wall.
      // only a new position that stays inside the glass is accepted; if the
      // wall blocks it, keep the velocity and let the evolving flow field
      // point a free direction next frame instead of freezing the particle
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
      // slow Perlin drift outside the glass
      const ang = noise(this.x * 0.005, this.y * 0.005, frameCount * 0.003) * TWO_PI * 2;
      this.vx += cos(ang) * FLOAT_FORCE;
      this.vy += sin(ang) * FLOAT_FORCE;
      // at the open rim, ease it downward so it can drop into the glass
      if (particleCtrl.isAtRim(this.x, this.y)) this.vy += ENTRY_PULL;
      this.vx *= FLOAT_DRAG;
      this.vy *= FLOAT_DRAG;
      // move in small steps and slide along the wall
      const total = Math.hypot(this.vx, this.vy);
      const steps = Math.max(1, Math.ceil(total / 2));
      const sx = this.vx / steps;
      const sy = this.vy / steps;
      for (let i = 0; i < steps; i++) {
        const nx = this.x + sx;
        const ny = this.y + sy;
        if (!glassCollision(nx, ny)) {
          this.x = nx;
          this.y = ny;
        } else {
          if (!glassCollision(nx, this.y)) this.x = nx;
          if (!glassCollision(this.x, ny)) this.y = ny;
        }
      }
      // outside particles wrap around the screen edges so they stay in view
      if (this.x < 0) this.x = width;
      if (this.x > width) this.x = 0;
      if (this.y < 0) this.y = height;
      if (this.y > height) this.y = 0;
    }
  }

  display() {
    noStroke();
    fill(this.hue, 70, 100, 80);
    circle(this.x, this.y, PARTICLE_SIZE);
  }
}
