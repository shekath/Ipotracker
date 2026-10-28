<?php
/** GET ?index=nifty50 -> index constituents with live price and valuation metrics */
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/screener.php';

$id = strtolower((string) ($_GET['index'] ?? ''));
if (!preg_match('/^[a-z0-9]{2,20}$/', $id)) json_out(['error' => 'Pass index=nifty50'], 400);
@set_time_limit(60);
try {
    json_out(screener($id), 200, 60);
} catch (InvalidArgumentException $e) {
    json_out(['error' => $e->getMessage()], 404);
}
