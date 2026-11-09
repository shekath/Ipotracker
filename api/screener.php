<?php
/** GET ?index=nifty50 -> index constituents with live price and valuation metrics */
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/screener.php';

$id = strtolower((string) ($_GET['index'] ?? ''));
if (!preg_match('/^[a-z0-9]{2,20}$/', $id)) json_out(['error' => 'Pass index=nifty50'], 400);
$def = index_defs()[$id] ?? null;
if (!$def) json_out(['error' => 'Unknown index'], 404);
@set_time_limit(120); // the complete exchange lists quote thousands of stocks

// The exchange-wide lists take several seconds to quote: an expired copy is served at once
// and refreshed after the response, so only the very first visit waits.
$big = in_array($def['source'] ?? '', ['nse', 'bse', 'all'], true);
$old = $big ? cache_stale("scr:$id") : null;
if ($old && !cache_get("scr:$id", (int) cfg('screener_full_ttl', 600))) {
    $lock = fopen(data_path("scr-$id.lock"), 'c');
    $mine = $lock && flock($lock, LOCK_EX | LOCK_NB);
    ignore_user_abort(true);
    $body = json_encode($old, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
    header('Content-Length: ' . strlen($body));
    header('Connection: close');
    echo $body;
    if (function_exists('litespeed_finish_request')) litespeed_finish_request();
    elseif (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
    else { @ob_end_flush(); flush(); }
    if ($mine) screener($id, true);
    exit;
}
json_out(screener($id), 200, 60);
