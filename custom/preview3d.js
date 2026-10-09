/* Agee Jewelry - interactive 3D piece preview for /custom
 * Illustrative only: generic models in a spotlight, recolored by finish. Final design is confirmed in CAD renders.
 * Needs /vendor/three.min.js (three r128), loaded on demand. */
(function () {
  'use strict';

  var root = document.getElementById('preview3d');
  if (!root) return;
  var layout = document.getElementById('custom-layout');
  var stage = root.querySelector('.pv-stage');
  var canvas = root.querySelector('canvas');
  var caption = root.querySelector('.pv-caption');
  var pieceSel = document.querySelector('select[name="piece_type"]');
  var finishSel = document.querySelector('select[name="metal_finish"]');
  var nameWrap = root.querySelector('.pv-name');
  var nameInput = document.getElementById('pv-name');
  var zoomRange = document.getElementById('pv-zoom');
  var pieceChips = root.querySelectorAll('[data-piece]');
  var finishChips = root.querySelectorAll('[data-finish]');
  var cutChips = root.querySelectorAll('[data-cut]');

  var PIECES = {
    'Custom Ring': 'ring',
    'Custom Nameplate': 'nameplate',
    'Picture Frame Pendant': 'frame',
    'Logo/Emblem Pendant': 'emblem',
    'Other': 'chain'
  };
  var FINISHES = {
    '925 Sterling Silver': { color: 0xe9eaec, rough: 0.16 },
    'Silver Plated': { color: 0xdbe2ee, rough: 0.07 },
    '14K Yellow Gold Plated': { color: 0xffc457, rough: 0.14 },
    'Rose Gold Plated': { color: 0xeaa28f, rough: 0.15 }
  };
  var state = { piece: 'Custom Ring', finish: '925 Sterling Silver', cut: 'round', name: 'AGEE' };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var T = null;             // THREE, once loaded
  var ready = false;
  var visible = true;
  var R = {};               // renderer, scene, camera, groups
  var cur = null;           // current built model { root, disposables }
  var mats = null;

  function webglOK() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  function loadThree(cb, fail) {
    if (window.THREE) { cb(); return; }
    var s = document.createElement('script');
    s.src = '/vendor/three.min.js';
    s.onload = cb;
    s.onerror = fail;
    document.head.appendChild(s);
  }

  /* ---------------------------------------------------------------- UI sync */
  function setCaption() {
    var cut = state.cut === 'round' ? 'Round stones' : 'Baguette stones';
    var chosen = pieceSel && pieceSel.value;
    var lead = chosen ? state.piece : 'Sample preview (choose a piece type)';
    caption.textContent = lead + '  ·  ' + state.finish + '  ·  ' + cut;
  }

  function syncChips() {
    var i;
    for (i = 0; i < pieceChips.length; i++) {
      var on = pieceChips[i].getAttribute('data-piece') === state.piece && pieceSel && pieceSel.value;
      pieceChips[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    for (i = 0; i < finishChips.length; i++) {
      finishChips[i].setAttribute('aria-pressed', finishChips[i].getAttribute('data-finish') === state.finish ? 'true' : 'false');
    }
    for (i = 0; i < cutChips.length; i++) {
      cutChips[i].setAttribute('aria-pressed', cutChips[i].getAttribute('data-cut') === state.cut ? 'true' : 'false');
    }
    nameWrap.hidden = PIECES[state.piece] !== 'nameplate';
    setCaption();
  }

  function readSelects() {
    if (pieceSel && PIECES[pieceSel.value]) state.piece = pieceSel.value;
    if (finishSel && FINISHES[finishSel.value]) state.finish = finishSel.value;
  }

  function setSelect(sel, value) {
    if (!sel) return;
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /* ---------------------------------------------------------------- geometry helpers */
  function rrPath(p, w, h, r) {
    var x = -w / 2, y = -h / 2, PI = Math.PI;
    p.moveTo(x + r, y);
    p.lineTo(x + w - r, y);
    p.absarc(x + w - r, y + r, r, -PI / 2, 0, false);
    p.lineTo(x + w, y + h - r);
    p.absarc(x + w - r, y + h - r, r, 0, PI / 2, false);
    p.lineTo(x + r, y + h);
    p.absarc(x + r, y + h - r, r, PI / 2, PI, false);
    p.lineTo(x, y + r);
    p.absarc(x + r, y + r, r, PI, PI * 1.5, false);
    return p;
  }

  function extrude(shape, depth, bevel) {
    var g = new T.ExtrudeGeometry(shape, {
      depth: depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
      bevelSegments: 3, curveSegments: 24
    });
    g.translate(0, 0, -depth / 2);
    return g;
  }

  function resample(points, spacing) {
    var out = [], carry = 0, i;
    for (i = 0; i < points.length; i++) {
      var a = points[i], b = points[(i + 1) % points.length];
      var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy);
      var d = carry;
      while (d < len) {
        out.push({ x: a.x + dx * d / len, y: a.y + dy * d / len, tx: dx / len, ty: dy / len });
        d += spacing;
      }
      carry = d - len;
    }
    return out;
  }

  /* ---------------------------------------------------------------- materials + shared gem geometry */
  function makeMaterials(disp) {
    var f = FINISHES[state.finish];
    var m = {
      metal: new T.MeshStandardMaterial({ color: f.color, metalness: 1, roughness: f.rough, envMapIntensity: 1.7 }),
      brushed: new T.MeshStandardMaterial({ color: f.color, metalness: 1, roughness: 0.36, envMapIntensity: 1.5 }),
      gem: new T.MeshStandardMaterial({
        color: 0xffffff, metalness: 1, roughness: 0.0, envMapIntensity: 2.3, flatShading: true
      })
    };
    disp.push(m.metal, m.brushed, m.gem);
    return m;
  }

  function roundGemGeo() {
    var pts = [
      new T.Vector2(0.0001, -0.56), new T.Vector2(0.17, -0.42), new T.Vector2(0.34, -0.2), new T.Vector2(0.5, 0.0),
      new T.Vector2(0.5, 0.04), new T.Vector2(0.45, 0.12), new T.Vector2(0.36, 0.2), new T.Vector2(0.27, 0.27), new T.Vector2(0.0001, 0.27)
    ];
    var g = new T.LatheGeometry(pts, 12);
    g.rotateY(Math.PI / 12);
    return g;
  }

  function baguetteGeo() {
    var s = new T.Shape();
    var w = 0.34, h = 0.8;
    s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.closePath();
    var g = new T.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.16, bevelSize: 0.1, bevelSegments: 1 });
    g.rotateX(-Math.PI / 2);
    g.computeBoundingBox();
    g.translate(0, -g.boundingBox.max.y + 0.27, 0);
    return g;
  }

  /* A stone with its girdle at the group origin and its table facing +Y. */
  function makeStone(ctx, scale) {
    var m = new T.Mesh(ctx.cut === 'baguette' ? ctx.bagGeo : ctx.roundGeo, ctx.mats.gem);
    m.scale.setScalar(scale);
    return m;
  }

  function stoneOnSurface(ctx, parent, pos, normal, scale, spin) {
    var holder = new T.Group();
    holder.position.copy(pos);
    holder.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), normal.clone().normalize());
    var s = makeStone(ctx, scale);
    if (spin) s.rotation.y = spin;
    holder.add(s);
    parent.add(holder);
    return holder;
  }

  /* Stone lying on a +Z facing plate. angle rotates a baguette's long axis within the plate. */
  function flatStone(ctx, parent, x, y, z, scale, angle) {
    var holder = new T.Group();
    holder.position.set(x, y, z);
    holder.rotation.x = Math.PI / 2;
    var s = makeStone(ctx, scale);
    s.rotation.y = 0;
    holder.add(s);
    var outer = new T.Group();
    outer.position.copy(holder.position);
    holder.position.set(0, 0, 0);
    outer.rotation.z = angle || 0;
    outer.add(holder);
    parent.add(outer);
  }

  function bail(ctx, parent, y) {
    var b = new T.Mesh(new T.TorusGeometry(0.17, 0.05, 14, 32), ctx.mats.metal);
    b.position.set(0, y, 0);
    b.rotation.y = Math.PI / 2;
    ctx.disp.push(b.geometry);
    parent.add(b);
  }

  /* ---------------------------------------------------------------- models */
  function buildRing(ctx) {
    var g = new T.Group();
    var band = new T.Mesh(new T.TorusGeometry(1.0, 0.17, 28, 96), ctx.mats.metal);
    band.scale.set(1, 1, 1.5);
    ctx.disp.push(band.geometry);
    g.add(band);

    var seat = new T.Mesh(new T.CylinderGeometry(0.5, 0.34, 0.26, 24), ctx.mats.metal);
    seat.position.y = 1.2;
    ctx.disp.push(seat.geometry);
    g.add(seat);

    var halo = new T.Mesh(new T.TorusGeometry(0.48, 0.05, 12, 40), ctx.mats.metal);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 1.33;
    ctx.disp.push(halo.geometry);
    g.add(halo);

    stoneOnSurface(ctx, g, new T.Vector3(0, 1.33, 0), new T.Vector3(0, 1, 0), 1.0, 0);

    var angles = [0.42, 0.68, 0.94], i, sgn, a;
    for (i = 0; i < angles.length; i++) {
      for (sgn = -1; sgn <= 1; sgn += 2) {
        a = angles[i] * sgn;
        var n = new T.Vector3(Math.sin(a), Math.cos(a), 0);
        var p = n.clone().multiplyScalar(1.17);
        stoneOnSurface(ctx, g, p, n, 0.3 - i * 0.03, 0);
      }
    }
    g.rotation.x = 0.2;
    g.rotation.y = 0.5;
    return g;
  }

  var _fontReady = false;
  function nameTexture(text) {
    var c = document.createElement('canvas');
    c.width = 1400; c.height = 360;
    var x = c.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    var size = 260, family = _fontReady ? '"Cinzel", Georgia, serif' : 'Georgia, serif';
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
    do { x.font = '700 ' + size + 'px ' + family; size -= 6; } while (x.measureText(text).width > c.width - 60 && size > 40);
    x.fillText(text, c.width / 2, c.height / 2 + 10);
    var t = new T.CanvasTexture(c);
    t.anisotropy = 4;
    return t;
  }

  function buildNameplate(ctx) {
    var g = new T.Group();
    var shape = rrPath(new T.Shape(), 3.3, 1.2, 0.22);
    var plate = new T.Mesh(extrude(shape, 0.14, 0.04), ctx.mats.brushed);
    ctx.disp.push(plate.geometry);
    g.add(plate);
    var zf = 0.07 + 0.04 + 0.002;

    var text = (state.name || 'AGEE').toUpperCase().slice(0, 12);
    var tex = nameTexture(text);
    ctx.disp.push(tex);
    var tm = new T.MeshStandardMaterial({
      color: FINISHES[state.finish].color, metalness: 1, roughness: 0.08, envMapIntensity: 2.0,
      alphaMap: tex, transparent: true, bumpMap: tex, bumpScale: 1.2
    });
    ctx.disp.push(tm);
    ctx.textMat = tm;
    var tp = new T.Mesh(new T.PlaneGeometry(2.75, 0.7), tm);
    tp.position.set(0, 0, zf + 0.012);
    ctx.disp.push(tp.geometry);
    g.add(tp);

    var x;
    for (x = -1.42; x <= 1.43; x += 0.2842) {
      flatStone(ctx, g, x, 0.46, zf, 0.2, Math.PI / 2);
      flatStone(ctx, g, x, -0.46, zf, 0.2, Math.PI / 2);
    }
    bail(ctx, g, 0.72);
    g.rotation.y = 0.35;
    g.rotation.x = 0.1;
    return g;
  }

  function buildFrame(ctx) {
    var g = new T.Group();
    var shape = rrPath(new T.Shape(), 2.0, 2.5, 0.34);
    shape.holes.push(rrPath(new T.Path(), 1.36, 1.86, 0.16));
    var frame = new T.Mesh(extrude(shape, 0.18, 0.05), ctx.mats.metal);
    ctx.disp.push(frame.geometry);
    g.add(frame);
    var zf = 0.09 + 0.05 + 0.002;

    var c = document.createElement('canvas');
    c.width = 340; c.height = 460;
    var x = c.getContext('2d');
    var grd = x.createLinearGradient(0, 0, 0, 460);
    grd.addColorStop(0, '#26221a'); grd.addColorStop(1, '#0d0c0a');
    x.fillStyle = grd; x.fillRect(0, 0, 340, 460);
    x.fillStyle = 'rgba(212,175,55,0.42)';
    x.beginPath(); x.arc(170, 170, 62, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(170, 400, 120, 120, 0, Math.PI, 0, false); x.fill();
    x.fillStyle = 'rgba(245,240,232,0.55)';
    x.font = '600 20px sans-serif'; x.textAlign = 'center';
    x.fillText('YOUR PHOTO', 170, 440);
    var ph = new T.CanvasTexture(c);
    ctx.disp.push(ph);
    var pm = new T.MeshBasicMaterial({ map: ph });
    ctx.disp.push(pm);
    var photo = new T.Mesh(new T.PlaneGeometry(1.36, 1.86), pm);
    photo.position.z = -0.03;
    ctx.disp.push(photo.geometry);
    g.add(photo);

    var hw = 0.84, hh = 1.09, pts = [
      { x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }
    ];
    var spots = resample(pts, 0.285), i;
    for (i = 0; i < spots.length; i++) {
      var sp = spots[i];
      flatStone(ctx, g, sp.x, sp.y, zf, 0.25, Math.abs(sp.tx) > 0.5 ? Math.PI / 2 : 0);
    }
    bail(ctx, g, 1.42);
    g.rotation.y = 0.35;
    g.rotation.x = 0.08;
    return g;
  }

  function shieldShape(s) {
    var sh = new T.Shape();
    sh.moveTo(0, 1.2 * s);
    sh.lineTo(0.95 * s, 1.0 * s);
    sh.lineTo(0.95 * s, 0.1 * s);
    sh.bezierCurveTo(0.95 * s, -0.6 * s, 0.4 * s, -1.0 * s, 0, -1.3 * s);
    sh.bezierCurveTo(-0.4 * s, -1.0 * s, -0.95 * s, -0.6 * s, -0.95 * s, 0.1 * s);
    sh.lineTo(-0.95 * s, 1.0 * s);
    sh.closePath();
    return sh;
  }

  function buildEmblem(ctx) {
    var g = new T.Group();
    var body = new T.Mesh(extrude(shieldShape(1), 0.2, 0.05), ctx.mats.metal);
    ctx.disp.push(body.geometry);
    g.add(body);
    var zf = 0.1 + 0.05 + 0.002;

    var inner = new T.Mesh(extrude(shieldShape(0.6), 0.06, 0.02), ctx.mats.brushed);
    inner.position.z = zf + 0.03;
    ctx.disp.push(inner.geometry);
    g.add(inner);

    var outline = shieldShape(0.85).getPoints(14), i;
    var spots = resample(outline, 0.27);
    for (i = 0; i < spots.length; i++) {
      var sp = spots[i];
      var ang = Math.atan2(sp.ty, sp.tx);
      flatStone(ctx, g, sp.x, sp.y, zf, 0.24, ang - Math.PI / 2 + Math.PI / 2);
    }

    var rim = new T.Mesh(new T.TorusGeometry(0.36, 0.045, 12, 40), ctx.mats.metal);
    rim.position.set(0, 0.04, zf + 0.07);
    ctx.disp.push(rim.geometry);
    g.add(rim);
    flatStone(ctx, g, 0, 0.04, zf + 0.07, 0.62, 0);
    bail(ctx, g, 1.42);
    g.rotation.y = 0.35;
    g.rotation.x = 0.08;
    return g;
  }

  function buildChain(ctx) {
    var g = new T.Group();
    var R0 = 2.3, cy = 1.2;
    var geo = new T.TorusGeometry(0.3, 0.085, 14, 32);
    ctx.disp.push(geo);
    var a0 = Math.PI * 1.06, a1 = Math.PI * 1.94;
    var pitch = 0.5, count = Math.floor((a1 - a0) * R0 / pitch), i;
    for (i = 0; i <= count; i++) {
      var a = a0 + (a1 - a0) * i / count;
      var pos = new T.Vector3(R0 * Math.cos(a), cy + R0 * Math.sin(a), 0);
      var tan = new T.Vector3(-Math.sin(a), Math.cos(a), 0);
      var radial = new T.Vector3(Math.cos(a), Math.sin(a), 0);
      var zAxis = (i % 2 === 0) ? new T.Vector3(0, 0, 1) : radial;
      var xAxis = new T.Vector3().crossVectors(tan, zAxis).normalize();
      var link = new T.Mesh(geo, ctx.mats.metal);
      link.scale.set(0.82, 1.5, 1.1);
      link.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(xAxis, tan, zAxis));
      link.position.copy(pos);
      g.add(link);
      if (i % 2 === 0) {
        stoneOnSurface(ctx, g, pos.clone().add(new T.Vector3(0, 0, 0.09)), new T.Vector3(0, 0, 1), 0.2, 0);
      }
    }
    g.rotation.x = 0.15;
    g.rotation.y = 0.2;
    return g;
  }

  var BUILDERS = { ring: buildRing, nameplate: buildNameplate, frame: buildFrame, emblem: buildEmblem, chain: buildChain };

  /* ---------------------------------------------------------------- scene */
  function disposeCurrent() {
    if (!cur) return;
    R.turn.remove(cur.root);
    var i;
    for (i = 0; i < cur.disp.length; i++) { if (cur.disp[i] && cur.disp[i].dispose) cur.disp[i].dispose(); }
    cur = null;
  }

  function buildCurrent() {
    if (!ready) return;
    disposeCurrent();
    var disp = [];
    var ctx = { disp: disp, cut: state.cut };
    ctx.mats = mats = makeMaterials(disp);
    ctx.roundGeo = roundGemGeo(); ctx.bagGeo = baguetteGeo();
    disp.push(ctx.roundGeo, ctx.bagGeo);
    var model = BUILDERS[PIECES[state.piece]](ctx);

    // normalize size and center
    var wrap = new T.Group();
    wrap.add(model);
    wrap.updateMatrixWorld(true);
    var box = new T.Box3().setFromObject(model);
    var size = box.getSize(new T.Vector3()), center = box.getCenter(new T.Vector3());
    var maxDim = Math.max(size.x, size.y, size.z);
    model.position.sub(center);
    var scaler = new T.Group();
    scaler.add(wrap);
    scaler.scale.setScalar(3.3 / maxDim);
    cur = { root: scaler, disp: disp, ctx: ctx };
    R.turn.add(scaler);
  }

  function applyFinish() {
    if (!cur || !mats) return;
    var f = FINISHES[state.finish];
    mats.metal.color.setHex(f.color); mats.metal.roughness = f.rough;
    mats.brushed.color.setHex(f.color);
    if (cur.ctx.textMat) cur.ctx.textMat.color.setHex(f.color);
  }

  function makeEnv(renderer) {
    var es = new T.Scene();
    es.add(new T.Mesh(new T.SphereGeometry(30, 32, 16), new T.MeshBasicMaterial({ color: 0x2a2a31, side: T.BackSide })));
    function panel(w, h, x, y, z, c) {
      var p = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(c[0], c[1], c[2]), side: T.DoubleSide }));
      p.position.set(x, y, z); p.lookAt(0, 0, 0); es.add(p);
    }
    panel(16, 10, 0, 18, 4, [7, 6.6, 6]);
    panel(6, 14, -16, 4, 6, [4.5, 4.4, 4.6]);
    panel(6, 14, 16, 2, 4, [4, 3.6, 3]);
    panel(14, 5, 0, -2, 18, [2.4, 2.4, 2.6]);
    panel(10, 4, 0, -14, -6, [1.2, 1.1, 1.0]);
    panel(5, 5, -8, 10, -16, [5, 4.4, 3.4]);
    var pm = new T.PMREMGenerator(renderer);
    var rt = pm.fromScene(es, 0.03);
    pm.dispose();
    return rt.texture;
  }

  function init() {
    var r = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputEncoding = T.sRGBEncoding;
    r.toneMapping = T.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.12;
    R.renderer = r;
    R.scene = new T.Scene();
    R.scene.environment = makeEnv(r);
    R.camera = new T.PerspectiveCamera(30, 1, 0.1, 100);
    R.dist = 12 - 0.55 * 7.5;
    R.camera.position.set(0, 0, R.dist);

    var key = new T.SpotLight(0xfff0d8, 2.4, 0, 0.5, 0.7, 1);
    key.position.set(3, 8, 5); key.target.position.set(0, 0, 0);
    R.scene.add(key, key.target);
    var rim = new T.DirectionalLight(0xbcd0ff, 0.5); rim.position.set(-5, 2, -4); R.scene.add(rim);
    R.scene.add(new T.AmbientLight(0xffffff, 0.12));

    R.tilt = new T.Group(); R.turn = new T.Group();
    R.tilt.add(R.turn); R.scene.add(R.tilt);
    R.yaw = 0; R.pitch = 0.12; R.vYaw = 0; R.vPitch = 0; R.dragging = false; R.idleAt = 0;

    ready = true;
    resize();
    buildCurrent();
    bindDrag();
    var last = performance.now();
    (function loop(now) {
      requestAnimationFrame(loop);
      var dt = Math.min((now - last) / 1000, 0.05); last = now;
      if (!visible) return;
      if (!R.dragging) {
        R.yaw += R.vYaw * dt; R.pitch += R.vPitch * dt;
        R.vYaw *= Math.pow(0.04, dt); R.vPitch *= Math.pow(0.04, dt);
        if (!reduceMotion && now - R.idleAt > 2200) R.yaw += 0.45 * dt;
      }
      R.pitch = Math.max(-0.7, Math.min(0.95, R.pitch));
      R.turn.rotation.y = R.yaw;
      R.tilt.rotation.x = R.pitch;
      R.camera.position.z += (R.dist - R.camera.position.z) * Math.min(1, dt * 8);
      R.renderer.render(R.scene, R.camera);
    })(last);
  }

  function resize() {
    if (!ready) return;
    var w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    R.renderer.setSize(w, h, false);
    R.camera.aspect = w / h;
    R.camera.updateProjectionMatrix();
  }

  function bindDrag() {
    var lx = 0, ly = 0;
    canvas.addEventListener('pointerdown', function (e) {
      R.dragging = true; lx = e.clientX; ly = e.clientY; R.vYaw = 0; R.vPitch = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      stage.classList.add('is-grabbing');
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!R.dragging) return;
      var dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
      R.yaw += dx * 0.011; R.pitch += dy * 0.008;
      R.vYaw = dx * 0.011 * 60 * 0.5; R.vPitch = dy * 0.008 * 60 * 0.5;
      R.idleAt = performance.now();
    });
    function end() { R.dragging = false; R.idleAt = performance.now(); stage.classList.remove('is-grabbing'); }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { R.yaw -= 0.2; R.idleAt = performance.now(); }
      if (e.key === 'ArrowRight') { R.yaw += 0.2; R.idleAt = performance.now(); }
      if (e.key === 'ArrowUp') { R.pitch -= 0.1; }
      if (e.key === 'ArrowDown') { R.pitch += 0.1; }
    });
    zoomRange.addEventListener('input', function () {
      var v = parseFloat(zoomRange.value);          // 0 (far) .. 100 (close)
      R.dist = 12 - (v / 100) * 7.5;
    });
  }

  /* ---------------------------------------------------------------- events */
  function onSelectChange() {
    var prevPiece = state.piece;
    readSelects();
    syncChips();
    if (!ready) return;
    if (prevPiece !== state.piece) { buildCurrent(); R.yaw = 0; R.idleAt = performance.now(); }
    else applyFinish();
  }

  function bindUI() {
    var i;
    if (pieceSel) pieceSel.addEventListener('change', onSelectChange);
    if (finishSel) finishSel.addEventListener('change', onSelectChange);
    for (i = 0; i < pieceChips.length; i++) {
      pieceChips[i].addEventListener('click', function () { setSelect(pieceSel, this.getAttribute('data-piece')); });
    }
    for (i = 0; i < finishChips.length; i++) {
      finishChips[i].addEventListener('click', function () { setSelect(finishSel, this.getAttribute('data-finish')); });
    }
    for (i = 0; i < cutChips.length; i++) {
      cutChips[i].addEventListener('click', function () {
        state.cut = this.getAttribute('data-cut');
        syncChips(); buildCurrent();
      });
    }
    var timer = null;
    nameInput.addEventListener('input', function () {
      state.name = nameInput.value.replace(/[^\w &'.\-]/g, '').slice(0, 12) || 'AGEE';
      clearTimeout(timer);
      timer = setTimeout(function () { if (PIECES[state.piece] === 'nameplate') buildCurrent(); }, 120);
    });
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  }

  function start() {
    if (!webglOK()) return;                 // preview simply stays hidden
    root.hidden = false;
    if (layout) layout.classList.add('has-preview');
    readSelects();
    bindUI();
    syncChips();

    var started = false;
    function go() {
      if (started) return; started = true;
      loadThree(function () {
        T = window.THREE;
        try { init(); } catch (err) { root.hidden = true; if (layout) layout.classList.remove('has-preview'); return; }
        if (document.fonts && document.fonts.load) {
          document.fonts.load('700 100px Cinzel').then(function () {
            _fontReady = true;
            if (ready && PIECES[state.piece] === 'nameplate') buildCurrent();
          });
        }
      }, function () { root.hidden = true; if (layout) layout.classList.remove('has-preview'); });
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) go();
      }, { rootMargin: '300px' }).observe(stage);
    } else { go(); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

})();
