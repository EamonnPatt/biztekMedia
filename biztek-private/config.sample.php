<?php
/*
 * Biztek Media settings.
 *
 * Copy this file to config.php (same folder) and fill it in.
 * config.php holds passwords: it lives in biztek-private, outside public_html, so it can't be downloaded.
 */
return [
    // Database: cPanel → MySQL Databases. On GoDaddy the name and user start with your cPanel username,
    // e.g. "abc123_biztek". The user needs ALL PRIVILEGES on the database. The tables are created automatically.
    'db_host' => 'localhost',
    'db_port' => 3306,
    'db_name' => '',
    'db_user' => '',
    'db_pass' => '',
    'table_prefix' => 'bz_',

    // Helcim API token (Helcim → Integrations → API Access, with permission to process transactions).
    // Leave empty for demo mode: checkout completes but no card is charged.
    'helcim_api_token' => '',

    // Password for the orders page (yourdomain.com/admin.php). Leave empty to turn the page off.
    'admin_password' => '',

    // Where to email new orders (optional), and the address all emails come from, including the
    // receipt each customer gets. Use an address on your own domain for "from_email" so the mail
    // isn't flagged as spam; customers' replies go to it.
    'notify_email' => '',
    'from_email' => '',

    // Time zone for dates on the orders page.
    'timezone' => 'America/Toronto',

    // Largest video or image an advertiser can upload, in MB. Mind your hosting disk space.
    'max_upload_mb' => 250,
];
