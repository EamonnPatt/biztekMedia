/*
 * Biztek Media — pricing engine.
 * The browser uses it for live quotes. The PHP backend reads the same CONFIG block
 * (between the BZ-CONFIG markers) and repeats the same maths in biztek-private/lib/pricing.php,
 * so the amount charged always matches the amount shown.
 *
 * Editing prices: change numbers inside the CONFIG block only. It must stay valid JSON
 * (double quotes, no comments, no trailing commas) because PHP reads it too.
 *
 *   plays          how often the ad plays, and its price for every periodWeeks weeks
 *   periodWeeks    the weeks each plays price covers; runs are booked in blocks of this many weeks
 *   duration       every spot is this many seconds long
 *   taxRate        e.g. 0.13 for 13% HST, added on top of the listed prices
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BiztekPricing = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CONFIG = /*BZ-CONFIG-START*/{
    "currency": "CAD",
    "formats": {
      "text":  { "label": "Text",  "accepts": "Just type — no files needed" },
      "image": { "label": "Image", "accepts": "JPG, PNG, WEBP, GIF" },
      "video": { "label": "Video", "accepts": "MP4, WEBM, MOV" }
    },
    "duration": { "min": 6, "max": 6 },
    "plays": [
      { "every": 1, "label": "1 play per minute",    "price": 5000 },
      { "every": 2, "label": "1 play per 2 minutes", "price": 2500 },
      { "every": 3, "label": "1 play per 3 minutes", "price": 1660 },
      { "every": 4, "label": "1 play per 4 minutes", "price": 1250 }
    ],
    "defaultEvery": 4,
    "periodWeeks": 4,
    "weeks": { "min": 4, "max": 24 },
    "addons": {
      "priority":     { "label": "Top of loop",   "detail": "Plays first in every rotation", "percent": 0.20 },
      "audio":        { "label": "Audio on",      "detail": "Sound on screens with speakers", "perWeek": 15, "formats": ["video"] },
      "designAssist": { "label": "Design assist", "detail": "Our team polishes your ad",     "flat": 49 },
      "rush":         { "label": "Rush approval", "detail": "Reviewed and live within 24h",  "flat": 25 }
    },
    "minimumOrder": 25,
    "taxRate": 0.13,
    "taxLabel": "HST"
  }/*BZ-CONFIG-END*/;

  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  /** The plays option for "1 play every N minutes", falling back to the default one. */
  function plan(every) {
    const n = Number(every);
    return CONFIG.plays.find((p) => p.every === n) || CONFIG.plays.find((p) => p.every === CONFIG.defaultEvery);
  }

  function normalize(input) {
    const i = input || {};
    const format = CONFIG.formats[i.format] ? i.format : 'text';
    const duration = clamp(Math.round(Number(i.duration) || CONFIG.duration.min), CONFIG.duration.min, CONFIG.duration.max);
    const every = plan(i.every).every;
    // Runs are sold in whole periods, so round to the nearest one.
    const per = CONFIG.periodWeeks;
    const weeks = clamp(Math.round((Number(i.weeks) || per) / per) * per, CONFIG.weeks.min, CONFIG.weeks.max);
    const addons = {
      priority: !!(i.addons && i.addons.priority),
      audio: !!(i.addons && i.addons.audio) && CONFIG.addons.audio.formats.includes(format),
      designAssist: !!(i.addons && i.addons.designAssist),
      rush: !!(i.addons && i.addons.rush),
    };
    return { format, duration, every, weeks, addons };
  }

  function quote(input) {
    const n = normalize(input);
    const p = plan(n.every);
    const periods = n.weeks / CONFIG.periodWeeks;
    const lines = [];

    const airtime = round2(p.price * periods);
    lines.push({ key: 'airtime', label: p.label, detail: `${n.weeks} wk · ${periods} × ${money(p.price)}`, amount: airtime });

    if (n.addons.priority) {
      const amt = round2(airtime * CONFIG.addons.priority.percent);
      lines.push({ key: 'priority', label: CONFIG.addons.priority.label, detail: `+${CONFIG.addons.priority.percent * 100}%`, amount: amt });
    }
    if (n.addons.audio) {
      lines.push({ key: 'audio', label: CONFIG.addons.audio.label, detail: `${n.weeks} wk × ${money(CONFIG.addons.audio.perWeek)}`, amount: round2(CONFIG.addons.audio.perWeek * n.weeks) });
    }
    if (n.addons.designAssist) {
      lines.push({ key: 'designAssist', label: CONFIG.addons.designAssist.label, detail: 'one-time', amount: CONFIG.addons.designAssist.flat });
    }
    if (n.addons.rush) {
      lines.push({ key: 'rush', label: CONFIG.addons.rush.label, detail: 'one-time', amount: CONFIG.addons.rush.flat });
    }

    let subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
    if (subtotal < CONFIG.minimumOrder) {
      const adj = round2(CONFIG.minimumOrder - subtotal);
      lines.push({ key: 'minimum', label: 'Minimum order', detail: `${money(CONFIG.minimumOrder)} minimum`, amount: adj });
      subtotal = CONFIG.minimumOrder;
    }

    const tax = round2(subtotal * CONFIG.taxRate);
    const total = round2(subtotal + tax);

    return {
      currency: CONFIG.currency,
      input: n,
      plan: p,
      periods,
      lines,
      subtotal,
      tax,
      total,
    };
  }

  function money(n) {
    const sign = n < 0 ? '−' : '';
    return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return { CONFIG, quote, normalize, plan, money, round2 };
});
