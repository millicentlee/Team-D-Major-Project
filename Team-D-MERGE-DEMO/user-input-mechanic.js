// user-input-mechanic.js
// strokes, tools, erase. Yufei's dissolve reads the strokes from here.

class DrawController {
  constructor() {
    this.strokes = [];       // finished lines
    this.current = null;     // the one we're still drawing
    this.tool = "pencil";    // pencil, pen, marker or hand
    this.hue = 180;
    this.lastErase = null;   // so a right-drag can keep going
  }

  // left click
  startStroke(x, y) {
    if (glassCollision(x, y)) return; // not on the glass
    if (tapSound) tapSound.play();
    // lock the size now, so changing the brush later doesn't change this line
    this.current = { pts: [{ x, y }], tool: this.tool, hue: this.hue, size: BRUSH[this.tool].size };
  }

  // while dragging, fill in points so the line doesn't break
  addPoint(x, y) {
    if (!this.current) return;
    if (glassCollision(x, y)) return; // can't cross the glass
    const pts = this.current.pts;
    const last = pts[pts.length - 1];
    // [OUT OF SCOPE] Math.ceil — we didn't cover the Math object in class
    const n = Math.ceil(dist(last.x, last.y, x, y) / 2);
    const j = BRUSH[this.tool].jitter; // jitter makes pencil strokes look rough
    for (let i = 1; i <= n; i++) {
      let px = last.x + (x - last.x) * i / n;
      let py = last.y + (y - last.y) * i / n;
      // stop at the glass
      if (glassCollision(px, py)) break;
      if (j > 0) {
        px += random(-j, j);
        py += random(-j, j);
      }
      pts.push({ x: px, y: py });
    }
  }

  // mouse up, keep the line
  endStroke() {
    if (this.current) {
      // this line's own time, later lines don't change it
      this.current.finishedAt = millis();
      this.strokes.push(this.current);
      this.current = null;
    }
  }

  // ctrl+z drops the line in progress, or the last finished one
  undo() {
    if (this.current) {
      this.current = null;
      return;
    }
    if (this.strokes.length > 0) {
      this.strokes.pop();
    }
  }

  // wipe every line, including the one still being drawn
  clear() {
    this.strokes = [];
    this.current = null;
  }

  // toolbar picks pencil, pen, marker or hand
  switchTool(k) {
    if (clickSound) clickSound.play();
    switch (k) {
      case "pencil": this.tool = "pencil"; break;
      case "pen": this.tool = "pen"; break;
      case "marker": this.tool = "marker"; break;
      case "hand": this.tool = "hand"; break;
    }
  }

  // 1 and 2 change the brush size
  adjustSize(delta) {
    const b = BRUSH[this.tool];
    b.size = constrain(b.size + delta, 6, 30);
  }

  // scroll walks the hue around the wheel. saturation and brightness stay put.
  cycleColour(delta) {
    this.hue = (this.hue + delta * 0.1 + 360) % 360;
  }

  // right click erases around the cursor
  eraseClick(x, y) {
    this.eraseRadius(x, y);
    this.lastErase = { x, y };
  }

  // right drag erases along the path
  eraseDrag(x, y) {
    // [OUT OF SCOPE] ? : is a one-line if/else. We didn't use this form in class.
    const sx = this.lastErase ? this.lastErase.x : x;
    const sy = this.lastErase ? this.lastErase.y : y;
    const n = Math.max(1, Math.ceil(dist(sx, sy, x, y) / 5));
    for (let i = 1; i <= n; i++) {
      this.eraseRadius(sx + (x - sx) * i / n, sy + (y - sy) * i / n);
    }
    this.lastErase = { x, y };
  }

  // drop points inside the erase circle
  eraseRadius(x, y) {
    for (let i = 0; i < this.strokes.length; i++) {
      const s = this.strokes[i];
      // keep points outside the circle
      const kept = [];
      for (let i = 0; i < s.pts.length; i++) {
        const p = s.pts[i];
        if (dist(x, y, p.x, p.y) > 40) kept.push(p);
      }
      s.pts = kept;
    }
    // throw out lines that have no points left
    const keptStrokes = [];
    for (let i = 0; i < this.strokes.length; i++) {
      const s = this.strokes[i];
      if (s.pts.length > 0) keptStrokes.push(s);
    }
    this.strokes = keptStrokes;
  }

  // for Yufei: keep each stroke together so the fade can redraw the line
  exportStrokes(list) {
    const src = list || this.strokes;
    const result = [];
    for (let i = 0; i < src.length; i++) {
      const s = src[i];
      const pts = [];
      for (let i = 0; i < s.pts.length; i++) {
        const p = s.pts[i];
        pts.push({ x: p.x, y: p.y });
      }
      result.push({ pts: pts, hue: s.hue, size: s.size, tool: s.tool });
    }
    return result;
  }

  // finished lines, the one in progress, and the cursor dot
  render() {
    for (let i = 0; i < this.strokes.length; i++) {
      const s = this.strokes[i];
      this.drawStroke(s, 1);
    }
    if (this.current) this.drawStroke(this.current, 0.6);
    this.drawHover();
  }

  // the line, plus a dot on each point
  drawStroke(s, fade) {
    const b = BRUSH[s.tool];
    // use the size from when we drew it
    let size;
    if (s.size !== undefined) size = s.size;
    else size = b.size;
    // [OUT OF SCOPE] push/pop so this stroke's style doesn't leak into the next draw
    push();
    stroke(s.hue, 80, 90, fade * 100 * b.alpha);
    strokeWeight(size);
    strokeJoin(ROUND);
    if (b.cap === "square") strokeCap(SQUARE);
    else strokeCap(ROUND);
    noFill();
    for (let i = 1; i < s.pts.length; i++) {
      const a = s.pts[i - 1];
      const c = s.pts[i];
      if (dist(a.x, a.y, c.x, c.y) > 15) continue; // erased gap: do not reconnect
      line(a.x, a.y, c.x, c.y);
    }
    noStroke();
    fill(s.hue, 80, 90, fade * 100 * b.alpha);
    for (let i = 0; i < s.pts.length; i++) {
      const p = s.pts[i];
      if (b.cap === "square") {
        // [OUT OF SCOPE] rectMode(CENTER) puts the square on the point instead of its corner
        rectMode(CENTER);
        rect(p.x, p.y, size, size);
      } else {
        circle(p.x, p.y, size);
      }
    }
    pop();
  }

  // cursor dot at the brush size, or the erase circle
  drawHover() {
    push();
    if (this.tool === "hand") { pop(); return; } // hand doesn't paint
    if (mouseIsPressed && mouseButton === RIGHT) {
      noFill();
      stroke(0, 0, 100, 70);
      circle(mouseX, mouseY, 80);
      pop();
      return; // erase circle
    }
    // don't draw it over the toolbar or it looks like another icon
    if (mouseX < 130 && mouseY > 100 && mouseY < 890) {
      pop();
      return;
    }
    // current colour, same size as the brush
    fill(this.hue, 80, 90);
    stroke(0, 0, 100, 70);
    strokeWeight(1);
    circle(mouseX, mouseY, BRUSH[this.tool].size);
    pop();
  }
}

// brush size, opacity and cap
const BRUSH = {
  pencil: { size: 6,  alpha: 0.90, cap: "round",  jitter: 1.5 },
  pen:    { size: 7,  alpha: 0.75, cap: "round",  jitter: 0.5 },
  marker: { size: 16, alpha: 0.30, cap: "square", jitter: 0   },
  hand:   { size: 0,  alpha: 1,    cap: "round",  jitter: 0   } // placeholder, hand draws nothing
};