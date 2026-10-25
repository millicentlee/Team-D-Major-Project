let decomposer;
let currentDrawingPoints = [];
let isDrawing = false;
let clearButton;

// Only run once.
function setup() {
  createCanvas(windowWidth, windowHeight);
  background(0, 0, 0);

  // Creat a new decomposer from Decomposer class.
  decomposer = new Decomposer();

  // Creat a clear button.
  clearButton = createButton('CLEAR');
  clearButton.position((width-clearButton.width)/2, height-clearButton.height-2);
  // The clear button will reset the lines and particles.
  clearButton.mousePressed(() => {
    decomposer.isDissolving = false;
    decomposer.particleList = [];
    decomposer.sourcePoints = [];
    currentDrawingPoints = [];
  })
} 

// Run in a loop.
function draw() {
  // Clear the background.
     background(0, 0, 0);
  
  // Draw the glass outline.
  drawGlassOutline();

  // Assign the properties to lines.
  // && = and.
  if (isDrawing && currentDrawingPoints.length > 1) {
    stroke(255, 255);
    strokeWeight(1.5);
    noFill();
    // Draw a custom shape based on the points in currentDrawingPoints.
    beginShape();
    for (let p of currentDrawingPoints) {
      vertex(p.x, p.y);
    }
    endShape();
  }

  // Process the time-based decomposition and draw the result.
  decomposer.processDissolve(millis());
  decomposer.draw();
}

// ==============================================
// Decomposer：Only responsible for time calculation, line fading, and gradual generation of particles.
// ==============================================
class Decomposer {
  constructor() {
    this.sourcePoints = []; // The original hand-drawn line points.
    this.startDissolveTime = 0;
    this.dissolveDuration = 4000;
    this.totalParticleAmount = 120;
    this.isDissolving = false;
    this.originalGraphicAlpha = 255;
    this.particleList = []; // The list of particles generated during the dissolve process.
  }

  processDissolve(currentTime) {
    // If not in the dissolving state, do nothing.
    if (!this.isDissolving) return;

    // Evaluate the time elapsed.
    let timeElapsed = currentTime - this.startDissolveTime;
    let progress = map(timeElapsed, 0, this.dissolveDuration, 0, 1, true);

    // The original line gradually fades out through the progress value.
    this.originalGraphicAlpha = map(progress, 0, 1, 255, 0);

    // The number of spawned particles gradually increases through the progress value.
    let targetSpawned = floor(map(progress, 0, 1, 0, this.totalParticleAmount));

    // Generate new particles until reaching the target number.
    while (this.particleList.length < targetSpawned) {
      let pt = random(this.sourcePoints);
      this.particleList.push(new DecompParticle(pt.x, pt.y));
    }
  }

  draw() {
    // Draw the original line with fading effect.
    if (this.sourcePoints.length > 1 && this.originalGraphicAlpha > 0) {
      noFill();
      stroke(255, this.originalGraphicAlpha);
      strokeWeight(1.5);
      beginShape();
      for (let p of this.sourcePoints) {
        vertex(p.x, p.y);
      }
      endShape();
    }

    // Only draw particle positions, without motion updates
    for (let pa of this.particleList) {
      pa.show();
    }
  }
  // Create a method to start the dissolve process, which takes an array of points as input.
  startDissolve(pointArray) {
    this.sourcePoints = pointArray;
    this.startDissolveTime = millis();
    this.isDissolving = true;
    this.particleList = [];
  }
}

// ==============================================
// DecompParticle： Represents a single particle generated during the dissolve process.
// ==============================================
class DecompParticle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = random(1.5, 3);
    this.alpha = 255;
  }

  show() {
    noStroke();
    fill(255, this.alpha);
    circle(this.x, this.y, this.radius);
  }
}

// ==============================================
// Mouse Interaction: Draw shapes, release mouse to trigger time-based decomposition
// ==============================================
// When the mouse is pressed, start drawing and record the points.
function mousePressed() {
  isDrawing = true;
  currentDrawingPoints = [];
  currentDrawingPoints.push(createVector(mouseX, mouseY));
}

// When the mouse is dragged, continue drawing and record the points.
function mouseDragged() {
  if (!isDrawing) return;
  currentDrawingPoints.push(createVector(mouseX, mouseY));
}

// When the mouse is released, stop drawing and trigger the decomposition process.
function mouseReleased() {
  isDrawing = false;

  if (currentDrawingPoints.length > 3) {
    decomposer.startDissolve(currentDrawingPoints);
  }
}

// ==============================================
// Create a function to draw the outline of a glass.
// ==============================================
function drawGlassOutline() {
  push();
  noFill();
  stroke(255, 255);
  strokeWeight(2.2);

  beginShape();
  vertex(260, 140);
  bezierVertex(270, 460, 530, 460, 540, 140);
  endShape();

  line(400, 460, 400, 510);
  ellipse(400, 530, 130, 24);
  pop();
}

