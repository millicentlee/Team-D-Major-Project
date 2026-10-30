// attractor-mechanic.js
// AttractorController owns the particle drift and attraction. Particles
// first drift with Perlin noise, then are taken over by a Clifford strange
// attractor and gather into a pattern.

// ----- settings -----
const DRIFT_SPEED = 0.6;     // how fast particles drift on the noise
const NOISE_SCALE = 0.004;   // size of the noise currents
const ATTRACTOR_SCALE = 2.0; // attractor size: 1 fills the screen, 2 runs off the edges
const DRIFT_FRAMES = 300;    // how long the Perlin drift scene lasts
const HANDOVER_FRAMES = 600; // frames to hand over from drift to the attractor

// the four numbers that decide the attractor's shape
const PRESET = { a: -1.4, b: 1.6, c: 1.0, d: 0.7 };

// zoom scales the attractor's small box up to the screen
let zoom;
// hidden layer where footprints build up the shape
let trace;

class AttractorController {
  constructor() {
    this.movers = [];
    this.mode = 1; // 1 = Perlin drift, 2 = attractor
    this.driftFrameCount = 0;
  }

  // enter the drift scene with particles from the previous mechanic
  initDrift(particles) {
    this.mode = 1;
    this.driftFrameCount = 0;
    // the attractor's box is about (1 + c) wide and (1 + d) tall;
    // scale it to the screen
    zoom = min(
      width / (2 * (1 + abs(PRESET.c))),
      height / (2 * (1 + abs(PRESET.d)))
    ) * ATTRACTOR_SCALE;
    // transparent trace layer so the colour background stays visible
    trace = createGraphics(width, height);
    trace.pixelDensity(1);
    trace.colorMode(HSB, 360, 100, 100, 100);
    trace.clear();
    this.movers = [];
    for (const p of particles) {
      const hue = p.hue !== undefined ? p.hue : 180;
      this.movers.push(new Mover(p.x, p.y, hue));
    }
  }

  // enter the attractor scene
  initAttract() {
    this.mode = 2;
    // Start the attractor iteration from each particle's current drift
    // position, then reset the handover. The first iterations are the short
    // "pull in" path that carries each particle onto the attractor.
    for (const m of this.movers) {
      m.ax = (m.driftX - width / 2) / zoom;
      m.ay = (m.driftY - height / 2) / zoom;
      m.age = 0;
      m.handover = 0;
    }
  }

  update() {
    if (this.mode === 1) {
      this.driftFrameCount++;
      for (const m of this.movers) m.driftUpdate();
    } else {
      for (const m of this.movers) m.attractUpdate();
    }
  }

  render() {
    image(trace, 0, 0);
    for (const m of this.movers) m.display();
  }

  // true once the Perlin drift has lasted long enough
  driftFinished() {
    return this.mode === 1 && this.driftFrameCount >= DRIFT_FRAMES;
  }
}

// one particle: it holds a drift position, and the drawn position blends
// from the drift position to the attractor position as handover rises
class Mover {
  constructor(x, y, hue) {
    this.driftX = x;
    this.driftY = y;
    this.targetX = x;
    this.targetY = y;
    this.x = x;
    this.y = y;
    // position in the attractor's small box
    this.ax = (x - width / 2) / zoom;
    this.ay = (y - height / 2) / zoom;
    this.hue = hue;
    this.age = 0;      // frames since the attractor took over
    this.handover = 0; // 0 = drift position, 1 = attractor position
  }

  // attractor rule: the next spot is calculated from the current spot
  step() {
    const p = PRESET;
    const nextX = sin(p.a * this.ay) + p.c * cos(p.a * this.ax);
    const nextY = sin(p.b * this.ax) + p.d * cos(p.b * this.ay);
    this.ax = nextX;
    this.ay = nextY;
    // convert back to pixels: this is the new target
    this.targetX = width / 2 + nextX * zoom;
    this.targetY = height / 2 + nextY * zoom;
    // leave a faint footprint once the attractor has some hold
    if (this.handover > 0.2) {
      trace.stroke(this.hue, 60, 100, 18);
      trace.point(this.targetX, this.targetY);
    }
  }

  // drift scene: Perlin noise gives a direction at each place
  driftUpdate() {
    const angle = noise(
      this.driftX * NOISE_SCALE,
      this.driftY * NOISE_SCALE,
      frameCount * 0.005
    ) * TWO_PI * 2;
    this.driftX += cos(angle) * DRIFT_SPEED;
    this.driftY += sin(angle) * DRIFT_SPEED;
    this.x = this.driftX;
    this.y = this.driftY;
  }

  // attract scene: the attractor iterates every frame while handover rises
  attractUpdate() {
    this.age++;
    const t = min(1, this.age / HANDOVER_FRAMES);
    // smoothstep: ease in and out
    this.handover = t * t * (3 - 2 * t);
    // 1. drift position keeps moving on the noise
    const angle = noise(
      this.driftX * NOISE_SCALE,
      this.driftY * NOISE_SCALE,
      frameCount * 0.005
    ) * TWO_PI * 2;
    this.driftX += cos(angle) * DRIFT_SPEED;
    this.driftY += sin(angle) * DRIFT_SPEED;
    // 2. attractor position: the next spot on the attractor
    this.step();
    // 3. drawn position slides from the drift spot to the attractor spot
    this.x = lerp(this.driftX, this.targetX, this.handover);
    this.y = lerp(this.driftY, this.targetY, this.handover);
  }

  display() {
    noStroke();
    fill(this.hue, 60, 100, 70);
    circle(this.x, this.y, 3);
  }
}
