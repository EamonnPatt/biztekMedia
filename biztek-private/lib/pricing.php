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

    // The plays option for "1 play every N minutes", falling back to the default one.
    public function plan(mixed $every): array
    {
        $n = self::num($every);
        $fallback = null;
        foreach ($this->config['plays'] as $p) {
            if ($p['every'] == $n) return $p;
            if ($p['every'] == $this->config['defaultEvery']) $fallback = $p;
        }
        return $fallback;
    }

    public function normalize(mixed $input): array
    {
        $c = $this->config;
        $i = is_array($input) ? $input : [];

        $format = is_string($i['format'] ?? null) && isset($c['formats'][$i['format']]) ? $i['format'] : 'text';
        $duration = (int) self::clamp(floor(self::orDefault(self::num($i['duration'] ?? null), $c['duration']['min']) + 0.5), $c['duration']['min'], $c['duration']['max']);
        $every = (int) $this->plan($i['every'] ?? null)['every'];

        // Runs are sold in whole periods, so round to the nearest one.
        $per = $c['periodWeeks'];
        $weeks = (int) self::clamp(floor(self::orDefault(self::num($i['weeks'] ?? null), $per) / $per + 0.5) * $per, $c['weeks']['min'], $c['weeks']['max']);

        $a = isset($i['addons']) && is_array($i['addons']) ? $i['addons'] : [];
        $addons = [
            'priority' => self::truthy($a['priority'] ?? null),
            'audio' => self::truthy($a['audio'] ?? null) && in_array($format, $c['addons']['audio']['formats'], true),
            'designAssist' => self::truthy($a['designAssist'] ?? null),
            'rush' => self::truthy($a['rush'] ?? null),
        ];

        return ['format' => $format, 'duration' => $duration, 'every' => $every, 'weeks' => $weeks, 'addons' => $addons];
    }

    public function quote(mixed $input): array
    {
        $c = $this->config;
        $n = $this->normalize($input);
        $p = $this->plan($n['every']);
        $periods = $n['weeks'] / $c['periodWeeks'];
        $lines = [];

        $airtime = self::round2($p['price'] * $periods);
        $lines[] = ['key' => 'airtime', 'label' => $p['label'], 'detail' => $n['weeks'] . ' wk · ' . self::jsNumber($periods) . ' × ' . self::money($p['price']), 'amount' => $airtime];

        if ($n['addons']['priority']) {
            $pr = $c['addons']['priority'];
            $lines[] = ['key' => 'priority', 'label' => $pr['label'], 'detail' => '+' . self::jsNumber($pr['percent'] * 100) . '%', 'amount' => self::round2($airtime * $pr['percent'])];
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
        if ($subtotal < $c['minimumOrder']) {
            $lines[] = ['key' => 'minimum', 'label' => 'Minimum order', 'detail' => self::money($c['minimumOrder']) . ' minimum', 'amount' => self::round2($c['minimumOrder'] - $subtotal)];
            $subtotal = $c['minimumOrder'];
        }

        $tax = self::round2($subtotal * $c['taxRate']);
        $total = self::round2($subtotal + $tax);

        return [
            'currency' => $c['currency'],
            'input' => $n,
            'plan' => $p,
            'periods' => $periods,
            'lines' => $lines,
            'subtotal' => $subtotal,
            'tax' => $tax,
            'total' => $total,
        ];
    }
}
