<?php
/**
 * GET ?market=IN            -> research table + high-conviction picks
 * GET ?market=IN&symbol=TCS -> every feature for one stock
 * Data is produced by cron/update-research.php.
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
if (!is_file($f)) json_out(['error' => 'Research has not run yet'], 503);
json_out(read_json($f, []), 200, 300);
