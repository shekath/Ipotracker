<?php
/**
 * Refresh the quant research tables (India and US).
 *
 * Each run refreshes a batch of stale price histories and fundamentals, then
 * re-scores the whole universe, so a full refresh builds up over a few runs.
 * hPanel cron (every 30 minutes):
 *   /usr/bin/php /home/USER/public_html/api/cron/update-research.php
 * Optional arguments: a market (IN or US) and a batch size, e.g. `IN 300`.
 * URL cron alternative: https://YOUR-DOMAIN/api/cron/update-research.php?token=YOUR_TOKEN
 */
declare(strict_types=1);
require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/research.php';

if (PHP_SAPI !== 'cli') {
    $token = (string) cfg('cron_token', '');
    if ($token === '' || !hash_equals($token, (string) ($_GET['token'] ?? ''))) {
        json_out(['error' => 'Forbidden'], 403);
    }
}

$markets = ['IN', 'US'];
$batch = null;
if (PHP_SAPI === 'cli') {
    if (isset($argv[1]) && in_array(strtoupper($argv[1]), $markets, true)) $markets = [strtoupper($argv[1])];
    if (isset($argv[2]) && ctype_digit($argv[2])) $batch = (int) $argv[2];
} elseif (isset($_GET['market']) && in_array(strtoupper((string) $_GET['market']), $markets, true)) {
    $markets = [strtoupper((string) $_GET['market'])];
}

$out = [];
foreach ($markets as $m) {
    try {
        $out[] = research_run($m, $batch);
    } catch (Throwable $e) {
        $out[] = ['market' => $m, 'error' => $e->getMessage()];
    }
}
if (PHP_SAPI === 'cli') {
    echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), PHP_EOL;
} else {
    json_out($out);
}
