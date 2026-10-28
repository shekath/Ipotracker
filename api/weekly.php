<?php
/** GET -> previous-week inputs for the weekly index range targets (Nifty, Bank Nifty, Sensex + India VIX). */
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/weekly.php';

try {
    json_out(get_weekly(), 200, 60);
} catch (Throwable $e) {
    json_out(['error' => $e->getMessage()], 502);
}
