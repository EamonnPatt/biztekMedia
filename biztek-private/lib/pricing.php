<?php
declare(strict_types=1);

/*
 * PHP twin of public_html/js/pricing.js.
 *
 * It reads the same CONFIG block out of pricing.js and repeats the same maths with the
 * same rounding, so the amount charged always equals the amount the studio showed.
 * If you change the formulas in pricing.js, change them here too.
 */
final class Pricing
{
    public readonly array $config;

    public function __construct(string $pricingJsPath)
    {
        $src = @file_get_contents($pricingJsPath);
        if ($src === false) {
            throw new RuntimeException("Can't read the pricing file at $pricingJsPath");
        }
        if (!preg_match('~/\*BZ-CONFIG-START\*/(.*?)/\*BZ-CONFIG-END\*/~s', $src, $m)) {
            throw new RuntimeException('The BZ-CONFIG markers are missing from pricing.js');
        }
        $config = json_decode($m[1], true);
        if (!is_array($config)) {
            throw new RuntimeException('The CONFIG block in pricing.js is not valid JSON: ' . json_last_error_msg());
        }
        $this->config = $config;
    }

    /* ------------------------------------------------ JavaScript-compatible helpers */

    // Math.round((n + Number.EPSILON) * 100) / 100
    public static function round2(float $n): float
    {
        return floor(($n + PHP_FLOAT_EPSILON) * 100 + 0.5) / 100;
    }

    private static function round3(float $n): float
    {
        return floor(($n + PHP_FLOAT_EPSILON) * 1000 + 0.5) / 1000;
    }

    private static function clamp(float $n, float $lo, float $hi): float
    {
        return min($hi, max($lo, $n));
    }

    // Number(v) in JavaScript, for the kinds of values JSON can carry.
    private static function num(mixed $v): float
    {
        if ($v === null) return 0.0;
        if (is_bool($v)) return $v ? 1.0 : 0.0;
        if (is_int($v) || is_float($v)) return (float) $v;
        if (is_string($v)) {
            $t = trim($v);
            if ($t === '') return 0.0;
            return is_numeric($t) ? (float) $t : NAN;
        }
        return NAN;
    }

    // `x || fallback` for numbers: 0 and NaN fall back.
    private static function orDefault(float $x, float $fallback): float
    {
        return ($x == 0 || is_nan($x)) ? $fallback : $x;
    }

    private static function truthy(mixed $v): bool
    {
        if ($v === null || $v === false || $v === '') return false;
        if (is_int($v) || is_float($v)) return $v != 0 && !is_nan((float) $v);
        return true;
    }

    // How JavaScript prints a number inside a template string (20, not 20.0).
    private static function jsNumber(float $n): string
    {
        $s = json_encode($n);
        return str_ends_with($s, '.0') ? substr($s, 0, -2) : $s;
    }

    public static function money(float $n): string
    {
        return ($n < 0 ? '−' : '') . '$' . number_format(abs($n), 2);
    }

    /* ------------------------------------------------ pricing */

    public function durationMultiplier(mixed $seconds): float
    {
        $c = $this->config['duration'];
        $d = self::clamp(floor(self::orDefault(self::num($seconds), $c['min']) + 0.5), $c['min'], $c['max']);
        return self::round3(pow($d / 10, $c['curve']));
    }

    public function termDiscountRate(int $weeks): float
    {
        foreach ($this->config['termDiscounts'] as $t) {
            if ($weeks >= $t['minWeeks']) return (float) $t['rate'];
        }
        return 0.0;
    }

    public function normalize(mixed $input): array
    {
        $c = $this->config;
        $i = is_array($input) ? $input : [];

        $format = is_string($i['format'] ?? null) && isset($c['formats'][$i['format']]) ? $i['format'] : 'text';
        $duration = (int) self::clamp(floor(self::orDefault(self::num($i['duration'] ?? null), 15) + 0.5), $c['duration']['min'], $c['duration']['max']);

        $wanted = self::num($i['frequency'] ?? null);
        $freq = $c['frequencies'][1];
        foreach ($c['frequencies'] as $f) {
            if ($f['value'] == $wanted) { $freq = $f; break; }
        }

        $daypart = is_string($i['daypart'] ?? null) && isset($c['dayparts'][$i['daypart']]) ? $i['daypart'] : 'all';

        $zones = [];
        if (isset($i['zones']) && is_array($i['zones']) && array_is_list($i['zones'])) {
            foreach (array_keys($c['zones']) as $z) {
                if (in_array($z, $i['zones'], true)) $zones[] = $z;
            }
        }

        $weeks = (int) self::clamp(floor(self::orDefault(self::num($i['weeks'] ?? null), 1) + 0.5), $c['weeks']['min'], $c['weeks']['max']);

        $a = isset($i['addons']) && is_array($i['addons']) ? $i['addons'] : [];
        $addons = [
            'priority' => self::truthy($a['priority'] ?? null),
            'audio' => self::truthy($a['audio'] ?? null) && in_array($format, $c['addons']['audio']['formats'], true),
            'designAssist' => self::truthy($a['designAssist'] ?? null),
            'rush' => self::truthy($a['rush'] ?? null),
        ];

        return [
            'format' => $format, 'duration' => $duration, 'frequency' => $freq['value'], 'daypart' => $daypart,
            'zones' => $zones, 'weeks' => $weeks, 'addons' => $addons,
        ];
    }

    public function quote(mixed $input): array
    {
        $c = $this->config;
        $n = $this->normalize($input);
        $fmt = $c['formats'][$n['format']];
        $freq = null;
        foreach ($c['frequencies'] as $f) {
            if ($f['value'] == $n['frequency']) { $freq = $f; break; }
        }
        $dp = $c['dayparts'][$n['daypart']];
        $allZones = count($n['zones']) === count($c['zones']);

        $durationMult = $this->durationMultiplier($n['duration']);
        $rawZoneWeight = 0.0;
        $screens = 0;
        foreach ($n['zones'] as $z) {
            $rawZoneWeight += $c['zones'][$z]['weight'];
            $screens += $c['zones'][$z]['screens'];
        }
        $zoneWeight = self::round3($rawZoneWeight * ($allZones ? 1 - $c['bundleDiscount'] : 1));

        $weekly = self::round2($fmt['base'] * $durationMult * $freq['mult'] * $zoneWeight * $dp['mult']);
        $lines = [];

        $airtime = self::round2($weekly * $n['weeks']);
        $lines[] = ['key' => 'airtime', 'label' => $fmt['label'] . ' airtime', 'detail' => $n['weeks'] . ' wk × ' . self::money($weekly), 'amount' => $airtime];

        $discountable = $airtime;
        if ($n['addons']['priority']) {
            $p = $c['addons']['priority'];
            $amt = self::round2($airtime * $p['percent']);
            $discountable = self::round2($discountable + $amt);
            $lines[] = ['key' => 'priority', 'label' => $p['label'], 'detail' => '+' . self::jsNumber($p['percent'] * 100) . '%', 'amount' => $amt];
        }

        $termRate = $this->termDiscountRate($n['weeks']);
        if ($termRate > 0 && $discountable > 0) {
            $lines[] = ['key' => 'term', 'label' => 'Term discount', 'detail' => '−' . (int) floor($termRate * 100 + 0.5) . '% for ' . $n['weeks'] . ' wk', 'amount' => -self::round2($discountable * $termRate)];
        }

        if ($n['addons']['audio']) {
            $au = $c['addons']['audio'];
            $lines[] = ['key' => 'audio', 'label' => $au['label'], 'detail' => $n['weeks'] . ' wk × ' . self::money($au['perWeek']), 'amount' => self::round2($au['perWeek'] * $n['weeks'])];
        }
        if ($n['addons']['designAssist']) {
            $lines[] = ['key' => 'designAssist', 'label' => $c['addons']['designAssist']['label'], 'detail' => 'one-time', 'amount' => $c['addons']['designAssist']['flat']];
        }
        if ($n['addons']['rush']) {
            $lines[] = ['key' => 'rush', 'label' => $c['addons']['rush']['label'], 'detail' => 'one-time', 'amount' => $c['addons']['rush']['flat']];
        }

        $sum = 0.0;
        foreach ($lines as $l) $sum += $l['amount'];
        $subtotal = self::round2($sum);
        $hasZones = count($n['zones']) > 0;
        if ($hasZones && $subtotal < $c['minimumOrder']) {
            $lines[] = ['key' => 'minimum', 'label' => 'Minimum order', 'detail' => self::money($c['minimumOrder']) . ' minimum', 'amount' => self::round2($c['minimumOrder'] - $subtotal)];
            $subtotal = $c['minimumOrder'];
        }

        $tax = self::round2($subtotal * $c['taxRate']);
        $total = $hasZones ? self::round2($subtotal + $tax) : 0;

        $playsPerWeek = $n['frequency'] * $dp['hours'] * $screens;
        $totalPlays = $playsPerWeek * $n['weeks'];

        $errors = $hasZones ? [] : ['Pick at least one screen zone.'];

        return [
            'valid' => !$errors,
            'errors' => $errors,
            'currency' => $c['currency'],
            'input' => $n,
            'factors' => [
                'base' => $fmt['base'],
                'durationMult' => $durationMult,
                'frequencyMult' => $freq['mult'],
                'zoneWeight' => $zoneWeight,
                'bundle' => $allZones,
                'daypartMult' => $dp['mult'],
            ],
            'weekly' => $weekly,
            'lines' => $lines,
            'subtotal' => $hasZones ? $subtotal : 0,
            'tax' => $hasZones ? $tax : 0,
            'total' => $total,
            'screens' => $screens,
            'playsPerWeek' => $playsPerWeek,
            'totalPlays' => $totalPlays,
            'costPer1000' => $totalPlays ? self::round2(($total / $totalPlays) * 1000) : 0,
        ];
    }
}
