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
    this.speed = 0; // The current speed, the stratSpeed is 0.
    this.angle = random(TWO_PI); // The current angle of movement, randomly initialized.
    this.colour = colour; // The color of the particle.
  }

  // Update the particle's state.
  update() {
    this.speed += (decompMaxSpeed - this.speed) * decompAccel; // Accelerate towards the maximum speed.
    this.angle += random(-decompTurn, decompTurn); // Randomly change the angle to create a drifting effect.
    this.pos.x += cos(this.angle) * this.speed; // Update the x position based on the angle and speed.
    this.pos.y += sin(this.angle) * this.speed; // Update the y position based on the angle and speed.
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
    this.strokes = strokes; // The strokes to dissolve.
    this.particles = []; // The particles generated from the strokes.
    this.startTime = millis(); // The time when the dissolve started.
    this.duration = duration; // The total duration of the dissolve.
    this.totalAmount = totalAmount; // The total number of particles to generate.
    this.lastParticleAt = 0; // The time when the last particle was generated.
  }

  // The dissolve process: 0.0 (start) to 1.0 (end)
  progress () {
    return map(millis() - this.startTime, 0, this.duration, 0, 1, true);
  }

  // Update the dissolve process and generate new particles if needed.
  update() {
    const elapsed = millis() - this.startTime; // Calculate the elapsed time since the dissolve started.
    const interval = this.duration / this.totalAmount; // Calculate the interval between particle generations.

    // Generate new particles if the elapsed time since the last particle generation exceeds the interval and the total number of particles has not been reached.
    while (elapsed - this.lastParticleAt >= interval && this.particles.length < this.totalAmount) {
      this.addParticle(); // Generate a new particle.
      this.lastParticleAt += interval; // Update the time of the last particle generation.
    }

     // Update all generated particles;
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
        all.push({ x: s.pts[j].x, y: s.pts[j].y, colour: s.hue}); // Store the point's position and color. At line21 of 'user-input-mechanic.js' 
      }
    }

    if (all.length === 0) return; // If there are no points, do nothing.
    const pt = random(all); // Choose a random point from all the points.
    this.particles.push(new DecompParticle(pt.x, pt.y, pt.colour)); // Create a new particle and add it to the list of particles.
  }

  // Check if the dissolve process is done.
  isDone() {
    return millis() - this.startTime > this.duration;
  }

  // Export all the particles generated from this batch.
  exportParticles() {
    const out = []; // Store the exported particles.
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      const v = p.getVelocity(); // Get the velocity of the particle.
      out.push({ x: p.pos.x, y: p.pos.y, hue: p.colour, vx: v.x, vy: v.y}); // Push the particle's position, color, and velocity to the out array.
    }
    return out; // Return the exported particles.
  }

  // Render all the particles in this batch.
  render() {
    const opacity = 1 - this.progress(); // Calculate the opacity based on the dissolve process.

    for (let i = 0; i < this.strokes.length; i++) {
      this.drawFadingStroke(this.strokes[i], opacity); // Draw each stroke with the calculated opacity.
    }

    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].display(); // Display each particle.  
    }
  }

  // Draw a stroke with fading opacity.
  drawFadingStroke(s, opacity) {
    if (s.pts.length === 0) return; // If there are no points in the stroke, do nothing.

    const startAlpha = BRUSH[s.tool].alpha * 100; // Get the starting alpha value for the stroke based on the brush tool.

    const alpha = startAlpha * opacity * opacity; // Calculate the current alpha value based on the opacity.
    
    push(); // Save the current drawing state.
    stroke(s.hue, 80, 90, alpha); // Set the stroke color with the calculated alpha value.
    strokeWeight(s.size); // Set the stroke weight based on the stroke size.
    strokeCap(ROUND); // Set the stroke cap to round for smoother edges.
    noFill();
    
    // Draw lines between consecutive points in the stroke.
    for (let i = 1; i < s.pts.length; i++) {
      const a = s.pts[i - 1];
      const b = s.pts[i];

      if (dist(a.x, a.y, b.x, b.y) > 15) continue; // Skip drawing if the distance between points is too large.
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
    this.batches = []; // Store all the currently running DissolveBatch.
    this.dissolveDuration = 4000; // Duration of complete dissolve of handwriting.
    this.inkPerParticle = 5; // How much ink is required to generate one particle.
    this.minParticles = 12; // The minimum number of particles to generate for one batch. 
    this.maxParticles = 800; // The maximum number of particles to generate for one batch.
  }

   // Start the dissolve process for a group of finished strokes.
   startDissolve(strokes) {
     // Calculate the number of particles to generate based on the amount of ink used in the strokes.
     const amount = this.particleAmountFor(strokes);

    // Create a new DissolveBatch for the strokes and add it to the list of batches.
     this.batches.push(new DissolveBatch(
       strokes, this.dissolveDuration, amount));
   }

   // Calculate the number of particles to generate based on the amount of ink used in the strokes.
   particleAmountFor(strokes) {
     let ink = 0;

     // Accumulate the length of the stroke by summing the distances between consecutive points.
     for (const s of strokes) {
       let length = 0;
       for (let i = 1; i < s.pts.length; i++) {   // At line21 of 'user-input-mechanic.js' 
         length += dist(s.pts[i - 1].x, s.pts[i - 1].y,
                        s.pts[i].x, s.pts[i].y);
       }

       // Calculate the total ink used in the stroke；Ink = Length of line × Thickness of line
       if (s.pts.length === 1) length = 1; // A single tap still has some ink.
       ink += length * s.size; // s (stroke object) is defined at line21 in user-input-mechanic.js；
     }

     // Calculate the amount of particles; The amount of ink divided by the ink consumed by a single particle.
     const amount = round(ink / this.inkPerParticle);
     return constrain(amount, this.minParticles, this.maxParticles); // Constrain the amount of particles to be within the minimum and maximum limits.
   }

   // Update every batch and return particles from batches that just finished.
   update() {
     const finished = []; // Store the particles from finished batches.

     // Iterate backwards to avoid index error when using splice
     for (let i = this.batches.length - 1; i >= 0; i--) {
       const b = this.batches[i];
       b.update(); 

       // If the batch is done, export its particles.
       if (b.isDone()) {
         const parts = b.exportParticles();
         for (let j = 0; j < parts.length; j++) finished.push(parts[j]);

         this.batches.splice(i, 1); // Remove the finished batch from the list.
       }
     }
     return finished; // Return the list of particles from finished batches.
   }

   // Render all the batches.
   render() {
     for (let i = 0; i < this.batches.length; i++) this.batches[i].render();
   }
}

