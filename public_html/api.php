<?php
// Biztek Media API. The code and settings live in the biztek-private folder next to public_html,
// where they can't be downloaded.
define('BZ_PUBLIC', __DIR__);
foreach ([dirname(__DIR__) . '/biztek-private', dirname(__DIR__, 2) . '/biztek-private'] as $bz) {
    if (is_file($bz . '/lib/api.php')) {
        require $bz . '/lib/api.php';
        bz_api();
        return;
    }
}
http_response_code(500);
header('Content-Type: application/json');
echo json_encode(['error' => 'Setup incomplete: upload the biztek-private folder next to public_html.']);
