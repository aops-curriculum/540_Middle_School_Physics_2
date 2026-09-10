/* The Fun Fly Stick bench, shared by three sims that show the same apparatus
 * under three different pictures of what charge is:
 *
 *   fly_stick.html          model: 'none'      nothing is drawn but the objects
 *   flowing_essence.html    model: 'one'       one red fluid that flows around
 *   electric_induction.html model: 'two'       red and blue charge, both present
 *                                              in everything, able to separate
 *
 * Keeping them in one file means the apparatus behaves identically in all
 * three; only the picture on top changes.
 */
(function (global) {
  'use strict';
  var CS = global.ChargeSim;

  function buildFlyStickScene(opts) {
    var canvas = opts.canvas;
    var model = opts.model || 'none';
    var W = 900, H = 600;
    var STICK_Q = -3.2;
    var stickOn = false;

    var world = new CS.World({ W: W, H: H, bounds: { x0: 20, y0: 20, x1: W - 20, y1: H - 20 } });

    function build() {
      world.bodies.length = 0;
      setPower(false);
      world.add({ id: 'stick', kind: 'stick', x: 130, y: 215, r: 30, q: 0, cap: 60, fixed: true });
      world.add({ id: 'f1', kind: 'flyer', x: 430, y: 170, r: 30, cap: 6 });
      world.add({ id: 'f2', kind: 'flyer', x: 430, y: 430, r: 30, cap: 6 });
      if (opts.paper !== false) {
        for (var i = 0; i < 6; i++) {
          world.add({ id: 'p' + i, kind: 'paper', r: 11,
            x: 620 + (i % 3) * 34, y: 250 + Math.floor(i / 3) * 40 });
        }
      }
      world.add({ id: 'hand', kind: 'hand', x: 810, y: 500, r: 30, q: 0, cap: 400, fixed: true });
      world.add({ id: 'glove', kind: 'glove', x: 810, y: 110, r: 30, q: 0, conductor: false, fixed: true });
      world.bodies.forEach(function (b, i) {
        b.data.seed = i * 17 + 3;
        if (b.kind === 'paper') b.data.rot = ((i * 37) % 90 - 45) * Math.PI / 180;
      });
    }

    world.onContact = function (a, b) {
      var kinds = [a.kind, b.kind];
      // Rubber first: if a glove is involved, nothing moves at all, whatever
      // the other object is.
      if (kinds.indexOf('glove') >= 0) return true;
      // Your hand runs to ground through you, so both ends come out neutral.
      if (kinds.indexOf('hand') >= 0) { a.q = 0; b.q = 0; return true; }
      if (kinds.indexOf('stick') >= 0) {
        // The stick is a source, not a bucket: it drags the other object
        // toward its own charge and never runs down.
        var o = a.kind === 'stick' ? b : a;
        if (stickOn) o.q += (STICK_Q - o.q) * 0.40;
        return true;
      }
      return false;
    };

    var m = CS.mountCanvas(canvas, W, H, draw);

    function pick(x, y) {
      var bs = world.bodies;
      for (var i = bs.length - 1; i >= 0; i--) {
        var b = bs[i], dx = x - b.x, dy = y - b.y, rr = b.r + 8;
        // The wand is long and thin, so grab it with a rectangle rather than
        // a circle around the bulb.
        if (b.kind === 'stick') {
          if (Math.abs(dx) < 46 && dy > -24 && dy < 196) return b;
          continue;
        }
        if (dx * dx + dy * dy < rr * rr) return b;
      }
      return null;
    }
    CS.makeDragger(canvas, m.toLogical, pick, {
      onPick: function () { canvas.classList.add('grabbing'); },
      onDrop: function () { canvas.classList.remove('grabbing'); }
    });

    // --- charge pictures ----------------------------------------------------

    /** Direction from a body toward the nearest strong charge, used to push a
     *  polarized body's positive and negative charge to opposite ends. */
    function polarAxis(b) {
      var bx = 0, by = 0, best = 0;
      for (var i = 0; i < world.bodies.length; i++) {
        var o = world.bodies[i];
        if (o === b || !o.q) continue;
        var dx = o.x - b.x, dy = o.y - b.y;
        var r2 = dx * dx + dy * dy;
        var w = Math.abs(o.q) / Math.max(r2, 400);
        if (w > best) { best = w; var r = Math.sqrt(r2); bx = dx / r; by = dy / r; }
      }
      // sign(o.q) decides which way the body's own positive charge slides
      var src = null, bestw = 0;
      for (var j = 0; j < world.bodies.length; j++) {
        var p = world.bodies[j];
        if (p === b || !p.q) continue;
        var ddx = p.x - b.x, ddy = p.y - b.y;
        var ww = Math.abs(p.q) / Math.max(ddx * ddx + ddy * ddy, 400);
        if (ww > bestw) { bestw = ww; src = p; }
      }
      var strength = src ? Math.min(1, bestw * 9000) : 0;
      var toward = src && src.q < 0 ? 1 : -1;  // positive charge moves toward a negative source
      return { x: bx * toward, y: by * toward, s: strength };
    }

    function drawCharge(ctx, b) {
      if (model === 'none') return;
      if (b.kind === 'hand' || b.kind === 'glove' || b.kind === 'stick') {
        if (b.kind === 'stick' && model !== 'none' && b.q) {
          for (var k = 0; k < 6; k++) {
            var a = k * Math.PI / 3;
            var px = b.x + Math.cos(a) * 11, py = b.y + Math.sin(a) * 11;
            if (model === 'one') CS.drawEssence(ctx, px, py, 12, 1);
            else CS.drawSign(ctx, px, py, false, 4.5);
          }
        }
        return;
      }
      // Charge marks have to stay inside the object they belong to, and a
      // collapsed flyer is a narrow ellipse, so scatter in that shape.
      var open = b.kind === 'flyer' ? Math.min(1, Math.abs(b.q) / 1.5) : 1;
      var sx = b.kind === 'flyer' ? b.r * (0.35 + 0.65 * open) * 0.5 : b.r * 0.5;
      var sy = b.kind === 'flyer' ? b.r * (1.0 - 0.35 * open) * 0.55 : b.r * 0.42;
      var mark = Math.max(3, Math.min(5, b.r * 0.17));
      var i;
      if (model === 'one') {
        var n = Math.min(9, Math.round(Math.abs(b.q) * 3));
        var pts = CS.scatter(n, 1, b.data.seed);
        for (i = 0; i < n; i++) {
          CS.drawEssence(ctx, b.x + pts[i][0] * sx * 1.4, b.y + pts[i][1] * sy * 1.4, mark * 2.2, 1);
        }
        return;
      }
      // Two-fluid: every object always holds both kinds. A neutral object holds
      // equal numbers; a charged one has a surplus of one. Nearby charge pulls
      // them to opposite ends.
      var base = b.kind === 'paper' ? 3 : 5;
      var extra = Math.round(Math.abs(b.q) * 1.4);
      var nNeg = base + (b.q < 0 ? extra : 0);
      var nPos = base + (b.q > 0 ? extra : 0);
      var ax = polarAxis(b);
      var shx = 0.5 * ax.s * ax.x * sx, shy = 0.5 * ax.s * ax.y * sy;
      var pp = CS.scatter(nPos, 1, b.data.seed);
      var pn = CS.scatter(nNeg, 1, b.data.seed + 91);
      for (i = 0; i < nPos; i++) {
        CS.drawSign(ctx, b.x + pp[i][0] * sx + shx, b.y + pp[i][1] * sy + shy, true, mark);
      }
      for (i = 0; i < nNeg; i++) {
        CS.drawSign(ctx, b.x + pn[i][0] * sx - shx, b.y + pn[i][1] * sy - shy, false, mark);
      }
    }

    // --- object art ---------------------------------------------------------

    function drawPaper(ctx, b) {
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.data.rot || 0);
      ctx.fillStyle = '#fdfdf7'; ctx.strokeStyle = '#b9b9ac'; ctx.lineWidth = 1.2;
      CS.roundRect(ctx, -b.r, -b.r * 0.7, b.r * 2, b.r * 1.4, 2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    function drawHand(ctx, b) {
      ctx.save(); ctx.translate(b.x, b.y);
      ctx.fillStyle = '#e8b98f'; ctx.strokeStyle = '#b98d63'; ctx.lineWidth = 1.5;
      CS.roundRect(ctx, -18, -8, 36, 30, 8); ctx.fill(); ctx.stroke();
      for (var i = 0; i < 4; i++) { CS.roundRect(ctx, -17 + i * 9, -26, 8, 22, 4); ctx.fill(); ctx.stroke(); }
      CS.roundRect(ctx, 14, -4, 14, 9, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#55606b'; ctx.font = '12px Arial'; ctx.textAlign = 'center';
      ctx.fillText('hand', 0, 42);
      ctx.restore();
    }

    function drawGlove(ctx, b) {
      ctx.save(); ctx.translate(b.x, b.y);
      ctx.fillStyle = '#f5c542'; ctx.strokeStyle = '#c39a24'; ctx.lineWidth = 1.5;
      CS.roundRect(ctx, -19, -8, 38, 32, 8); ctx.fill(); ctx.stroke();
      for (var i = 0; i < 4; i++) { CS.roundRect(ctx, -18 + i * 9.5, -28, 8.5, 24, 4); ctx.fill(); ctx.stroke(); }
      CS.roundRect(ctx, 15, -4, 15, 10, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#55606b'; ctx.font = '12px Arial'; ctx.textAlign = 'center';
      ctx.fillText('rubber glove', 0, 44);
      ctx.restore();
    }

    function draw() {
      var ctx = m.ctx;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      var bs = world.bodies, i, b;
      for (i = 0; i < bs.length; i++) {
        b = bs[i];
        if (b.kind === 'stick') CS.drawStick(ctx, b.x, b.y, stickOn, 0.95);
        else if (b.kind === 'flyer') CS.drawFlyer(ctx, b);
        else if (b.kind === 'paper') drawPaper(ctx, b);
        else if (b.kind === 'hand') drawHand(ctx, b);
        else if (b.kind === 'glove') drawGlove(ctx, b);
      }
      for (i = 0; i < bs.length; i++) drawCharge(ctx, bs[i]);
    }

    function frame() {
      if (stickOn) { var s = world.get('stick'); if (s) s.q = STICK_Q; }
      world.step();
      draw();
      requestAnimationFrame(frame);
    }

    var powerBtn = opts.powerBtn;
    function setPower(on) {
      stickOn = on;
      if (powerBtn) {
        powerBtn.textContent = on ? 'Turn the stick off' : 'Turn the stick on';
        powerBtn.classList.toggle('on', on);
      }
      if (!on) { var s = world.get('stick'); if (s) s.q = 0; }
    }
    if (powerBtn) powerBtn.addEventListener('click', function () { setPower(!stickOn); });
    if (opts.resetBtn) opts.resetBtn.addEventListener('click', build);

    build();
    frame();
    var api = { world: world, build: build, setPower: setPower, draw: draw };
    global.scene = api;   // handy when checking the sim from the console
    return api;
  }

  global.buildFlyStickScene = buildFlyStickScene;
})(window);
