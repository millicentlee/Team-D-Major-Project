//--------------------------------------------------------
// main file: scenes, loading, input, drawing order.
// the four mechanics live in their own files.
// --------------------------------------------------------

// one DrawController for the whole sketch
let ctrl;

// the other mechanics:
// timeCtrl fades lines into particles
// particleCtrl is the sandbox (flow, mouse push, hand drag)
let timeCtrl;
let particleCtrl;

// fade slider
let fadeSlider;
let clearBtn;
let fadeDurationMs = 4000;
let pointerOnUI = false;

// floating colour glows for the colourful black background
let glows = [];

// small blurred layer for the glows: blur runs on 1/16 of the pixels
let glowLayer;

// background glass split into two layers:
// back layer sits under the strokes, front layer covers them
let glassBackImg, glassFrontImg;

// glass collision image: its visible (alpha) area is the glass shape used
// to block strokes from entering the glass
let glassCollisionImg;

// solid fill of the glass interior: opaque pixels are where particles may move
let glassWallImg;

// horizontal offset of the glass: starts off-screen right and slides in
let glassOffsetX;

// tilt angle of the glass while it slides in, eases back to upright
let glassAngle;

// tool icons for the left toolbar (normal + highlighted versions)
let iconPencil, iconPen, iconMarker, iconHand;
let iconPencilActive, iconPenActive, iconMarkerActive, iconHandActive;
let toolIcons = [];

// the door screen images: closed bar door and its open version
let doorImg;
let doorOpenImg;

// audio: background music plus UI sound effects
let bgMusic, clickSound, tapSound, doorOpenSound, doorCloseSound, glassSlideSound, glassLandSound;
let audioStarted = false; // the browser unlocks audio after the first click

// scene flow: the door screen hides the sketch until the user clicks,
// which unlocks the browser audio and starts the glass animation
let scene = "door";
// each finished stroke dissolves this many ms after its own mouse release
const AUTO_DISSOLVE_MS = 3000;
// entry timeline: after clicking the door, it opens, then closes, then a
// black cover fades in and the glass slides in invisibly, settling with
// a sound before the cover fades out. All times are ms after the click.
let enterT0 = 0;
let enterStarted = false;
let closeSounded = false, slideSounded = false, landSounded = false;
let slideAnimStarted = false; // glass moves (off-screen) before the sound starts
let maxIrisR; // largest visible circle radius (screen centre to corners)
const T_FADE = 300;         // iris close/open duration
const T_BLACK_FULL = 300;   // iris fully closed right after the click
const T_CLOSE_START = 1100; // open sound (1.1s) done, close sound begins
const T_OPEN_START = 1850;  // close sound (0.75s) done, iris begins opening

// --------------------------------------------------------
// Preload: Load image & audio assets.
// --------------------------------------------------------

function preload() {
  glassBackImg = loadImage("assets/glass-back.png");
  glassFrontImg = loadImage("assets/glass-front.png");
  glassCollisionImg = loadImage("assets/glass-collision.png");
  glassWallImg = loadImage("assets/glass-wall.png");
  iconPencil = loadImage("assets/icon-pencil.png");
  iconPen = loadImage("assets/icon-pen.png");
  iconMarker = loadImage("assets/icon-marker.png");
  iconPencilActive = loadImage("assets/icon-pencil-active.png");
  iconPenActive = loadImage("assets/icon-pen-active.png");
  iconMarkerActive = loadImage("assets/icon-marker-active.png");
  iconHand = loadImage("assets/icon-hand.png");
  iconHandActive = loadImage("assets/icon-hand-active.png");
  doorImg = loadImage("assets/door.png");
  doorOpenImg = loadImage("assets/door-open.png");
  bgMusic = loadSound("assets/audio/bg-music.wav");
  clickSound = loadSound("assets/audio/sfx-click.wav");
  tapSound = loadSound("assets/audio/sfx-tap.wav");
  doorOpenSound = loadSound("assets/audio/sfx-door-open.wav");
  doorCloseSound = loadSound("assets/audio/sfx-door-close.wav");
  glassSlideSound = loadSound("assets/audio/sfx-glass-slide.wav");
  glassLandSound = loadSound("assets/audio/sfx-glass-land.wav");
}

// --------------------------------------------------------
// Setup: Create the canvas, initialize controllers, and prepare assets.
// --------------------------------------------------------

function setup() {
  createCanvas(windowWidth, windowHeight);
  glassOffsetX = width; // starts off to the right
  // [OUT OF SCOPE] Math.sqrt — we didn't cover the Math object in class
  maxIrisR = Math.sqrt((width / 2) * (width / 2) + (height / 2) * (height / 2));
  glassAngle = -0.35;   // tilted left at the start, about -20 degrees
  // [OUT OF SCOPE] createGraphics is a small extra canvas. Blurring that is much cheaper than the full screen.
  glowLayer = createGraphics(width / 4, height / 4);
  glowLayer.colorMode(HSB, 360, 100, 100);
  colorMode(HSB, 360, 100, 100);
  ctrl = new DrawController();
  timeCtrl = new TimeController();
  particleCtrl = new ParticleController();
  textFont("Calibri");
  // [OUT OF SCOPE] block the right-click menu so that button can erase
  document.querySelector("canvas").addEventListener("contextmenu", function (e) { e.preventDefault(); });
  // create the background colour glows
  for (let i = 0; i < 16; i++) {
    glows.push({
      x: random(width),
      y: random(height),
      r: random(140, 320),
      hue: random(360),
      vx: random(-0.3, 0.3),
      vy: random(-0.3, 0.3)
    });
  }
  // positions come from the window height, so a short window doesn't clip the last icon
  toolIcons.push({ img: iconPencil, activeImg: iconPencilActive, tool: "pencil", x: 0, y: 0, size: 0 });
  toolIcons.push({ img: iconPen, activeImg: iconPenActive, tool: "pen", x: 0, y: 0, size: 0 });
  toolIcons.push({ img: iconMarker, activeImg: iconMarkerActive, tool: "marker", x: 0, y: 0, size: 0 });
  toolIcons.push({ img: iconHand, activeImg: iconHandActive, tool: "hand", x: 0, y: 0, size: 0 });
  layoutToolIcons();
  // shrink the door images once so the per-frame draw stays fast
  const doorTargetW = Math.min(720, windowWidth * 0.46);
  if (doorImg.width > doorTargetW) {
    // [OUT OF SCOPE] resize() once now, so we aren't scaling the big image every frame
    doorImg.resize(doorTargetW, doorTargetW * doorImg.height / doorImg.width);
  }
  if (doorOpenImg.width > doorTargetW) {
    doorOpenImg.resize(doorTargetW, doorTargetW * doorOpenImg.height / doorOpenImg.width);
  }
  // shrink the glass images to ~1.25x display height (they are drawn near full-screen)
  const glassH = Math.ceil(windowHeight * 1.25);
  for (let i = 0; i < [glassBackImg, glassFrontImg, glassCollisionImg, glassWallImg].length; i++) {
    const g = [glassBackImg, glassFrontImg, glassCollisionImg, glassWallImg][i];
    if (g.height > glassH) g.resize(Math.ceil(glassH * g.width / g.height), glassH);
  }
  // only shrink huge sources; 512 still looks sharp when a tall window scales the icons up
  for (let i = 0; i < toolIcons.length; i++) {
    const ic = toolIcons[i];
    if (ic.img.width > 512) ic.img.resize(512, Math.ceil(512 * ic.img.height / ic.img.width));
    if (ic.activeImg.width > 512) ic.activeImg.resize(512, Math.ceil(512 * ic.activeImg.height / ic.activeImg.width));
  }
  // grab the collision pixels once, checking every frame with get() is too slow
  // [OUT OF SCOPE] loadPixels() so we can read the alpha straight from the array
  glassCollisionImg.loadPixels();
  glassWallImg.loadPixels();

  // create the fade duration slider, but hide it until the sandbox scene
  fadeSlider = createSlider(1000, 8000, fadeDurationMs, 100);
  fadeSlider.id('fadeSlider');
  fadeSlider.style('width','300px');
  fadeSlider.position(20, height - 80);
  fadeSlider.hide();
  // [OUT OF SCOPE] () => is a short function. We didn't write functions this way in class.
  fadeSlider.input(()=>{
    fadeDurationMs = fadeSlider.value();
    timeCtrl.dissolveDuration = fadeDurationMs;
  });

  // clear button, to the right of the slider, hidden until the sandbox
  clearBtn = createButton("");
  clearBtn.id('clearBtn');
  clearBtn.position(340, height - 107);
  clearBtn.hide();
  clearBtn.mousePressed((e) => {
    e.stopPropagation(); // this click should not also start a stroke
    ctrl.clear();
    particleCtrl.clear();
    timeCtrl.clear();
  });
  buildUIStyles();
}

// --------------------------------------------------------
// Main draw loop: run logic by different scene.
// Scene flow: door page → intro transition → sandbox drawing & particle scene.
// --------------------------------------------------------

function draw() {
  background(0, 0, 6); // near black base
  drawGlows();
  // paste the blurred glow layer up to full size
  image(glowLayer, 0, 0, width, height);

  if (scene === "door") {
    drawDoor();
    updateEnterTimeline();
    fadeSlider.hide();
    clearBtn.hide();
    return;
  }

  if (scene === "intro") {
    // "intro" renders the scene under a fading black cover
    updateGlassSlide();
    drawGlassBack();
    ctrl.render();
    drawGlassFront();
    drawToolIcons();
    updateEnterTimeline();
    fadeSlider.hide();
    clearBtn.hide();
    return;
  }

  if (scene === "sandbox") {
    // one continuous scene: drawing, background dissolves and particles
    // all run at the same time and never block each other
    updateGlassSlide();
    drawGlassBack();
    // interactive particles run continuously (gravity, drift, disturbance)
    particleCtrl.update();
    particleCtrl.renderTrace();
    particleCtrl.render();
    // dissolve batches run in the background; finished batches add particles
    const newParticles = timeCtrl.update();
    if (newParticles.length > 0) particleCtrl.addParticles(newParticles);
    timeCtrl.render();
    ctrl.render();
    drawGlassFront();
    drawToolIcons();

    // fade duration slider and text
    fadeSlider.show();
    clearBtn.show();
    fill(255);
    noStroke();
    textAlign(LEFT, BOTTOM);
    // Caveat for this label only, then restore Calibri for every other text
    textFont("Caveat");
    textSize(20);
    // [OUT OF SCOPE] backticks let the number sit inside the sentence
    text(`Fade Duration: ${fadeDurationMs} ms`, 20, height - 85);
    textAlign(LEFT, BASELINE);
    textFont("Calibri");

    // each line dissolves 3 seconds after it was released, on its own clock
    const due = [];
    const keep = [];
    for (let i = 0; i < ctrl.strokes.length; i++) {
      const s = ctrl.strokes[i];
      if (s.finishedAt !== undefined && millis() - s.finishedAt >= AUTO_DISSOLVE_MS) due.push(s);
      else keep.push(s);
    }
    if (due.length > 0) {
      timeCtrl.startDissolve(ctrl.exportStrokes(due));
      ctrl.strokes = keep;
    }
    return;
  }
}

// --------------------------------------------------------
// Submodule: Background glow effect.
// --------------------------------------------------------

// draw the glows into the small layer and blur there.
// a quarter-size blur is much cheaper than blurring the whole screen.
function drawGlows() {
  const s = 4; // downscale factor
  glowLayer.clear(); // [OUT OF SCOPE] clear() empties the small canvas
  for (let i = 0; i < glows.length; i++) {
    const g = glows[i];
    g.x += g.vx;
    g.y += g.vy;
    if (g.x < 0 || g.x > width)  g.vx *= -1;
    if (g.y < 0 || g.y > height) g.vy *= -1;
    glowLayer.noStroke();
    glowLayer.fill(g.hue, 50, 25, 6); // very low opacity colour
    glowLayer.circle(g.x / s, g.y / s, (g.r * 2) / s);
  }
  // [OUT OF SCOPE] filter(BLUR) on the small layer, not the whole screen
  glowLayer.filter(BLUR, 20); // cheap: only 1/16 of the pixels
}

// ---------------------------------------------------------
// Submodule: Entry timeline & iris mask transition.
// ---------------------------------------------------------

// door close, black cover, slide and land sounds, then the sandbox
function updateEnterTimeline() {
  if (!enterStarted) return; // timeline only runs after the door click
  const t = millis() - enterT0;
  // swap from the door screen to the scene immediately on the click
  if (scene === "door") scene = "intro";
  if (scene !== "intro") return;
  let visR; // radius of the visible circular opening
  if (t < T_BLACK_FULL) {
    // iris closing straight away: the opening shrinks to the centre
    visR = maxIrisR * (1 - constrain(t / T_FADE, 0, 1));
  } else {
    // fully black: wait for the open sound, then play the close sound
    if (!closeSounded && t >= T_CLOSE_START) {
      doorCloseSound.play();
      closeSounded = true;
    }
    if (t < T_OPEN_START) {
      visR = 0; // hold black while the door sounds play
    } else {
      // iris opening only after the close sound has finished
      const p = constrain((t - T_OPEN_START) / T_FADE, 0, 1);
      visR = maxIrisR * p;
      // under the cover, glide the glass from off-screen toward the right edge
      const r = getGlassRect();
      if (!slideAnimStarted) {
        glassOffsetX = width + (r.x - width) * p;
      }
      // start the sound a little early so its attack lands as the glass appears
      if (!slideSounded && p >= 0.9) {
        glassSlideSound.play();
        slideSounded = true;
      }
      if (p >= 1) {
        // fully visible: release the easing slide into the centre
        slideAnimStarted = true;
        if (!landSounded && glassOffsetX <= 0.5 && abs(glassAngle) <= 0.01) {
          glassLandSound.play();
          bgMusic.loop();
          landSounded = true;
        }
        if (landSounded) {
          scene = "sandbox";
          // build the particle mask once before the sandbox starts
          particleCtrl.prepare();
          particleCtrl.setupAttractor();
        }
      }
    }
  }
  drawIris(visR);
}

// black everywhere except a round hole. a fat stroked circle makes the hole.
function drawIris(visR) {
  if (visR >= maxIrisR) return; // fully visible, nothing to cover
  push();
  noFill();
  stroke(0);
  strokeWeight(maxIrisR * 2);
  circle(width / 2, height / 2, 2 * (maxIrisR + visR));
  pop();
}

// ---------------------------------------------------------
// Submodule: Glass sliding animation.
// ---------------------------------------------------------

// slide in from the right. each frame we only cover part of the gap, so it slows down at the end.
function updateGlassSlide() {
  // [OUT OF SCOPE] lerp eases it part of the way toward the target each frame
  // hold it off-screen while the cover is still going black
  if (scene === "intro" && !slideAnimStarted) return;
  // phase 1: slide in from the right while keeping the tilt
  if (glassOffsetX > 0.5) {
    glassOffsetX = lerp(glassOffsetX, 0, 0.16);
    return;
  }
  glassOffsetX = 0;
  // phase 2: the glass has stopped, now it straightens up
  if (abs(glassAngle) > 0.01) {
    glassAngle = lerp(glassAngle, 0, 0.4);
  } else {
    glassAngle = 0;
  }
}

// where the glass sits on the canvas
function getGlassRect() {
  const scale = 1.0;
  const h = height * scale;
  const w = h * (glassBackImg.width / glassBackImg.height);
  const x = (width - w) / 2;
  const y = (height - h) / 2 + 130;
  return { x, y, w, h };
}

// back of the cup, under the strokes so we can draw over it
function drawGlassBack() {
  const r = getGlassRect();
  // [OUT OF SCOPE] push/pop so the move and rotate don't stick for the rest of the draw
  // pivot is the marked point, 11% across and 92.6% down the glass
  push();
  translate(r.x + glassOffsetX + r.w * 0.11, r.y + r.h * 0.926);
  rotate(glassAngle);
  image(glassBackImg, -r.w * 0.11, -r.h * 0.926, r.w, r.h);
  pop();
}

// front line art, over the strokes so it covers what's inside the cup
function drawGlassFront() {
  const r = getGlassRect();
  // pivot at 11% width / 92.6% height of the glass (the marked point)
  push();
  translate(r.x + glassOffsetX + r.w * 0.11, r.y + r.h * 0.926);
  rotate(glassAngle);
  image(glassFrontImg, -r.w * 0.11, -r.h * 0.926, r.w, r.h);
  pop();
}

// ---------------------------------------------------------
// Submodule: Glass collision detection (prevent drawing inside glass).
// ---------------------------------------------------------

// is this image pixel on the glass wall?
function glassCollisionMap(mx, my) {
  if (!glassCollisionImg) return false;
  if (mx < 0 || my < 0 || mx >= glassCollisionImg.width || my >= glassCollisionImg.height) return false;
  // use the pixels we cached, get() every frame is too slow
  return glassCollisionImg.pixels[(my * glassCollisionImg.width + mx) * 4 + 3] > 8;
}

// canvas point to collision image. true means we hit the glass.
function glassCollision(cx, cy) {
  if (!glassCollisionImg) return false; // safety fallback: no image, no collision
  if (glassOffsetX > 0.5 || abs(glassAngle) > 0.01) return false; // wait until the glass stops
  const r = getGlassRect();
  const x = r.x + glassOffsetX;
  const y = r.y;
  if (cx < x || cx > x + r.w || cy < y || cy > y + r.h) return false;
  const mx = floor((cx - x) / r.w * glassCollisionImg.width);
  const my = floor((cy - y) / r.h * glassCollisionImg.height);
  return glassCollisionMap(mx, my);
}

// the opening "door" screen: hovering the mouse opens the two panels
// and reveals the glowing background, clicking enters the sketch
function getDoorRect() {
  // fit the door image, keeping its aspect ratio
  const maxH = height * 0.8;
  let dw = width * 0.46;
  let dh = dw * (doorImg.height / doorImg.width);
  if (dh > maxH) { dh = maxH; dw = dh / (doorImg.height / doorImg.width); }
  return { x: (width - dw) / 2, y: (height - dh) / 2, w: dw, h: dh };
}

// ---------------------------------------------------------
// Submodule: Door page render.
// ---------------------------------------------------------

function drawDoor() {
  const doorRect = getDoorRect();
  const dx = doorRect.x, dy = doorRect.y, dw = doorRect.w, dh = doorRect.h;
  let hovering = mouseX > dx && mouseX < dx + dw && mouseY > dy && mouseY < dy + dh;
  // once the door is clicked it stays open even if the mouse moves away
  if (enterStarted) hovering = true;
  // dim the background behind the closed door; while it is open the
  // doorway shows the real sketch background directly
  noStroke();
  // [OUT OF SCOPE] ? : is a one-line if/else. We didn't use this form in class.
  fill(0, 0, 4, hovering ? 0 : 70);
  rect(0, 0, width, height);
  // hard switch: hovering shows the open door, otherwise the closed door
  if (hovering) {
    // mask: the real background is only visible inside the doorway frame
    // (doorway is 480-1340 x 550-2080 of the source), everything outside
    // the frame is painted back to the base colour
    const ox = dx + dw * (480 / 1832);
    const oy = dy + dh * (550 / 2288);
    const ow = dw * ((1340 - 480) / 1832);
    const oh = dh * ((2080 - 550) / 2288);
    noStroke();
    fill(0, 0, 6);
    rect(0, 0, width, oy);
    rect(0, oy, ox, oh);
    rect(ox + ow, oy, width - ox - ow, oh);
    rect(0, oy + oh, width, height - oy - oh);
    image(doorOpenImg, dx, dy, dw, dh);
  } else {
    image(doorImg, dx, dy, dw, dh);
  }
  // prompt below the door
  noStroke();
  fill(0, 0, 100);
  // [OUT OF SCOPE] textAlign / textSize / text for the words under the door
  textAlign(CENTER, CENTER);
  textSize(30);
  text("CLICK TO ENTER", width / 2, dy + dh + 70);
  textAlign(LEFT, BASELINE);
}

// ---------------------------------------------------------
// Submodule: Toolbar render.
// ---------------------------------------------------------

// fit all four icons in the window: short windows shrink them, tall ones scale them up
function layoutToolIcons() {
  const topPad = height * 0.10;
  const botPad = height * 0.06;
  const avail = height - topPad - botPad;
  const size = avail / 4.45;
  const gap = size * 0.15;
  const x = height * 0.025;
  for (let i = 0; i < toolIcons.length; i++) {
    const ic = toolIcons[i];
    ic.x = x;
    ic.size = size;
    if (i === 0) ic.y = topPad;
    else ic.y = toolIcons[i - 1].y + size + gap;
  }
}

// tool icons. the selected one uses the lit image.
function drawToolIcons() {
  for (let i = 0; i < toolIcons.length; i++) {
    const ic = toolIcons[i];
    // [OUT OF SCOPE] ? : picks the lit icon when this tool is selected
    const img = ic.tool === ctrl.tool ? ic.activeImg : ic.img;
    image(img, ic.x, ic.y, ic.size, ic.size);
  }
}

// doodle images for the clear button and the fade slider
function buildUIStyles() {
  // [OUT OF SCOPE] appearance: none turns off the browser's own slider
  // [OUT OF SCOPE] ::-webkit-slider-thumb and ::-moz-range-thumb are the knob in Chrome and Firefox
  // bright image normally, line drawing while it's held down
  const uiStyle = createElement('style');
  uiStyle.html(
    "#clearBtn {" +
    "width: 180px; height: 90px; padding: 0; border: none;" +
    "background-color: transparent;" +
    "background-image: url('assets/btn-clear-down.png');" +
    "background-size: 100% 100%; background-repeat: no-repeat;" +
    "cursor: pointer; color: transparent; font-size: 0;" +
    "}" +
    "#clearBtn:active {" +
    "background-image: url('assets/btn-clear-up.png');" +
    "}" +
    "#fadeSlider {" +
    "appearance: none; -webkit-appearance: none;" +
    "width: 300px; height: 36px; outline: none;" +
    "background-color: transparent;" +
    "background-image: url('assets/slider-track.png');" +
    "background-size: 100% 100%; background-repeat: no-repeat;" +
    "}" +
    "#fadeSlider::-webkit-slider-thumb {" +
    "appearance: none; -webkit-appearance: none;" +
    "width: 48px; height: 48px; border: none;" +
    "background-color: transparent;" +
    "background-image: url('assets/slider-thumb-down.png');" +
    "background-size: 100% 100%; background-repeat: no-repeat;" +
    "cursor: pointer;" +
    "}" +
    "#fadeSlider::-moz-range-thumb {" +
    "appearance: none; -webkit-appearance: none;" +
    "width: 48px; height: 48px; border: none;" +
    "background-color: transparent;" +
    "background-image: url('assets/slider-thumb-down.png');" +
    "background-size: 100% 100%; background-repeat: no-repeat;" +
    "cursor: pointer;" +
    "}" +
    "#fadeSlider::-moz-range-track {" +
    "background-color: transparent;" +
    "background-image: url('assets/slider-track.png');" +
    "background-size: 100% 100%; background-repeat: no-repeat;" +
    "height: 36px; border: none;" +
    "}"
  );
}

// ---------------------------------------------------------
// Input handler: mouse & keyboard, send actions to controllers.
// ---------------------------------------------------------

function mousePressed(event) {
  // clicking the door unlocks the audio and opens the sketch
  if (scene === "door") {
    const r = getDoorRect();
    const onDoor =
      mouseX >= r.x && mouseX <= r.x + r.w &&
      mouseY >= r.y && mouseY <= r.y + r.h;
    if (!onDoor) return; // a click off the door does nothing
    // [OUT OF SCOPE] userStartAudio() has to run inside the click, or the browser stays silent
    userStartAudio();
    audioStarted = true;
    // start the entry timeline: open sound, close sound, iris opens
    enterT0 = millis();
    enterStarted = true;
    closeSounded = false;
    slideSounded = false;
    landSounded = false;
    slideAnimStarted = false;
    doorOpenSound.play();
    return;
  }
  // if they didn't come through the door, this click still has to unlock the sound
  if (!audioStarted) {
    // [OUT OF SCOPE] same unlock, just on whatever they click first
    userStartAudio();
    audioStarted = true;
  }
  // sandbox: toolbar, drawing, erasing and particle grabbing
  if (scene === "sandbox") {
    // a drag that starts on the slider or button must not draw on the canvas
    if (event.target.tagName !== 'CANVAS') {
      pointerOnUI = true;
      return;
    }
    // clicking a toolbar icon switches the tool
    for (let i = 0; i < toolIcons.length; i++) {
      const ic = toolIcons[i];
      if (mouseX > ic.x - 6 && mouseX < ic.x + ic.size + 6 &&
          mouseY > ic.y - 6 && mouseY < ic.y + ic.size + 6) {
        ctrl.switchTool(ic.tool);
        return;
      }
    }
    if (mouseButton === RIGHT) { ctrl.eraseClick(mouseX, mouseY); particleCtrl.eraseAt(mouseX, mouseY); return; }
    if (ctrl.tool === "hand") particleCtrl.grabStart(mouseX, mouseY);
    else ctrl.startStroke(mouseX, mouseY);
    return;
  }
}

function mouseDragged() {
  if (scene === "sandbox") {
    if (pointerOnUI) return;
    if (mouseButton === RIGHT) { ctrl.eraseDrag(mouseX, mouseY); particleCtrl.eraseAt(mouseX, mouseY); return; }
    if (ctrl.tool === "hand") particleCtrl.grabDrag(mouseX, mouseY);
    else ctrl.addPoint(mouseX, mouseY);
    return;
  }
}

// [OUT OF SCOPE] mouseReleased is the button coming up, pairs with mousePressed
function mouseReleased() {
  if (scene === "sandbox") {
    if (pointerOnUI) { pointerOnUI = false; return; }
    if (ctrl.tool === "hand") particleCtrl.grabRelease();
    else ctrl.endStroke();
    return;
  }
}

// [OUT OF SCOPE] mouseWheel is the scroll. e.delta is how far it moved.
function mouseWheel(e) {
  if (scene === "sandbox") ctrl.cycleColour(e.delta);
  return false;
}

// key 1 makes the brush thinner, key 2 makes it thicker
function keyPressed() {
  if (scene === "door") return;
  // scenes where drawing is active
  const canDraw = scene === "sandbox";
  // ctrl+z (cmd+z on mac) undoes the line
  // [OUT OF SCOPE] keyCode 90 is Z. keyIsDown checks Ctrl or Cmd.
  if (canDraw && keyCode === 90 &&
      (keyIsDown(CONTROL) || keyIsDown(COMMAND))) {
    ctrl.undo();
    return;
  }
  if (canDraw && key === "1") ctrl.adjustSize(-1);
  else if (canDraw && key === "2") ctrl.adjustSize(1);
}

// ---------------------------------------------------------
// Window resize.
// ---------------------------------------------------------

// keeps the canvas filling the window on resize
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  glowLayer.resizeCanvas(width / 4, height / 4);
  maxIrisR = Math.sqrt((width / 2) * (width / 2) + (height / 2) * (height / 2));
  fadeSlider.position(20, height - 80);
  clearBtn.position(340, height - 107);
  particleCtrl.setupAttractor();
  layoutToolIcons();
}
