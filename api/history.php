<?php
/** GET ?id=IN:RELIANCE&range=1y  (1mo|6mo|1y|5y) -> close series */
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require __DIR__ . '/lib/quotes.php';

$id = strtoupper((string) ($_GET['id'] ?? ''));
$range = (string) ($_GET['range'] ?? '1y');
if (!yahoo_symbol($id) || !in_array($range, ['1mo', '6mo', '1y', '5y'], true)) json_out(['error' => 'Bad id or range'], 400);
try {
    json_out(get_history($id, $range), 200, 600);
} catch (Throwable $e) {
    json_out(['error' => $e->getMessage()], 502);
}
