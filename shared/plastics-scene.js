/* Three plastics you can rub against each other, shared by
 *   rub_plastics.html      (plastics only)
 *   add_stick_plastic.html (plastics plus a Fun Fly Stick, whose charge we
 *                           already decided is negative)
 *
 * The charges are never drawn. The whole point of the pair of sims is that
 * rubbing alone tells you which plastics are opposite, and only a reference
 * charge of known sign tells you which is which.
 */
(function (global) {
  'use strict';
  var CS = global.ChargeSim;

  // Position on the triboelectric series. The lower one picks up the negative
  // charge when a pair is rubbed together.
  var SERIES = { PVC: 0, PET: 1, PA: 2 };
  var RUB_Q = 2.6;
  var STICK_Q = -3.2;

  function buildPlasticsScene(opts) {
    var canvas = opts.canvas;
    var withStick = !!opts.withStick;
    var W = 900, H = 600;
    var stickOn = false;
    var selected = [];

    var world = new CS.World({ W: W, H: H, bounds: { x0: 30, y0: 30, x1: W - 30, y1: H - 30 } });
    // Plastics are insulators, so touching never moves charge. The stick is the
    // one thing that can put charge onto something, and only by rubbing.
    world.onContact = function () { return true; };

    var SLABS = [
      { id: 'PVC', x: 300, y: 150, color: '#7fb069' },
      { id: 'PET', x: 300, y: 320, color: '#e0a458' },
      { id: 'PA',  x: 300, y: 490, color: '#8e7cc3' }
    ];

    function build() {
      world.bodies.length = 0;
      selected = [];
      stickOn = false;
      SLABS.forEach(function (s) {
        world.add({ id: s.id, kind: 'slab', x: s.x, y: s.y, r: 40, q: 0,
                    conductor: false, label: s.id, color: s.color });
      });
      if (withStick) {
        world.add({ id: 'stick', kind: 'stick', x: 720, y: 205, r: 30, q: 0, cap: 60 });
      }
      syncUi();
    }

    var m = CS.mountCanvas(canvas, W, H, draw);

    function pick(x, y) {
      for (var i = world.bodies.length - 1; i >= 0; i--) {
        var b = world.bodies[i], dx = x - b.x, dy = y - b.y, rr = b.r + 6;
        if (b.kind === 'stick') {
          if (Math.abs(dx) < 46 && dy > -24 && dy < 196) return b;
          continue;
        }
        if (dx * dx + dy * dy < rr * rr) return b;
      }
      return null;
    }

    CS.makeDragger(canvas, m.toLogical, pick, {
      onPick: function (b) {
        canvas.classList.add('grabbing');
        if (b.kind !== 'slab') return;
        var i = selected.indexOf(b.id);
        if (i >= 0) selected.splice(i, 1);
        else { selected.push(b.id); if (selected.length > 2) selected.shift(); }
        syncUi();
      },
      onDrop: function () { canvas.classList.remove('grabbing'); }
    });

    function rub() {
      if (selected.length !== 2) return;
      var a = world.get(selected[0]), b = world.get(selected[1]);
      var lower = SERIES[a.id] < SERIES[b.id] ? a : b;
      var upper = lower === a ? b : a;
      lower.q = -RUB_Q;   // further left on the series -> picks up the negative
      upper.q = RUB_Q;
      // Nudge them apart so you can see them react right away.
      var dx = upper.x - lower.x, dy = upper.y - lower.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      lower.x -= dx / d * 20; lower.y -= dy / d * 20;
      upper.x += dx / d * 20; upper.y += dy / d * 20;
      syncUi();
    }

    function dischargeAll() {
      world.bodies.forEach(function (b) { if (b.kind === 'slab') b.q = 0; });
      syncUi();
    }

    function syncUi() {
      if (opts.rubBtn) {
        opts.rubBtn.disabled = selected.length !== 2;
        opts.rubBtn.textContent = selected.length === 2
          ? 'Rub ' + selected[0] + ' and ' + selected[1] + ' together'
          : 'Rub two plastics together';
      }
      if (opts.status) {
        opts.status.textContent = selected.length === 2
          ? ''
          : 'Click two of the plastics to choose them.';
      }
    }

    function drawSlab(ctx, b) {
      ctx.save();
      ctx.translate(b.x, b.y);
      var w = 84, h = 58;
      ctx.fillStyle = b.color;
      ctx.strokeStyle = selected.indexOf(b.id) >= 0 ? '#1F3864' : '#7c8896';
      ctx.lineWidth = selected.indexOf(b.id) >= 0 ? 3.5 : 1.5;
      CS.roundRect(ctx, -w / 2, -h / 2, w, h, 7);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#26313d';
      ctx.font = 'bold 20px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.label, 0, 1);
      ctx.restore();
    }

    function draw() {
      var ctx = m.ctx;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      for (var i = 0; i < world.bodies.length; i++) {
        var b = world.bodies[i];
        if (b.kind === 'slab') drawSlab(ctx, b);
        else if (b.kind === 'stick') CS.drawStick(ctx, b.x, b.y, stickOn, 0.95);
      }
    }

    function frame() {
      if (withStick) {
        var s = world.get('stick');
        if (s) s.q = stickOn ? STICK_Q : 0;
      }
      world.step();
      draw();
      requestAnimationFrame(frame);
    }

    if (opts.rubBtn) opts.rubBtn.addEventListener('click', rub);
    if (opts.clearBtn) opts.clearBtn.addEventListener('click', dischargeAll);
    if (opts.resetBtn) opts.resetBtn.addEventListener('click', build);
    if (opts.powerBtn) {
      opts.powerBtn.addEventListener('click', function () {
        stickOn = !stickOn;
        this.textContent = stickOn ? 'Turn the stick off' : 'Turn the stick on';
        this.classList.toggle('on', stickOn);
      });
    }

    build();
    frame();
    var api = { world: world, build: build, rub: rub, draw: draw };
    global.scene = api;   // handy when checking the sim from the console
    return api;
  }

  global.buildPlasticsScene = buildPlasticsScene;
})(window);
