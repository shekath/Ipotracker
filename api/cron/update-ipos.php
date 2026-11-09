<?php
/**
 * Refresh IPO list, subscription snapshots and GMP.
 *
 * cPanel / hPanel cron (every 15 minutes):
 *   /usr/bin/php /home/USER/public_html/api/cron/update-ipos.php
 * or, if CLI PHP is unavailable, a URL cron with the token from config.local.php:
 *   wget -q -O /dev/null "https://YOUR-DOMAIN/api/cron/update-ipos.php?token=YOUR_TOKEN"
 */
declare(strict_types=1);
require __DIR__ . '/../lib/bootstrap.php';
require __DIR__ . '/../lib/ipo.php';

if (PHP_SAPI !== 'cli') {
    $token = (string) cfg('cron_token', '');
    if ($token === '' || !hash_equals($token, (string) ($_GET['token'] ?? ''))) {
        json_out(['error' => 'Forbidden'], 403);
    }
}

$res = refresh_ipos(true);
if (PHP_SAPI === 'cli') {
    // Keep the exchange-wide screener lists warm, so visitors never wait for thousands of quotes.
    require __DIR__ . '/../lib/screener.php';
    @set_time_limit(300);
    foreach (index_defs() as $id => $def) {
        if (!in_array($def['source'] ?? '', ['nse', 'bse', 'all'], true)) continue;
        try {
            $s = screener($id, true);
            $res['screener'][$id] = count($s['rows']);
        } catch (Throwable $e) {
            $res['screener'][$id] = 'failed: ' . $e->getMessage();
        }
    }
    echo json_encode($res, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), PHP_EOL;
} else {
    json_out($res);
}
