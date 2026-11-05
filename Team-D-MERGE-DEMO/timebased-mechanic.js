// The maximum speed of particle dift.
let decompMaxSpeed = 1.5;
// How fast the particle  accelerate to reach the maximum drift speed.
let decompAccel = 0.03;
// Random offset smplitude in each frame.
let decompTurn = 0.08;

// ---------------------------------------------------------
// DecompParticle: A single particle that drifts away from the original stroke.
// ---------------------------------------------------------
class DecompParticle {
  constructor(x, y, colour) {
    this.pos = createVector(x,y);
    this.speed = 0; // stratSpeed is 0
    this.angle = random(TWO_PI);
    this.colour = colour;
  }

  update() {
    this.speed += (decompMaxSpeed - this.speed) * decompAccel;
    this.angle += random(-decompTurn, decompTurn);
    this.pos.x += cos(this.angle) * this.speed;
    this.pos.y += sin(this.angle) * this.speed;
  }

  getVelocity() {
    return {
      x: cos(this.angle) * this.speed,
      y: sin(this.angle) * this.speed
    }
  }

  display() {
    noStroke();
    fill(this.colour, 100, 100, 50);
    circle(this.pos.x, this.pos.y, 5);
  }
}


// ---------------------------------------------------------
// DissolveBatch: One group of strokes fading out together.
// ---------------------------------------------------------
class DissolveBatch {
  constructor(strokes, duration, totalAmount) {
    this.strokes = strokes;
    this.particles = [];
    this.startTime = millis();
    this.duration = duration;
    this.totalAmount = totalAmount;
    this.lastParticleAt = 0;
  }

  // 0 at the start, 1 when the dissolve ends
  progress () {
    return map(millis() - this.startTime, 0, this.duration, 0, 1, true);
  }

  update() {
    const elapsed = millis() - this.startTime;
    const interval = this.duration / this.totalAmount;

    while (elapsed - this.lastParticleAt >= interval && this.particles.length < this.totalAmount) {
      this.addParticle();
      this.lastParticleAt += interval;
    }

    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].update();
    }
  }

  addParticle() {
    const all = [];

    for (let i = 0; i < this.strokes.length; i++) {
      const s = this.strokes[i];
      for (let j = 0; j < s.pts.length; j++) {
        all.push({ x: s.pts[j].x, y: s.pts[j].y, colour: s.hue});
      }
    }

    if (all.length === 0) return;
    const pt = random(all);
    this.particles.push(new DecompParticle(pt.x, pt.y, pt.colour));
  }

  isDone() {
    return millis() - this.startTime > this.duration;
  }

  exportParticles() {
    const out = [];
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const v = p.getVelocity();
      out.push({ x: p.pos.x, y: p.pos.y, hue: p.colour, vx: v.x, vy: v.y});
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

  drawFadingStroke(s, opacity) {
    if (s.pts.length === 0) return;

    const startAlpha = BRUSH[s.tool].alpha * 100;
    const alpha = startAlpha * opacity * opacity;

    push();
    stroke(s.hue, 80, 90, alpha);
    strokeWeight(s.size);
    strokeCap(ROUND);
    noFill();

    for (let i = 1; i < s.pts.length; i++) {
      const a = s.pts[i - 1];
      const b = s.pts[i];

      if (dist(a.x, a.y, b.x, b.y) > 15) continue; // gap from the eraser, don't reconnect
      line(a.x, a.y, b.x, b.y);
    }
    pop();
  }
}


// ---------------------------------------------------------
// TimeController: Manage all the fading handwirting batches.
// ---------------------------------------------------------
class TimeController {
  constructor() {
    this.batches = [];
    this.dissolveDuration = 4000;
    this.inkPerParticle = 5;
    this.minParticles = 12;
    this.maxParticles = 800;
  }

   clear() {
     this.batches = [];
   }

   startDissolve(strokes) {
     const amount = this.particleAmountFor(strokes);
     this.batches.push(new DissolveBatch(
       strokes, this.dissolveDuration, amount));
   }

   particleAmountFor(strokes) {
     let ink = 0;

     for (let i = 0; i < strokes.length; i++) {
       const s = strokes[i];
       let length = 0;
       for (let j = 1; j < s.pts.length; j++) {
         length += dist(s.pts[j - 1].x, s.pts[j - 1].y,
                        s.pts[j].x, s.pts[j].y);
       }

       // Ink = length x thickness. A single tap still counts.
       if (s.pts.length === 1) length = 1;
       ink += length * s.size;
     }

     const amount = round(ink / this.inkPerParticle);
     return constrain(amount, this.minParticles, this.maxParticles);
   }

   update() {
     const finished = [];

     // go backwards so splice does not skip the next batch
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
