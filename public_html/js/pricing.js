/*
 * Biztek Media — pricing engine.
 * The browser uses it for live quotes. The PHP backend reads the same CONFIG block
 * (between the BZ-CONFIG markers) and repeats the same maths in biztek-private/lib/pricing.php,
 * so the amount charged always matches the amount shown.
 *
 * Editing prices: change numbers inside the CONFIG block only. It must stay valid JSON
 * (double quotes, no comments, no trailing commas) because PHP reads it too.
 *
 *   formats.*.base     weekly rate for a 10s spot (every ad plays on every screen, all day)
 *   duration.curve     how price grows with length (below 1 = longer spots cost less per second)
 *   zones.*.screens    number of screens in each part of the gym (placeholders)
 *   rotation           hours the screens are on and how often a spot comes round; used for play estimates
 *   taxRate            e.g. 0.05 for 5% GST
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
      "text":  { "label": "Text",  "base": 77.15,  "accepts": "Just type — no files needed" },
      "image": { "label": "Image", "base": 128.57, "accepts": "JPG, PNG, WEBP, GIF" },
      "video": { "label": "Video", "base": 205.72, "accepts": "MP4, WEBM, MOV" }
    },
    "duration": { "min": 10, "max": 60, "curve": 0.75 },
    "zones": {
      "entrance": { "label": "Front Desk & Entry",    "screens": 2, "note": "Every member, every visit" },
      "cardio":   { "label": "Cardio Deck",           "screens": 4, "note": "Longest dwell time on the floor" },
      "weights":  { "label": "Free Weights",          "screens": 2, "note": "Between-set glances" },
      "studio":   { "label": "Studio & Classes",      "screens": 1, "note": "Before and after every class" },
      "recovery": { "label": "Stretch & Recovery",    "screens": 1, "note": "Slow, relaxed attention" },
      "lounge":   { "label": "Smoothie Bar & Lounge", "screens": 1, "note": "Post-workout hangout" }
    },
    "rotation": { "hours": "5am – 11pm", "hoursPerWeek": 126, "playsPerHour": 4 },
    "weeks": { "min": 1, "max": 26 },
    "termDiscounts": [
      { "minWeeks": 12, "rate": 0.20 },
      { "minWeeks": 8,  "rate": 0.15 },
      { "minWeeks": 4,  "rate": 0.10 }
    ],
    "addons": {
      "priority":     { "label": "Top of loop",   "detail": "Plays first in every rotation", "percent": 0.20 },
      "audio":        { "label": "Audio on",      "detail": "Sound in zones with speakers",  "perWeek": 15, "formats": ["video"] },
      "designAssist": { "label": "Design assist", "detail": "Our team polishes your ad",     "flat": 49 },
      "rush":         { "label": "Rush approval", "detail": "Reviewed and live within 24h",  "flat": 25 }
    },
    "minimumOrder": 25,
    "taxRate": 0,
    "taxLabel": "Tax"
  }/*BZ-CONFIG-END*/;

  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const round3 = (n) => Math.round((n + Number.EPSILON) * 1000) / 1000;
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  function durationMultiplier(seconds) {
    const d = clamp(Math.round(Number(seconds) || CONFIG.duration.min), CONFIG.duration.min, CONFIG.duration.max);
    return round3(Math.pow(d / 10, CONFIG.duration.curve));
  }

  /** Weekly rate on every screen — used by the public rate card. */
  function spotRate(format, seconds) {
    const f = CONFIG.formats[format] || CONFIG.formats.text;
    return round2(f.base * durationMultiplier(seconds));
  }

  function termDiscountRate(weeks) {
    const tier = CONFIG.termDiscounts.find((t) => weeks >= t.minWeeks);
    return tier ? tier.rate : 0;
  }

  function normalize(input) {
    const i = input || {};
    const format = CONFIG.formats[i.format] ? i.format : 'text';
    const duration = clamp(Math.round(Number(i.duration) || 15), CONFIG.duration.min, CONFIG.duration.max);
    const weeks = clamp(Math.round(Number(i.weeks) || 1), CONFIG.weeks.min, CONFIG.weeks.max);
    const addons = {
      priority: !!(i.addons && i.addons.priority),
      audio: !!(i.addons && i.addons.audio) && CONFIG.addons.audio.formats.includes(format),
      designAssist: !!(i.addons && i.addons.designAssist),
      rush: !!(i.addons && i.addons.rush),
    };
    return { format, duration, weeks, addons };
  }

  function quote(input) {
    const n = normalize(input);
    const fmt = CONFIG.formats[n.format];
    const durationMult = durationMultiplier(n.duration);
    const screens = Object.values(CONFIG.zones).reduce((s, z) => s + z.screens, 0);

    const weekly = round2(fmt.base * durationMult);
    const lines = [];

    const airtime = round2(weekly * n.weeks);
    lines.push({ key: 'airtime', label: `${fmt.label} airtime`, detail: `${n.weeks} wk × ${money(weekly)}`, amount: airtime });

    let discountable = airtime;
    if (n.addons.priority) {
      const amt = round2(airtime * CONFIG.addons.priority.percent);
      discountable = round2(discountable + amt);
      lines.push({ key: 'priority', label: CONFIG.addons.priority.label, detail: `+${CONFIG.addons.priority.percent * 100}%`, amount: amt });
    }

    const termRate = termDiscountRate(n.weeks);
    if (termRate > 0 && discountable > 0) {
      lines.push({ key: 'term', label: 'Term discount', detail: `−${Math.round(termRate * 100)}% for ${n.weeks} wk`, amount: -round2(discountable * termRate) });
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

    const playsPerWeek = CONFIG.rotation.playsPerHour * CONFIG.rotation.hoursPerWeek * screens;
    const totalPlays = playsPerWeek * n.weeks;

    return {
      currency: CONFIG.currency,
      input: n,
      factors: { base: fmt.base, durationMult },
      weekly,
      lines,
      subtotal,
      tax,
      total,
      screens,
      playsPerWeek,
      totalPlays,
      costPer1000: totalPlays ? round2((total / totalPlays) * 1000) : 0,
    };
  }

  function money(n) {
    const sign = n < 0 ? '−' : '';
    return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return { CONFIG, quote, normalize, spotRate, durationMultiplier, termDiscountRate, money, round2 };
});
