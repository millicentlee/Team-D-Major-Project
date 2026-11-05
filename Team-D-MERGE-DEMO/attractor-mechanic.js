// attractor-mechanic.js
// outside the glass a particle either keeps drifting, or eases onto the attractor.
// the first frame it actually follows the attractor we tag it fixed, so Clear leaves it
// and its trail alone. until then, leaving the glass rolls drift or attractor again.

// ----- settings -----
const DRIFT_SPEED = 0.6;     // how fast particles drift on the noise
const NOISE_SCALE = 0.004;   // size of the noise currents
const ATTRACTOR_SCALE = 2.0; // attractor size: 1 fills the screen, 2 runs off the edges
const HANDOVER_FRAMES = 600; // frames to hand over from drift to the attractor

// the four numbers that decide the attractor's shape
const PRESET = { a: -1.4, b: 1.6, c: 1.0, d: 0.7 };

// zoom scales the attractor's small box up to the screen
let zoom;
// hidden layer where footprints build up the shape
let trace;

class AttractorController {
  // fit it to this screen and start a blank trail layer
  setup() {
    // the shape is about (1 + c) wide and (1 + d) tall, scale that up to the screen
    zoom = min(
      width / (2 * (1 + abs(PRESET.c))),
      height / (2 * (1 + abs(PRESET.d)))
    ) * ATTRACTOR_SCALE;
    // [OUT OF SCOPE] createGraphics is a second canvas, just for the trail. pixelDensity(1) keeps it light.
    trace = createGraphics(width, height);
    trace.pixelDensity(1);
    trace.colorMode(HSB, 360, 100, 100, 100);
    trace.clear();
  }

  // just left the glass, so start the blend here or it jumps.
  // already fixed ones stay on the attractor
  beginOutside(p) {
    if (p.fixed) return;
    p.driftX = p.x;
    p.driftY = p.y;
    p.ax = (p.x - width / 2) / zoom;
    p.ay = (p.y - height / 2) / zoom;
    p.targetX = p.x;
    p.targetY = p.y;
    p.age = 0;
    p.handover = 0;
    // half drift, half attractor
    // [OUT OF SCOPE] ? : is a one-line if/else. We didn't write it this way in class.
    p.mode = random() < 0.5 ? "drift" : "attractor";
  }

  // one frame outside: everyone drifts, then attractor mode eases onto the shape
  updateOutside(p) {
    const angle = noise(
      p.driftX * NOISE_SCALE,
      p.driftY * NOISE_SCALE,
      frameCount * 0.005
    ) * TWO_PI * 2;
    p.driftX += cos(angle) * DRIFT_SPEED;
    p.driftY += sin(angle) * DRIFT_SPEED;
    // hold the drift base on screen; the changing noise angle carries it back in
    p.driftX = constrain(p.driftX, 0, width);
    p.driftY = constrain(p.driftY, 0, height);
    const prevX = p.x;
    const prevY = p.y;
    if (p.mode === "attractor") {
      p.fixed = true; // on the attractor now, Clear should keep it
      p.age++;
      const t = min(1, p.age / HANDOVER_FRAMES);
      // ease in and out
      p.handover = t * t * (3 - 2 * t);
      this.step(p);
      p.x = lerp(p.driftX, p.targetX, p.handover);
      p.y = lerp(p.driftY, p.targetY, p.handover);
    } else {
      p.x = p.driftX;
      p.y = p.driftY;
    }
    // the drawn point stays on screen too
    p.x = constrain(p.x, 0, width);
    p.y = constrain(p.y, 0, height);
    // carry this frame's move so a return into the glass stays smooth
    p.vx = p.x - prevX;
    p.vy = p.y - prevY;
  }

  // next point on the attractor, from where we are now
  step(p) {
    const rule = PRESET;
    const nextX = sin(rule.a * p.ay) + rule.c * cos(rule.a * p.ax);
    const nextY = sin(rule.b * p.ax) + rule.d * cos(rule.b * p.ay);
    p.ax = nextX;
    p.ay = nextY;
    // convert back to pixels: this is the new target
    p.targetX = width / 2 + nextX * zoom;
    p.targetY = height / 2 + nextY * zoom;
    // faint footprint once the attractor has some hold, and only outside the glass
    if (p.handover > 0.2 && !particleCtrl.isInside(p.targetX, p.targetY)) {
      trace.stroke(p.hue, 60, 100, 18);
      trace.point(p.targetX, p.targetY);
    }
  }

  // draw the built-up shape
  renderTrace() {
    image(trace, 0, 0);
  }

  // wipe the footprints when the sandbox is cleared
  clearTrace() {
    trace.clear();
  }
}
