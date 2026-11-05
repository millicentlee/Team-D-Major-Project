// timebased-mechanic.js
// TimeController runs the line-dissolve in the background. Each group of
// finished strokes becomes a DissolveBatch that fades out over 4 seconds
// while particles are born along the lines. Several batches can run at
// once, so drawing is never blocked while a dissolve is happening.

// DecompParticle motion: ease toward a gentle drift instead of accelerating
// forever, so the line spreads like ink rather than bursting outward
const DECOMP_MAX_SPEED = 1.5; // drift speed approached but never exceeded
const DECOMP_ACCEL = 0.03;    // how quickly the drift speed is reached
const DECOMP_TURN = 0.08;     // how far the direction wanders each frame

class TimeController {
  constructor() {
    this.batches = [];            // dissolve batches currently running
    this.dissolveDuration = 4000; // ms for the lines to disappear
    // ink (length x thickness) needed to produce one particle. Calibrated so
    // a 200px pencil line (size 3) gives about 120 particles
    this.inkPerParticle = 5;
    this.minParticles = 12;
    this.maxParticles = 800;
  }

  // start a new background dissolve for a group of finished strokes
  startDissolve(strokes) {
    const amount = this.particleAmountFor(strokes);
    this.batches.push(new DissolveBatch(
      strokes, this.dissolveDuration, amount));
  }

  // number of particles reflects how much ink was drawn: each stroke's length
  // multiplied by its thickness, summed, then converted to a particle count
  particleAmountFor(strokes) {
    let ink = 0;
    for (let i = 0; i < strokes.length; i++) {
      const s = strokes[i];
      let length = 0;
      for (let i = 1; i < s.pts.length; i++) {
        length += dist(s.pts[i - 1].x, s.pts[i - 1].y,
                       s.pts[i].x, s.pts[i].y);
      }
      if (s.pts.length === 1) length = 1; // a single tap still has some ink
      ink += length * s.size;
    }
    const amount = round(ink / this.inkPerParticle);
    return constrain(amount, this.minParticles, this.maxParticles);
  }

  // update every batch and return particles from batches that just finished
  update() {
    const finished = [];
    for (let i = this.batches.length - 1; i >= 0; i--) {
      const b = this.batches[i];
      b.update();
      if (b.isDone()) {
        const parts = b.exportParticles();
        for (let j = 0; j < parts.length; j++) finished.push(parts[j]);
        this.batches.splice(i, 1);
      }
    }
    return finished;
  }

  render() {
    for (let i = 0; i < this.batches.length; i++) this.batches[i].render();
  }
}

// one group of strokes fading out together, with its own particles
class DissolveBatch {
  constructor(strokes, duration, totalAmount) {
    this.strokes = strokes;
    this.particles = [];
    this.startTime = millis();
    this.duration = duration;
    this.totalAmount = totalAmount;
    this.lastParticleAt = 0;
  }

  // 0..1 progress of this batch
  progress() {
    return constrain((millis() - this.startTime) / this.duration, 0, 1);
  }

  update() {
    const elapsed = millis() - this.startTime;
    const interval = this.duration / this.totalAmount;
    // spawn one particle per interval until the total is reached
    while (elapsed - this.lastParticleAt >= interval &&
           this.particles.length < this.totalAmount) {
      this.addParticle();
      this.lastParticleAt += interval;
    }
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].update();
    }
  }

  // pick a random point on a random stroke and spawn a particle there
  addParticle() {
    const all = [];
    for (let i = 0; i < this.strokes.length; i++) {
      const s = this.strokes[i];
      for (let j = 0; j < s.pts.length; j++) {
        all.push({ x: s.pts[j].x, y: s.pts[j].y, colour: s.hue });
      }
    }
    if (all.length === 0) return;
    const pt = random(all);
    this.particles.push(new DecompParticle(pt.x, pt.y, pt.colour));
  }

  isDone() {
    return millis() - this.startTime > this.duration;
  }

  // particle positions and velocities for the interactive particle sandbox
  exportParticles() {
    const out = [];
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const v = p.getVelocity();
      out.push({ x: p.pos.x, y: p.pos.y, hue: p.colour, vx: v.x, vy: v.y });
    }
    return out;
  }

  render() {
    const opacity = 1 - this.progress();
    for (let i = 0; i < this.strokes.length; i++) {
      this.drawFadingStroke(this.strokes[i], opacity);
    }
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].display();
    }
  }

  // draw one stroke with the given overall opacity (1 at the start, 0 at the end)
  drawFadingStroke(s, opacity) {
    if (s.pts.length === 0) return;
    // same full strength as a normal stroke of this tool, on the 0–100 alpha scale
    const startAlpha = BRUSH[s.tool].alpha * 100;
    // square the remaining life: the ink falls away in a curve that stays
    // easy to see across the whole dissolve, then eases out to nothing
    const alpha = startAlpha * opacity * opacity;
    push();
    stroke(s.hue, 80, 90, alpha);
    strokeWeight(s.size);
    strokeCap(ROUND);
    noFill();
    for (let i = 1; i < s.pts.length; i++) {
      const a = s.pts[i - 1];
      const b = s.pts[i];
      if (dist(a.x, a.y, b.x, b.y) > 15) continue; // erased gap
      line(a.x, a.y, b.x, b.y);
    }
    pop();
  }
}

// a single particle that starts still on a line and slowly speeds away
class DecompParticle {
  constructor(x, y, colour) {
    this.pos = createVector(x, y);
    this.speed = 0;
    this.angle = random(TWO_PI);
    this.colour = colour;
  }

  update() {
    // ease the speed toward a gentle cap so it never runs away
    this.speed += (DECOMP_MAX_SPEED - this.speed) * DECOMP_ACCEL;
    // slowly wander the direction so the motion reads as spreading ink
    this.angle += random(-DECOMP_TURN, DECOMP_TURN);
    this.pos.x += cos(this.angle) * this.speed;
    this.pos.y += sin(this.angle) * this.speed;
  }

  // current velocity vector: the travel direction multiplied by speed
  getVelocity() {
    return {
      x: cos(this.angle) * this.speed,
      y: sin(this.angle) * this.speed
    };
  }

  display() {
    noStroke();
    fill(this.colour, 100, 100, 50);
    circle(this.pos.x, this.pos.y, 5);
  }
}
