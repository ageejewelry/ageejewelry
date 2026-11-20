(function () {
  var A = window.AGEE, grid = document.getElementById('mto-grid');
  if (!A || !grid) return;
  var FIN = {
    tri: ['Silver', 'Yellow Gold', 'Rose Gold'],
    duo: ['Silver', 'Yellow Gold'],
    silver: ['Silver']
  };
  var items = A.items.map(function (r, i) {
    return { img: r[0], code: r[1], name: r[2], cat: r[3], spec: r[4], price: r[5], fin: r[6], order: i };
  });
  var state = { cat: 'all', sort: 'featured' };
  var money = function (n) { return '$' + Math.round(n).toLocaleString(); };
  var dep = function (p) { return Math.ceil(p * A.DEPOSIT_PCT); };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  document.querySelectorAll('.mto-wait').forEach(function (n) { n.textContent = A.WAIT; });

  function render() {
    var list = items.filter(function (it) { return state.cat === 'all' || it.cat === state.cat; });
    if (state.sort !== 'featured') {
      list.sort(function (a, b) {
        var pa = a.price == null ? 1e9 : a.price, pb = b.price == null ? 1e9 : b.price;
        return state.sort === 'low' ? pa - pb : (b.price == null ? -1 : a.price == null ? 1 : pb - pa);
      });
    }
    document.getElementById('mto-count').textContent = list.length + ' pieces';
    grid.innerHTML = list.map(function (it) {
      var priced = it.price != null;
      return '<article class="mto-card">' +
        '<div class="ph"><img src="/collection/img/' + it.img + '.jpg" alt="' + esc(it.name) + '" loading="lazy" width="600" height="600"></div>' +
        '<div class="info"><span class="stock-badge made-to-order">Made to Order</span>' +
        '<div class="nm">' + esc(it.name) + '</div>' +
        '<div class="meta">' + esc(it.code) + (it.spec ? ' &middot; ' + esc(it.spec) : '') + '</div>' +
        (priced ? '<div class="pr">' + money(it.price) + '</div><div class="dep">' + money(dep(it.price)) + ' deposit to start</div>'
                : '<div class="pr">Quote</div><div class="dep">Price sent within 24 hrs</div>') +
        '<button type="button" class="buy-btn' + (priced ? '' : ' quote') + '" data-code="' + esc(it.code) + '">' +
        (priced ? 'Order &middot; Pay Deposit' : 'Get a Quote') + '</button></div></article>';
    }).join('');
  }

  document.querySelectorAll('.mto-chip').forEach(function (b) {
    b.addEventListener('click', function () {
      state.cat = b.dataset.cat;
      document.querySelectorAll('.mto-chip').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      render();
    });
  });
  document.getElementById('mto-sort').addEventListener('change', function (e) { state.sort = e.target.value; render(); });

  var dlg = document.getElementById('mto-dialog'), form = dlg.querySelector('form');
  function opts(sel, arr) { sel.innerHTML = arr.map(function (v) { return '<option>' + esc(v) + '</option>'; }).join(''); }
  function sizes(it) {
    var s = [], v;
    if (it.cat === 'rings') { for (v = 5; v <= 13; v += 0.5) s.push('US ' + v); return ['Ring size', s, 'US 10']; }
    if (it.cat === 'bracelets') return ['Length', ['6.5 in', '7 in', '7.5 in', '8 in', '8.5 in', '9 in', 'Not sure, help me'], it.spec || '8 in'];
    if (it.cat === 'chains') return ['Length', ['16 in', '18 in', '20 in', '22 in', '24 in', '26 in', '30 in'], it.spec || '20 in'];
    return ['Chain', ['Pendant only', 'Add a matching chain (quoted)'], 'Pendant only'];
  }
  grid.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-code]'); if (!b) return;
    var it = items.find(function (x) { return x.code === b.dataset.code; });
    var priced = it.price != null;
    form.reset();
    form.item.value = it.name; form.code.value = it.code;
    form.price.value = priced ? it.price : 'quote';
    form.deposit.value = priced ? dep(it.price) : 'quote';
    document.getElementById('mto-d-img').src = '/collection/img/' + it.img + '.jpg';
    document.getElementById('mto-d-title').textContent = it.name;
    document.getElementById('mto-d-meta').textContent = it.code + (it.spec ? ' · ' + it.spec : '') + ' · ' + A.WAIT;
    document.getElementById('mto-d-price').innerHTML = priced
      ? money(it.price) + '<small>' + money(dep(it.price)) + ' deposit today, ' + money(it.price - dep(it.price)) + ' before it ships</small>'
      : 'Price on request<small>We&rsquo;ll text your quote, then a 50% deposit starts the order</small>';
    opts(document.getElementById('mto-finish'), FIN[it.fin] || FIN.duo);
    var z = sizes(it), ss = document.getElementById('mto-size');
    document.getElementById('mto-size-label').textContent = z[0];
    opts(ss, z[1]); ss.value = z[1].indexOf(z[2]) >= 0 ? z[2] : z[1][0];
    document.getElementById('mto-submit').textContent = priced ? 'Continue to ' + money(dep(it.price)) + ' Deposit' : 'Request My Quote';
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  });
  dlg.addEventListener('click', function (e) {
    if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
  });
  form.addEventListener('submit', function () {
    try {
      sessionStorage.setItem('agee_mto', JSON.stringify({
        item: form.item.value, code: form.code.value, price: form.price.value, deposit: form.deposit.value,
        finish: form.finish.value, size: form.size.value, email: form.email.value,
        img: document.getElementById('mto-d-img').getAttribute('src')
      }));
    } catch (err) {}
  });
  render();
})();
