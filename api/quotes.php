<?php
/** GET ?ids=IN:RELIANCE,US:AAPL  -> live quotes */
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/quotes.php';

$ids = array_values(array_unique(array_filter(array_map('trim', explode(',', strtoupper((string) ($_GET['ids'] ?? '')))))));
$ids = array_values(array_filter($ids, fn($id) => yahoo_symbol($id) !== null));
if (!$ids) json_out(['error' => 'Pass ids=IN:SYMBOL,US:SYMBOL'], 400);
$ids = array_slice($ids, 0, (int) cfg('max_symbols', 60));

$res = get_quotes($ids);
json_out(['asOf' => time()] + $res, 200, 30);
