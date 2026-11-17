<?php
/**
 * GET /api/pipeline.php?names=Jio Platforms|Phonepe -> which pipeline companies are already trading.
 * Each name is a legal-name prefix, matched against NSE's listed-securities file and BSE's daily
 * bhavcopy (BSE truncates names, so keep prefixes short). The IPO page hides any that match.
 */
declare(strict_types=1);
require __DIR__ . '/lib/bootstrap.php';
require_once __DIR__ . '/lib/nse_list.php';

function pl_norm(string $s): string
{
    $s = strtolower($s);
    $s = preg_replace('/[^a-z0-9 ]+/', ' ', $s);
    $s = preg_replace('/\b(the|limited|ltd)\b/', ' ', $s);
    return trim(preg_replace('/\s+/', ' ', $s));
}

$names = array_slice(array_filter(array_map('trim', explode('|', (string) ($_GET['names'] ?? '')))), 0, 30);
$names = array_values(array_filter($names, fn ($n) => strlen($n) >= 3 && strlen($n) <= 80));
if (!$names) json_out(['error' => 'Pass names=a|b|c'], 400);

$listed = [];
$nse = nse_listed();
foreach ($nse['rows'] ?? [] as $sym => $r) $listed[] = ['name' => $r['name'] ?? $sym, 'symbol' => $sym, 'exchange' => 'NSE', 'listedOn' => $r['listedOn'] ?? null];
$bse = bse_bhavcopy();
foreach ($bse['rows'] ?? [] as $r) $listed[] = ['name' => $r['name'], 'symbol' => $r['symbol'], 'exchange' => 'BSE', 'listedOn' => null];
foreach ($listed as &$l) $l['n'] = pl_norm($l['name']);
unset($l);

$out = [];
foreach ($names as $q) {
    $nq = pl_norm($q);
    if ($nq === '') continue;
    foreach ($listed as $l) {
        if ($l['n'] === $nq || str_starts_with($l['n'], $nq . ' ')) {
            $out[$q] = ['symbol' => $l['symbol'], 'exchange' => $l['exchange'], 'listedOn' => $l['listedOn'], 'name' => $l['name']];
            break;
        }
    }
}
json_out(['checked' => (bool) ($nse || $bse), 'listed' => (object) $out], 200, 3600);
