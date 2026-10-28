<?php
declare(strict_types=1);

/**
 * Weekly index range targets: previous completed week's High / Low / Close for
 * Nifty 50, Nifty Bank and Sensex, plus India VIX High / Low for that week,
 * the present week so far and the last finished session's close.
 * Weeks run Monday–Friday in the configured timezone (Asia/Kolkata).
 */

const WEEKLY_SYMBOLS = ['NIFTY' => '^NSEI', 'BANKNIFTY' => '^NSEBANK', 'SENSEX' => '^BSESN'];
const WEEKLY_VIX = '^INDIAVIX';

/** Parse a Yahoo v8 chart response into candles + meta. */
function weekly_parse_chart(array $json): ?array
{
    $r = $json['chart']['result'][0] ?? null;
    if (!$r) return null;
    $q = $r['indicators']['quote'][0] ?? [];
    $bars = [];
    foreach (($r['timestamp'] ?? []) as $i => $t) {
        $o = $q['open'][$i] ?? null; $h = $q['high'][$i] ?? null; $l = $q['low'][$i] ?? null; $c = $q['close'][$i] ?? null;
        if ($o === null || $h === null || $l === null || $c === null) continue;
        $bars[] = ['t' => (int) $t, 'open' => (float) $o, 'high' => (float) $h, 'low' => (float) $l, 'close' => (float) $c];
    }
    if (!$bars) return null;
    $m = $r['meta'] ?? [];
    $period = $m['currentTradingPeriod']['regular'] ?? null;
    return [
        'bars' => $bars,
        'price' => isset($m['regularMarketPrice']) ? (float) $m['regularMarketPrice'] : null,
        'time' => (int) ($m['regularMarketTime'] ?? time()),
        'sessionEnd' => $period ? (int) $period['end'] : null,
    ];
}

/** Candles for many [key => [symbol, interval, range]] in parallel, cached for 5 minutes. */
function weekly_fetch(array $reqs): array
{
    $ttl = (int) cfg('weekly_ttl', 300);
    $out = [];
    $missing = [];
    foreach ($reqs as $k => [$sym, $interval, $range]) {
        $c = cache_get("w:$sym:$interval", $ttl);
        if ($c) $out[$k] = $c; else $missing[$k] = [$sym, $interval, $range];
    }
    foreach (cfg('upstream')['yahoo'] as $host) {
        if (!$missing) break;
        $urls = [];
        foreach ($missing as $k => [$sym, $interval, $range]) {
            $urls[$k] = $host . '/v8/finance/chart/' . rawurlencode($sym) . "?range=$range&interval=$interval";
        }
        foreach (http_multi($urls) as $k => [$status, $body]) {
            if ($status !== 200) continue;
            $p = weekly_parse_chart(json_decode($body, true) ?: []);
            if ($p) {
                $out[$k] = $p;
                cache_set('w:' . $missing[$k][0] . ':' . $missing[$k][1], $p);
                unset($missing[$k]);
            }
        }
    }
    foreach ($missing as $k => [$sym, $interval]) {
        $old = cache_stale("w:$sym:$interval");
        if ($old) $out[$k] = $old + ['stale' => true];
    }
    return $out;
}

/** ISO year-week of a timestamp in the configured timezone. */
function weekly_week_key(int $t): string
{
    return date('o-W', $t);
}

/**
 * Split weekly candles into the previous completed week and the present week.
 * On Saturday/Sunday the week that just ended becomes "previous" (next week's levels).
 */
function weekly_split(array $bars, int $now): array
{
    $last = $bars[count($bars) - 1];
    $weekend = (int) date('N', $now) >= 6;
    if (weekly_week_key($last['t']) === weekly_week_key($now) && !$weekend && count($bars) > 1) {
        return [$bars[count($bars) - 2], $last];
    }
    return [$last, null];
}

/** Close of the last finished session: today's candle counts only once the session has ended. */
function weekly_prev_day(array $daily, int $now): ?array
{
    $bars = $daily['bars'];
    $b = $bars[count($bars) - 1] ?? null;
    if (!$b) return null;
    $today = date('Y-m-d', $now) === date('Y-m-d', $b['t']);
    $open = $daily['sessionEnd'] === null ? true : $now < $daily['sessionEnd'];
    if ($today && $open && count($bars) > 1) $b = $bars[count($bars) - 2];
    return ['close' => round($b['close'], 2), 'date' => date('Y-m-d', $b['t'])];
}

function weekly_label(int $t): string
{
    $mon = strtotime(date('Y-m-d', $t) . ' -' . ((int) date('N', $t) - 1) . ' days');
    return date('j M', $mon) . ' – ' . date('j M Y', $mon + 4 * 86400);
}

function get_weekly(?int $now = null): array
{
    $now = $now ?? time();
    $reqs = ['VIX:w' => [WEEKLY_VIX, '1wk', '3mo']];
    foreach (WEEKLY_SYMBOLS as $k => $sym) {
        $reqs["$k:w"] = [$sym, '1wk', '3mo'];
        $reqs["$k:d"] = [$sym, '1d', '1mo'];
    }
    $data = weekly_fetch($reqs);
    if (empty($data['VIX:w'])) throw new RuntimeException('India VIX data unavailable');
    [$vprev] = weekly_split($data['VIX:w']['bars'], $now);

    $out = [];
    foreach (WEEKLY_SYMBOLS as $k => $sym) {
        $w = $data["$k:w"] ?? null;
        if (!$w) continue;
        [$prev, $cur] = weekly_split($w['bars'], $now);
        $price = $w['price'];
        $current = null;
        if ($cur) {
            $current = [
                'price' => $price !== null ? round($price, 2) : round($cur['close'], 2),
                'high' => round(max($cur['high'], $price ?? $cur['high']), 2),
                'low' => round(min($cur['low'], $price ?? $cur['low']), 2),
                'asOf' => date('c', $w['time']),
            ];
        }
        $d = $data["$k:d"] ?? null;
        $out[$k] = [
            'index' => $k,
            'source' => 'Yahoo Finance weekly candles',
            'prevWeekLabel' => weekly_label($prev['t']),
            'prev' => [
                'high' => round($prev['high'], 2), 'low' => round($prev['low'], 2), 'close' => round($prev['close'], 2),
                'vixHigh' => round($vprev['high'], 4), 'vixLow' => round($vprev['low'], 4),
            ],
            'current' => $current,
            'prevDay' => $d ? weekly_prev_day($d, $now) : null,
            'stale' => !empty($w['stale']) || !empty($data['VIX:w']['stale']),
        ];
    }
    if (!$out) throw new RuntimeException('Index data unavailable');
    return ['indices' => $out, 'updatedAt' => date('c', $now)];
}
