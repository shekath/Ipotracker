<?php
/**
 * GET ?market=IN            -> research table + high-conviction picks
 * GET ?market=IN&symbol=TCS -> every feature for one stock
 * Data is produced by cron/update-research.php, or by a stale visit (below).
 */
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';

$mkt = strtoupper((string) ($_GET['market'] ?? ''));
if (!in_array($mkt, ['IN', 'US'], true)) json_out(['error' => 'Pass market=IN or market=US'], 400);
$sym = strtoupper(trim((string) ($_GET['symbol'] ?? '')));

if ($sym !== '') {
    if (!preg_match('/^[A-Z0-9&.\-]{1,20}$/', $sym)) json_out(['error' => 'Bad symbol'], 400);
    $full = read_json(data_path("research-$mkt-full.json"), []);
    $row = $full['rows'][$sym] ?? null;
    if (!$row) json_out(['error' => 'Not in the research universe yet'], 404);
    json_out(['asOf' => $full['asOf'] ?? null, 'row' => $row], 200, 300);
}

$f = data_path("research-$mkt.json");
$data = is_file($f) ? read_json($f, []) : null;

// Safety net when the host's scheduler doesn't fire: a visit to stale research
// sends the response first, then advances one batch in the background.
// A marker file spaces the kicks out; the run's own lock stops overlaps.
$kick = data_path("research-$mkt.kick");
$stale = !$data || !empty($data['building']) || time() - (int) @filemtime($f) > 1200;
$due = $stale && time() - (int) @filemtime($kick) > 240;

$status = $data ? 200 : 503;
$body = json_encode($data ?? ['error' => 'Research has not run yet'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
if (!$due) {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header($data ? 'Cache-Control: public, max-age=300' : 'Cache-Control: no-store');
    echo $body;
    exit;
}

@touch($kick);
ignore_user_abort(true);
http_response_code($status);
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
header('Content-Length: ' . strlen($body));
header('Connection: close');
echo $body;
if (function_exists('litespeed_finish_request')) litespeed_finish_request();
elseif (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
else { @ob_end_flush(); flush(); }

require_once __DIR__ . '/lib/research.php';
research_run($mkt, (int) cfg('research_web_batch', 80));
