<?php
declare(strict_types=1);

/*
 * Shared setup for api.php and admin.php: settings, database, helpers.
 * Everything in biztek-private stays outside public_html, so none of it can be downloaded.
 */

const BZ_PRIVATE = __DIR__ . '/..';
const BZ_UPLOAD_TYPES = [
    'video/mp4' => 'video',
    'video/webm' => 'video',
    'video/quicktime' => 'video',
    'image/jpeg' => 'image',
    'image/png' => 'image',
    'image/webp' => 'image',
    'image/gif' => 'image',
];

require __DIR__ . '/pricing.php';

ini_set('display_errors', '0'); // warnings must never leak into JSON responses or pages

final class HttpError extends Exception
{
    public function __construct(public readonly int $status, string $message)
    {
        parent::__construct($message);
    }
}

function bz_config(): array
{
    static $config = null;
    if ($config !== null) return $config;

    $file = getenv('BZ_CONFIG_FILE') ?: BZ_PRIVATE . '/config.php';
    if (!is_file($file)) {
        throw new HttpError(500, 'Setup incomplete: copy config.sample.php to config.php in the biztek-private folder and fill it in.');
    }
    $loaded = require $file;
    $config = array_merge([
        'db_host' => 'localhost',
        'db_port' => 3306,
        'db_name' => '',
        'db_user' => '',
        'db_pass' => '',
        'table_prefix' => 'bz_',
        'helcim_api_token' => '',
        'admin_password' => '',
        'notify_email' => '',
        'from_email' => '',
        'timezone' => 'America/Toronto',
        'max_upload_mb' => 250,
    ], is_array($loaded) ? $loaded : []);
    if (!preg_match('/^[A-Za-z0-9_]*$/', (string) $config['table_prefix'])) {
        throw new HttpError(500, 'table_prefix in config.php may only use letters, numbers and underscores.');
    }
    return $config;
}

function bz_demo(): bool
{
    return trim((string) bz_config()['helcim_api_token']) === '';
}

function bz_pricing(): Pricing
{
    static $pricing = null;
    return $pricing ??= new Pricing(BZ_PUBLIC . '/js/pricing.js');
}

function bz_table(string $name): string
{
    return bz_config()['table_prefix'] . $name;
}

function bz_db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;

    $c = bz_config();
    if ($c['db_name'] === '') {
        throw new HttpError(500, 'Setup incomplete: add your database name, user and password to config.php.');
    }
    $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $c['db_host'], (int) $c['db_port'], $c['db_name']);
    try {
        $pdo = new PDO($dsn, $c['db_user'], $c['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    } catch (PDOException $e) {
        error_log('[biztek] database connection failed: ' . $e->getMessage());
        throw new HttpError(500, "We couldn't reach the database. Check the database details in config.php.");
    }
    $pdo->exec("SET time_zone = '+00:00'");
    bz_ensure_schema($pdo);
    return $pdo;
}

// Creates the two tables the first time the site runs. Safe to run again.
function bz_ensure_schema(PDO $pdo): void
{
    $marker = bz_storage_dir() . '/.schema-v1-' . bz_config()['table_prefix'] . bz_config()['db_name'];
    if (is_file($marker)) return;

    $orders = bz_table('orders');
    $uploads = bz_table('uploads');
    $pdo->exec("CREATE TABLE IF NOT EXISTS `$orders` (
        id VARCHAR(20) NOT NULL PRIMARY KEY,
        status VARCHAR(24) NOT NULL,
        demo TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        paid_at DATETIME NULL,
        business VARCHAR(160) NOT NULL,
        email VARCHAR(200) NOT NULL,
        total DECIMAL(10,2) NOT NULL,
        currency CHAR(3) NOT NULL,
        checkout_token VARCHAR(100) NULL,
        secret_token VARCHAR(200) NULL,
        transaction_id VARCHAR(64) NULL,
        data LONGTEXT NOT NULL,
        UNIQUE KEY uq_{$orders}_txn (transaction_id),
        KEY idx_{$orders}_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    $pdo->exec("CREATE TABLE IF NOT EXISTS `$uploads` (
        id CHAR(24) NOT NULL PRIMARY KEY,
        name VARCHAR(160) NOT NULL,
        type VARCHAR(40) NOT NULL,
        kind VARCHAR(10) NOT NULL,
        size BIGINT NOT NULL,
        received BIGINT NOT NULL DEFAULT 0,
        status VARCHAR(12) NOT NULL,
        ip VARCHAR(64) NULL,
        created_at DATETIME NOT NULL,
        KEY idx_{$uploads}_created (created_at),
        KEY idx_{$uploads}_ip (ip, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    @file_put_contents($marker, gmdate('c'));
}

/* ---------------------------------------------------------------- files */

function bz_storage_dir(): string
{
    $dir = BZ_PRIVATE . '/storage';
    if (!is_dir($dir . '/uploads')) {
        @mkdir($dir . '/uploads', 0755, true);
        // belt and braces, in case the folder ever ends up inside public_html
        @file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
    }
    return $dir;
}

function bz_upload_path(string $id): string
{
    return bz_storage_dir() . '/uploads/' . $id . '.bin';
}

function bz_valid_upload_id(mixed $id): bool
{
    return is_string($id) && preg_match('/^[a-f0-9]{24}$/', $id) === 1;
}

function bz_get_upload(mixed $id): ?array
{
    if (!bz_valid_upload_id($id)) return null;
    $st = bz_db()->prepare('SELECT * FROM `' . bz_table('uploads') . '` WHERE id = ?');
    $st->execute([$id]);
    return $st->fetch() ?: null;
}

function bz_max_upload_bytes(): int
{
    return max(1, (int) bz_config()['max_upload_mb']) * 1024 * 1024;
}

function bz_ini_bytes(string $key): int
{
    $v = trim((string) ini_get($key));
    if ($v === '') return 0;
    $n = (int) $v;
    return match (strtolower(substr($v, -1))) {
        'g' => $n * 1024 ** 3,
        'm' => $n * 1024 ** 2,
        'k' => $n * 1024,
        default => $n,
    };
}

// Size of each upload piece: small enough to fit under this host's PHP limits.
function bz_chunk_bytes(): int
{
    $limits = [4 * 1024 * 1024];
    if (($u = bz_ini_bytes('upload_max_filesize')) > 0) $limits[] = $u;
    if (($p = bz_ini_bytes('post_max_size')) > 0) $limits[] = $p - 64 * 1024;
    return max(256 * 1024, min($limits));
}

/* ---------------------------------------------------------------- orders */

function bz_load_order(mixed $id): array
{
    if (!is_string($id) || !preg_match('/^BZ-\d{6}-[A-F0-9]{6}$/', $id)) throw new HttpError(400, 'Unknown order.');
    $st = bz_db()->prepare('SELECT * FROM `' . bz_table('orders') . '` WHERE id = ?');
    $st->execute([$id]);
    $row = $st->fetch();
    if (!$row) throw new HttpError(404, 'Unknown order.');
    $order = json_decode($row['data'], true) ?: [];
    $order['id'] = $row['id'];
    $order['status'] = $row['status'];
    $order['_secret'] = $row['secret_token'];
    $order['_checkout'] = $row['checkout_token'];
    return $order;
}

/* ---------------------------------------------------------------- output */

function bz_json(int $status, array $body): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function bz_h(mixed $v): string
{
    return htmlspecialchars((string) $v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function bz_cut(mixed $v, int $max): string
{
    $s = trim((string) $v);
    return function_exists('mb_substr') ? mb_substr($s, 0, $max) : substr($s, 0, $max);
}

function bz_now(): string
{
    return gmdate('Y-m-d H:i:s');
}

function bz_site_url(): string
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $dir = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
    return ($https ? 'https' : 'http') . '://' . $host . $dir;
}
