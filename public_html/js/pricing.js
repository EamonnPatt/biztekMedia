/*
 * Biztek Media — pricing engine.
 * The browser uses it for live quotes. The PHP backend reads the same CONFIG block
 * (between the BZ-CONFIG markers) and repeats the same maths in biztek-private/lib/pricing.php,
 * so the amount charged always matches the amount shown.
 *
 * Editing prices: change numbers inside the CONFIG block only. It must stay valid JSON
 * (double quotes, no comments, no trailing commas) because PHP reads it too.
 *
 *   formats.*.base     weekly rate for a 10s spot, one zone, standard rotation, all day
 *   duration.curve     how price grows with length (below 1 = longer spots cost less per second)
 *   zones.*.weight     how much each zone adds; screens = number of screens (placeholders)
 *   bundleDiscount     taken off the zone total when every zone is booked
 *   dayparts.*.hours   hours per week the ad is in rotation (gym open 5am–11pm)
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
      "text":  { "label": "Text",  "base": 15, "accepts": "Just type — no files needed" },
      "image": { "label": "Image", "base": 25, "accepts": "JPG, PNG, WEBP, GIF" },
      "video": { "label": "Video", "base": 40, "accepts": "MP4, WEBM, MOV" }
    },
    "duration": { "min": 10, "max": 60, "curve": 0.75 },
    "zones": {
      "entrance": { "label": "Front Desk & Entry",    "screens": 2, "weight": 1.25, "note": "Every member, every visit" },
      "cardio":   { "label": "Cardio Deck",           "screens": 4, "weight": 1.4,  "note": "Longest dwell time on the floor" },
      "weights":  { "label": "Free Weights",          "screens": 2, "weight": 1.0,  "note": "Between-set glances" },
      "studio":   { "label": "Studio & Classes",      "screens": 1, "weight": 0.8,  "note": "Before and after every class" },
      "recovery": { "label": "Stretch & Recovery",    "screens": 1, "weight": 0.7,  "note": "Slow, relaxed attention" },
      "lounge":   { "label": "Smoothie Bar & Lounge", "screens": 1, "weight": 0.9,  "note": "Post-workout hangout" }
    },
    "bundleDiscount": 0.15,
    "frequencies": [
      { "value": 2,  "label": "Light",      "mult": 0.6 },
      { "value": 4,  "label": "Standard",   "mult": 1.0 },
      { "value": 6,  "label": "Heavy",      "mult": 1.4 },
      { "value": 10, "label": "Saturation", "mult": 2.1 }
    ],
    "dayparts": {
      "all":     { "label": "All day",    "detail": "5am – 11pm",       "hours": 126, "mult": 1.0 },
      "prime":   { "label": "Prime time", "detail": "5–9am & 4–8pm",    "hours": 56,  "mult": 0.7 },
      "offpeak": { "label": "Off-peak",   "detail": "9am–4pm & 8–11pm", "hours": 70,  "mult": 0.45 }
    },
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

  /** Weekly rate for one zone at standard rotation — used by the public rate card. */
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
    const freq = CONFIG.frequencies.find((f) => f.value === Number(i.frequency)) || CONFIG.frequencies[1];
    const daypart = CONFIG.dayparts[i.daypart] ? i.daypart : 'all';
    const zones = Array.isArray(i.zones)
      ? Object.keys(CONFIG.zones).filter((z) => i.zones.includes(z))
      : [];
    const weeks = clamp(Math.round(Number(i.weeks) || 1), CONFIG.weeks.min, CONFIG.weeks.max);
    const addons = {
      priority: !!(i.addons && i.addons.priority),
      audio: !!(i.addons && i.addons.audio) && CONFIG.addons.audio.formats.includes(format),
      designAssist: !!(i.addons && i.addons.designAssist),
      rush: !!(i.addons && i.addons.rush),
    };
    return { format, duration, frequency: freq.value, daypart, zones, weeks, addons };
  }

  function quote(input) {
    const n = normalize(input);
    const fmt = CONFIG.formats[n.format];
    const freq = CONFIG.frequencies.find((f) => f.value === n.frequency);
    const dp = CONFIG.dayparts[n.daypart];
    const allZones = n.zones.length === Object.keys(CONFIG.zones).length;

    const durationMult = durationMultiplier(n.duration);
    const rawZoneWeight = n.zones.reduce((s, z) => s + CONFIG.zones[z].weight, 0);
    const zoneWeight = round3(rawZoneWeight * (allZones ? 1 - CONFIG.bundleDiscount : 1));
    const screens = n.zones.reduce((s, z) => s + CONFIG.zones[z].screens, 0);

    const weekly = round2(fmt.base * durationMult * freq.mult * zoneWeight * dp.mult);
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
    if (n.zones.length && subtotal < CONFIG.minimumOrder) {
      const adj = round2(CONFIG.minimumOrder - subtotal);
      lines.push({ key: 'minimum', label: 'Minimum order', detail: `${money(CONFIG.minimumOrder)} minimum`, amount: adj });
      subtotal = CONFIG.minimumOrder;
    }

    const tax = round2(subtotal * CONFIG.taxRate);
    const total = n.zones.length ? round2(subtotal + tax) : 0;

    const playsPerWeek = n.frequency * dp.hours * screens;
    const totalPlays = playsPerWeek * n.weeks;

    const errors = [];
    if (!n.zones.length) errors.push('Pick at least one screen zone.');

    return {
      valid: errors.length === 0,
      errors,
      currency: CONFIG.currency,
      input: n,
      factors: {
        base: fmt.base,
        durationMult,
        frequencyMult: freq.mult,
        zoneWeight,
        bundle: allZones,
        daypartMult: dp.mult,
      },
      weekly,
      lines,
      subtotal: n.zones.length ? subtotal : 0,
      tax: n.zones.length ? tax : 0,
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
