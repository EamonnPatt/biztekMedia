/* Biztek Media — landing page */
(() => {
  'use strict';
  const P = window.BiztekPricing;
  const C = P.CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const money = P.money;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const x2 = (n) => '×' + n.toFixed(2);

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
  const zoneKeys = Object.keys(C.zones);
  const facts = {
    from: money(Math.min(...Object.values(C.formats).map((f) => f.base))).replace('.00', ''),
    zones: zoneKeys.length,
    screens: zoneKeys.reduce((s, k) => s + C.zones[k].screens, 0),
    hours: C.rotation.hours,
  };
  $$('[data-fact]').forEach((el) => {
    const v = facts[el.dataset.fact];
    if (v != null) el.textContent = v;
  });
  $('#year').textContent = new Date().getFullYear();

  /* ---------------------------------------------------------- rate card */
  const range = $('#lenRange');
  const out = $('#lenOut');
  const chips = $$('#lenChips button');
  const cards = $$('.fcard[data-format]');

  function setLength(sec, animate) {
    sec = Math.round(sec);
    range.value = sec;
    out.textContent = sec + 's';
    range.style.setProperty('--p', ((sec - C.duration.min) / (C.duration.max - C.duration.min)) * 100 + '%');
    chips.forEach((b) => b.classList.toggle('is-on', Number(b.dataset.len) === sec));

    cards.forEach((card) => {
      const fmt = card.dataset.format;
      const rate = P.spotRate(fmt, sec);
      const amt = $('[data-price]', card);
      const next = money(rate);
      if (amt.textContent !== next) {
        amt.textContent = next;
        if (animate) { amt.classList.remove('bump'); void amt.offsetWidth; amt.classList.add('bump'); }
      }
      const perSec = rate / sec;
      const basePerSec = C.formats[fmt].base / 10;
      const saving = Math.round((1 - perSec / basePerSec) * 100);
      $('[data-persec]', card).textContent = saving > 0
        ? `${money(perSec)} per second · ${saving}% less than a 10s spot`
        : `${money(perSec)} per second of airtime`;
    });
  }
  range.addEventListener('input', () => setLength(Number(range.value), true));
  chips.forEach((b) => b.addEventListener('click', () => setLength(Number(b.dataset.len), true)));
  setLength(15, false);

  /* ---------------------------------------------------------- price stack */
  const lengths = [10, 15, 20, 30, 45, 60];
  const plates = [
    {
      title: 'Format', note: 'Weekly base for a 10s spot on every screen.',
      rows: Object.values(C.formats).map((f) => [f.label, money(f.base) + '<small>/wk</small>']),
    },
    {
      title: 'Length', note: 'Longer spots cost less per second.',
      rows: lengths.map((s) => [s + ' seconds', x2(P.durationMultiplier(s))]),
    },
    {
      title: 'Weeks', note: `Run ${C.weeks.min}–${C.weeks.max} weeks. Longer runs save more.`,
      rows: [['1–3 weeks', 'full price']].concat(
        C.termDiscounts.slice().reverse().map((t) => [`${t.minWeeks}+ weeks`, `−${Math.round(t.rate * 100)}%`])
      ),
    },
  ];
  $('#priceStack').innerHTML = plates.map((p, i) => `
    <article class="plate reveal">
      ${i ? '<span class="plate-op" aria-hidden="true">×</span>' : ''}
      <h3>${p.title}</h3>
      <p>${p.note}</p>
      <ul>${p.rows.map(([a, b]) => `<li><b>${a}</b><span>${b}</span></li>`).join('')}</ul>
    </article>`).join('');

  const addonPrice = (a) => a.percent ? `+${Math.round(a.percent * 100)}% airtime`
    : a.perWeek ? `${money(a.perWeek)}/wk` : `${money(a.flat)} once`;
  $('#addonList').innerHTML = Object.values(C.addons).map((a) => `
    <li><b>${esc(a.label)}</b><span>${esc(a.detail)}${a.formats ? ' · video only' : ''}</span><em>${addonPrice(a)}</em></li>`).join('');

  /* ---------------------------------------------------------- example receipt */
  const example = { format: 'image', duration: 15, weeks: 4 };
  const q = P.quote(example);
  $('#exampleReceipt').innerHTML = `
    <p class="receipt-title">Example order</p>
    <p class="receipt-sub">15s image · every screen · 4 weeks</p>
    <hr>
    ${q.lines.map((l) => `
      <div class="r-row${l.amount < 0 ? ' is-neg' : ''}">
        <span class="r-label">${esc(l.label)}<span class="r-detail">${esc(l.detail)}</span></span>
        <span class="r-amt">${money(l.amount)}</span>
      </div>`).join('')}
    <hr>
    <div class="r-row r-total"><span>Total</span><span class="r-amt">${money(q.total)}</span></div>
    <hr>
    <div class="r-row r-meta"><span>Plays over ${q.input.weeks} weeks</span><span>${q.totalPlays.toLocaleString()}</span></div>
    <div class="r-row r-meta"><span>Cost per 1,000 plays</span><span>${money(q.costPer1000)}</span></div>
    <a class="btn btn-orange" href="editor.html?start=image">Build one like this →</a>`;

  /* ---------------------------------------------------------- floor plan */
  $('#floorplan').innerHTML = zoneKeys.map((k) => {
    const z = C.zones[k];
    const count = `${z.screens} screen${z.screens > 1 ? 's' : ''}`;
    return `
      <div class="zone zone--${k}" style="grid-area:${k}">
        <h3>${esc(z.label)}</h3>
        <p>${esc(z.note)}</p>
        <div class="zone-foot">
          <span class="zone-screens" aria-hidden="true">${'<i></i>'.repeat(z.screens)}</span>
          <span class="zone-count">${count}</span>
        </div>
      </div>`;
  }).join('');

  /* ---------------------------------------------------------- sample ads on the TV */
  const qr = $('.si-qr');
  if (qr) qr.innerHTML = fakeQr(25);

  const slides = $$('#tvScreen .slide');
  const bar = $('#tvProgress');
  let current = 0;
  let timer;
  function show(i) {
    slides.forEach((s, j) => s.classList.toggle('is-active', j === i));
    const secs = Number(slides[i].dataset.len) * 0.4; // sped up for the demo
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
