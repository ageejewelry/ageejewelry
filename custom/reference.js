(function () {
  var strip = document.getElementById('ref-strip');
  if (!strip) return;
  var INSTOCK = [
    { img: '/havin.jpg', name: 'HAVIN Cuban Link + Name Pendant', cat: 'chains', stock: true },
    { img: '/watch.jpg', name: 'Baguette Iced Watch', cat: 'watches', stock: true },
    { img: '/bracelet.jpg', name: 'Moissanite Tennis Bracelet', cat: 'bracelets', stock: true },
    { img: '/earrings.jpg', name: 'Moissanite Stud Earrings', cat: 'earrings', stock: true },
    { img: '/rings.jpg', name: 'Square Cluster Ring', cat: 'rings', stock: true },
    { img: '/motion.jpg', name: 'MOTION Name Pendant (sold, can remake)', cat: 'pendants', stock: true }
  ];
  var cat = ((window.AGEE || {}).items || []).map(function (r) {
    return { img: '/collection/img/' + r[0] + '.jpg', name: r[2] + ' (' + r[1] + ')', cat: r[3], stock: false };
  });
  var all = INSTOCK.concat(cat), filter = 'all', chosen = null;
  var input = document.getElementById('ref-input'), box = document.getElementById('ref-selected');
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function render() {
    var list = all.filter(function (it) { return filter === 'all' || (filter === 'instock' ? it.stock : it.cat === filter); });
    strip.innerHTML = list.map(function (it) {
      var i = all.indexOf(it);
      return '<button type="button" class="ref-item" data-i="' + i + '" aria-pressed="' + (chosen === i) + '">' +
        '<img src="' + it.img + '" alt="" loading="lazy" width="132" height="132"><span>' + (it.stock ? '<em>In stock</em>' : '') + esc(it.name) + '</span></button>';
    }).join('');
  }
  function setPieceType(c) {
    var sel = document.querySelector('select[name="piece_type"]'); if (!sel) return;
    var v = c === 'rings' ? 'Custom Ring' : c === 'pendants' ? 'Logo/Emblem Pendant' : 'Other';
    sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  strip.addEventListener('click', function (e) {
    var b = e.target.closest('.ref-item'); if (!b) return;
    chosen = +b.dataset.i; var it = all[chosen];
    input.value = it.name;
    document.getElementById('ref-sel-img').src = it.img;
    document.getElementById('ref-sel-name').textContent = it.name;
    box.hidden = false; setPieceType(it.cat); render();
    var d = document.querySelector('textarea[name="design_description"]');
    if (d && !d.value) d.value = 'Based on: ' + it.name + '. Changes I want: ';
  });
  document.getElementById('ref-clear').addEventListener('click', function () {
    chosen = null; input.value = ''; box.hidden = true; render();
  });
  document.querySelectorAll('.ref-chip').forEach(function (b) {
    b.addEventListener('click', function () {
      filter = b.dataset.cat;
      document.querySelectorAll('.ref-chip').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      render(); strip.scrollLeft = 0;
    });
  });
  var q = new URLSearchParams(location.search).get('ref');
  render();
})();
