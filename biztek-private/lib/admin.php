<?php
declare(strict_types=1);

/*
 * Orders page, reached through public_html/admin.php.
 * Sign in with admin_password from config.php. Lists orders, and lets you download
 * each ad's media files and its full layout.
 */

require __DIR__ . '/common.php';

function bz_admin(): void
{
    header('X-Robots-Tag: noindex');
    header('Cache-Control: no-store');
    header('X-Frame-Options: DENY');
    try {
        admin_route();
    } catch (HttpError $e) {
        admin_message($e->status, $e->getMessage());
    } catch (Throwable $e) {
        error_log('[biztek] ' . $e);
        admin_message(500, 'Something went wrong. Check the PHP error log for details.');
    }
}

function admin_route(): void
{
    $password = (string) bz_config()['admin_password'];
    if ($password === '') {
        throw new HttpError(403, 'The orders page is turned off. Set admin_password in biztek-private/config.php to turn it on.');
    }

    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off');
    // Keep sign-ins in our own private folder so they work whatever the host's session settings are.
    $sessions = bz_storage_dir() . '/sessions';
    if (!is_dir($sessions)) @mkdir($sessions, 0700, true);
    session_save_path($sessions);
    session_name('bzadmin');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
    session_start();

    if (isset($_GET['logout'])) {
        $_SESSION = [];
        session_destroy();
        header('Location: admin.php');
        exit;
    }

    if (empty($_SESSION['bz_admin'])) {
        $error = '';
        if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
            $given = (string) ($_POST['password'] ?? '');
            if (hash_equals(hash('sha256', $password), hash('sha256', $given))) {
                session_regenerate_id(true);
                $_SESSION['bz_admin'] = true;
                header('Location: admin.php');
                exit;
            }
            sleep(1); // slow down guessing
            $error = 'Wrong password.';
        }
        admin_login_page($error);
        return;
    }
    session_write_close(); // don't hold the session lock during long downloads

    if (isset($_GET['download'])) {
        admin_download((string) $_GET['download']);
        return;
    }
    if (isset($_GET['order'])) {
        $order = bz_load_order((string) $_GET['order']);
        unset($order['_secret'], $order['_checkout']);
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $order['id'] . '.json"');
        echo json_encode($order, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        return;
    }
    if (isset($_GET['check-helcim'])) {
        admin_helcim_check();
        return;
    }
    admin_orders_page(isset($_GET['all']));
}

// Opens a $1.00 Helcim checkout session, the same call every real checkout starts with, and
// reports whether Helcim accepted the API token. Nobody pays, so nothing is charged.
function admin_helcim_check(): void
{
    $back = '<p><a class="btn btn-orange" href="admin.php">Back to orders</a></p>';
    if (bz_demo()) {
        admin_shell('Helcim check', '<h1>Helcim check</h1><p class="notice">No Helcim API token is set, so the site is in demo mode. Add <code>helcim_api_token</code> to config.php.</p>' . $back);
        return;
    }
    $r = helcim('POST', '/helcim-pay/initialize', ['paymentType' => 'purchase', 'amount' => 1.00, 'currency' => bz_pricing()->config['currency']]);
    if ($r['ok'] && !empty($r['data']['checkoutToken'])) {
        $result = '<p class="notice"><b>Working.</b> Helcim accepted your API token and opened a test checkout session. No card was charged. Advertisers can pay by card.</p>';
    } else {
        $detail = $r['status'] === 0
            ? "Couldn't reach Helcim: " . $r['error']
            : 'Helcim answered HTTP ' . $r['status'] . ': ' . json_encode($r['data']['errors'] ?? $r['data'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $result = '<p class="notice"><b>Not working.</b> ' . bz_h(bz_cut($detail, 500)) . '</p>'
            . '<p class="muted">Check that <code>helcim_api_token</code> in config.php is copied exactly, and that the token has permission to process transactions (Helcim → Integrations → API Access).</p>';
    }
    admin_shell('Helcim check', '<h1>Helcim check</h1>' . $result . $back);
}

function admin_download(string $id): void
{
    $upload = bz_get_upload($id);
    $path = $upload ? bz_upload_path($upload['id']) : '';
    if (!$upload || $upload['status'] !== 'ready' || !is_file($path)) throw new HttpError(404, 'File not found.');

    while (ob_get_level()) ob_end_clean();
    @set_time_limit(0);
    $ascii = preg_replace('/[^\w.\- ()]/', '_', $upload['name']);
    header('Content-Type: ' . $upload['type']);
    header('Content-Length: ' . filesize($path));
    header("Content-Disposition: attachment; filename=\"$ascii\"; filename*=UTF-8''" . rawurlencode($upload['name']));
    readfile($path);
}

/* ---------------------------------------------------------------- pages */

function admin_shell(string $title, string $body): void
{
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<title>' . bz_h($title) . ' — Biztek Media</title><meta name="robots" content="noindex">'
        . '<link rel="icon" href="img/logo.svg" type="image/svg+xml">'
        . '<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">'
        . '<link rel="stylesheet" href="css/base.css"><style>' . ADMIN_CSS . '</style></head><body>'
        . '<div class="top"><a class="brand" href="./"><img src="img/logo.svg" alt="" width="32" height="32"><span class="wordmark">BIZTEK<span>MEDIA</span></span></a>'
        . (!empty($_SESSION['bz_admin']) ? '<a class="muted" href="admin.php?logout=1">Sign out</a>' : '')
        . '</div>' . $body . '</body></html>';
}

function admin_message(int $status, string $message): void
{
    http_response_code($status);
    admin_shell('Orders', '<h1>Orders</h1><p class="notice">' . bz_h($message) . '</p>');
}

function admin_login_page(string $error): void
{
    if ($error || isset($_GET['download']) || isset($_GET['order'])) http_response_code(401);
    admin_shell('Sign in', '<h1>Orders</h1>
      <form method="post" class="login">
        <label>Password<input type="password" name="password" autocomplete="current-password" autofocus required></label>
        ' . ($error ? '<p class="error">' . bz_h($error) . '</p>' : '') . '
        <button class="btn btn-orange" type="submit">Sign in</button>
      </form>');
}

function admin_orders_page(bool $showAll): void
{
    $table = bz_table('orders');
    $sql = "SELECT * FROM `$table`" . ($showAll ? '' : " WHERE status <> 'pending'") . ' ORDER BY created_at DESC LIMIT 200';
    $rows = bz_db()->query($sql)->fetchAll();
    $p = bz_pricing()->config;
    $tz = new DateTimeZone(bz_config()['timezone'] ?: 'UTC');
    $when = fn(?string $utc) => $utc ? (new DateTime($utc, new DateTimeZone('UTC')))->setTimezone($tz)->format('M j, Y g:i a') : '';
    $size = fn(int $b) => $b > 1048576 ? number_format($b / 1048576, 1) . ' MB' : max(1, (int) round($b / 1024)) . ' KB';

    $cards = '';
    foreach ($rows as $row) {
        $o = json_decode($row['data'], true) ?: [];
        $c = $o['contact'] ?? [];
        $k = $o['campaign'] ?? [];
        $comp = $o['composition'] ?? [];
        $end = !empty($k['startDate']) ? (new DateTime($k['startDate'] . ' 00:00:00', new DateTimeZone('UTC')))->modify('+' . ((int) ($k['weeks'] ?? 1) * 7 - 1) . ' days')->format('Y-m-d') : '';
        // Orders placed before every ad went on every screen still carry their chosen zones.
        $where = empty($k['zones']) ? 'Every screen'
            : implode(', ', array_map(fn($z) => bz_h($p['zones'][$z]['label'] ?? $z), $k['zones'])) . '<br>' . bz_h(($k['frequency'] ?? '') . '/hr · ' . ($k['daypart'] ?? ''));
        $addons = implode(', ', array_map(fn($a) => bz_h($p['addons'][$a]['label'] ?? $a), array_keys(array_filter($k['addons'] ?? []))));
        $media = implode('<br>', array_map(fn($u) => '<a href="admin.php?download=' . bz_h($u['id']) . '">' . bz_h($u['name']) . '</a> <span class="muted">' . bz_h($u['kind']) . ' · ' . $size((int) $u['size']) . '</span>', $o['uploads'] ?? []));
        $t = $o['transaction'] ?? null;
        $txn = $t ? ' · ' . bz_h(($t['cardType'] ?? '') . ' ' . ($t['cardNumber'] ?? '')) . ' · approval ' . bz_h($t['approvalCode'] ?? '') . ' · #' . bz_h($t['transactionId'] ?? '') : '';
        $site = (string) ($c['website'] ?? '');
        $siteUrl = preg_match('~^https?://~i', $site) ? $site : 'https://' . $site;

        $cards .= '
        <article class="order st-' . bz_h($row['status']) . '">
          <header>
            <div><b class="mono">' . bz_h($row['id']) . '</b> <span class="pill">' . bz_h($row['status']) . '</span>' . ($row['demo'] ? ' <span class="pill pill-demo">demo</span>' : '') . '</div>
            <div class="total mono">' . bz_h(Pricing::money((float) $row['total'])) . ' ' . bz_h($row['currency']) . '</div>
          </header>
          <div class="grid">
            <section><h3>Advertiser</h3><p><b>' . bz_h($c['business'] ?? '') . '</b><br>' . bz_h($c['name'] ?? '') . '<br><a href="mailto:' . bz_h($c['email'] ?? '') . '">' . bz_h($c['email'] ?? '') . '</a>'
                . (!empty($c['phone']) ? '<br>' . bz_h($c['phone']) : '')
                . ($site !== '' ? '<br><a href="' . bz_h($siteUrl) . '" target="_blank" rel="noopener noreferrer">' . bz_h($site) . '</a>' : '') . '</p>'
                . (!empty($c['notes']) ? '<p class="notes">' . bz_h($c['notes']) . '</p>' : '') . '</section>
            <section><h3>Schedule</h3><p>' . bz_h($k['startDate'] ?? '') . ' → ' . bz_h($end) . ' <span class="muted">(' . bz_h($k['weeks'] ?? '') . ' wk)</span><br>' . $where . '<br>'
                . ($addons ?: '<span class="muted">No add-ons</span>') . '</p></section>
            <section><h3>Ad</h3><p>' . bz_h($p['formats'][$k['format'] ?? '']['label'] ?? '') . ' · ' . bz_h($comp['duration'] ?? '') . 's · ' . bz_h($comp['orientation'] ?? '') . ' · ' . count($comp['layers'] ?? []) . ' layers<br>'
                . ($media ?: '<span class="muted">No media files</span>') . '<br><a href="admin.php?order=' . bz_h($row['id']) . '">Download full layout (JSON)</a></p></section>
          </div>
          <footer class="muted">Created ' . bz_h($when($row['created_at'])) . ($row['paid_at'] ? ' · paid ' . bz_h($when($row['paid_at'])) : '') . $txn . '</footer>
        </article>';
    }

    $mode = bz_demo() ? 'demo mode (no cards charged)' : 'Helcim live';
    admin_shell('Orders', '<h1>Orders</h1>
      <p class="muted">' . ($showAll ? 'All recent orders, including unpaid checkouts. <a href="admin.php">Hide unpaid</a>' : 'Paid orders. <a href="admin.php?all=1">Show unpaid checkouts too</a>') . ' · Payments: ' . $mode . ' · <a href="admin.php?check-helcim=1">Test Helcim connection</a></p>'
      . ($cards ?: '<p class="notice">No orders yet.</p>'));
}

const ADMIN_CSS = '
  body { padding: 0 var(--gutter) 60px; }
  .top { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 0; border-bottom: 2px solid var(--ink); margin-bottom: 24px; }
  h1 { margin: 0 0 6px; font-size: clamp(32px, 5vw, 56px); font-weight: 900; font-stretch: 125%; text-transform: uppercase; letter-spacing: -.03em; }
  .muted { color: var(--muted); font-size: 13px; }
  .muted a, .order a { color: var(--ember); }
  .notice { padding: 16px 18px; border: 2px solid var(--ink); border-radius: 12px; background: var(--paper); max-width: 640px; }
  .login { display: grid; gap: 12px; max-width: 340px; margin-top: 18px; }
  .login label { display: grid; gap: 6px; font-weight: 700; font-size: 14px; }
  .login input { padding: 11px 12px; border: 2px solid var(--ink); border-radius: 10px; font-size: 16px; background: #fff; }
  .error { color: var(--ember); font-weight: 700; margin: 0; }
  .order { background: var(--paper); border: 2px solid var(--ink); border-radius: 16px; box-shadow: 5px 5px 0 var(--ink); padding: 18px 20px; margin: 18px 0; }
  .order header { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
  .total { font-size: 22px; font-weight: 700; }
  .pill { display: inline-block; padding: 2px 9px; border-radius: 99px; border: 1.5px solid var(--ink); font-family: var(--mono); font-size: 11.5px; text-transform: uppercase; }
  .st-paid .pill:first-of-type { background: var(--orange); }
  .st-paid-demo .pill:first-of-type { background: #FFE0CF; }
  .st-payment-mismatch .pill:first-of-type { background: var(--ember); color: #fff; }
  .st-pending { opacity: .7; box-shadow: none; }
  .pill-demo { border-style: dashed; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px 24px; }
  h3 { margin: 0 0 6px; font-family: var(--mono); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  .grid p { margin: 0; font-size: 14.5px; }
  .notes { margin-top: 8px !important; padding: 8px 10px; background: var(--cream-deep); border-radius: 8px; white-space: pre-wrap; }
  .order footer { margin-top: 12px; padding-top: 10px; border-top: 1px dashed var(--line-strong); }
';
