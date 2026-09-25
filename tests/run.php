<?php
declare(strict_types=1);

/*
 * Checks the pricing, the payment checks and the deploy setup. From the project folder:
 *
 *   php tests/run.php                            checks the code on this computer
 *   php tests/run.php https://biztekmedia.ca     also checks the live site after a deploy
 *
 * Needs PHP 8.1+. Comparing the studio's prices with the server's also needs Node.js.
 */

const ROOT = __DIR__ . '/..';
define('BZ_PUBLIC', ROOT . '/public_html');
// Run with blank settings, never the real config.php.
$blankConfig = tempnam(sys_get_temp_dir(), 'bz-test-config');
file_put_contents($blankConfig, '<?php return [];');
register_shutdown_function(fn() => @unlink($blankConfig));
putenv("BZ_CONFIG_FILE=$blankConfig");
require ROOT . '/biztek-private/lib/api.php';

$failed = 0;
$passed = 0;

function section(string $title): void
{
    echo "\n$title\n";
}

function check(string $name, bool $ok, string $detail = ''): void
{
    global $failed, $passed;
    $ok ? $passed++ : $failed++;
    echo ($ok ? '  ok    ' : '  FAIL  ') . $name . "\n";
    if (!$ok && $detail !== '') echo "        $detail\n";
}

/* ---------------------------------------------------------------- pricing */

section('Pricing');
$p = bz_pricing();
$c = $p->config;

check('no zone, time-of-day or plays-per-hour settings are left', !array_intersect(['zones', 'rotation', 'frequencies', 'dayparts'], array_keys($c)));
$q = $p->quote(['format' => 'text', 'duration' => 10, 'weeks' => 1]);
check('a 10s spot costs the base rate each week', $q['weekly'] == $c['formats']['text']['base']);

$plain = $p->quote(['format' => 'image', 'duration' => 15, 'weeks' => 4]);
$tampered = $p->quote(['format' => 'image', 'duration' => 15, 'weeks' => 4, 'zones' => ['recovery'], 'frequency' => 2, 'daypart' => 'offpeak']);
check('zone, plays-per-hour and time-of-day choices sent by old browsers are ignored', $tampered == $plain);

$long = $p->quote(['format' => 'video', 'duration' => 30, 'weeks' => 12]);
check('12-week runs get the 20% term discount', in_array('term', array_column($long['lines'], 'key'), true) && str_contains(json_encode($long['lines'], JSON_UNESCAPED_UNICODE), '−20%'));

/* ---------------------------------------------------------------- studio vs server */

section('Studio and server prices');
$cases = [];
foreach (array_keys($c['formats']) as $format) {
    foreach ([10, 11, 15, 22, 30, 37, 45, 60] as $duration) {
        foreach ([1, 3, 4, 8, 12, 26] as $weeks) {
            foreach ([[], ['priority' => true], ['priority' => true, 'audio' => true, 'designAssist' => true, 'rush' => true]] as $addons) {
                $cases[] = compact('format', 'duration', 'weeks', 'addons');
            }
        }
    }
}
$js = run_node(__DIR__ . '/quote.js', json_encode($cases));
if ($js === null) {
    echo "  skip  Node.js not found, so the studio's prices weren't compared\n";
} else {
    $money = fn(array $q) => [$q['lines'], $q['weekly'], $q['subtotal'], $q['tax'], $q['total']];
    $mismatch = null;
    foreach ($cases as $i => $case) {
        if ($money($p->quote($case)) != $money($js[$i])) { $mismatch = $case; break; }
    }
    check('the studio shows the same price the server charges (' . count($cases) . ' orders)', $mismatch === null, 'first difference: ' . json_encode($mismatch));
}

/* ---------------------------------------------------------------- payment checks */

section('Payment checks');
$secret = 'test-secret-token';
// A transaction as HelcimPay.js reports it (sample values), with a slash and an accent to test encoding.
$raw = '{"transactionId":20163175,"dateCreated":"2026-09-25 10:03:11","cardBatchId":3517042,"status":"APPROVED","type":"purchase",'
    . '"amount":77.15,"currency":"CAD","avsResponse":"X","cvvResponse":"M","cardType":"VI","approvalCode":"T3E5ST",'
    . '"cardNumber":"4242424242","cardHolderName":"Zoë O/Brien","customerCode":"CST1000","invoiceNumber":"INV1000","warning":""}';
$txn = json_decode($raw, true);
$sign = fn(string $json, string $key = 'test-secret-token') => hash('sha256', $json . $key);

check('a payment signed by Helcim is accepted', helcim_signature_ok($txn, $sign($raw), $secret));
check('a payment signed from PHP-style JSON is accepted', helcim_signature_ok($txn, $sign(json_encode($txn)), $secret));
$whole = str_replace('"amount":77.15', '"amount":100', $raw);
check('a whole-dollar payment is accepted', helcim_signature_ok(json_decode($whole, true), $sign($whole), $secret));
check('a payment with a changed amount is rejected', !helcim_signature_ok(['amount' => 1.0] + $txn, $sign($raw), $secret));
check('a payment signed with another secret is rejected', !helcim_signature_ok($txn, $sign($raw, 'someone-elses-secret'), $secret));

/* ---------------------------------------------------------------- deploy */

section('Deploy');
$missing = [];
foreach (file(ROOT . '/.cpanel.yml') as $line) {
    if (!preg_match('~/bin/cp\s+(?:-R\s+)?(.+)\s+\S+$~', trim($line), $m)) continue;
    foreach (preg_split('/\s+/', $m[1]) as $source) {
        if (!file_exists(ROOT . '/' . $source)) $missing[] = $source;
    }
}
check('every file the cPanel deploy copies exists', !$missing, 'missing: ' . implode(', ', $missing));
$ignored = preg_split('/\R/', (string) file_get_contents(ROOT . '/.gitignore'));
check('config.php, with your passwords, is kept out of git', in_array('biztek-private/config.php', $ignored, true));

/* ---------------------------------------------------------------- live site */

$site = rtrim((string) ($argv[1] ?? ''), '/');
if ($site !== '') {
    section("Live site ($site)");
    $config = json_decode(fetch("$site/api.php?r=config")['body'], true);
    check('it takes real card payments (not demo mode)', is_array($config) && ($config['demo'] ?? null) === false, 'api.php?r=config said: ' . json_encode($config));

    // Looking up an order number that can't exist only reads the database.
    $lookup = fetch("$site/api.php?r=confirm", ['orderId' => 'BZ-000000-000000']);
    check('it connects to the database', $lookup['status'] === 404, 'api.php said: ' . $lookup['body']);

    $http = fetch(preg_replace('~^https://~', 'http://', $site) . '/editor.html');
    check('http:// visits are sent to https://', in_array($http['status'], [301, 302, 307, 308], true) && str_starts_with($http['location'], 'https://'), "got HTTP {$http['status']}");

    $live = fetch("$site/js/pricing.js")['body'];
    $local = file_get_contents(BZ_PUBLIC . '/js/pricing.js');
    check('it charges the same prices as this code (the latest version is deployed)', normalize_eol($live) === normalize_eol($local), 'deploy the latest commit in cPanel');
}

echo "\n" . ($failed ? "$failed of " . ($failed + $passed) . ' checks failed.' : "All $passed checks passed.") . "\n";
exit($failed ? 1 : 0);

/* ---------------------------------------------------------------- helpers */

function run_node(string $script, string $input): ?array
{
    $proc = @proc_open(['node', $script], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    if (!is_resource($proc)) return null;
    fwrite($pipes[0], $input);
    fclose($pipes[0]);
    $out = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $data = json_decode((string) $out, true);
    return proc_close($proc) === 0 && is_array($data) ? $data : null;
}

function fetch(string $url, ?array $postJson = null): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_FOLLOWLOCATION => false]);
    if ($postJson !== null) {
        curl_setopt_array($ch, [CURLOPT_POSTFIELDS => json_encode($postJson), CURLOPT_HTTPHEADER => ['content-type: application/json']]);
    }
    // PHP on Windows often ships without a certificate list; use the one Windows keeps.
    if (PHP_OS_FAMILY === 'Windows' && defined('CURLSSLOPT_NATIVE_CA')) curl_setopt($ch, CURLOPT_SSL_OPTIONS, CURLSSLOPT_NATIVE_CA);
    $body = curl_exec($ch);
    $result = [
        'status' => (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE),
        'location' => (string) curl_getinfo($ch, CURLINFO_REDIRECT_URL),
        'body' => is_string($body) ? $body : '',
    ];
    if ($body === false) echo "  !     couldn't reach $url: " . curl_error($ch) . "\n";
    curl_close($ch);
    return $result;
}

function normalize_eol(string $s): string
{
    return str_replace("\r\n", "\n", $s);
}
