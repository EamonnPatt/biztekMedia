/* Biztek Media — landing page */
(() => {
  'use strict';
  const P = window.BiztekPricing;
  const C = P.CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const money = P.money;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------------------------------------------------- nav */
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('is-stuck', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const toggle = $('#navToggle');
  const links = $('#navLinks');
  const setMenu = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    links.classList.toggle('is-open', open);
  };
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  links.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });

  /* ---------------------------------------------------------- facts from config */
  const whole = (n) => money(n).replace('.00', '');
  const facts = {
    from: whole(Math.min(...C.plays.map((p) => p.price))),
  };
  $$('[data-fact]').forEach((el) => {
    const v = facts[el.dataset.fact];
    if (v != null) el.textContent = v;
  });
  $('#year').textContent = new Date().getFullYear();

  /* ---------------------------------------------------------- rate card */
  const runs = [C.weeks.min, C.weeks.min * 3, C.weeks.max].filter((w, i, a) => a.indexOf(w) === i);
  $('#priceStack').innerHTML = C.plays.map((p) => `
    <article class="plate reveal">
      <h3>${esc(p.label)}</h3>
      <p class="plate-price">${whole(p.price)}</p>
      <p>per ${C.periodWeeks} weeks + ${esc(C.taxLabel)}</p>
      <ul>${runs.map((w) => `<li><b>${w} weeks</b><span>${whole(P.quote({ every: p.every, weeks: w }).lines[0].amount)}</span></li>`).join('')}</ul>
    </article>`).join('');

  const addonPrice = (a) => a.percent ? `+${Math.round(a.percent * 100)}% airtime`
    : a.perWeek ? `${money(a.perWeek)}/wk` : `${money(a.flat)} once`;
  $('#addonList').innerHTML = Object.values(C.addons).map((a) => `
    <li><b>${esc(a.label)}</b><span>${esc(a.detail)}${a.formats ? ' · video only' : ''}</span><em>${addonPrice(a)}</em></li>`).join('');

  /* ---------------------------------------------------------- example receipt */
  const example = { format: 'image', every: 2, weeks: C.periodWeeks };
  const q = P.quote(example);
  const row = (label, amt, detail = '') => `
      <div class="r-row${amt < 0 ? ' is-neg' : ''}">
        <span class="r-label">${esc(label)}${detail ? `<span class="r-detail">${esc(detail)}</span>` : ''}</span>
        <span class="r-amt">${money(amt)}</span>
      </div>`;
  $('#exampleReceipt').innerHTML = `
    <p class="receipt-title">Example order</p>
    <p class="receipt-sub">${q.input.duration}s image · every screen · ${q.input.weeks} weeks</p>
    <hr>
    ${q.lines.map((l) => row(l.label, l.amount, l.detail)).join('')}
    <hr>
    ${C.taxRate > 0 ? row('Subtotal', q.subtotal) + row(`${C.taxLabel} (${Math.round(C.taxRate * 10000) / 100}%)`, q.tax) + '<hr>' : ''}
    <div class="r-row r-total"><span>Total</span><span class="r-amt">${money(q.total)}</span></div>
    <a class="btn btn-orange" href="editor.html?start=image">Build one like this →</a>`;

  /* ---------------------------------------------------------- sample ads on the TV */
  const qr = $('.si-qr');
  if (qr) qr.innerHTML = fakeQr(25);

  const slides = $$('#tvScreen .slide');
  const bar = $('#tvProgress');
  let current = 0;
  let timer;
  function show(i) {
    slides.forEach((s, j) => s.classList.toggle('is-active', j === i));
    const secs = Number(slides[i].dataset.len);
    bar.style.transition = 'none';
    bar.style.width = '0%';
    void bar.offsetWidth;
    bar.style.transition = `width ${secs}s linear`;
    bar.style.width = '100%';
    clearTimeout(timer);
    timer = setTimeout(() => { current = (i + 1) % slides.length; show(current); }, secs * 1000);
  }
  if (slides.length) show(0);

  function fakeQr(n) {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const finder = (r, c) => {
      for (const [fr, fc] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
        const y = r - fr, x = c - fc;
        if (y >= 0 && y < 7 && x >= 0 && x < 7) {
          return y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4) ? 1 : 0;
        }
        if (y >= -1 && y <= 7 && x >= -1 && x <= 7) return 0;
      }
      return -1;
    };
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const f = finder(r, c);
      if (f === 1 || (f === -1 && rnd() > 0.52)) d += `M${c} ${r}h1v1h-1z`;
    }
    return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path d="${d}" fill="#17130F"/></svg>`;
  }

  /* ---------------------------------------------------------- reveal on scroll */
  const reveals = $$('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const sibs = [...e.target.parentElement.children].filter((el) => el.classList.contains('reveal'));
        e.target.style.transitionDelay = Math.min(sibs.indexOf(e.target), 5) * 80 + 'ms';
        e.target.classList.add('in');
        setTimeout(() => { e.target.style.transitionDelay = ''; }, 1400);
        io.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add('in'));
  }
})();
