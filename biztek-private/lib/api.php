<?php
declare(strict_types=1);

/*
 * Biztek Media API, reached through public_html/api.php?r=<route>.
 *
 *   GET  config         site settings the studio needs
 *   POST uploads        start an upload            { name, type, size } → { id, chunkBytes }
 *   POST upload-chunk   send one piece of a file   ?id=…&offset=…  (multipart field "chunk")
 *   POST checkout       price the order on the server, save it, open a Helcim payment
 *   POST confirm        verify Helcim's payment result and mark the order paid
 *   POST demo-confirm   finish an order when no Helcim token is set (demo mode)
 */

require __DIR__ . '/common.php';

const MAX_JSON_BYTES = 2 * 1024 * 1024;
const UPLOADS_PER_HOUR_PER_IP = 40;

function bz_api(): void
{
    header('X-Content-Type-Options: nosniff');
    try {
        $route = (string) ($_GET['r'] ?? '');
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        match ("$method $route") {
            'GET config' => api_config(),
            'POST uploads' => api_upload_start(),
            'POST upload-chunk' => api_upload_chunk(),
            'POST checkout' => api_checkout(),
            'POST confirm' => api_confirm(),
            'POST demo-confirm' => api_demo_confirm(),
            default => throw new HttpError(404, 'Not found'),
        };
    } catch (HttpError $e) {
        bz_json($e->status, ['error' => $e->getMessage()]);
    } catch (Throwable $e) {
        error_log('[biztek] ' . $e);
        bz_json(500, ['error' => 'Something went wrong on our side.']);
    }
}

function read_json(): array
{
    $raw = file_get_contents('php://input', false, null, 0, MAX_JSON_BYTES + 1);
    if ($raw === false || strlen($raw) > MAX_JSON_BYTES) throw new HttpError(413, 'Request too large.');
    $data = json_decode($raw === '' ? '{}' : $raw, true);
    if (!is_array($data)) throw new HttpError(400, 'Invalid JSON.');
    return $data;
}

function api_config(): never
{
    bz_json(200, [
        'demo' => bz_demo(),
        'currency' => bz_pricing()->config['currency'],
        'maxUploadBytes' => bz_max_upload_bytes(),
        'chunkBytes' => bz_chunk_bytes(),
    ]);
}

/* ---------------------------------------------------------------- uploads */

function api_upload_start(): never
{
    $b = read_json();
    $type = strtolower(trim((string) ($b['type'] ?? '')));
    if (!isset(BZ_UPLOAD_TYPES[$type])) throw new HttpError(415, 'Unsupported file type. Use MP4, WEBM, MOV, JPG, PNG, WEBP or GIF.');
    $size = is_numeric($b['size'] ?? null) ? (int) $b['size'] : 0;
    if ($size <= 0) throw new HttpError(400, 'The file was empty.');
    $maxMb = (int) bz_config()['max_upload_mb'];
    if ($size > bz_max_upload_bytes()) throw new HttpError(413, "File is larger than $maxMb MB.");

    $name = preg_replace('/[^\w.\- ()]/u', '_', bz_cut($b['name'] ?? 'upload', 120)) ?: 'upload';
    $ip = substr((string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
    $db = bz_db();
    $table = bz_table('uploads');

    $recent = $db->prepare("SELECT COUNT(*) FROM `$table` WHERE ip = ? AND created_at > ?");
    $recent->execute([$ip, gmdate('Y-m-d H:i:s', time() - 3600)]);
    if ((int) $recent->fetchColumn() >= UPLOADS_PER_HOUR_PER_IP) throw new HttpError(429, 'Too many uploads in the last hour. Please wait a little and try again.');

    clean_stale_uploads($db, $table);

    $id = bin2hex(random_bytes(12));
    $db->prepare("INSERT INTO `$table` (id, name, type, kind, size, received, status, ip, created_at) VALUES (?, ?, ?, ?, ?, 0, 'uploading', ?, ?)")
        ->execute([$id, $name, $type, BZ_UPLOAD_TYPES[$type], $size, $ip, bz_now()]);
    touch(bz_upload_path($id));
    bz_json(201, ['id' => $id, 'chunkBytes' => bz_chunk_bytes()]);
}

// Uploads started more than a day ago and never finished are removed.
function clean_stale_uploads(PDO $db, string $table): void
{
    $st = $db->prepare("SELECT id FROM `$table` WHERE status = 'uploading' AND created_at < ? LIMIT 50");
    $st->execute([gmdate('Y-m-d H:i:s', time() - 86400)]);
    foreach ($st->fetchAll(PDO::FETCH_COLUMN) as $id) {
        @unlink(bz_upload_path($id));
        $db->prepare("DELETE FROM `$table` WHERE id = ?")->execute([$id]);
    }
}

function api_upload_chunk(): never
{
    $id = $_GET['id'] ?? '';
    $offset = filter_var($_GET['offset'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
    if (!bz_valid_upload_id($id) || $offset === false) throw new HttpError(400, 'Bad upload request.');
    $upload = bz_get_upload($id);
    if (!$upload) throw new HttpError(404, 'Upload not found. Please start again.');
    $size = (int) $upload['size'];
    if ($upload['status'] === 'ready') bz_json(200, ['received' => $size, 'done' => true]);

    $piece = $_FILES['chunk'] ?? null;
    if (!$piece || ($piece['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($piece['tmp_name'])) {
        $tooBig = in_array($piece['error'] ?? null, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) || empty($_FILES);
        throw new HttpError($tooBig ? 413 : 400, $tooBig ? 'Upload piece rejected by the server. Please try again.' : 'Upload interrupted. Please try again.');
    }
    $len = (int) $piece['size'];

    $path = bz_upload_path($id);
    $fh = fopen($path, 'c+b');
    if (!$fh || !flock($fh, LOCK_EX)) throw new RuntimeException('Could not open upload file');
    try {
        $current = fstat($fh)['size'];
        if ($offset !== $current) {
            // A retried piece we already have is fine; anything else, tell the browser where to resume.
            $already = $offset < $current && $offset + $len <= $current;
            bz_json($already ? 200 : 409, ['received' => $current, 'done' => $current === $size, 'error' => $already ? null : 'Resume from ' . $current]);
        }
        if ($len <= 0 || $current + $len > $size) throw new HttpError(400, 'This piece does not fit the file size you started with.');

        fseek($fh, $current);
        $in = fopen($piece['tmp_name'], 'rb');
        $copied = stream_copy_to_stream($in, $fh);
        fclose($in);
        fflush($fh);
        if ($copied !== $len) {
            ftruncate($fh, $current);
            throw new HttpError(500, 'Could not save the upload. The server may be out of space.');
        }

        if ($current === 0) {
            // Check the file really is what it claims to be before accepting more of it.
            fseek($fh, 0);
            if (!sniff_matches($upload['type'], (string) fread($fh, 16))) {
                flock($fh, LOCK_UN);
                fclose($fh);
                $fh = null;
                @unlink($path);
                bz_db()->prepare('DELETE FROM `' . bz_table('uploads') . '` WHERE id = ?')->execute([$id]);
                throw new HttpError(415, "This file doesn't look like a real " . strtoupper(explode('/', $upload['type'])[1]) . ' file.');
            }
        }

        $received = $current + $len;
        $done = $received === $size;
        bz_db()->prepare('UPDATE `' . bz_table('uploads') . '` SET received = ?, status = ? WHERE id = ?')
            ->execute([$received, $done ? 'ready' : 'uploading', $id]);
        bz_json(200, ['received' => $received, 'done' => $done]);
    } finally {
        if ($fh) { flock($fh, LOCK_UN); fclose($fh); }
    }
}

function sniff_matches(string $type, string $head): bool
{
    return match ($type) {
        'image/png' => str_starts_with($head, "\x89PNG\r\n\x1a\n"),
        'image/jpeg' => str_starts_with($head, "\xFF\xD8\xFF"),
        'image/gif' => str_starts_with($head, 'GIF87a') || str_starts_with($head, 'GIF89a'),
        'image/webp' => str_starts_with($head, 'RIFF') && substr($head, 8, 4) === 'WEBP',
        'video/webm' => str_starts_with($head, "\x1A\x45\xDF\xA3"),
        'video/mp4', 'video/quicktime' => in_array(substr($head, 4, 4), ['ftyp', 'moov', 'mdat', 'free', 'wide', 'skip', 'pnot'], true),
        default => false,
    };
}

/* ---------------------------------------------------------------- checkout */

function api_checkout(): never
{
    $b = read_json();
    $contact = clean_contact($b['contact'] ?? null);
    $composition = clean_composition($b['composition'] ?? null);

    // Every media layer must point at a file that finished uploading.
    $uploads = [];
    foreach ($composition['layers'] as $layer) {
        if ($layer['type'] !== 'image' && $layer['type'] !== 'video') continue;
        $u = bz_get_upload($layer['uploadId'] ?? '');
        if (!$u || $u['status'] !== 'ready') throw new HttpError(400, 'One of your media files did not finish uploading. Please try again.');
        $uploads[$u['id']] = ['id' => $u['id'], 'name' => $u['name'], 'type' => $u['type'], 'kind' => $u['kind'], 'size' => (int) $u['size']];
    }
    $uploads = array_values($uploads);

    // The rate comes from what was really uploaded, not from what the browser says.
    $kinds = array_column($uploads, 'kind');
    $format = in_array('video', $kinds, true) ? 'video' : (in_array('image', $kinds, true) ? 'image' : 'text');

    $campaign = is_array($b['campaign'] ?? null) ? $b['campaign'] : [];
    $q = bz_pricing()->quote(array_merge($campaign, ['format' => $format, 'duration' => $composition['duration']]));

    $startDate = (string) ($campaign['startDate'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate) || $startDate < gmdate('Y-m-d', time() - 86400)) {
        throw new HttpError(400, 'Choose a start date from today onward.');
    }

    $orderId = 'BZ-' . gmdate('ymd') . '-' . strtoupper(bin2hex(random_bytes(3)));
    $order = [
        'id' => $orderId,
        'demo' => bz_demo(),
        'createdAt' => gmdate('c'),
        'contact' => $contact,
        'campaign' => $q['input'] + ['startDate' => $startDate],
        'quote' => [
            'currency' => $q['currency'], 'weekly' => $q['weekly'], 'lines' => $q['lines'], 'subtotal' => $q['subtotal'],
            'tax' => $q['tax'], 'total' => $q['total'], 'playsPerWeek' => $q['playsPerWeek'], 'totalPlays' => $q['totalPlays'],
        ],
        'composition' => $composition,
        'uploads' => $uploads,
    ];

    $checkoutToken = null;
    $secretToken = null;
    if (!bz_demo()) {
        $init = helcim('POST', '/helcim-pay/initialize', [
            'paymentType' => 'purchase',
            'amount' => $q['total'],
            'currency' => $q['currency'],
            'paymentMethod' => 'cc',
        ]);
        if (!$init['ok'] || empty($init['data']['checkoutToken']) || empty($init['data']['secretToken'])) {
            error_log('[biztek] Helcim initialize failed: HTTP ' . $init['status'] . ' ' . json_encode($init['data']) . ' ' . $init['error']);
            throw new HttpError(502, "We couldn't start the secure payment. Please try again in a few minutes.");
        }
        $checkoutToken = (string) $init['data']['checkoutToken'];
        $secretToken = (string) $init['data']['secretToken'];
    }

    bz_db()->prepare('INSERT INTO `' . bz_table('orders') . '` (id, status, demo, created_at, business, email, total, currency, checkout_token, secret_token, data)
        VALUES (?, \'pending\', ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        ->execute([$orderId, bz_demo() ? 1 : 0, bz_now(), $contact['business'], $contact['email'], $q['total'], $q['currency'], $checkoutToken, $secretToken, order_json($order)]);

    bz_json(201, [
        'orderId' => $orderId,
        'demo' => bz_demo(),
        'amount' => $q['total'],
        'currency' => $q['currency'],
        'lines' => $q['lines'],
        'checkoutToken' => $checkoutToken,
    ]);
}

function api_confirm(): never
{
    if (bz_demo()) throw new HttpError(400, 'Payments are in demo mode.');
    $b = read_json();
    $order = bz_load_order($b['orderId'] ?? null);
    if ($order['status'] === 'paid') bz_json(200, ['ok' => true, 'orderId' => $order['id'], 'transactionId' => $order['transaction']['transactionId'] ?? null]);
    if (!$order['_secret']) throw new HttpError(400, 'This order has no payment session.');

    // HelcimPay.js sends { data: { data: <transaction>, hash } }, sometimes as a JSON string.
    $message = $b['eventMessage'] ?? null;
    if (is_string($message)) {
        $message = json_decode($message, true);
        if (!is_array($message)) throw new HttpError(400, 'Unreadable payment response.');
    }
    $payload = is_array($message['data']['data'] ?? null) ? $message['data'] : $message;
    $txn = is_array($payload['data'] ?? null) ? $payload['data'] : null;
    if (!$txn) throw new HttpError(400, 'Missing transaction details.');

    // 1) Check the signature HelcimPay.js attached, using the secret only this server knows.
    $verified = is_string($payload['hash'] ?? null) && helcim_signature_ok($txn, $payload['hash'], $order['_secret']);
    // 2) If the signature can't be reproduced byte-for-byte, ask Helcim directly.
    if (!$verified && !empty($txn['transactionId'])) {
        $lookup = helcim('GET', '/card-transactions/' . rawurlencode((string) $txn['transactionId']));
        if ($lookup['ok'] && (string) ($lookup['data']['transactionId'] ?? '') === (string) $txn['transactionId']) {
            $txn = $lookup['data'];
            $verified = true;
        }
    }
    if (!$verified) throw new HttpError(400, 'We could not verify this payment with Helcim. Please contact us with your order number before trying again, so you are not charged twice.');

    $approved = strtoupper((string) ($txn['status'] ?? '')) === 'APPROVED';
    $amountMatches = (int) round((float) ($txn['amount'] ?? 0) * 100) === (int) round((float) $order['quote']['total'] * 100);
    $order['transaction'] = pick_transaction($txn);
    $table = bz_table('orders');

    if (!$approved || !$amountMatches) {
        save_order_status($order, 'payment-mismatch', null);
        throw new HttpError(400, 'The payment did not match your order total. Please contact us with your order number.');
    }

    $order['paidAt'] = gmdate('c');
    try {
        save_order_status($order, 'paid', (string) $order['transaction']['transactionId']);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') throw new HttpError(400, 'This payment has already been used for another order.');
        throw $e;
    }
    bz_db()->prepare("UPDATE `$table` SET secret_token = NULL WHERE id = ?")->execute([$order['id']]);
    notify_new_order($order);
    send_order_receipt($order);
    bz_json(200, ['ok' => true, 'orderId' => $order['id'], 'transactionId' => $order['transaction']['transactionId']]);
}

function api_demo_confirm(): never
{
    if (!bz_demo()) throw new HttpError(400, 'Demo checkout is disabled because live payments are set up.');
    $b = read_json();
    $order = bz_load_order($b['orderId'] ?? null);
    if ($order['status'] !== 'paid-demo') {
        $order['paidAt'] = gmdate('c');
        save_order_status($order, 'paid-demo', null);
        notify_new_order($order);
        send_order_receipt($order);
    }
    bz_json(200, ['ok' => true, 'orderId' => $order['id'], 'transactionId' => 'DEMO']);
}

function save_order_status(array $order, string $status, ?string $transactionId): void
{
    $order['status'] = $status;
    bz_db()->prepare('UPDATE `' . bz_table('orders') . '` SET status = ?, paid_at = ?, transaction_id = COALESCE(?, transaction_id), data = ? WHERE id = ?')
        ->execute([$status, str_starts_with($status, 'paid') ? bz_now() : null, $transactionId, order_json($order), $order['id']]);
}

function order_json(array $order): string
{
    unset($order['_secret'], $order['_checkout'], $order['status']);
    return json_encode($order, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

// HelcimPay.js signs a transaction as sha256(transaction JSON + secret token). The JSON arrives
// already decoded, so re-encode it each way it could have been written and look for a match.
function helcim_signature_ok(array $txn, string $hash, string $secret): bool
{
    $encodings = [
        json_encode($txn, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        json_encode($txn),
        json_like_js($txn),
    ];
    foreach ($encodings as $encoded) {
        if (hash_equals(hash('sha256', $encoded . $secret), $hash)) return true;
    }
    return false;
}

// JSON.stringify-style encoding (whole-number floats without ".0"), for signature checks.
function json_like_js(mixed $v): string
{
    if (is_array($v)) {
        if (array_is_list($v)) return '[' . implode(',', array_map('json_like_js', $v)) . ']';
        $parts = [];
        foreach ($v as $k => $item) $parts[] = json_encode((string) $k, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . ':' . json_like_js($item);
        return '{' . implode(',', $parts) . '}';
    }
    if (is_float($v) && floor($v) === $v && abs($v) < 1e15) return (string) (int) $v;
    return json_encode($v, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

function pick_transaction(array $t): array
{
    $keys = ['transactionId', 'status', 'amount', 'currency', 'cardType', 'cardNumber', 'approvalCode', 'dateCreated'];
    return array_intersect_key($t, array_flip($keys));
}

/* ---------------------------------------------------------------- input cleaning */

function clean_contact(mixed $c): array
{
    $src = is_array($c) ? $c : [];
    $contact = [
        'business' => bz_cut($src['business'] ?? '', 120),
        'name' => bz_cut($src['name'] ?? '', 120),
        'email' => bz_cut($src['email'] ?? '', 200),
        'phone' => bz_cut($src['phone'] ?? '', 40),
        'website' => bz_cut($src['website'] ?? '', 200),
        'notes' => bz_cut($src['notes'] ?? '', 2000),
    ];
    if ($contact['business'] === '' || $contact['name'] === '') throw new HttpError(400, 'Business and contact name are required.');
    if (!filter_var($contact['email'], FILTER_VALIDATE_EMAIL)) throw new HttpError(400, 'Enter a valid email address.');
    return $contact;
}

// Keep only the layout fields the studio produces, with the right types.
const LAYER_FIELDS = [
    'all' => ['id' => 's', 'type' => 's', 'name' => 's', 'x' => 'n', 'y' => 'n', 'w' => 'n', 'h' => 'n', 'rot' => 'n', 'opacity' => 'n', 'start' => 'n', 'end' => 'n', 'animIn' => 's', 'animOut' => 's', 'animDur' => 'n', 'locked' => 'b'],
    'text' => ['text' => 's', 'font' => 's', 'fontSize' => 'n', 'weight' => 'n', 'color' => 's', 'hl' => 'b', 'hlColor' => 's', 'align' => 's', 'lineHeight' => 'n', 'letter' => 'n', 'upper' => 'b', 'italic' => 'b', 'shadow' => 'b'],
    'image' => ['uploadId' => 's', 'mediaName' => 's', 'fit' => 's', 'radius' => 'n', 'brightness' => 'n', 'contrast' => 'n', 'saturate' => 'n', 'grayscale' => 'n'],
    'video' => ['uploadId' => 's', 'mediaName' => 's', 'fit' => 's', 'radius' => 'n', 'brightness' => 'n', 'contrast' => 'n', 'saturate' => 'n', 'grayscale' => 'n', 'trimStart' => 'n', 'loop' => 'b'],
    'shape' => ['shape' => 's', 'fill' => 's', 'fill2' => 's', 'radius' => 'n', 'stroke' => 's', 'strokeW' => 'n', 'band' => 'n'],
    'qr' => ['url' => 's', 'fg' => 's', 'bg' => 's'],
];

function pick_fields(array $src, array $spec): array
{
    $out = [];
    foreach ($spec as $key => $kind) {
        $v = $src[$key] ?? null;
        if ($kind === 'n' && (is_int($v) || is_float($v)) && is_finite((float) $v)) $out[$key] = $v;
        elseif ($kind === 's' && is_string($v)) $out[$key] = bz_cut($v, 2000);
        elseif ($kind === 'b' && is_bool($v)) $out[$key] = $v;
    }
    return $out;
}

function clean_composition(mixed $c): array
{
    $src = is_array($c) ? $c : [];
    $layers = [];
    foreach (is_array($src['layers'] ?? null) ? $src['layers'] : [] as $l) {
        if (!is_array($l) || !is_string($l['type'] ?? null) || $l['type'] === 'all' || !isset(LAYER_FIELDS[$l['type']])) continue;
        $layers[] = pick_fields($l, LAYER_FIELDS['all']) + pick_fields($l, LAYER_FIELDS[$l['type']]);
    }
    if (!$layers) throw new HttpError(400, 'Your ad is empty. Add at least one layer.');
    if (count($layers) > 60) throw new HttpError(400, 'Too many layers.');
    return [
        'orientation' => ($src['orientation'] ?? '') === 'portrait' ? 'portrait' : 'landscape',
        'duration' => bz_pricing()->normalize(['duration' => $src['duration'] ?? null])['duration'],
        'background' => pick_fields(is_array($src['background'] ?? null) ? $src['background'] : [], ['type' => 's', 'color1' => 's', 'color2' => 's', 'angle' => 'n']),
        'layers' => $layers,
    ];
}

/* ---------------------------------------------------------------- email */

// Tells Biztek about a new order. Needs notify_email in config.php; failures never block the order.
function notify_new_order(array $order): void
{
    $to = trim((string) bz_config()['notify_email']);
    if ($to === '' || !filter_var($to, FILTER_VALIDATE_EMAIL)) return;

    $p = bz_pricing()->config;
    $c = $order['contact'];
    $k = $order['campaign'];
    $files =implode("\n", array_map(fn($u) => "  - {$u['name']} ({$u['kind']})", $order['uploads'])) ?: '  (none)';
    $demo = $order['demo'] ? ' [DEMO, no charge]' : '';

    $body = "New ad order {$order['id']}$demo\n\n"
        . "Total: " . Pricing::money((float) $order['quote']['total']) . " {$order['quote']['currency']}\n\n"
        . "Advertiser: {$c['business']}\nContact: {$c['name']} <{$c['email']}>" . ($c['phone'] ? ", {$c['phone']}" : '') . "\n"
        . ($c['website'] ? "Website: {$c['website']}\n" : '')
        . ($c['notes'] ? "Notes: {$c['notes']}\n" : '')
        . "\nStarts {$k['startDate']} for {$k['weeks']} week(s)\n"
        . "Every screen, {$p['rotation']['hours']}\n"
        . "Ad: " . ($p['formats'][$k['format']]['label'] ?? $k['format']) . ", {$k['duration']}s\nFiles:\n$files\n\n"
        . "Review it: " . bz_site_url() . "/admin.php\n";

    if (!bz_mail($to, "New ad order {$order['id']} from {$c['business']}$demo", $body, $c['email'])) {
        error_log("[biztek] could not send the order email for {$order['id']}");
    }
}

// Emails the advertiser a receipt with the details of their order. Failures never block the order:
// the payment is already saved by the time this runs.
function send_order_receipt(array $order): void
{
    try {
        $email = (string) ($order['contact']['email'] ?? '');
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return;
        $subject = ($order['demo'] ? '[TEST] ' : '') . "Your Biztek Media order {$order['id']}";
        if (!bz_mail($email, $subject, order_receipt_text($order))) {
            error_log("[biztek] could not send the receipt for {$order['id']}");
        }
    } catch (Throwable $e) {
        error_log("[biztek] could not build the receipt for {$order['id']}: $e");
    }
}

function order_receipt_text(array $order): string
{
    $p = bz_pricing()->config;
    $c = $order['contact'];
    $k = $order['campaign'];
    $q = $order['quote'];
    $t = $order['transaction'] ?? [];
    $money = fn($n) => Pricing::money((float) $n);
    $tz = new DateTimeZone(bz_config()['timezone'] ?: 'UTC');
    $paidOn = (new DateTimeImmutable($order['paidAt'] ?? 'now'))->setTimezone($tz)->format('F j, Y');
    $startOn = DateTimeImmutable::createFromFormat('!Y-m-d', $k['startDate'])->format('l, F j, Y');
    $weeks = $k['weeks'] . ' week' . ($k['weeks'] == 1 ? '' : 's');

    $prices = '';
    foreach ($q['lines'] as $l) $prices .= "  {$l['label']} ({$l['detail']}): " . $money($l['amount']) . "\n";
    if ($p['taxRate'] > 0) {
        $prices .= "  Subtotal: " . $money($q['subtotal']) . "\n  {$p['taxLabel']} (" . ($p['taxRate'] * 100) . "%): " . $money($q['tax']) . "\n";
    }
    $prices .= "  Total: " . $money($q['total']) . " {$q['currency']}\n";

    if ($order['demo']) {
        $payment = "This was a test order: the site is in demo mode, so no card was charged.\n";
    } else {
        $card = trim(($t['cardType'] ?? 'Card') . (!empty($t['cardNumber']) ? ' ending in ' . substr((string) $t['cardNumber'], -4) : ''));
        $payment = "Payment\n  $card, " . $money($t['amount'] ?? $q['total']) . " {$q['currency']}\n"
            . "  Transaction: " . ($t['transactionId'] ?? '') . (!empty($t['approvalCode']) ? ", approval code {$t['approvalCode']}" : '') . "\n";
    }

    return "Hi {$c['name']},\n\n"
        . "Thanks for booking ad time with Biztek Media. Here are the details of your order.\n\n"
        . "Order: {$order['id']}\nDate: $paidOn\nBusiness: {$c['business']}\n\n"
        . "Your campaign\n"
        . "  Starts: $startOn, for $weeks\n"
        . "  Where: every screen in the gym, {$p['rotation']['hours']}\n"
        . "  Ad: " . ($p['formats'][$k['format']]['label'] ?? $k['format']) . ", {$k['duration']} seconds, {$order['composition']['orientation']}\n"
        . "  Estimated plays: " . number_format($q['playsPerWeek']) . " per week, " . number_format($q['totalPlays']) . " in total\n\n"
        . "Price\n$prices\n"
        . "$payment\n"
        . "What happens next\n"
        . "  1. Review: we check your ad within " . ($k['addons']['rush'] ? '24 hours (rush)' : '48 hours') . ".\n"
        . "  2. Fixes, if any: we'll email you here if anything needs a change.\n"
        . "  3. Live: your ad starts playing on $startOn.\n\n"
        . "Questions? Reply to this email and include your order number.\n\n"
        . "Biztek Media\n" . bz_site_url() . "\n";
}

// Sends a plain-text email from from_email (or no-reply@ this site when it isn't set).
function bz_mail(string $to, string $subject, string $body, ?string $replyTo = null): bool
{
    $from = trim((string) bz_config()['from_email']);
    $valid = filter_var($from, FILTER_VALIDATE_EMAIL) !== false;
    if (!$valid) $from = 'no-reply@' . preg_replace('/:\d+$/', '', (string) ($_SERVER['HTTP_HOST'] ?? 'localhost'));

    $headers = "From: Biztek Media <$from>\r\n" . ($replyTo ? "Reply-To: $replyTo\r\n" : '') . 'Content-Type: text/plain; charset=UTF-8';
    // -f sets the bounce address to from_email too, which helps the mail pass spam checks.
    return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers, $valid ? '-f' . $from : '');
}
