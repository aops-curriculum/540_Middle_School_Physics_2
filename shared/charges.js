/* Shared electrostatics engine for the 540 Middle School Physics 2 sims.
 *
 * The physics here is deliberately cartoon-simple. It only has to reproduce
 * the observations the lesson makes:
 *   - two charged objects repel when their charges have the same sign and
 *     attract when the signs differ,
 *   - a charged object attracts a neutral one (weaker, and falls off faster),
 *   - conductors that touch share their charge,
 *   - a hand grounds whatever it touches, a rubber glove does not.
 *
 * Each simulation supplies its own body list and draw hooks; everything below
 * is common. Design grid is a fixed logical W x H, scaled to the element.
 */
(function (global) {
  'use strict';

  // Tuned so that at about a third of the stage width a charged object visibly
  // pulls a neutral one in over a second or two, and two charged objects push
  // apart a bit faster than that.
  var K_CHARGED = 2400;    // charged <-> charged, 1/r^2
  var K_NEUTRAL = 600000;  // charged <-> neutral (induction), 1/r^3
  var F_MAX = 18;          // keeps a close approach from launching anything
  var R_MIN = 40;          // softening, keeps forces finite on contact
  var DAMP = 0.86;         // velocity damping per frame
  var MAX_V = 7;           // slow enough to watch, in logical px per frame

  function dist(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy) || 1e-6;
  }

  /** A body in the world. `q` is charge; `cap` is how much charge it holds
   *  when sharing (a big metal pot swallows far more than a scrap of foil). */
  function Body(o) {
    this.id = o.id;
    this.kind = o.kind || 'flyer';
    this.x = o.x; this.y = o.y;
    this.vx = 0; this.vy = 0;
    this.r = o.r != null ? o.r : 18;
    this.q = o.q || 0;
    this.cap = o.cap != null ? o.cap : 1;
    this.fixed = !!o.fixed;
    this.conductor = o.conductor !== false;
    this.label = o.label || '';
    this.color = o.color || '#7a8794';
    this.home = { x: o.x, y: o.y };
    this.held = false;
    this.data = o.data || {};
  }

  function World(opts) {
    opts = opts || {};
    this.bodies = [];
    this.W = opts.W || 900;
    this.H = opts.H || 600;
    this.bounds = opts.bounds || { x0: 10, y0: 10, x1: this.W - 10, y1: this.H - 10 };
    this.onContact = opts.onContact || null;   // (a, b) -> true to skip default
    this.gravity = opts.gravity || 0;
    this.enabled = true;
  }

  World.prototype.add = function (o) {
    var b = o instanceof Body ? o : new Body(o);
    this.bodies.push(b);
    return b;
  };

  World.prototype.get = function (id) {
    for (var i = 0; i < this.bodies.length; i++) {
      if (this.bodies[i].id === id) return this.bodies[i];
    }
    return null;
  };

  /** Force on `a` from `b`, as [fx, fy]. Sign convention: like charges repel. */
  World.prototype.force = function (a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var r = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    // Never let the separation fall below the point where the two are
    // touching: past that the direction flips every frame and the pair
    // rattles instead of settling.
    var rs = Math.max(r, a.r + b.r, R_MIN);
    var ux = dx / r, uy = dy / r;
    var mag;
    if (a.q !== 0 && b.q !== 0) {
      // Product positive (like charges) -> repulsion, so push a away from b.
      mag = -K_CHARGED * a.q * b.q / (rs * rs);
    } else if (a.q !== 0 || b.q !== 0) {
      // Induction: the charged one polarizes the neutral one. Always attractive,
      // and it dies off faster than the charged-charged force.
      var qq = (a.q || b.q);
      mag = K_NEUTRAL * qq * qq / (rs * rs * rs);
    } else {
      return [0, 0];
    }
    if (mag > F_MAX) mag = F_MAX;
    if (mag < -F_MAX) mag = -F_MAX;
    return [mag * ux, mag * uy];
  };

  World.prototype.step = function () {
    if (!this.enabled) return;
    var bs = this.bodies, i, j;
    for (i = 0; i < bs.length; i++) {
      var a = bs[i];
      if (a.fixed || a.held) { a.vx = 0; a.vy = 0; continue; }
      var fx = 0, fy = 0;
      for (j = 0; j < bs.length; j++) {
        if (i === j) continue;
        var f = this.force(a, bs[j]);
        fx += f[0]; fy += f[1];
      }
      a.vx = (a.vx + fx) * DAMP;
      a.vy = (a.vy + fy + this.gravity) * DAMP;
      var sp = Math.sqrt(a.vx * a.vx + a.vy * a.vy);
      if (sp > MAX_V) { a.vx *= MAX_V / sp; a.vy *= MAX_V / sp; }
      a.x += a.vx; a.y += a.vy;
      var bd = this.bounds;
      if (a.x < bd.x0 + a.r) { a.x = bd.x0 + a.r; a.vx = -a.vx * 0.4; }
      if (a.x > bd.x1 - a.r) { a.x = bd.x1 - a.r; a.vx = -a.vx * 0.4; }
      if (a.y < bd.y0 + a.r) { a.y = bd.y0 + a.r; a.vy = -a.vy * 0.4; }
      if (a.y > bd.y1 - a.r) { a.y = bd.y1 - a.r; a.vy = -a.vy * 0.4; }
    }
    // Contacts: separate the pair so nothing passes through anything, then
    // let charge move.
    for (i = 0; i < bs.length; i++) {
      for (j = i + 1; j < bs.length; j++) {
        var p = bs[i], w = bs[j];
        var d = dist(p, w);
        var touch = p.r + w.r;
        if (d >= touch) continue;
        separate(p, w, d, touch);
        if (this.onContact && this.onContact(p, w)) continue;
        transfer(p, w);
      }
    }
  };

  /** Push two overlapping bodies apart and drop the part of their velocity
   *  that was carrying them into each other. */
  function separate(a, b, d, touch) {
    var ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
    var push = (touch - d);
    var aFree = !(a.fixed || a.held), bFree = !(b.fixed || b.held);
    if (aFree && bFree) {
      a.x -= ux * push / 2; a.y -= uy * push / 2;
      b.x += ux * push / 2; b.y += uy * push / 2;
    } else if (aFree) {
      a.x -= ux * push; a.y -= uy * push;
    } else if (bFree) {
      b.x += ux * push; b.y += uy * push;
    }
    var rel = (b.vx - a.vx) * ux + (b.vy - a.vy) * uy;
    if (rel < 0) {   // closing
      if (aFree) { a.vx += ux * rel / 2; a.vy += uy * rel / 2; }
      if (bFree) { b.vx -= ux * rel / 2; b.vy -= uy * rel / 2; }
    }
  }

  /** Default contact rule: two conductors share charge in proportion to
   *  capacity; anything insulating keeps what it has. */
  function transfer(a, b) {
    if (!a.conductor || !b.conductor) return;
    var total = a.q + b.q;
    var capSum = a.cap + b.cap;
    var qa = total * (a.cap / capSum);
    var qb = total * (b.cap / capSum);
    // Ease toward equilibrium so the flow is visible rather than instant.
    a.q += (qa - a.q) * 0.35;
    b.q += (qb - b.q) * 0.35;
    if (Math.abs(a.q) < 0.02) a.q = 0;
    if (Math.abs(b.q) < 0.02) b.q = 0;
  }

  // --- canvas plumbing ------------------------------------------------------

  /** Set up a canvas for a fixed logical grid, handling devicePixelRatio and
   *  resize. Returns { ctx, toLogical }. */
  function mountCanvas(canvas, W, H, draw) {
    var ctx = canvas.getContext('2d');
    function fit() {
      var dpr = global.devicePixelRatio || 1;
      var cw = canvas.clientWidth, ch = canvas.clientHeight;
      if (!cw || !ch) return;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
      draw();
    }
    global.addEventListener('resize', fit);
    if (global.ResizeObserver) new ResizeObserver(fit).observe(canvas);
    setTimeout(fit, 0);
    function toLogical(ev) {
      var rect = canvas.getBoundingClientRect();
      var pt = ev.touches ? ev.touches[0] : ev;
      return {
        x: (pt.clientX - rect.left) * W / rect.width,
        y: (pt.clientY - rect.top) * H / rect.height
      };
    }
    return { ctx: ctx, fit: fit, toLogical: toLogical };
  }

  /** Pointer dragging for a world. `pick` maps a point to a body (or null). */
  function makeDragger(canvas, toLogical, pick, opts) {
    opts = opts || {};
    var held = null, ox = 0, oy = 0;
    function down(ev) {
      var p = toLogical(ev);
      var b = pick(p.x, p.y);
      if (!b) return;
      ev.preventDefault();
      held = b; b.held = true; b.vx = 0; b.vy = 0;
      ox = b.x - p.x; oy = b.y - p.y;
      if (opts.onPick) opts.onPick(b);
    }
    function move(ev) {
      if (!held) return;
      ev.preventDefault();
      var p = toLogical(ev);
      held.x = p.x + ox; held.y = p.y + oy;
      if (opts.onDrag) opts.onDrag(held);
    }
    function up() {
      if (!held) return;
      held.held = false;
      if (opts.onDrop) opts.onDrop(held);
      held = null;
    }
    canvas.addEventListener('mousedown', down);
    global.addEventListener('mousemove', move);
    global.addEventListener('mouseup', up);
    canvas.addEventListener('touchstart', down, { passive: false });
    global.addEventListener('touchmove', move, { passive: false });
    global.addEventListener('touchend', up);
    return { get held() { return held; } };
  }

  // --- drawing helpers ------------------------------------------------------

  var RED = '#d94141';    // negative charge
  var BLUE = '#3466c4';   // positive charge

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Draw n charge marks scattered inside a circle of radius r, using a fixed
   *  pseudo-random layout per body so they don't jitter frame to frame. */
  function scatter(n, r, seed) {
    var pts = [], s = seed || 1;
    function rnd() { s = (s * 9301 + 49297) % 233280; return s / 233280; }
    for (var i = 0; i < n; i++) {
      var a = rnd() * Math.PI * 2;
      var rr = Math.sqrt(rnd()) * r;
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    return pts;
  }

  function drawSign(ctx, x, y, positive, size) {
    size = size || 5;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = positive ? BLUE : RED;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - size * 0.5, y); ctx.lineTo(x + size * 0.5, y);
    if (positive) { ctx.moveTo(x, y - size * 0.5); ctx.lineTo(x, y + size * 0.5); }
    ctx.stroke();
  }

  /** A blob of the one-fluid "essence" model: a soft red splodge. */
  function drawEssence(ctx, x, y, r, alpha) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(217,65,65,' + (0.85 * alpha) + ')');
    g.addColorStop(1, 'rgba(217,65,65,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /** The Fun Fly Stick: a wand with a bulb on top and a switch on the grip.
   *  (x, y) is the bulb, which is where the charge lives, so it is also the
   *  body's position in the world. */
  function drawStick(ctx, x, y, on, scale) {
    scale = scale || 1;
    ctx.save();
    ctx.translate(x, y + 84 * scale);
    ctx.scale(scale, scale);
    // grip
    ctx.fillStyle = '#4a4f57';
    roundRect(ctx, -13, 0, 26, 96, 9); ctx.fill();
    // shaft
    ctx.fillStyle = '#9aa3ad';
    roundRect(ctx, -6, -74, 12, 80, 5); ctx.fill();
    // bulb
    ctx.beginPath();
    ctx.arc(0, -84, 15, 0, Math.PI * 2);
    ctx.fillStyle = on ? '#ffd257' : '#c9ced5';
    ctx.fill();
    ctx.strokeStyle = '#6d747c'; ctx.lineWidth = 1.5; ctx.stroke();
    if (on) {
      ctx.strokeStyle = 'rgba(255,196,60,0.75)';
      ctx.lineWidth = 2;
      for (var i = 0; i < 8; i++) {
        var a = i * Math.PI / 4 + 0.2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 19, -84 + Math.sin(a) * 19);
        ctx.lineTo(Math.cos(a) * 27, -84 + Math.sin(a) * 27);
        ctx.stroke();
      }
    }
    // switch
    ctx.fillStyle = on ? '#4caf50' : '#8b929b';
    roundRect(ctx, -7, 22, 14, 20, 4); ctx.fill();
    ctx.restore();
  }

  /** A "flyer": a light metallized ring. Collapsed when neutral, open when
   *  charged, because every part of it repels every other part. */
  function drawFlyer(ctx, b, openness) {
    var open = openness == null ? Math.min(1, Math.abs(b.q) / 1.5) : openness;
    var rx = b.r * (0.35 + 0.65 * open);
    var ry = b.r * (1.0 - 0.35 * open);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.strokeStyle = '#8e6fb8';
    ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(190,170,220,0.30)';
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  global.ChargeSim = {
    Body: Body, World: World, transfer: transfer,
    mountCanvas: mountCanvas, makeDragger: makeDragger,
    roundRect: roundRect, scatter: scatter, drawSign: drawSign,
    drawEssence: drawEssence, drawStick: drawStick, drawFlyer: drawFlyer,
    RED: RED, BLUE: BLUE, dist: dist
  };
})(window);
