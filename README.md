# Inspiration

### 1. Crystal Universe
Our project __Glass Universe__ is inspired by teamLab’s interactive installation [Crystal Universe](https://art.team-lab.cn/w/crystaluniverse/).
TeamLab’s work builds an immersive cosmos with luminous floating points, where audiences can participate and watch light elements evolve. 

### 2. Point, line and plane
We also ground our visual language in the classic design concept of _point, line and plane_.
The classic design principle of _point, line and plane_ tells us that points gather to form lines, and lines gather to form planes — this process symbolises how all things in the universe come into being.

### 3. How these inspirations shaped our project
We adopted the reverse logic: drawn lines gradually decompose and break down into individual points, which become moving particles. Combined with inspiration from teamLab’s _Crystal Universe_, we built this particle-based miniature universe.
Instead of showing creation by gathering, our work shows how forms dissolve and return back to points.

### 4. Add a context
Our imaginative setting is a magical tavern. You wander in, fall into a dreamy state, and enter a miniature particle universe contained in a glass. You draw freely on the canvas; your hand-drawn strokes dissolve into drifting particles. This creates an uncanny, surreal feeling, as the marks you make transform into a living fluid world.

# Techniques

### The Sketch.js
The sketch uses __three scene states__ to manage page transitions: `door` (welcome page), `intro` (transition animation), `sandbox` (main interactive workspace).
Three separate controller classes handle distinct behaviours:
1. `DrawController`: manages drawing strokes, brush tools, erasing and undo.
2. `TimeController`: handles timed stroke fading and converts finished strokes into particle data.
3. `ParticleController`: updates particle movement, drag interaction and glass boundary constraints.

The main sketch file coordinates these scenes and calls controller methods.

### User-input mechanic
`DrawController` captures mouse input, builds stroke geometry, supports multiple brush tools, erasing, dragging strokes and undo. It stores finished strokes and timestamps them for the time-based dissolve system.

1. Class & object-oriented programming:

Encapsulates all drawing logic inside `DrawController`. It separates user input handling, stroke storage, rendering and tool behaviour into one self-contained module.

2. Mouse input events (`mousePressed`, `mouseDragged`, `mouseReleased`):

Captures mouse state to start, extend and finish strokes. Right-click drag triggers eraser, while dragging with the hand tool moves existing strokes.

3. `dist()` for geometry sampling and collision checking:

Measures distances between points: interpolates extra points to smooth lines, detects points within erase radius, and checks stroke intersection with the glass boundary.

4. `random()` for brush jitter:

Adds subtle positional noise to pencil points to simulate natural sketch texture.

5. `constrain()`:

Clamps brush size and UI preview position to valid canvas ranges.

6. `push()` / `pop()` drawing state stack:

Encapsulates brush styling, so stroke colour, weight and alpha settings do not affect other drawn elements.

7. `strokeCap()` / `strokeJoin()` and HSB colour:

Creates distinct brush styles (pencil / pen / marker) with adjustable transparency and smooth hue rotation.

8. `millis()`:

Attaches a finish timestamp to each completed stroke, feeding data into the time-based dissolve system.

9. `circle()`, `rect()`, `text()`:

Draws cursor preview and HUD showing active tool, hue and brush size.

### Timebased mechanic
After a drawing stroke finishes, `TimeController` creates a `DissolveBatch`; the batch gradually fades the original stroke and spawns `DecompParticle` particles at intervals, then exports these particles to the `ParticleController` once the fading sequence completes.

1. Class & object-oriented programming: 

Used to separate logic into `DecompParticle`, `DissolveBatch`, `TimeController`. It keeps particle behaviour, fading batches and timeline management modular, clean and reusable.

2. `millis()` for custom timeline control:

Instead of frameCount, `millis()` creates time-stable animations. It tracks the start time of each dissolve batch.

3. `p5.Vector` (`createVector()`):

Stores particle position for clean position updates. It supports vector-based movement and can be extended easily for collision and drag interactions later.

4. `random()` for random-walk drift effect:

`random(-decompTurn, decompTurn)` changes movement angle each frame. This creates the natural, unstructured drifting motion of ink particles.

5. `map()` & `constrain()`:

`map()` converts elapsed time into a 0–1 progress value for opacity fading. 

__ink particles:__ Particle count is calculated by total stroke length multiplied by brush size, so thicker and longer strokes generate more ink particles. 

`constrain()` caps particle count between min and max values to prevent performance overload.

6. `push()` / `pop()` drawing state stack:

Isolate stroke styling (hue, alpha, stroke weight) for fading strokes. It avoids style leaking to other drawing elements on the canvas.

7. `strokeCap(ROUND)`, `noFill()`, `stroke()`:

Fine-grained drawing style control for smooth hand-drawn strokes, with dynamic alpha for the fade-out effect.

8. `dist()`:

Calculates stroke segment length to compute total "ink volume" and skip broken, long-gap stroke segments during rendering.

### Perlin Noise mechanic
After a drawn stroke dissolves, it breaks into particles. Particles behave differently __inside / outside the glass vessel__. Perlin noise generates swirling flow and drift, while random values decide particle behaviour modes.

1. Class & object-oriented programming:

Encapsulates all particle simulation logic inside `ParticleController` and `Particle` class. Separates particle spawning, force update, collision checking, attractor iteration and rendering into one self-contained module. It receives new particles from the time-based dissolve mechanic via `addParticles()`.

2. `Perlin noise` & `chaotic attractor` for particle movement

`noise()` and the attractor rule drive two core regions:

         (1) Inside glass: `curlNoise()` computes a rotational noise field to create continuous swirling currents for particles to follow.

         (2) Outside glass: Particles choose between two motion modes — smooth `Perlin‑noise` drift, or gradual transition onto the `chaotic attractor` path.

3. `random()` for behaviour branching:

`random()` selects each particle’s behaviour mode when it leaves the glass: either `drift` (pure noise wandering) or `attractor` (following the chaotic attractor shape).

It introduces controlled variation so every particle’s long-term path is different.

4. `dist()` for proximity checking:

`dist()` is used in multiple interaction rules:

         (1) Mouse disturbance: push particles within `DISTURB_RADIUS`

         (2) Hand tool grab: collect particles within `GRAB_RADIUS`

         (3) Eraser: remove particles within `ERASE_RADIUS`

         (4) Resolve overlaps: measure distance between adjacent particles to avoid stacking

5. `constrain()`:

Restricts particle positions to the canvas bounds and limits blending values, preventing particles from drifting off-screen.

6. `lerp()` for smooth state transition:

Linearly interpolates particle position between noise drift and the chaotic attractor target, creating a gradual handover instead of abrupt movement switching.

7. Offscreen graphics buffer & pixel mask:

A precomputed pixel mask tests whether a particle is inside the glass. A separate `createGraphics()` trace layer accumulates faint trails to visualise the emergent attractor shape.

### The key decisions for teamwork
Our core discussion focused on particle motion, with the glass container as the central interactive element.

1. __Initial idea:__ Particles moved freely with random drift, ignoring the glass boundary. This failed to leverage the glass as a meaningful spatial constraint.

2. __Revised design V1:__ We split particle behaviour into two distinct states based on their position relative to the glass:

         (1) Particles inside the glass: Follow curl-noise swirling flow, with overlap constraints to simulate liquid-like volume.

         (2) Particles outside the glass: Drift slowly with gentle Perlin noise and can wrap around the canvas edges.

3. __Final iteration:__ We expanded the outside behaviour to two optional motion modes:

         (1) Particles inside the glass: Remain governed by curl-noise swirling flow with overlap constraints.

         (2) Particles outside the glass: Randomly choose between gentle Perlin-noise drift, or a smooth transition onto a chaotic attractor orbit. Particles still wrap around canvas edges.

4. __Further interaction extension:__ We added the hand grab tool from the user-input mechanic. Users can drag groups of particles directly, modifying their position and momentum to interact with the particle sandbox.

# Mechanic ownership
### Chenghao Zhu: User-input mechanic
Captures mouse input for drawing, erasing, undo and stroke dragging, and records timestamps for completed strokes.

### Yufei Meng: Time-based mechanic
Manages stroke fade-out on a timed schedule, spawns ink particles and passes particle data to the particle simulation.

### Millicent: Particle / Perlin noise mechanic
Runs the particle simulation, using Perlin curl noise to create swirling flow inside the glass and slow drift outside, with collision and interactive drag functions.

# AI acknowledgement
We used Doubao and ChatGPT to support this project. AI helped refactor modular p5.js code, debug particle physics, curl noise and glass collision logic, and refine written documentation. All AI outputs were edited, tested and integrated by our team. Core design ideas belong to the group.

# External reference
We use `chaotic attractor` in Particle-mechanic. (e.g. // this technique is from www.source-url.com).

# Interaction instructions: 
1. Draw strokes on the canvas with your mouse.
2. Drawn lines fade gradually and dissolve into ink particles.
3. Particles inside the glass swirl in liquid-like curl flow; particles outside drift slowly and wrap around screen edges.
4. Hover the mouse to push particles away.
5. Use the hand tool to click, drag and release particle groups.
6. Continue drawing to add new particles anytime.


