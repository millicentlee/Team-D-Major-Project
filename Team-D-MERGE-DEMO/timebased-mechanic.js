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
    this.pos = createVector(x,y); // The current position.
    this.speed = 0; // The current speed, starting at 0.
    this.angle = random(TWO_PI); // The current angle of movement, randomly initialized.
    this.colour = colour;
  }


  // Update the particle's state.
  update() {
    this.speed += (decompMaxSpeed - this.speed) * decompAccel; // Accelerate towards the maximum speed.
    this.angle += random(-decompTurn, decompTurn); // Randomly change the angle to create a drifting effect.
    this.pos.x += cos(this.angle) * this.speed;
    this.pos.y += sin(this.angle) * this.speed;
  }


  // Get the current velocity of the particle.
  getVelocity() {
    return {
      x: cos(this.angle) * this.speed,
      y: sin(this.angle) * this.speed
    }
  }


  // Display the particle on the canvas.
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
    this.particles = []; // The particles generated from the strokes.
    this.startTime = millis();
    this.duration = duration; // The total duration of the dissolve.
    this.totalAmount = totalAmount; // The total number of particles to generate.
    this.lastParticleAt = 0;
  }

  // 0 at the start, 1 when the dissolve ends
  progress () {
    return map(millis() - this.startTime, 0, this.duration, 0, 1, true);
  }

  update() {
    const elapsed = millis() - this.startTime; // How much time has passed since the dissolve started.
    const interval = this.duration / this.totalAmount; // How often to generate a new particle.


    // Generate new particles if enough time has passed and we haven't reached the total amount.
    while (elapsed - this.lastParticleAt >= interval && this.particles.length < this.totalAmount) {
      this.addParticle();
      this.lastParticleAt += interval;
    }

    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].update();
    }
  }


  // Choose a random point to generate a new particle.
  addParticle() {
    const all = []; // Store all the points in this batch.

    for (let i = 0; i < this.strokes.length; i++) {
      const s = this.strokes[i];
      for (let j = 0; j < s.pts.length; j++) {
        all.push({ x: s.pts[j].x, y: s.pts[j].y, colour: s.hue}); // At line18 of 'user-input-mechanic.js' 
      }
    }

    if (all.length === 0) return; // If there are no points, do nothing.
    const pt = random(all);
    this.particles.push(new DecompParticle(pt.x, pt.y, pt.colour));
  }


  // Check if the dissolve process is complete.
  isDone() {
    return millis() - this.startTime > this.duration;
  }

  // Export the current state of all particles in this batch.
  exportParticles() {
    const out = []; // Store the exported particle data.
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const v = p.getVelocity(); // Get the current velocity of the particle.
      out.push({ x: p.pos.x, y: p.pos.y, hue: p.colour, vx: v.x, vy: v.y});
    }
    return out;
  }

  // Render the strokes and particles in this batch.
  render() {
    const opacity = 1 - this.progress(); // Calculate the opacity based on the dissolve progress.

    for (let i = 0; i < this.strokes.length; i++) {
      this.drawFadingStroke(this.strokes[i], opacity);
    }

    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].display();
    }
  }

  // Draw a stroke with fading opacity.
  drawFadingStroke(s, opacity) {
    if (s.pts.length === 0) return;

    const startAlpha = BRUSH[s.tool].alpha * 100;
    const alpha = startAlpha * opacity * opacity;

    push(); // Save the current drawing state.
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
    pop(); // Restore the previous drawing state.
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

   // Clear all the current dissolve batches.
   clear() {
     this.batches = [];
   }

   // Start a new dissolve batch with the given strokes.
   startDissolve(strokes) {
     const amount = this.particleAmountFor(strokes);
     this.batches.push(new DissolveBatch(
       strokes, this.dissolveDuration, amount));
   }

   // Calculate the number of particles to generate based on the amount of ink used in the strokes.
   particleAmountFor(strokes) {
     let ink = 0; // Total ink used in the strokes.

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

   // Update all the dissolve batches and return particles from batches that just finished.
   update() {
     const finished = []; // Store the particles from finished batches.

     // go backwards so splice does not skip the next batch
     for (let i = this.batches.length - 1; i >= 0; i--) {
       const b = this.batches[i];
       b.update();

       if (b.isDone()) {
         const parts = b.exportParticles();
         for (let j = 0; j < parts.length; j++) finished.push(parts[j]);
         this.batches.splice(i, 1); //The functions ouside the class:
                                    //array.splice(startIndex, deleteCount) 
                                    //Built-in array method: remove deleteCount elements starting at startIndex;
       }
     }
     return finished;
   }

   render() {
     for (let i = 0; i < this.batches.length; i++) this.batches[i].render();
   }
}
