<?php
// research_track(): logging, target / stop / same-bar / expiry outcomes. Run with ML_CONFIG_LOCAL set.
declare(strict_types=1);
require __DIR__ . '/../public/api/lib/bootstrap.php';
require __DIR__ . '/../public/api/lib/research.php';

$fail = function (string $m) { fwrite(STDERR, "FAIL: $m\n"); exit(1); };
@unlink(data_path('track-ZZ.json'));
$t0 = 1_800_000_000;
$pick = fn($s, $px, $tg, $sl) => ['symbol' => $s, 'name' => $s, 'sector' => 'X', 'cap' => 'Mid', 'price' => $px,
    'plan' => ['entry' => [$px - 1, $px], 'target' => $tg, 'stop' => $sl, 'score' => 99]];
$bars = function (string $s, array $hl) use ($t0) {
    $h = ['t' => [], 'c' => [], 'h' => [], 'l' => [], 'v' => [], 'at' => time()];
    foreach ($hl as $i => [$hi, $lo]) { $h['t'][] = $t0 + $i * 86400 - 43200; $h['h'][] = $hi; $h['l'][] = $lo; $h['c'][] = ($hi + $lo) / 2; $h['v'][] = 1; }
    cache_set(rs_history_key("ZZ:$s"), $h);
};
// Bar 0 is before the recommendation and must be ignored even though it crosses both levels.
$bars('HIT', [[200, 50], [105, 99], [111, 104]]);   // target 110 on day 2
$bars('STOP', [[200, 50], [101, 94]]);              // stop 95 on day 1
$bars('BOTH', [[200, 50], [112, 94]]);              // one bar crosses both: counted as a stop
$bars('OPEN', [[200, 50], [104, 98]]);
$picks = ['st' => [$pick('HIT', 100, 110, 95), $pick('STOP', 100, 110, 95), $pick('BOTH', 100, 110, 95)], 'lt' => [$pick('OPEN', 100, 150, 80)]];
$rows = ['ZZ:HIT' => ['price' => 108], 'ZZ:STOP' => ['price' => 96], 'ZZ:BOTH' => ['price' => 100], 'ZZ:OPEN' => ['price' => 102]];

$T = research_track('ZZ', $picks, [], $t0);          // log only: no bars after t0 yet, no live price
if (count($T['entries']) !== 4 || array_unique(array_column($T['entries'], 'status')) !== ['open']) $fail('logging: ' . json_encode($T));
$T = research_track('ZZ', $picks, $rows, $t0 + 3 * 86400);
$by = array_column($T['entries'], null, 'symbol');
if (count($T['entries']) !== 4) $fail('a still-recommended pick was logged twice');
if ($by['HIT']['status'] !== 'target' || $by['HIT']['exit'] !== 110) $fail('target: ' . json_encode($by['HIT']));
if ($by['STOP']['status'] !== 'stop' || $by['STOP']['exit'] !== 95) $fail('stop: ' . json_encode($by['STOP']));
if ($by['BOTH']['status'] !== 'stop') $fail('same-bar ambiguity should count as a stop');
if ($by['OPEN']['status'] !== 'open' || $by['OPEN']['last'] !== 102.0 || $by['OPEN']['hi'] !== 104.0) $fail('open: ' . json_encode($by['OPEN']));
// Short-term picks expire after ~3 months; long-term after ~2 years.
$T = research_track('ZZ', ['st' => [$pick('NEW', 50, 60, 45)]], ['ZZ:NEW' => ['price' => 52]], $t0 + 3 * 86400);
$T = research_track('ZZ', [], ['ZZ:NEW' => ['price' => 53]], $t0 + 100 * 86400);
$by = array_column($T['entries'], null, 'symbol');
if ($by['NEW']['status'] !== 'expired' || $by['NEW']['exit'] !== 53.0) $fail('st expiry: ' . json_encode($by['NEW']));
if ($by['OPEN']['status'] !== 'open') $fail('lt pick expired too early');
echo "ok track\n";
