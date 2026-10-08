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

check('no zone or time-of-day settings are left', !array_intersect(['zones', 'rotation', 'frequencies', 'dayparts'], array_keys($c)));
$ok = true;
foreach ($c['plays'] as $plan) {
    $q = $p->quote(['every' => $plan['every'], 'weeks' => $c['periodWeeks']]);
    $ok = $ok && $q['lines'][0]['amount'] == $plan['price'] && $q['lines'][0]['label'] === $plan['label'];
}
check('each play rate costs its listed price for one ' . $c['periodWeeks'] . '-week period', $ok);
$q = $p->quote(['every' => 2, 'weeks' => 3 * $c['periodWeeks']]);
check('three periods cost three times the price', $q['lines'][0]['amount'] == 3 * $p->plan(2)['price']);
check('a play rate that is not offered falls back to the default', $p->quote(['every' => 7])['input']['every'] === $c['defaultEvery']);
check('every spot is ' . $c['duration']['min'] . ' seconds, whatever length is sent', $p->quote(['duration' => 30])['input']['duration'] === $c['duration']['min']);
check('runs are rounded to whole periods', array_map(fn($w) => $p->quote(['weeks' => $w])['input']['weeks'], [1, 6, 26]) === [4, 8, 24]);
$q = $p->quote(['every' => 4, 'weeks' => 4]);
check($c['taxLabel'] . ' is added on top of the listed price', $q['subtotal'] == $p->plan(4)['price'] && $q['tax'] == Pricing::round2($q['subtotal'] * $c['taxRate']) && $q['total'] == $q['subtotal'] + $q['tax']);

$plain = $p->quote(['format' => 'image', 'every' => 2, 'weeks' => 4]);
$tampered = $p->quote(['format' => 'image', 'every' => 2, 'weeks' => 4, 'zones' => ['recovery'], 'frequency' => 2, 'daypart' => 'offpeak']);
check('zone, plays-per-hour and time-of-day choices sent by old browsers are ignored', $tampered == $plain);

/* ---------------------------------------------------------------- studio vs server */

section('Studio and server prices');
$cases = [];
foreach (array_keys($c['formats']) as $format) {
    foreach ([null, 6, 15, 60] as $duration) {
        foreach ([null, 1, 2, 3, 4, 6, 8, 12, 20, 24, 26] as $weeks) {
            foreach ([null, 1, 2, 3, 4, 7, '3'] as $every) {
                foreach ([[], ['priority' => true], ['priority' => true, 'audio' => true, 'designAssist' => true, 'rush' => true]] as $addons) {
                    $cases[] = compact('format', 'duration', 'weeks', 'every', 'addons');
                }
            }
        }
    }
}
$js = run_node(__DIR__ . '/quote.js', json_encode($cases));
if ($js === null) {
    echo "  skip  Node.js not found, so the studio's prices weren't compared\n";
} else {
    $money = fn(array $q) => [$q['input'], $q['lines'], $q['subtotal'], $q['tax'], $q['total']];
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

/* ---------------------------------------------------------------- demo mode */

section('Demo mode');
check('with no Helcim token the site is in demo mode', bz_demo());

/* ---------------------------------------------------------------- order emails */

section('Order emails');
check('new orders are emailed to every address in notify_email', notify_recipients('contact@northumberlandfitness.com, anthony@biztekmedia.ca') === ['contact@northumberlandfitness.com', 'anthony@biztekmedia.ca']);
check('a list, repeats and bad addresses in notify_email are handled', notify_recipients(['a@example.com', ' a@example.com', 'not an email', '']) === ['a@example.com']);
check('a blank notify_email sends no order emails', notify_recipients('') === []);

/* ---------------------------------------------------------------- ad player */

section('Ad player hand-off');
$handoff = [
    'id' => 'BZ-261001-AAAAAA', 'status' => 'paid',
    'contact' => ['business' => "Joe's Pizza", 'name' => 'Joe', 'email' => 'joe@example.com'],
    'campaign' => ['every' => 2, 'weeks' => 8, 'startDate' => '2026-11-02'],
    'composition' => ['orientation' => 'portrait', 'duration' => 6, 'background' => ['color1' => '#112233'], 'layers' => [
        ['type' => 'text', 'text' => 'Now open!', 'color' => '#ff0000'],
        ['type' => 'image', 'uploadId' => 'img1'],
        ['type' => 'video', 'uploadId' => 'vid1', 'fit' => 'contain'],
    ]],
    'uploads' => [['id' => 'img1', 'kind' => 'image', 'type' => 'image/png'], ['id' => 'vid1', 'kind' => 'video', 'type' => 'video/mp4']],
];
$picked = bz_player_pick_media($handoff);
check('a video is chosen over an image as the ad\'s main file', ($picked['upload']['id'] ?? '') === 'vid1');
$ad = bz_player_ad_fields($handoff, $picked);
check('the ad is added paused, so nothing reaches a TV before it is reviewed', $ad['enabled'] === 0);
check('the ad is added NOT approved, tied to its order, so the TVs hold it back until the Approve button', $ad['approved'] === 0 && $ad['order_id'] === 'BZ-261001-AAAAAA');
check('the notes start "Biztek order <id>", which the player uses to find ads sent before approvals existed', str_starts_with($ad['notes'], 'Biztek order BZ-261001-AAAAAA'));
check('it plays from the start date for the booked weeks (8 weeks from Nov 2 ends Dec 27)', $ad['start_date'] === '2026-11-02' && $ad['end_date'] === '2026-12-27');
check('it is a video ad named after the business, in the spot length', $ad['type'] === 'video' && $ad['title'] === "Joe's Pizza" && $ad['duration'] === 6);
check('the layer\'s own fit and the studio\'s background colour carry over', $ad['fit'] === 'contain' && $ad['background'] === '#112233');
check('the notes name the order and the layers the player can\'t show', str_contains($ad['notes'], 'BZ-261001-AAAAAA') && str_contains($ad['notes'], '2 more layers'));
$onlyImage = $handoff;
$onlyImage['composition']['layers'] = [['type' => 'image', 'uploadId' => 'img1']];
check('with no video, the image is the main file', (bz_player_pick_media($onlyImage)['upload']['id'] ?? '') === 'img1');
$textOnly = ['id' => 'BZ-261001-BBBBBB', 'status' => 'paid', 'contact' => ['business' => 'Bagels'], 'campaign' => ['weeks' => 4, 'startDate' => '2026-11-02'],
    'composition' => ['layers' => [['type' => 'text', 'text' => 'Fresh Bagels', 'color' => '#00ff00'], ['type' => 'text', 'text' => 'Daily at 7am']]]];
$textAd = bz_player_ad_fields($textOnly, bz_player_pick_media($textOnly));
check('a text-only order becomes a text slide: first line the headline, the rest the body', $textAd['type'] === 'text' && $textAd['headline'] === 'Fresh Bagels' && $textAd['body'] === 'Daily at 7am' && $textAd['text_color'] === '#00ff00');
$bad = bz_player_ad_fields(['id' => 'BZ-261001-CCCCCC', 'campaign' => ['startDate' => '2026-02-31', 'weeks' => 4], 'composition' => ['duration' => 9999, 'background' => ['color1' => 'red'], 'layers' => []]], null);
check('a bad date, colour or length can\'t get into the player\'s tables', $bad['start_date'] === null && $bad['end_date'] === null && $bad['background'] === '#000000' && $bad['duration'] === 600);

$future = $handoff;
$future['contact']['name'] = 'Joe';
$future['campaign']['startDate'] = gmdate('Y-m-d', time() + 30 * 86400);
$mail = bz_player_approval_text($future);
check('the approval email greets the buyer, names the order and says the ad is approved', str_contains($mail, 'Hi Joe,') && str_contains($mail, 'BZ-261001-AAAAAA') && str_contains($mail, "it's approved"));
check('the approval email says when it goes on screen', str_contains($mail, 'goes on screen on ' . DateTimeImmutable::createFromFormat('!Y-m-d', $future['campaign']['startDate'])->format('l, F j, Y')));
$started = $handoff;
$started['campaign']['startDate'] = gmdate('Y-m-d', time() - 3 * 86400);
check('an ad whose start date has passed is described as on screen now', str_contains(bz_player_approval_text($started), 'It is on screen now'));
check('a demo order\'s email says it was a test', str_contains(bz_player_approval_text($handoff + ['demo' => true]), 'test order') && !str_contains($mail, 'test order'));

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
