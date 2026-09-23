<?php
// Biztek Media orders page. The code and settings live in the biztek-private folder next to public_html.
define('BZ_PUBLIC', __DIR__);
foreach ([dirname(__DIR__) . '/biztek-private', dirname(__DIR__, 2) . '/biztek-private'] as $bz) {
    if (is_file($bz . '/lib/admin.php')) {
        require $bz . '/lib/admin.php';
        bz_admin();
        return;
    }
}
http_response_code(500);
echo 'Setup incomplete: upload the biztek-private folder next to public_html.';
