<?php
declare(strict_types=1);

/**
 * Quant research engine.
 *
 * Builds a ranked research table for every stock in a market's universe from
 * public data only: daily price history (technicals), Yahoo fundamentals and
 * analyst estimates, and index membership. Each run refreshes a batch of stale
 * symbols, then re-scores the whole universe and writes:
 *   data/research-IN.json  (table: one compact row per stock + picks)
 *   data/research-IN-full.json  (every feature, for the stock research page)
 *
 * Models (all transparent, no look-ahead):
 *  - Technicals: SMA 20/50/200, RSI(14), ATR(14), 12-1 and 3/6-month momentum,
 *    126-day log-price regression (slope and R²), volatility, drawdown, volume.
 *  - Fundamentals: ROE, margins, growth, leverage, valuation vs. sector median,
 *    analyst target and recommendation.
 *  - Factor scores are percentile ranks within the market (value within sector).
 *  - Horizon composites (long term, short term) and rule-based swing setups whose
 *    hit rate is backtested on each stock's own two-year history.
 *  - "High conviction" needs a top-decile composite plus agreement across
 *    factors and no red flags; a weak market regime raises the bar.
 */

require_once __DIR__ . '/screener.php';

const RS_LOOKBACK = '2y';

// ---------------------------------------------------------------- universe

/** Indices whose members become filter tags, per market. */
function research_tag_indices(string $mkt): array
{
    return $mkt === 'IN'
        ? ['nifty50', 'niftynext50', 'nifty100', 'nifty200', 'midcap100', 'sensex', 'banknifty', 'niftyit', 'niftypharma', 'niftyauto', 'niftyfmcg']
        : ['dow30'];
}

/** @return array<string,array{0:string,1:string,2:?string}> symbol => [symbol, name, sector] */
function research_universe(string $mkt): array
{
    $rows = [];
    if ($mkt === 'IN') {
        // Nifty Total Market (~750 stocks) when reachable, else Nifty 500, else the bundled list.
        foreach (['https://www.niftyindices.com/IndexConstituent/ind_niftytotalmarket_list.csv', null] as $csv) {
            $def = $csv ? ['id' => 'niftytotal', 'csv' => $csv, 'fallback' => []] : (index_defs()['allin'] ?? []);
            $got = $csv ? single_constituents($def)['rows'] : index_constituents($def)['rows'];
            if (count($got) >= 50) {
                $rows = $got;
                break;
            }
        }
    } else {
        $rows = us_sp500_rows();
        foreach (us_nasdaq100_rows() as $r) $rows[] = $r;
        foreach ((index_defs()['allus']['fallback'] ?? []) as $r) $rows[] = $r;
    }
    $out = [];
    foreach ($rows as $r) {
        $sym = strtoupper(trim((string) $r[0]));
        if ($sym === '' || isset($out[$sym]) && !empty($out[$sym][2])) continue;
        $out[$sym] = [$sym, (string) ($r[1] ?? $sym), ($r[2] ?? null) ?: ($out[$sym][2] ?? null)];
    }
    return $out;
}

/** S&P 500 members: refreshed from the public dataset daily, bundled list as fallback. */
function us_sp500_rows(): array
{
    $ck = 'us:sp500';
    if ($c = cache_get($ck, 86400)) return $c;
    $url = cfg('upstream')['sp500_csv'] ?? 'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/main/data/constituents.csv';
    [$status, $body] = http_get($url, ['accept' => 'text/csv,*/*']);
    $rows = [];
    if ($status === 200) {
        $lines = preg_split('/\r\n|\n|\r/', trim($body));
        $head = array_map('strtolower', str_getcsv((string) array_shift($lines)));
        $iS = array_search('symbol', $head, true);
        $iN = array_search('security', $head, true);
        $iG = array_search('gics sector', $head, true);
        foreach ($lines as $l) {
            $c = str_getcsv($l);
            if ($iS !== false && !empty($c[$iS])) $rows[] = [trim($c[$iS]), trim($c[$iN] ?? $c[$iS]), $iG !== false ? trim($c[$iG] ?? '') : null];
        }
    }
    if (count($rows) >= 400) {
        cache_set($ck, $rows);
        return $rows;
    }
    if ($old = cache_stale($ck)) return $old;
    return read_json(__DIR__ . '/../../data/sp500.json', ['rows' => []])['rows'];
}

/** Nasdaq-100 members parsed from Wikipedia's constituents table (best effort, cached a day). */
function us_nasdaq100_rows(): array
{
    $ck = 'us:ndx';
    if ($c = cache_get($ck, 86400)) return $c;
    $url = cfg('upstream')['ndx_page'] ?? 'https://en.wikipedia.org/wiki/Nasdaq-100';
    [$status, $html] = http_get($url, ['accept' => 'text/html']);
    $rows = [];
    if ($status === 200 && class_exists('DOMDocument')) {
        $dom = new DOMDocument();
        @$dom->loadHTML($html);
        foreach ($dom->getElementsByTagName('table') as $t) {
            if ($t->getAttribute('id') !== 'constituents') continue;
            $hdr = [];
            foreach ($t->getElementsByTagName('tr') as $i => $tr) {
                $cells = [];
                foreach ($tr->childNodes as $td) if ($td instanceof DOMElement) $cells[] = trim($td->textContent);
                if ($i === 0) {
                    $hdr = array_map('strtolower', $cells);
                    continue;
                }
                $iT = array_search('ticker', $hdr, true);
                $iC = array_search('company', $hdr, true);
                $iS = array_search('gics sector', $hdr, true);
                if ($iT !== false && !empty($cells[$iT])) $rows[] = [$cells[$iT], $cells[$iC] ?? $cells[$iT], $iS !== false ? ($cells[$iS] ?? null) : null];
            }
        }
    }
    if (count($rows) >= 80) {
        cache_set($ck, $rows);
        return $rows;
    }
    return cache_stale($ck) ?: [];
}

/** symbol => list of index names it belongs to. */
function research_index_tags(string $mkt, array $universe): array
{
    $tags = [];
    $defs = index_defs();
    foreach (research_tag_indices($mkt) as $id) {
        if (!isset($defs[$id])) continue;
        foreach (index_constituents($defs[$id])['rows'] as $r) $tags[strtoupper($r[0])][] = $defs[$id]['name'];
    }
    if ($mkt === 'US') {
        foreach (us_sp500_rows() as $r) $tags[strtoupper($r[0])][] = 'S&P 500';
        foreach (us_nasdaq100_rows() as $r) $tags[strtoupper($r[0])][] = 'Nasdaq-100';
    }
    foreach ($tags as $s => $t) $tags[$s] = array_values(array_unique($t));
    return $tags;
}

// ------------------------------------------------------------ data fetching

function rs_history_key(string $id): string { return "rs:h:$id"; }
function rs_fund_key(string $id): string { return "rs:f:$id"; }

/** Parse a v8 chart response into compact arrays. */
function rs_parse_history(string $body): ?array
{
    $r = (json_decode($body, true) ?: [])['chart']['result'][0] ?? null;
    if (!$r) return null;
    $q = $r['indicators']['quote'][0] ?? [];
    $out = ['t' => [], 'c' => [], 'h' => [], 'l' => [], 'v' => []];
    foreach ($r['timestamp'] ?? [] as $i => $t) {
        $c = $q['close'][$i] ?? null;
        if ($c === null) continue;
        $out['t'][] = (int) $t;
        $out['c'][] = round((float) $c, 4);
        $out['h'][] = round((float) ($q['high'][$i] ?? $c), 4);
        $out['l'][] = round((float) ($q['low'][$i] ?? $c), 4);
        $out['v'][] = (float) ($q['volume'][$i] ?? 0);
    }
    return count($out['c']) >= 30 ? $out + ['at' => time()] : null;
}

/** Pull fundamentals out of a v10 quoteSummary response. */
function rs_parse_fundamentals(string $body): ?array
{
    $r = (json_decode($body, true) ?: [])['quoteSummary']['result'][0] ?? null;
    if (!$r) return null;
    $raw = fn($a, $k) => isset($a[$k]) ? (is_array($a[$k]) ? num($a[$k]['raw'] ?? null) : num($a[$k])) : null;
    $fd = $r['financialData'] ?? [];
    $ks = $r['defaultKeyStatistics'] ?? [];
    $sd = $r['summaryDetail'] ?? [];
    $ce = $r['calendarEvents']['earnings']['earningsDate'] ?? [];
    $next = null;
    foreach ($ce as $d) {
        $t = is_array($d) ? (int) ($d['raw'] ?? 0) : (int) $d;
        if ($t > time() - 86400 && ($next === null || $t < $next)) $next = $t;
    }
    $f = [
        'roe' => $raw($fd, 'returnOnEquity'),
        'opMargin' => $raw($fd, 'operatingMargins'),
        'netMargin' => $raw($fd, 'profitMargins'),
        'revGrowth' => $raw($fd, 'revenueGrowth'),
        'epsGrowth' => $raw($fd, 'earningsGrowth'),
        'de' => $raw($fd, 'debtToEquity'),
        'currentRatio' => $raw($fd, 'currentRatio'),
        'fcf' => $raw($fd, 'freeCashflow'),
        'target' => $raw($fd, 'targetMeanPrice'),
        'targetHigh' => $raw($fd, 'targetHighPrice'),
        'targetLow' => $raw($fd, 'targetLowPrice'),
        'rec' => $raw($fd, 'recommendationMean'),
        'analysts' => $raw($fd, 'numberOfAnalystOpinions'),
        'fwdEps' => $raw($ks, 'forwardEps'),
        'ttmEps' => $raw($ks, 'trailingEps'),
        'evEbitda' => $raw($ks, 'enterpriseToEbitda'),
        'peg' => $raw($ks, 'pegRatio'),
        'insiders' => $raw($ks, 'heldPercentInsiders'),
        'beta' => $raw($sd, 'beta') ?? $raw($ks, 'beta'),
        'nextEarnings' => $next,
        'at' => time(),
    ];
    return $f;
}

/**
 * Refresh up to $limit stale histories and fundamentals. Missing data first,
 * then oldest. Polite concurrency: Yahoo rate-limits bursts.
 */
function research_refresh_batch(string $mkt, array $ids, int $limit): array
{
    $now = time();
    $hTtl = (int) cfg('research_history_ttl', 18 * 3600);
    $fTtl = (int) cfg('research_fund_ttl', 3 * 86400);
    $staleH = $staleF = [];
    foreach ($ids as $id) {
        $h = cache_stale(rs_history_key($id));
        $f = cache_stale(rs_fund_key($id));
        $ha = $h['at'] ?? 0;
        $fa = $f['at'] ?? 0;
        if ($now - $ha > $hTtl) $staleH[$id] = $ha;
        if ($now - $fa > $fTtl) $staleF[$id] = $fa;
    }
    asort($staleH);
    asort($staleF);
    $hosts = cfg('upstream')['yahoo'];
    $conc = (int) cfg('research_concurrency', 8);

    $urls = [];
    foreach (array_slice(array_keys($staleH), 0, $limit) as $id) {
        $urls[$id] = $hosts[0] . '/v8/finance/chart/' . rawurlencode(yahoo_symbol($id)) . '?range=' . RS_LOOKBACK . '&interval=1d';
    }
    $gotH = 0;
    foreach (http_multi($urls, [], $conc) as $id => [$st, $body]) {
        $h = $st === 200 ? rs_parse_history($body) : null;
        if ($h) {
            cache_set(rs_history_key($id), $h);
            $gotH++;
        }
    }

    $gotF = 0;
    $crumb = yahoo_crumb();
    if ($crumb) {
        $jar = data_path('cache/yahoo-cookies.txt');
        $urls = [];
        foreach (array_slice(array_keys($staleF), 0, $limit) as $id) {
            $urls[$id] = $hosts[0] . '/v10/finance/quoteSummary/' . rawurlencode(yahoo_symbol($id)) . '?' . http_build_query(['modules' => 'financialData,defaultKeyStatistics,summaryDetail,calendarEvents', 'crumb' => $crumb]);
        }
        foreach (http_multi($urls, ['cookie_jar' => $jar], $conc) as $id => [$st, $body]) {
            $f = $st === 200 ? rs_parse_fundamentals($body) : null;
            if ($f) {
                cache_set(rs_fund_key($id), $f);
                $gotF++;
            } elseif ($st === 200 || $st === 404) {
                // Yahoo has no data for this symbol: remember the miss so it doesn't block the queue.
                // Throttling or crumb errors (401/429/5xx) are retried on the next run instead.
                cache_set(rs_fund_key($id), ['at' => time(), 'missing' => true]);
            }
        }
    }
    return ['history' => $gotH, 'historyStale' => count($staleH), 'fundamentals' => $gotF, 'fundamentalsStale' => count($staleF)];
}

// ---------------------------------------------------------------- maths

function sma(array $a, int $n, ?int $end = null): ?float
{
    $end ??= count($a);
    if ($end < $n) return null;
    return array_sum(array_slice($a, $end - $n, $n)) / $n;
}

/** Wilder RSI over the whole series; returns the value at each bar (null until warm). */
function rsi_series(array $c, int $n = 14): array
{
    $out = array_fill(0, count($c), null);
    if (count($c) <= $n) return $out;
    $g = $l = 0.0;
    for ($i = 1; $i <= $n; $i++) {
        $d = $c[$i] - $c[$i - 1];
        $g += max($d, 0);
        $l += max(-$d, 0);
    }
    $g /= $n;
    $l /= $n;
    $out[$n] = $l == 0 ? 100 : 100 - 100 / (1 + $g / $l);
    for ($i = $n + 1; $i < count($c); $i++) {
        $d = $c[$i] - $c[$i - 1];
        $g = ($g * ($n - 1) + max($d, 0)) / $n;
        $l = ($l * ($n - 1) + max(-$d, 0)) / $n;
        $out[$i] = $l == 0 ? 100 : 100 - 100 / (1 + $g / $l);
    }
    return $out;
}

function atr_series(array $h, array $l, array $c, int $n = 14): array
{
    $out = array_fill(0, count($c), null);
    if (count($c) <= $n) return $out;
    $tr = [0];
    for ($i = 1; $i < count($c); $i++) $tr[] = max($h[$i] - $l[$i], abs($h[$i] - $c[$i - 1]), abs($l[$i] - $c[$i - 1]));
    $a = array_sum(array_slice($tr, 1, $n)) / $n;
    $out[$n] = $a;
    for ($i = $n + 1; $i < count($c); $i++) {
        $a = ($a * ($n - 1) + $tr[$i]) / $n;
        $out[$i] = $a;
    }
    return $out;
}

/** OLS on log price: annualised slope and R². */
function log_regression(array $c, int $n): ?array
{
    if (count($c) < $n) return null;
    $y = array_map(fn($v) => log(max($v, 1e-9)), array_slice($c, -$n));
    $mx = ($n - 1) / 2;
    $my = array_sum($y) / $n;
    $sxy = $sxx = $syy = 0.0;
    foreach ($y as $i => $v) {
        $sxy += ($i - $mx) * ($v - $my);
        $sxx += ($i - $mx) ** 2;
        $syy += ($v - $my) ** 2;
    }
    if ($sxx == 0 || $syy == 0) return ['slope' => 0.0, 'r2' => 0.0];
    $b = $sxy / $sxx;
    return ['slope' => exp($b * 252) - 1, 'r2' => ($sxy * $sxy) / ($sxx * $syy)];
}

function stdev(array $a): float
{
    $n = count($a);
    if ($n < 2) return 0.0;
    $m = array_sum($a) / $n;
    $s = 0.0;
    foreach ($a as $v) $s += ($v - $m) ** 2;
    return sqrt($s / ($n - 1));
}

function median(array $a): ?float
{
    $a = array_values(array_filter($a, fn($v) => $v !== null && is_finite((float) $v)));
    if (!$a) return null;
    sort($a);
    $n = count($a);
    return $n % 2 ? (float) $a[intdiv($n, 2)] : ($a[$n / 2 - 1] + $a[$n / 2]) / 2;
}

/** Percentile rank 0–100 for each key; nulls stay null. $higherBetter flips direction. */
function pct_rank(array $vals, bool $higherBetter = true): array
{
    $v = array_filter($vals, fn($x) => $x !== null && is_finite((float) $x));
    $n = count($v);
    $out = array_fill_keys(array_keys($vals), null);
    if ($n < 3) return $out;
    asort($v);
    $i = 0;
    $prev = null;
    $rank = 0;
    foreach ($v as $k => $x) {
        if ($x !== $prev) $rank = $i;
        $p = $rank / ($n - 1) * 100;
        $out[$k] = $higherBetter ? $p : 100 - $p;
        $prev = $x;
        $i++;
    }
    return $out;
}

/** Weighted mean of available parts, needs at least $minWeight of the total weight present. */
function blend(array $parts, float $minWeight = 0.5): ?float
{
    $s = $w = $tot = 0.0;
    foreach ($parts as [$v, $wt]) {
        $tot += $wt;
        if ($v === null) continue;
        $s += $v * $wt;
        $w += $wt;
    }
    return $w >= $tot * $minWeight && $w > 0 ? $s / $w : null;
}

// ------------------------------------------------------------ features

/** Technical features from a daily history. */
function rs_technicals(array $h): ?array
{
    $c = $h['c'];
    $n = count($c);
    if ($n < 60) return null;
    $px = $c[$n - 1];
    $rsi = rsi_series($c);
    $atr = atr_series($h['h'], $h['l'], $c);
    $ret = fn(int $k) => $n > $k ? $px / $c[$n - 1 - $k] - 1 : null;
    $lr = [];
    for ($i = max(1, $n - 63); $i < $n; $i++) $lr[] = log($c[$i] / $c[$i - 1]);
    $hi252 = max(array_slice($h['h'], -min(252, $n)));
    $peak = 0;
    $dd = 0;
    foreach (array_slice($c, -min(252, $n)) as $v) {
        $peak = max($peak, $v);
        $dd = min($dd, $v / $peak - 1);
    }
    $reg = log_regression($c, min(126, $n));
    $v20 = sma($h['v'], min(20, $n));
    $v50 = sma($h['v'], min(50, $n));
    return [
        'px' => $px,
        'sma20' => sma($c, 20),
        'sma50' => sma($c, 50),
        'sma200' => $n >= 200 ? sma($c, 200) : null,
        'rsi' => $rsi[$n - 1],
        'rsi3' => $rsi[$n - 4] ?? null,
        'atr' => $atr[$n - 1],
        'atrPct' => $atr[$n - 1] ? $atr[$n - 1] / $px : null,
        'r1m' => $ret(21),
        'r3m' => $ret(63),
        'r6m' => $ret(126),
        'r12m' => $ret(252),
        'mom121' => $n > 252 ? $c[$n - 22] / $c[$n - 253] - 1 : ($n > 130 ? $c[$n - 22] / $c[0] - 1 : null),
        'vol' => stdev($lr) * sqrt(252),
        'dd' => $dd,
        'from52h' => $px / $hi252 - 1,
        'trendSlope' => $reg['slope'] ?? null,
        'trendR2' => $reg['r2'] ?? null,
        'volRatio' => $v50 ? $v20 / $v50 : null,
        'turnover' => $v20 ? $v20 * $px : null,
        'bars' => $n,
    ];
}

/** Rolling mean ending at each bar (inclusive); null until $n bars exist. */
function sma_series(array $a, int $n): array
{
    $out = array_fill(0, count($a), null);
    $sum = 0.0;
    foreach ($a as $i => $v) {
        $sum += $v;
        if ($i >= $n) $sum -= $a[$i - $n];
        if ($i >= $n - 1) $out[$i] = $sum / $n;
    }
    return $out;
}

/** Indicator series computed once per stock, so the backtest replay stays fast. */
function rs_series(array $h): array
{
    $n = count($h['c']);
    $hi55 = array_fill(0, $n, null);
    $lo5 = array_fill(0, $n, null);
    for ($i = 55; $i < $n; $i++) $hi55[$i] = max(array_slice($h['h'], $i - 55, 55)); // prior 55 bars, today excluded
    for ($i = 4; $i < $n; $i++) $lo5[$i] = min(array_slice($h['l'], $i - 4, 5));
    $v20 = sma_series($h['v'], 20);
    return [
        'rsi' => rsi_series($h['c']),
        'atr' => atr_series($h['h'], $h['l'], $h['c']),
        's20' => sma_series($h['c'], 20),
        's50' => sma_series($h['c'], 50),
        's200' => sma_series($h['c'], 200),
        'v20prev' => array_merge([null], array_slice($v20, 0, $n - 1)), // average volume of the 20 bars before today
        'hi55' => $hi55,
        'lo5' => $lo5,
    ];
}

/**
 * Swing setups at bar $i (inclusive). Only uses data up to $i, so it can be
 * replayed historically for the backtest.
 * @return array{type:string,entry:float,stop:float,target:float,target2:float}|null
 */
function rs_swing_at(array $h, array $S, int $i): ?array
{
    if ($i < 200) return null;
    $c = $h['c'];
    $px = $c[$i];
    $s20 = $S['s20'][$i];
    $s50 = $S['s50'][$i];
    $s200 = $S['s200'][$i];
    $a = $S['atr'][$i];
    $r = $S['rsi'][$i];
    if (!$a || $r === null || $s200 === null) return null;
    $uptrend = $px > $s200 && $s50 > $s200;
    if (!$uptrend) return null;
    // Breakout: close above the prior 55-day high on above-average volume, not overbought.
    $prior = $S['hi55'][$i];
    $v20 = $S['v20prev'][$i];
    if ($px > $prior && $v20 > 0 && $h['v'][$i] >= 1.5 * $v20 && $r < 78) {
        $stop = $prior - $a;
        $risk = $px - $stop;
        if ($risk > 0 && $risk / $px < 0.12) return ['type' => 'Breakout', 'entry' => $px, 'stop' => $stop, 'target' => $px + 2 * $risk, 'target2' => $px + 3 * $risk];
    }
    // Pullback: dipped to the 20/50-day average inside an uptrend and turning up.
    $low5 = $S['lo5'][$i];
    $touched = abs($low5 - $s20) <= $a || abs($low5 - $s50) <= $a;
    $rsi3 = $S['rsi'][$i - 3] ?? null;
    if ($touched && $r >= 38 && $r <= 58 && $rsi3 !== null && $r > $rsi3 && $px > $c[$i - 1] && $px > $s50) {
        $stop = $low5 - 0.5 * $a;
        $risk = $px - $stop;
        if ($risk > 0 && $risk / $px < 0.10) return ['type' => 'Pullback', 'entry' => $px, 'stop' => $stop, 'target' => $px + 2 * $risk, 'target2' => $px + 3 * $risk];
    }
    return null;
}

/**
 * Replay the swing rules over the stock's history: a signal wins when the 2R
 * target is hit before the stop within 20 bars. Non-overlapping signals.
 * @return array<string,array{n:int,wins:int,sumR:float}>
 */
function rs_swing_backtest(array $h, array $S): array
{
    $n = count($h['c']);
    $stats = [];
    $i = 200;
    while ($i < $n - 1) {
        $s = rs_swing_at($h, $S, $i);
        if (!$s) {
            $i++;
            continue;
        }
        $risk = $s['entry'] - $s['stop'];
        $res = null;
        $end = min($n - 1, $i + 20);
        for ($j = $i + 1; $j <= $end; $j++) {
            $hitStop = $h['l'][$j] <= $s['stop'];
            $hitTgt = $h['h'][$j] >= $s['target'];
            if ($hitStop) { $res = -1.0; break; } // same-bar ties count as losses (conservative)
            if ($hitTgt) { $res = 2.0; break; }
        }
        if ($res === null) {
            if ($end === $n - 1 && $end - $i < 20) break; // still open: not scored
            $res = ($h['c'][$end] - $s['entry']) / $risk;
        }
        $t = $s['type'];
        $stats[$t] ??= ['n' => 0, 'wins' => 0, 'sumR' => 0.0];
        $stats[$t]['n']++;
        $stats[$t]['wins'] += $res >= 2.0 ? 1 : 0;
        $stats[$t]['sumR'] += $res;
        $i = $j ?? $end; // skip past the trade
        $i++;
    }
    return $stats;
}

// ---------------------------------------------------------------- scoring

/** Large / Mid / Small by SEBI-style rank for India, by $ size for the US. */
function rs_cap_bucket(string $mkt, ?float $mcap, ?int $rank): ?string
{
    if ($mkt === 'IN') {
        if ($rank === null) return null;
        return $rank <= 100 ? 'Large' : ($rank <= 250 ? 'Mid' : ($rank <= 500 ? 'Small' : 'Micro'));
    }
    if ($mcap === null) return null;
    return $mcap >= 200e9 ? 'Mega' : ($mcap >= 10e9 ? 'Large' : ($mcap >= 2e9 ? 'Mid' : 'Small'));
}

/** Market regime from the benchmark: price vs. 200-day average and 3-month trend. */
function rs_regime(string $mkt): array
{
    $id = $mkt === 'IN' ? 'IX:NIFTY' : 'IX:SPX';
    $h = cache_get("rs:h:$id", 18 * 3600);
    if (!$h) {
        $url = cfg('upstream')['yahoo'][0] . '/v8/finance/chart/' . rawurlencode(yahoo_symbol($id)) . '?range=' . RS_LOOKBACK . '&interval=1d';
        [$st, $body] = http_get($url);
        $h = $st === 200 ? rs_parse_history($body) : null;
        if ($h) cache_set("rs:h:$id", $h);
        else $h = cache_stale("rs:h:$id");
    }
    $t = $h ? rs_technicals($h) : null;
    if (!$t || !$t['sma200']) return ['state' => 'unknown', 'label' => 'Regime unknown', 'bar' => 90];
    $above = $t['px'] > $t['sma200'];
    $rising = ($t['r3m'] ?? 0) > 0;
    $state = $above && $rising ? 'risk-on' : (!$above && !$rising ? 'risk-off' : 'mixed');
    return [
        'state' => $state,
        'label' => ['risk-on' => 'Risk-on: benchmark above its 200-day average and rising', 'mixed' => 'Mixed: benchmark trend is unclear', 'risk-off' => 'Risk-off: benchmark below its 200-day average and falling'][$state],
        'px' => $t['px'], 'sma200' => $t['sma200'], 'r3m' => $t['r3m'],
        // Weaker tape, higher bar: only the very top of the ranking qualifies.
        'bar' => ['risk-on' => 90, 'mixed' => 93, 'risk-off' => 96][$state],
    ];
}

const RS_FINANCIAL = '/bank|financ|insur|nbfc|capital markets/i';

/**
 * Score every stock and pick high-conviction ideas.
 * @param array<string,array> $rows id => base row (symbol, name, sector, quote fields, tags)
 */
function research_score(string $mkt, array $rows, array $regime): array
{
    $feat = [];
    $poolSwing = [];
    foreach ($rows as $id => $r) {
        $h = cache_stale(rs_history_key($id));
        $f = cache_stale(rs_fund_key($id)) ?: [];
        $t = $h ? rs_technicals($h) : null;
        $swing = null;
        $bt = [];
        if ($h && count($h['c']) >= 220) {
            $S = rs_series($h);
            $swing = rs_swing_at($h, $S, count($h['c']) - 1);
            $bt = rs_swing_backtest($h, $S);
            foreach ($bt as $type => $s) {
                $poolSwing[$type] ??= ['n' => 0, 'wins' => 0, 'sumR' => 0.0];
                $poolSwing[$type]['n'] += $s['n'];
                $poolSwing[$type]['wins'] += $s['wins'];
                $poolSwing[$type]['sumR'] += $s['sumR'];
            }
        }
        // Prefer the live quote price for valuation; fall back to the last close.
        $px = $r['price'] ?? ($t['px'] ?? null);
        $feat[$id] = ['t' => $t, 'f' => empty($f['missing']) ? $f : [], 'swing' => $swing, 'bt' => $bt, 'px' => $px];
    }

    // Sector medians for relative valuation.
    $bySector = [];
    foreach ($rows as $id => $r) $bySector[$r['sector'] ?? '—'][] = $id;
    $relPe = $relFpe = [];
    foreach ($bySector as $ids) {
        $mPe = median(array_map(fn($id) => ($rows[$id]['pe'] ?? 0) > 0 ? $rows[$id]['pe'] : null, $ids));
        $mF = median(array_map(fn($id) => ($rows[$id]['fpe'] ?? 0) > 0 ? $rows[$id]['fpe'] : null, $ids));
        foreach ($ids as $id) {
            $pe = $rows[$id]['pe'] ?? null;
            $fpe = $rows[$id]['fpe'] ?? null;
            $relPe[$id] = $pe > 0 && $mPe ? $pe / $mPe : null;
            $relFpe[$id] = $fpe > 0 && $mF ? $fpe / $mF : null;
            $feat[$id]['secPe'] = $mPe;
            $feat[$id]['secFpe'] = $mF;
        }
    }

    $col = fn(callable $g) => array_map($g, $feat, array_keys($feat));
    $keys = array_keys($feat);
    $mk = fn(array $v) => array_combine($keys, $v);
    $isFin = fn($id) => (bool) preg_match(RS_FINANCIAL, (string) ($rows[$id]['sector'] ?? ''));

    // Factor inputs.
    $P = [
        'pe' => pct_rank($relPe, false),
        'fpe' => pct_rank($relFpe, false),
        'pb' => pct_rank($mk($col(fn($x, $id) => ($rows[$id]['pb'] ?? 0) > 0 ? $rows[$id]['pb'] : null)), false),
        'ev' => pct_rank($mk($col(fn($x) => ($x['f']['evEbitda'] ?? 0) > 0 ? $x['f']['evEbitda'] : null)), false),
        'roe' => pct_rank($mk($col(fn($x) => $x['f']['roe'] ?? null))),
        'opm' => pct_rank($mk($col(fn($x, $id) => $isFin($id) ? null : ($x['f']['opMargin'] ?? null)))),
        'npm' => pct_rank($mk($col(fn($x) => $x['f']['netMargin'] ?? null))),
        'de' => pct_rank($mk($col(fn($x, $id) => $isFin($id) ? null : ($x['f']['de'] ?? null))), false),
        'rg' => pct_rank($mk($col(fn($x) => $x['f']['revGrowth'] ?? null))),
        'eg' => pct_rank($mk($col(fn($x) => $x['f']['epsGrowth'] ?? null))),
        'fg' => pct_rank($mk($col(fn($x) => ($x['f']['fwdEps'] ?? null) && ($x['f']['ttmEps'] ?? 0) > 0 ? $x['f']['fwdEps'] / $x['f']['ttmEps'] - 1 : null))),
        'm121' => pct_rank($mk($col(fn($x) => $x['t']['mom121'] ?? null))),
        'm6' => pct_rank($mk($col(fn($x) => $x['t']['r6m'] ?? null))),
        'm3' => pct_rank($mk($col(fn($x) => $x['t']['r3m'] ?? null))),
        'tq' => pct_rank($mk($col(fn($x) => isset($x['t']['trendR2']) ? $x['t']['trendR2'] * ($x['t']['trendSlope'] > 0 ? 1 : -1) : null))),
        'vol' => pct_rank($mk($col(fn($x) => $x['t']['vol'] ?? null)), false),
        'dd' => pct_rank($mk($col(fn($x) => $x['t']['dd'] ?? null))),
        'an' => pct_rank($mk($col(fn($x) => ($x['f']['analysts'] ?? 0) >= 3 && ($x['f']['target'] ?? 0) > 0 && $x['px'] ? $x['f']['target'] / $x['px'] - 1 - 0.05 * (($x['f']['rec'] ?? 3) - 2) : null))),
    ];

    $out = [];
    $scores = ['lt' => [], 'st' => []];
    foreach ($feat as $id => $x) {
        $t = $x['t'] ?? [];
        $g = fn($k) => $P[$k][$id];
        $trendPts = null;
        if ($t) {
            $pts = 0;
            $pts += ($t['sma50'] && $x['px'] > $t['sma50']) ? 25 : 0;
            $pts += ($t['sma200'] && $x['px'] > $t['sma200']) ? 25 : 0;
            $pts += ($t['sma200'] && $t['sma50'] > $t['sma200']) ? 20 : 0;
            $trendPts = $pts + 0.3 * ($g('tq') ?? 50);
        }
        $F = [
            'value' => blend([[$g('fpe'), 0.35], [$g('pe'), 0.25], [$g('ev'), 0.25], [$g('pb'), 0.15]]),
            'quality' => blend([[$g('roe'), 0.4], [$g('opm'), 0.2], [$g('npm'), 0.2], [$g('de'), 0.2]]),
            'growth' => blend([[$g('rg'), 0.35], [$g('eg'), 0.35], [$g('fg'), 0.3]]),
            'momentum' => blend([[$g('m121'), 0.5], [$g('m6'), 0.25], [$g('m3'), 0.25]], 0.25),
            'trend' => $trendPts,
            'risk' => blend([[$g('vol'), 0.6], [$g('dd'), 0.4]]),
            'analyst' => $g('an'),
        ];
        $lt = blend([[$F['quality'], 0.30], [$F['growth'], 0.25], [$F['value'], 0.20], [$F['momentum'], 0.15], [$F['risk'], 0.10]], 0.7);
        $st = blend([[$F['momentum'], 0.35], [$F['trend'], 0.25], [$F['growth'], 0.15], [$F['quality'], 0.15], [$F['analyst'], 0.10]], 0.6);
        $scores['lt'][$id] = $lt;
        $scores['st'][$id] = $st;
        $out[$id] = ['F' => array_map(fn($v) => $v === null ? null : round($v), $F), 'lt' => $lt, 'st' => $st];
    }
    $ltP = pct_rank($scores['lt']);
    $stP = pct_rank($scores['st']);
    $bar = $regime['bar'];

    $poolStats = [];
    foreach ($poolSwing as $type => $s) $poolStats[$type] = ['n' => $s['n'], 'win' => $s['n'] ? $s['wins'] / $s['n'] : null, 'avgR' => $s['n'] ? $s['sumR'] / $s['n'] : null];

    $final = [];
    foreach ($rows as $id => $r) {
        $x = $feat[$id];
        $t = $x['t'];
        $f = $x['f'];
        $F = $out[$id]['F'];
        $px = $x['px'];
        $flags = [];
        if (($r['pe'] ?? 1) < 0 || (($f['ttmEps'] ?? 1) < 0)) $flags[] = 'Loss-making on trailing earnings';
        if (!$isFin($id) && ($f['de'] ?? 0) > 150) $flags[] = 'High debt (debt/equity ' . round($f['de']) . '%)';
        if (($t['vol'] ?? 0) > 0.6) $flags[] = 'Very volatile (' . round($t['vol'] * 100) . '% a year)';
        if (($t['turnover'] ?? INF) < ($r['market'] === 'IN' ? 5e7 : 5e6)) $flags[] = 'Thinly traded';
        $earnSoon = !empty($f['nextEarnings']) && $f['nextEarnings'] - time() < 14 * 86400;
        if ($earnSoon) $flags[] = 'Results due ' . date('j M', (int) $f['nextEarnings']);
        $hard = array_values(array_filter($flags, fn($s) => !str_starts_with($s, 'Results due')));

        $picks = [];
        $atr = $t['atr'] ?? null;
        // Long term: top decile, quality and growth both above median, no hard red flags, not in a downtrend.
        if (($ltP[$id] ?? 0) >= $bar && ($F['quality'] ?? 0) >= 60 && ($F['growth'] ?? 0) >= 55 && ($F['momentum'] ?? 0) >= 40 && !$hard && $t && $t['sma200'] && $px > 0.95 * $t['sma200'] && $atr) {
            $entryHi = $px;
            $entryLo = max($px - 1.5 * $atr, ($t['sma50'] ?? $px) * 0.98);
            if ($entryLo >= $entryHi) $entryLo = $px * 0.96;
            $stop = max($t['sma200'] - $atr, $px * 0.80);
            $fair = null;
            if (($f['fwdEps'] ?? 0) > 0 && $x['secFpe']) $fair = $f['fwdEps'] * $x['secFpe'] * (1 + min(0.3, max(0, ($f['epsGrowth'] ?? 0))) / 2);
            $tgts = array_filter([($f['analysts'] ?? 0) >= 3 ? ($f['target'] ?? null) : null, $fair]);
            $target = $tgts ? array_sum($tgts) / count($tgts) : $px * 1.25;
            $mid = ($entryLo + $entryHi) / 2;
            if ($target >= $mid * 1.15 && $mid > $stop && ($target - $mid) / ($mid - $stop) >= 1.5) {
                $picks['lt'] = ['entry' => [round($entryLo, 2), round($entryHi, 2)], 'stop' => round($stop, 2), 'target' => round($target, 2), 'horizon' => '12–24 months', 'rr' => round(($target - $mid) / ($mid - $stop), 1), 'score' => round($ltP[$id])];
            }
        }
        // Short term: top decile on momentum/trend, aligned averages, not overbought, near highs.
        if (($stP[$id] ?? 0) >= $bar && ($F['trend'] ?? 0) >= 75 && $t && $t['sma200'] && $px > $t['sma50'] && $t['sma50'] > $t['sma200'] && ($t['rsi'] ?? 99) >= 50 && $t['rsi'] <= 74 && $t['from52h'] > -0.12 && !$hard && $atr) {
            $entryLo = max($t['sma20'] ?? $px, $px - $atr);
            if ($entryLo >= $px) $entryLo = $px - 0.5 * $atr;
            $stop = min($entryLo - 1.5 * $atr, max($t['sma50'] - 0.5 * $atr, $px - 3.5 * $atr));
            $mid = ($entryLo + $px) / 2;
            $risk = $mid - $stop;
            if ($risk > 0 && $risk / $mid < 0.14) {
                $picks['st'] = ['entry' => [round($entryLo, 2), round($px, 2)], 'stop' => round($stop, 2), 'target' => round($mid + 2.2 * $risk, 2), 'horizon' => '1–3 months', 'rr' => 2.2, 'score' => round($stP[$id])];
            }
        }
        // Swing: live setup, positive pooled expectancy, the stock's own history agrees, results not inside the window.
        $sw = $x['swing'];
        if ($sw && !$earnSoon && !$hard && ($F['trend'] ?? 0) >= 60) {
            $pool = $poolStats[$sw['type']] ?? null;
            $own = $x['bt'][$sw['type']] ?? null;
            $ownWin = $own && $own['n'] ? $own['wins'] / $own['n'] : null;
            $ownR = $own && $own['n'] ? $own['sumR'] / $own['n'] : null;
            // Needs: the setup pays across the market (pooled expectancy) and on this stock (avg R, 2R hit rate).
            if ($pool && $pool['n'] >= 30 && $pool['avgR'] > 0.15 && $own && $own['n'] >= 3 && $ownR >= 0.3 && $ownWin >= 0.4) {
                $picks['sw'] = ['type' => $sw['type'], 'entry' => [round($sw['entry'] - 0.25 * $atr, 2), round($sw['entry'] + 0.25 * $atr, 2)], 'stop' => round($sw['stop'], 2), 'target' => round($sw['target'], 2), 'target2' => round($sw['target2'], 2), 'horizon' => '1–4 weeks', 'rr' => 2.0,
                    'own' => ['n' => $own['n'], 'win' => round($ownWin, 2), 'avgR' => round($ownR, 2)], 'pool' => ['n' => $pool['n'], 'win' => round($pool['win'], 2), 'avgR' => round($pool['avgR'], 2)]];
            }
        }

        $final[$id] = [
            'symbol' => $r['symbol'], 'name' => $r['name'], 'sector' => $r['sector'], 'cap' => $r['cap'], 'idx' => $r['idx'],
            'price' => $px, 'chg' => $r['changePct'] ?? null, 'mcap' => $r['mcap'] ?? null, 'pe' => $r['pe'] ?? null, 'fpe' => $r['fpe'] ?? null, 'pb' => $r['pb'] ?? null, 'dy' => $r['divYield'] ?? null,
            'lt' => $ltP[$id] !== null ? round($ltP[$id]) : null, 'st' => $stP[$id] !== null ? round($stP[$id]) : null,
            'setup' => $sw['type'] ?? null, 'F' => $F, 'flags' => $flags, 'picks' => $picks ?: null,
            'tech' => $t ? array_map(fn($v) => is_float($v) ? round($v, 4) : $v, $t) : null,
            'fund' => $f ? array_map(fn($v) => is_float($v) ? round($v, 4) : $v, array_diff_key($f, ['at' => 1])) : null,
            'secPe' => $x['secPe'] ? round($x['secPe'], 1) : null, 'secFpe' => $x['secFpe'] ? round($x['secFpe'], 1) : null,
            'bt' => $x['bt'] ? array_map(fn($s) => ['n' => $s['n'], 'win' => round($s['wins'] / max(1, $s['n']), 2), 'avgR' => round($s['sumR'] / max(1, $s['n']), 2)], $x['bt']) : null,
            'dataAt' => ['h' => cache_stale(rs_history_key($id))['at'] ?? null, 'f' => $f['at'] ?? null],
        ];
    }
    return ['rows' => $final, 'pool' => $poolStats];
}

// ---------------------------------------------------------------- run

/** One research pass for a market: refresh a batch, re-score, write files. */
function research_run(string $mkt, ?int $batch = null): array
{
    $lock = fopen(data_path("research-$mkt.lock"), 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) return ['market' => $mkt, 'skipped' => 'another run is in progress'];
    @set_time_limit(0);
    $t0 = microtime(true);

    $uni = research_universe($mkt);
    $tags = research_index_tags($mkt, $uni);
    $ids = [];
    foreach ($uni as $sym => $_) {
        $id = "$mkt:$sym";
        if (yahoo_symbol($id) !== null) $ids[$id] = $sym;
    }

    // Live quotes for the whole universe (batched 50 a request).
    $ymap = array_map(fn($id) => yahoo_symbol($id), array_combine(array_keys($ids), array_keys($ids)));
    $v7 = yahoo_v7_quotes(array_values($ymap));

    $refresh = research_refresh_batch($mkt, array_keys($ids), $batch ?? (int) cfg('research_batch', 120));

    // Rank by market cap for the India cap buckets.
    $mc = [];
    foreach ($ids as $id => $sym) $mc[$id] = $v7[$ymap[$id]]['mcap'] ?? null;
    arsort($mc);
    $rank = [];
    $k = 0;
    foreach ($mc as $id => $v) if ($v) $rank[$id] = ++$k;

    $rows = [];
    foreach ($ids as $id => $sym) {
        $q = $v7[$ymap[$id]] ?? [];
        $rows[$id] = ['symbol' => $sym, 'name' => $uni[$sym][1], 'sector' => $uni[$sym][2] ?: null, 'market' => $mkt,
            'cap' => rs_cap_bucket($mkt, $q['mcap'] ?? null, $rank[$id] ?? null), 'idx' => $tags[$sym] ?? []] + $q;
    }
    $regime = rs_regime($mkt);
    $scored = research_score($mkt, $rows, $regime);

    $withHist = count(array_filter($scored['rows'], fn($r) => $r['tech'] !== null));
    $withFund = count(array_filter($scored['rows'], fn($r) => $r['fund'] !== null));
    $meta = [
        'market' => $mkt, 'asOf' => time(), 'regime' => $regime, 'universe' => count($rows),
        'coverage' => ['history' => $withHist, 'fundamentals' => $withFund], 'refresh' => $refresh,
        'swingPool' => $scored['pool'], 'quoteSource' => $v7 ? 'Yahoo Finance' : null,
        'model' => 'MarketLens quant v1: factor percentiles (value, quality, growth, momentum, trend, risk, analyst), regime-adjusted top-decile gates, backtested swing setups',
    ];
    // Compact table for the list; full features for the stock page.
    $table = [];
    $picks = ['lt' => [], 'st' => [], 'sw' => []];
    foreach ($scored['rows'] as $r) {
        $table[] = array_intersect_key($r, array_flip(['symbol', 'name', 'sector', 'cap', 'idx', 'price', 'chg', 'mcap', 'pe', 'fpe', 'pb', 'dy', 'lt', 'st', 'setup', 'F', 'flags'])) + ['pk' => $r['picks'] ? array_keys($r['picks']) : []];
        foreach ($r['picks'] ?? [] as $h => $p) $picks[$h][] = ['symbol' => $r['symbol'], 'name' => $r['name'], 'sector' => $r['sector'], 'cap' => $r['cap'], 'idx' => $r['idx'], 'price' => $r['price'], 'chg' => $r['chg'], 'F' => $r['F'], 'flags' => $r['flags'], 'plan' => $p, 'tech' => $r['tech'], 'fund' => $r['fund']];
    }
    // Rankings are only meaningful once most of the universe has data: hold picks back until then.
    $building = $withHist < 0.7 * count($rows);
    if ($building) $picks = ['lt' => [], 'st' => [], 'sw' => []];
    // Strongest first, at most 12 per horizon and cap size: concentration over breadth,
    // while a size filter on the picks page still finds the best small caps.
    $order = ['lt' => fn($p) => $p['plan']['score'], 'st' => fn($p) => $p['plan']['score'], 'sw' => fn($p) => $p['plan']['own']['avgR'] * 100 + $p['plan']['own']['win'] * 10];
    foreach ($picks as $h => &$list) {
        usort($list, fn($a, $b) => $order[$h]($b) <=> $order[$h]($a));
        $per = [];
        $list = array_values(array_filter($list, function ($p) use (&$per) {
            $c = $p['cap'] ?? '';
            return ($per[$c] = ($per[$c] ?? 0) + 1) <= (int) cfg('research_max_picks', 12);
        }));
    }
    unset($list);
    write_json(data_path("research-$mkt.json"), $meta + ['building' => $building, 'picks' => $picks, 'rows' => $table]);
    $full = [];
    foreach ($scored['rows'] as $r) $full[$r['symbol']] = $r;
    write_json(data_path("research-$mkt-full.json"), ['asOf' => time(), 'rows' => $full]);

    flock($lock, LOCK_UN);
    return ['market' => $mkt, 'universe' => count($rows), 'coverage' => $meta['coverage'], 'building' => $building, 'refresh' => $refresh, 'regime' => $regime['state'], 'picks' => array_map('count', $picks), 'seconds' => round(microtime(true) - $t0, 1)];
}
