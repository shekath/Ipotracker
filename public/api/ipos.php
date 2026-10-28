<?php
/**
 * GET /api/ipos.php -> auto-discovered IPOs with subscription history and GMP.
 * If the cron job has not run recently, the data is refreshed after the response is sent.
 */
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/ipo.php';

$store = load_store();
$stale = $store['lastRun'] < time() - 60 * (int) cfg('ipo_refresh_minutes', 20);

if ($stale && empty($store['ipos'])) {
    // First run: refresh synchronously so the visitor gets data.
    refresh_ipos();
    $store = load_store();
    $stale = false;
}

$payload = [
    'asOf' => time(),
    'lastRun' => $store['lastRun'],
    'lastSuccess' => $store['lastSuccess'],
    'sources' => $store['sources'],
    'ipos' => ipo_payload($store),
];

if (!$stale) json_out($payload, 200, 60);

// Send the response, then refresh in the background ("poor man's cron").
ignore_user_abort(true);
$body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('Content-Length: ' . strlen($body));
header('Connection: close');
echo $body;
if (function_exists('litespeed_finish_request')) litespeed_finish_request();
elseif (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
else { @ob_end_flush(); flush(); }
refresh_ipos();
