<?php
declare(strict_types=1);

/** Market indices and macro tickers, addressed as "IX:NIFTY" etc. */
const INDEX_SYMBOLS = [
    'NIFTY' => '^NSEI', 'SENSEX' => '^BSESN', 'BANKNIFTY' => '^NSEBANK', 'NIFTYIT' => '^CNXIT',
    'MIDCAP' => 'NIFTY_MIDCAP_100.NS', 'INDIAVIX' => '^INDIAVIX', 'USDINR' => 'INR=X',
    'SPX' => '^GSPC', 'NASDAQ' => '^IXIC', 'DOW' => '^DJI', 'VIX' => '^VIX',
    'GOLD' => 'GC=F', 'BRENT' => 'BZ=F', 'US10Y' => '^TNX',
];

/** "IN:RELIANCE" -> "RELIANCE.NS", "US:AAPL" -> "AAPL", "IX:NIFTY" -> "^NSEI" */
function yahoo_symbol(string $id): ?string
{
    if (preg_match('/^IX:([A-Z0-9]{1,12})$/', $id, $m)) return INDEX_SYMBOLS[$m[1]] ?? null;
    if (!preg_match('/^(IN|US):([A-Z0-9&.\-]{1,20})$/', $id, $m)) return null;
    return $m[1] === 'IN' ? $m[2] . '.NS' : str_replace('.', '-', $m[2]);
}

/** Normalise a Yahoo v8 chart response into our quote shape. */
function parse_yahoo_chart(array $json): ?array
{
    $r = $json['chart']['result'][0] ?? null;
    $m = $r['meta'] ?? null;
    if (!$m || !isset($m['regularMarketPrice'])) return null;
    $price = (float) $m['regularMarketPrice'];
    $prev = (float) ($m['previousClose'] ?? $m['chartPreviousClose'] ?? $price);
    $period = $m['currentTradingPeriod']['regular'] ?? null;
    $now = time();
    return [
        'price' => $price,
        'prevClose' => $prev,
        'change' => round($price - $prev, 4),
        'changePct' => $prev ? round(($price - $prev) / $prev * 100, 3) : 0,
        'dayHigh' => num($m['regularMarketDayHigh'] ?? null),
        'dayLow' => num($m['regularMarketDayLow'] ?? null),
        'high52' => num($m['fiftyTwoWeekHigh'] ?? null),
        'low52' => num($m['fiftyTwoWeekLow'] ?? null),
        'volume' => num($m['regularMarketVolume'] ?? null),
        'currency' => $m['currency'] ?? null,
        'time' => (int) ($m['regularMarketTime'] ?? $now),
        'marketOpen' => $period ? ($now >= (int) $period['start'] && $now <= (int) $period['end']) : null,
        'source' => 'Yahoo Finance',
    ];
}

function parse_twelvedata(array $j): ?array
{
    if (!isset($j['close'])) return null;
    $price = (float) $j['close'];
    $prev = (float) ($j['previous_close'] ?? $price);
    return [
        'price' => $price,
        'prevClose' => $prev,
        'change' => round($price - $prev, 4),
        'changePct' => $prev ? round(($price - $prev) / $prev * 100, 3) : 0,
        'dayHigh' => num($j['high'] ?? null),
        'dayLow' => num($j['low'] ?? null),
        'high52' => num($j['fifty_two_week']['high'] ?? null),
        'low52' => num($j['fifty_two_week']['low'] ?? null),
        'volume' => num($j['volume'] ?? null),
        'currency' => $j['currency'] ?? null,
        'time' => (int) ($j['timestamp'] ?? time()),
        'marketOpen' => isset($j['is_market_open']) ? (bool) $j['is_market_open'] : null,
        'source' => 'Twelve Data',
    ];
}

/**
 * Resolve quotes for app ids, using cache, then Yahoo (2 hosts), then Twelve Data.
 * @return array{quotes:array,errors:array}
 */
function get_quotes(array $ids): array
{
    $ttl = (int) cfg('quote_ttl', 60);
    $quotes = [];
    $missing = [];
    foreach ($ids as $id) {
        $c = cache_get("q:$id", $ttl);
        if ($c) $quotes[$id] = $c;
        else $missing[] = $id;
    }

    foreach (cfg('upstream')['yahoo'] as $host) {
        if (!$missing) break;
        $urls = [];
        foreach ($missing as $id) {
            $urls[$id] = $host . '/v8/finance/chart/' . rawurlencode(yahoo_symbol($id)) . '?range=1d&interval=1d';
        }
        foreach (http_multi($urls) as $id => [$status, $body]) {
            if ($status !== 200) continue;
            $q = parse_yahoo_chart(json_decode($body, true) ?: []);
            if ($q) {
                $quotes[$id] = $q;
                cache_set("q:$id", $q);
            }
        }
        $missing = array_values(array_diff($missing, array_keys($quotes)));
    }

    $key = cfg('twelvedata_key');
    if ($missing && $key) {
        $urls = [];
        foreach ($missing as $id) {
            [$mkt, $sym] = explode(':', $id, 2);
            if ($mkt === 'IX') continue; // Twelve Data's free plan has no index quotes
            $q = ['symbol' => $sym, 'apikey' => $key] + ($mkt === 'IN' ? ['exchange' => 'NSE'] : []);
            $urls[$id] = cfg('upstream')['twelvedata'] . '/quote?' . http_build_query($q);
        }
        foreach (http_multi($urls) as $id => [$status, $body]) {
            $q = $status === 200 ? parse_twelvedata(json_decode($body, true) ?: []) : null;
            if ($q) {
                $quotes[$id] = $q;
                cache_set("q:$id", $q);
            }
        }
        $missing = array_values(array_diff($missing, array_keys($quotes)));
    }

    // Last resort: serve the last known value, flagged as stale.
    $errors = [];
    foreach ($missing as $id) {
        $old = cache_stale("q:$id");
        if ($old) {
            $quotes[$id] = $old + ['stale' => true];
        } else {
            $errors[] = $id;
        }
    }
    return ['quotes' => $quotes, 'errors' => $errors];
}

/** Daily/weekly close series for charts. */
function get_history(string $id, string $range): array
{
    $map = ['1d' => '5m', '1mo' => '1d', '6mo' => '1d', '1y' => '1d', '5y' => '1wk'];
    $interval = $map[$range];
    $ck = "h:$id:$range";
    // Intraday series go stale within minutes; daily closes can be cached longer.
    $ttl = $range === '1d' ? (int) cfg('quote_ttl', 60) * 2 : (int) cfg('history_ttl', 1800);
    if ($c = cache_get($ck, $ttl)) return $c;
    foreach (cfg('upstream')['yahoo'] as $host) {
        $url = $host . '/v8/finance/chart/' . rawurlencode(yahoo_symbol($id)) . "?range=$range&interval=$interval";
        [$status, $body] = http_get($url);
        if ($status !== 200) continue;
        $r = (json_decode($body, true) ?: [])['chart']['result'][0] ?? null;
        $ts = $r['timestamp'] ?? [];
        $close = $r['indicators']['quote'][0]['close'] ?? [];
        $pts = [];
        foreach ($ts as $i => $t) {
            if (isset($close[$i]) && $close[$i] !== null) $pts[] = [$t, round((float) $close[$i], 2)];
        }
        if ($pts) {
            $out = ['id' => $id, 'range' => $range, 'points' => $pts, 'source' => 'Yahoo Finance'];
            cache_set($ck, $out);
            return $out;
        }
    }
    $old = cache_stale($ck);
    if ($old) return $old + ['stale' => true];
    throw new RuntimeException('History unavailable');
}
