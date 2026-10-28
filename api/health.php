<?php
/** GET /api/health.php -> environment diagnostics for setting up hosting. */
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/ipo.php';

$dataDir = cfg('data_dir');
$probe = $dataDir . '/.write-test';
$writable = @file_put_contents($probe, 'ok') !== false;
if ($writable) @unlink($probe);
$store = load_store();

json_out([
    'php' => PHP_VERSION,
    'extensions' => ['curl' => extension_loaded('curl'), 'json' => extension_loaded('json'), 'dom' => extension_loaded('dom')],
    'dataDirWritable' => $writable,
    'timezone' => date_default_timezone_get(),
    'ipoStore' => [
        'ipos' => count($store['ipos']),
        'lastRun' => $store['lastRun'] ? date('c', $store['lastRun']) : null,
        'lastSuccess' => $store['lastSuccess'] ? date('c', $store['lastSuccess']) : null,
        'sources' => $store['sources'],
    ],
    'cronTokenSet' => cfg('cron_token') !== '',
    'twelvedataKeySet' => cfg('twelvedata_key') !== '',
]);
