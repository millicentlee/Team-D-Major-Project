// =====================================================
// Text → attractor — v16
// "hello world" is turned into particles. They hold as text,
// drift on Perlin noise, and are slowly taken over by a strange attractor.
// =====================================================

// ----- settings -----
const WORDS = 'hello world';
const TEXT_SIZE = 0.16;       // text height, as a fraction of the screen height
const SPACING = 10;           // gap between particles on the text in pixels (bigger = fewer)
const ATTRACTOR_SCALE = 2.0;  // attractor size: 1 fills the screen, 2 is twice that and runs off the edges
const DOT = 2;                // particle size in pixels

const HOLD = 90;              // frames particles stay as text (1.5 s)
const STAGGER = 60;           // extra random wait for each particle, up to 1 s
const DRIFT_FRAMES = 1200;    // frames to hand over from noise drift to the attractor (20 s)
const DRIFT_SPEED = 0.6;      // how fast particles drift on the noise
const NOISE_SCALE = 0.004;    // size of the noise currents
const GLIDE = 0.12;           // how much of the way to its target a particle moves each frame
const STEP_FRAMES = 12;       // frames between attractor steps

// the four numbers that decide the attractor's shape
const PRESET = { a: -1.4, b: 1.6, c: 1.0, d: 0.7 };

let movers = [];   // all particles
let trace;         // hidden layer where footprints build up the shape
let zoom;          // scales the attractor's small box up to the screen

// =====================================================
// Class: one particle
// =====================================================

class Mover {
  constructor(x, y, delay) {
    // two positions, both starting on the text:
    // drift (moved by Perlin noise) and free (moved by the attractor)
    this.driftX = x;
    this.driftY = y;
    this.freeX = x;
    this.freeY = y;
    this.targetX = x;
    this.targetY = y;
    // where it is drawn: a blend of the two
    this.x = x;
    this.y = y;
    // its position in the attractor's small box
    this.ax = (x - width / 2) / zoom;
    this.ay = (y - height / 2) / zoom;
    this.delay = delay;        // frames to wait as text
    this.age = 0;              // frames since it started moving
    this.handover = 0;         // 0 = drawn at the drift position, 1 = at the attractor position
    this.timer = STEP_FRAMES;  // so the first step happens straight away
  }

  // the rule: the next spot is calculated from the current spot
  step() {
    let p = PRESET;
    let nextX = sin(p.a * this.ay) + p.c * cos(p.a * this.ax);
    let nextY = sin(p.b * this.ax) + p.d * cos(p.b * this.ay);
    this.ax = nextX;
    this.ay = nextY;
    // convert back to pixels: this is the new target
    this.targetX = width / 2 + nextX * zoom;
    this.targetY = height / 2 + nextY * zoom;
    // leave a faint footprint once the attractor has some hold
    if (this.handover > 0.2) trace.point(this.targetX, this.targetY);
  }

  update() {
    // hold: stay as text until the delay runs out
    if (this.delay > 0) {
      this.delay--;
      return;
    }

    // handover rises slowly from 0 to 1, easing in and out
    this.age++;
    let t = min(1, this.age / DRIFT_FRAMES);
    this.handover = t * t * (3 - 2 * t);

    // 1. drift position: Perlin noise gives a direction at each place
    let angle = noise(this.driftX * NOISE_SCALE, this.driftY * NOISE_SCALE, frameCount * 0.005) * TWO_PI * 2;
    this.driftX += cos(angle) * DRIFT_SPEED;
    this.driftY += sin(angle) * DRIFT_SPEED;

    // 2. free position: follows the attractor
    this.timer++;
    if (this.timer >= STEP_FRAMES) {
      this.timer = 0;
      this.step();
    }
    this.freeX = lerp(this.freeX, this.targetX, GLIDE);
    this.freeY = lerp(this.freeY, this.targetY, GLIDE);

    // 3. drawn position: slides from drift to free as handover rises
    this.x = lerp(this.driftX, this.freeX, this.handover);
    this.y = lerp(this.driftY, this.freeY, this.handover);
  }

  show() {
    point(this.x, this.y);
  }
}

// =====================================================
// Setup and draw
// =====================================================

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  start();
}

function start() {
  // the attractor's box is about (1 + c) wide and (1 + d) tall; scale it to the screen
  zoom = min(width / (2 * (1 + abs(PRESET.c))), height / (2 * (1 + abs(PRESET.d)))) * ATTRACTOR_SCALE;

  trace = createGraphics(width, height);
  trace.pixelDensity(1);
  trace.background(0);
  trace.stroke(255, 18);
  trace.strokeWeight(1);

  movers = [];
  makeTextParticles();
}

function draw() {
  image(trace, 0, 0);
  stroke(255);
  strokeWeight(DOT);
  for (let m of movers) {
    m.update();
    m.show();
  }
}

// write the words on a hidden layer, then put a particle wherever the layer is white
function makeTextParticles() {
  let layer = createGraphics(width, height);
  layer.pixelDensity(1);
  layer.background(0);
  layer.fill(255);
  layer.noStroke();
  layer.textSize(height * TEXT_SIZE);
  layer.textStyle(BOLD);
  layer.textAlign(CENTER, CENTER);
  layer.text(WORDS, width / 2, height / 2);

  // check the layer in a grid, every SPACING pixels
  for (let x = 0; x < width; x += SPACING) {
    for (let y = 0; y < height; y += SPACING) {
      let colour = layer.get(x, y);   // [red, green, blue, alpha] at this spot
      if (colour[0] > 128) {          // bright = part of the text
        movers.push(new Mover(x, y, HOLD + floor(random(STAGGER))));
      }
    }
  }
  layer.remove(); // the hidden layer is no longer needed
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  start();
}
//Here is a test modification made on github 'edit in place'to see if it will synchronise to vs code'
