<?php
declare(strict_types=1);

/*
 * Hands a paid order's ad over to the ad player: the site that runs on the gym's TVs.
 *
 * The player keeps its ads, and the image or video each one plays, in a MySQL database (this site's, or its own),
 * in tables named <prefix>tv_ads, <prefix>tv_media and <prefix>tv_media_chunks (the player creates them the first
 * time it is opened). This copies the order's file into them and adds the ad with the advertiser's start and end
 * dates, NOT APPROVED. The player's TVs skip an ad that isn't approved, and nothing in the player's own admin panel
 * can approve it: only bz_player_approve() below can, from the Approve button on this site's orders page. That is
 * the review the advertiser was promised. Approving also emails the buyer to confirm.
 *
 * The player plays one image, one video or one text slide per ad, so only the order's main video or image is
 * copied (a text-only order becomes a text slide). Any other layers are listed in the ad's private notes.
 */

const BZ_PLAYER_CHUNK = 1048576; // the player stores and serves files in pieces of exactly this size

// The player's settings from config.php: player_db when the player has its own database, or null when its tables
// are in this site's database.
function bz_player_settings(): ?array
{
    $p = bz_config()['player_db'];
    return is_array($p) && !empty($p['db_name']) ? $p : null;
}

// The database the player keeps its ads in: its own (player_db in config.php), or this site's.
function bz_player_db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    $p = bz_player_settings();
    if (!$p) return $pdo = bz_db();
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $p['db_host'] ?? 'localhost', (int) ($p['db_port'] ?? 3306), $p['db_name']);
    try {
        $pdo = new PDO($dsn, (string) ($p['db_user'] ?? ''), (string) ($p['db_pass'] ?? ''), [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (PDOException $e) {
        error_log('[biztek] player database connection failed: ' . $e->getMessage());
        $hint = match (preg_match('/\[(\d{4})\]/', $e->getMessage(), $m) ? $m[1] : '') {
            '1045' => 'the user or password (db_user, db_pass) is wrong',
            '1044' => 'the user has no access to that database',
            '1049' => 'no database has that name (db_name)',
            '2002', '2005' => "the server (db_host) can't be found",
            default => 'check the details',
        };
        throw new HttpError(500, "Couldn't reach the ad player's database: $hint. Copy them from the player's adscreen-private/config.php into player_db in config.php.");
    }
    return $pdo;
}

// A table of the player: its prefix, then tv_. With player_db, the prefix is its table_prefix (blank by default, as in
// the player); otherwise player_table_prefix, or this site's table_prefix when that isn't set.
function bz_player_table(string $name): string
{
    $c = bz_config();
    $p = bz_player_settings();
    $prefix = (string) ($p ? ($p['table_prefix'] ?? '') : ($c['player_table_prefix'] ?? $c['table_prefix']));
    if (!preg_match('/^[A-Za-z0-9_]*$/', $prefix)) {
        throw new HttpError(500, "The ad player's table prefix in config.php may only use letters, numbers and underscores.");
    }
    return '`' . $prefix . 'tv_' . $name . '`';
}

function bz_player_hex(mixed $v, string $fallback): string
{
    return is_string($v) && preg_match('/^#[0-9a-f]{6}$/i', $v) ? $v : $fallback;
}

// The order's main video, or failing that its main image: the upload row and the layer that uses it.
function bz_player_pick_media(array $order): ?array
{
    $uploads = [];
    foreach ($order['uploads'] ?? [] as $u) {
        if (is_array($u) && isset($u['id'])) $uploads[$u['id']] = $u;
    }
    foreach (['video', 'image'] as $kind) {
        foreach ($order['composition']['layers'] ?? [] as $layer) {
            $id = $layer['uploadId'] ?? null;
            if (($layer['type'] ?? '') === $kind && is_string($id) && isset($uploads[$id]) && ($uploads[$id]['kind'] ?? '') === $kind) {
                return ['upload' => $uploads[$id], 'layer' => $layer];
            }
        }
    }
    return null;
}

// The first and last day an order's ad runs (Y-m-d, null if the start date is bad) and how many weeks it was booked
// for. $campaign is the order's 'campaign'.
function bz_player_dates(array $campaign): array
{
    $start = (string) ($campaign['startDate'] ?? '');
    $ok = preg_match('/^\d{4}-\d{2}-\d{2}$/', $start) === 1 && checkdate((int) substr($start, 5, 2), (int) substr($start, 8, 2), (int) substr($start, 0, 4));
    $weeks = max(1, (int) ($campaign['weeks'] ?? 1));
    return [
        'start' => $ok ? $start : null,
        'end' => $ok ? (new DateTimeImmutable($start, new DateTimeZone('UTC')))->modify('+' . ($weeks * 7 - 1) . ' days')->format('Y-m-d') : null,
        'weeks' => $weeks,
    ];
}

// The player's columns for an order's ad. Pure: no database or files, so the tests can run it. $media is
// bz_player_pick_media()'s result, or null for a text-only order.
function bz_player_ad_fields(array $order, ?array $media): array
{
    $c = $order['contact'] ?? [];
    $k = $order['campaign'] ?? [];
    $comp = $order['composition'] ?? [];
    $layers = is_array($comp['layers'] ?? null) ? $comp['layers'] : [];

    ['start' => $startDate, 'end' => $end, 'weeks' => $weeks] = bz_player_dates($k);
    $startOk = $startDate !== null;
    $start = (string) $startDate;

    $business = bz_cut($c['business'] ?? '', 120);
    $fields = [
        'type' => $media ? $media['upload']['kind'] : 'text',
        'title' => $business !== '' ? $business : 'Untitled ad',
        'duration' => max(3, min(600, (int) ($comp['duration'] ?? 6))),
        'play_full_video' => 0,
        'video_length' => 0,
        'muted' => 1,
        'fit' => ($media['layer']['fit'] ?? null) === 'cover' || ($media['layer']['fit'] ?? null) === 'contain'
            ? $media['layer']['fit']
            : (($comp['orientation'] ?? '') === 'portrait' ? 'contain' : 'cover'), // a tall ad keeps all of itself on a wide screen
        'background' => bz_player_hex($comp['background']['color1'] ?? null, '#000000'),
        'enabled' => 0,
        'approved' => 0, // the TVs skip the ad until the Approve button on the orders page sets this
        'order_id' => $order['id'],
        'start_date' => $startOk ? $start : null,
        'end_date' => $end,
        'plays_per_loop' => 1,
        'headline' => '',
        'body' => '',
        'footer' => '',
        'text_color' => '#ffffff',
        'accent_color' => '#5fa82a',
    ];

    $others = 0;
    if ($media) {
        $others = max(0, count($layers) - 1);
    } else {
        // A text-only order: the first text layer is the headline and the rest are the body.
        $texts = [];
        foreach ($layers as $layer) {
            if (($layer['type'] ?? '') === 'text' && trim((string) ($layer['text'] ?? '')) !== '') {
                $texts[] = $layer;
                if (count($texts) === 1) $fields['text_color'] = bz_player_hex($layer['color'] ?? null, '#ffffff');
            }
        }
        if ($texts) {
            $fields['headline'] = bz_cut($texts[0]['text'], 200);
            $fields['body'] = bz_cut(implode("\n", array_map(fn($l) => trim((string) $l['text']), array_slice($texts, 1))), 600);
        }
        $others = max(0, count($layers) - count($texts));
    }

    $plan = '';
    try {
        $plan = (string) (bz_pricing()->plan($k['every'] ?? null)['label'] ?? '');
    } catch (Throwable) {
        // The label is only a note.
    }
    $who = trim(($c['name'] ?? '') . (!empty($c['email']) ? ' <' . $c['email'] . '>' : '') . (!empty($c['phone']) ? ', ' . $c['phone'] : ''));
    $fields['notes'] = bz_cut(
        "Biztek order {$order['id']}" . (($order['status'] ?? '') === 'paid-demo' ? ' (DEMO, nothing was charged)' : '') . "\n"
        . "Advertiser: $business" . ($who !== '' ? " · $who" : '') . "\n"
        . 'Booked: ' . ($plan !== '' ? "$plan, " : '') . "$weeks week" . ($weeks === 1 ? '' : 's') . ($startOk ? " from $start" : '') . "\n"
        . ($others > 0 ? "The design has $others more layer" . ($others === 1 ? '' : 's') . " (text, shapes) than the player can show. See the order's layout on the Biztek orders page.\n" : '')
        . "Waiting for approval: it can't play until you press Approve on the Biztek Media orders page, which also emails the buyer. Then set Plays per loop to match the booking.",
        1000
    );
    return $fields;
}

// Copies a finished upload into the player's media tables, in the player's piece size. Returns the new media id.
function bz_player_copy_file(PDO $db, array $upload, string $path): string
{
    $size = (int) filesize($path);
    $id = bin2hex(random_bytes(12));
    $db->prepare('INSERT INTO ' . bz_player_table('media') . ' (id, mime, size, chunk_size, ready) VALUES (?, ?, ?, ?, 0)')
        ->execute([$id, $upload['type'], $size, BZ_PLAYER_CHUNK]);
    $fh = fopen($path, 'rb');
    if (!$fh) throw new RuntimeException('Could not open the uploaded file.');
    try {
        $stmt = $db->prepare('INSERT INTO ' . bz_player_table('media_chunks') . ' (media_id, seq, data) VALUES (?, ?, ?)');
        $copied = 0;
        for ($seq = 0; ; $seq++) {
            $data = stream_get_contents($fh, BZ_PLAYER_CHUNK);
            if ($data === false || $data === '') break;
            $stmt->bindValue(1, $id);
            $stmt->bindValue(2, $seq, PDO::PARAM_INT);
            $stmt->bindValue(3, $data, PDO::PARAM_LOB);
            $stmt->execute();
            $copied += strlen($data);
        }
    } finally {
        fclose($fh);
    }
    if ($copied !== $size) throw new RuntimeException("Copied $copied of $size bytes.");
    return $id;
}

function bz_player_delete_media(PDO $db, string $mediaId): void
{
    $db->prepare('DELETE FROM ' . bz_player_table('media_chunks') . ' WHERE media_id = ?')->execute([$mediaId]);
    $db->prepare('DELETE FROM ' . bz_player_table('media') . ' WHERE id = ?')->execute([$mediaId]);
}

// Which of the given player ads exist, and their state: id => ['enabled' => bool, 'approved' => bool|null]. approved
// is null when the player is an older version that can't hold ads for approval yet. Empty if the player's tables
// aren't there.
function bz_player_ad_states(array $adIds): array
{
    $adIds = array_values(array_filter(array_unique($adIds), 'is_string'));
    if (!$adIds) return [];
    $in = implode(', ', array_fill(0, count($adIds), '?'));
    $db = null;
    try {
        $db = bz_player_db();
        try {
            $st = $db->prepare('SELECT id, enabled, approved FROM ' . bz_player_table('ads') . " WHERE id IN ($in)");
            $st->execute($adIds);
        } catch (PDOException $e) {
            if ($e->getCode() !== '42S22') throw $e; // unknown column: a player from before approvals
            $st = $db->prepare('SELECT id, enabled, NULL AS approved FROM ' . bz_player_table('ads') . " WHERE id IN ($in)");
            $st->execute($adIds);
        }
        $states = [];
        foreach ($st->fetchAll() as $r) {
            $states[(string) $r['id']] = ['enabled' => (bool) $r['enabled'], 'approved' => $r['approved'] === null ? null : (bool) $r['approved']];
        }
        return $states;
    } catch (PDOException | HttpError) {
        return [];
    }
}

// Runs $work with a lock on one order, so a double click, a retry mid-copy or an approval during a send can't
// happen twice at once.
function bz_player_locked(string $orderId, callable $work): mixed
{
    $db = bz_db();
    $lockName = 'bz_player_' . $orderId;
    $lock = $db->prepare('SELECT GET_LOCK(?, 0)');
    $lock->execute([$lockName]);
    if ((int) $lock->fetchColumn() !== 1) throw new HttpError(409, 'This order is being worked on right now. Try again in a minute.');
    try {
        return $work();
    } finally {
        $db->prepare('SELECT RELEASE_LOCK(?)')->execute([$lockName]);
    }
}

// Sends a paid order's ad to the player, NOT approved, and notes it on the order. Returns what was recorded.
function bz_player_publish(string $orderId): array
{
    return bz_player_locked($orderId, fn() => bz_player_publish_locked(bz_player_db(), $orderId));
}

function bz_player_publish_locked(PDO $db, string $orderId): array
{
    $order = bz_load_order($orderId);
    if (!in_array($order['status'], ['paid', 'paid-demo'], true)) throw new HttpError(400, 'Only paid orders can be sent to the player.');
    $existing = (string) ($order['player']['adId'] ?? '');
    if ($existing !== '' && isset(bz_player_ad_states([$existing])[$existing])) {
        throw new HttpError(409, 'This order is already on the player.');
    }

    $media = bz_player_pick_media($order);
    $path = '';
    if ($media) {
        $upload = bz_get_upload($media['upload']['id']);
        $path = $upload ? bz_upload_path($upload['id']) : '';
        if (!$upload || $upload['status'] !== 'ready' || !is_file($path) || filesize($path) !== (int) $upload['size']) {
            throw new HttpError(404, 'The order\'s uploaded file is missing or incomplete on this server.');
        }
        $media['upload'] = $upload;
    }
    $fields = bz_player_ad_fields($order, $media);
    if (!$media && $fields['headline'] === '') throw new HttpError(400, 'The order has no video, image or text to show.');

    $mediaId = null;
    try {
        if ($media) $mediaId = bz_player_copy_file($db, $media['upload'], $path);
        $adId = bin2hex(random_bytes(12));
        $db->beginTransaction();
        if ($mediaId) $db->prepare('UPDATE ' . bz_player_table('media') . ' SET ready = 1 WHERE id = ?')->execute([$mediaId]);
        $columns = $fields + [
            'id' => $adId,
            'media_id' => $mediaId,
            'position' => (int) $db->query('SELECT COALESCE(MAX(position), -1) + 1 FROM ' . bz_player_table('ads'))->fetchColumn(),
        ];
        $db->prepare('INSERT INTO ' . bz_player_table('ads') . ' (' . implode(', ', array_keys($columns)) . ') VALUES (' . implode(', ', array_fill(0, count($columns), '?')) . ')')
            ->execute(array_values($columns));
        // The player's admin panel notices the ad list changed.
        $db->prepare('REPLACE INTO ' . bz_player_table('settings') . " (name, value) VALUES ('updatedAt', ?)")->execute([(string) (int) round(microtime(true) * 1000)]);
        $db->commit();
    } catch (PDOException $e) {
        if ($db->inTransaction()) $db->rollBack();
        if ($mediaId) bz_player_delete_media($db, $mediaId);
        if ($e->getCode() === '42S22') {
            // Fail closed: an ad is never added to a player that can't hold it back until it's approved.
            throw new HttpError(500, "The ad player is an older version that can't hold ads for approval. Deploy its latest version and open it once, then send the order again.");
        }
        if ($e->getCode() === '42S02') {
            throw new HttpError(500, "The ad player's tables aren't where this site looked: " . str_replace('`', '', bz_player_table('ads')) . ' in '
                . (bz_player_settings() ? 'the database in player_db' : "this site's database") . ". Set player_db in config.php to the database and table_prefix from the player's adscreen-private/config.php, then send the order again.");
        }
        throw $e;
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        if ($mediaId) bz_player_delete_media($db, $mediaId);
        throw $e;
    }

    // A fresh ad: clear anything left over from an earlier send of this order (an error, an approval of a removed ad).
    $result = ['adId' => $adId, 'mediaId' => $mediaId, 'type' => $fields['type'], 'at' => gmdate('c'),
        'error' => null, 'approvedAt' => null, 'emailedAt' => null, 'emailError' => null];
    bz_player_record($orderId, $result);
    return $result;
}

// Remembers on the order what happened with its ad (its id, why it couldn't be sent, when it was approved and the
// buyer emailed). Adds to what is already there; only touches the 'player' key.
function bz_player_record(string $orderId, array $player): void
{
    $table = bz_table('orders');
    $st = bz_db()->prepare("SELECT data FROM `$table` WHERE id = ?");
    $st->execute([$orderId]);
    $data = json_decode((string) $st->fetchColumn(), true);
    if (!is_array($data)) return;
    $data['player'] = array_merge(is_array($data['player'] ?? null) ? $data['player'] : [], $player);
    bz_db()->prepare("UPDATE `$table` SET data = ? WHERE id = ?")
        ->execute([json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $orderId]);
}

// Sends the order to the player once the payment's reply has gone to the customer's browser, so a big video
// can't slow down or break the checkout. Whatever goes wrong is noted on the order and never reaches the customer.
function bz_player_publish_later(string $orderId): void
{
    if (!bz_config()['player_publish']) return;
    ignore_user_abort(true);
    register_shutdown_function(static function () use ($orderId): void {
        if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
        elseif (function_exists('litespeed_finish_request')) litespeed_finish_request();
        @set_time_limit(0);
        try {
            bz_player_publish($orderId);
        } catch (Throwable $e) {
            error_log("[biztek] could not send order $orderId to the player: " . $e->getMessage());
            try {
                bz_player_record($orderId, ['error' => bz_cut($e->getMessage(), 400), 'at' => gmdate('c')]);
            } catch (Throwable) {
                // Nothing more to do; the error log has it.
            }
        }
    });
}

/* ---------------------------------------------------------------- approval */

// Approves an order's ad: the TVs may now play it, from its start date. It is also switched on, since approving
// is the decision to run it. Then the buyer is emailed. Returns ['emailed' => bool, 'error' => string].
function bz_player_approve(string $orderId): array
{
    return bz_player_locked($orderId, function () use ($orderId): array {
        $order = bz_load_order($orderId);
        $adId = (string) ($order['player']['adId'] ?? '');
        if ($adId === '') throw new HttpError(400, 'This order has not been sent to the player yet.');
        $state = bz_player_ad_states([$adId])[$adId] ?? null;
        if (!$state) throw new HttpError(404, 'The ad is no longer on the player. Send the order to the player again first.');
        if ($state['approved'] === null) throw new HttpError(500, "The ad player is an older version that can't hold ads for approval. Deploy its latest version and open it once.");
        if ($state['approved']) throw new HttpError(409, 'This ad is already approved.');

        $db = bz_player_db();
        $db->prepare('UPDATE ' . bz_player_table('ads') . ' SET approved = 1, enabled = 1 WHERE id = ? AND approved = 0')->execute([$adId]);
        // The player's admin panel and TVs notice the ad list changed.
        $db->prepare('REPLACE INTO ' . bz_player_table('settings') . " (name, value) VALUES ('updatedAt', ?)")->execute([(string) (int) round(microtime(true) * 1000)]);
        bz_player_record($orderId, ['approvedAt' => gmdate('c'), 'emailedAt' => null, 'emailError' => null]);
        return bz_player_notify_buyer($order);
    });
}

// Sends the approval email again when the first one didn't go (see the order's emailError).
function bz_player_resend_approval(string $orderId): array
{
    return bz_player_locked($orderId, function () use ($orderId): array {
        $order = bz_load_order($orderId);
        if (empty($order['player']['approvedAt'])) throw new HttpError(400, 'This order has not been approved on this page.');
        if (!empty($order['player']['emailedAt'])) throw new HttpError(409, 'The buyer was already emailed.');
        return bz_player_notify_buyer($order);
    });
}

// Emails the buyer that their ad is approved, and notes on the order whether it went. A mail failure never undoes the
// approval: the orders page shows it, with a button to try again.
function bz_player_notify_buyer(array $order): array
{
    $to = trim((string) ($order['contact']['email'] ?? ''));
    $sent = false;
    $error = '';
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
        $error = "The buyer's email address isn't valid.";
    } else {
        $test = !empty($order['demo']) || ($order['status'] ?? '') === 'paid-demo';
        $subject = ($test ? '[TEST] ' : '') . "Your Biztek Media ad is approved ({$order['id']})";
        $sent = bz_mail($to, $subject, bz_player_approval_text($order));
        if (!$sent) $error = "The server couldn't send the email. Check from_email in config.php and the mail setup in cPanel.";
    }
    bz_player_record($order['id'], $sent
        ? ['emailedAt' => gmdate('c'), 'emailError' => null]
        : ['emailedAt' => null, 'emailError' => $error]);
    if (!$sent) error_log("[biztek] could not send the approval email for {$order['id']}: $error");
    return ['emailed' => $sent, 'error' => $error];
}

// The approval email's text. Pure, so the tests can read it.
function bz_player_approval_text(array $order): string
{
    $c = $order['contact'] ?? [];
    $k = $order['campaign'] ?? [];
    $dates = bz_player_dates($k);
    $day = fn(?string $d) => $d ? DateTimeImmutable::createFromFormat('!Y-m-d', $d)->format('l, F j, Y') : '';
    $today = (new DateTimeImmutable('now', new DateTimeZone(bz_config()['timezone'] ?: 'UTC')))->format('Y-m-d');
    $plan = '';
    try {
        $plan = (string) (bz_pricing()->plan($k['every'] ?? null)['label'] ?? '');
    } catch (Throwable) {
        // The label is only a detail.
    }

    $when = !$dates['start'] ? 'It goes on screen shortly.'
        : ($dates['start'] > $today ? 'It goes on screen on ' . $day($dates['start']) . ' and runs through ' . $day($dates['end']) . '.'
            : 'It is on screen now and runs through ' . $day($dates['end']) . '.');
    $test = !empty($order['demo']) || ($order['status'] ?? '') === 'paid-demo';

    return "Hi " . ($c['name'] ?? '') . ",\n\n"
        . "Good news: we've reviewed your ad for " . ($c['business'] ?? 'your business') . " and it's approved.\n\n"
        . "Order: {$order['id']}\n"
        . "$when\n"
        . "Where: every screen in the gym\n"
        . ($plan !== '' ? "How often: $plan\n" : '')
        . "\nYou don't need to do anything. It goes on screen by itself.\n\n"
        . ($test ? "(This was a test order. The site is in demo mode, so no card was charged.)\n\n" : '')
        . "Questions? Reply to this email and include your order number.\n\n"
        . "Biztek Media\n" . bz_site_url() . "\n";
}
