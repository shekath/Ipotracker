<?php
declare(strict_types=1);

require_once __DIR__ . '/quotes.php';

function index_defs(): array
{
    $f = __DIR__ . '/../../data/indices.json';
    $d = read_json($f, ['indices' => []]);
    $out = [];
    foreach ($d['indices'] as $i) $out[$i['id']] = $i;
    return $out;
}

/** Parse a niftyindices.com constituent CSV: Company Name,Industry,Symbol,Series,ISIN Code */
function parse_constituent_csv(string $csv): array
{
    $lines = preg_split('/\r\n|\n|\r/', trim($csv));
    if (count($lines) < 2) return [];
    $head = array_map(fn($h) => strtolower(trim($h, " \t\"\xEF\xBB\xBF")), str_getcsv(array_shift($lines)));
    $iName = array_search('company name', $head, true);
    $iInd = array_search('industry', $head, true);
    $iSym = array_search('symbol', $head, true);
    if ($iSym === false) return [];
    $rows = [];
    foreach ($lines as $l) {
        $c = str_getcsv($l);
        $sym = strtoupper(trim($c[$iSym] ?? ''));
        if ($sym === '') continue;
        $rows[] = [$sym, trim($c[$iName] ?? $sym), $iInd !== false ? trim($c[$iInd] ?? '') : null];
    }
    return $rows;
}

/** @return array{rows:array,source:string} */
function index_constituents(array $def): array
{
    if (!empty($def['csv'])) {
        $ck = 'idx:' . $def['id'];
        if ($c = cache_get($ck, (int) cfg('constituents_ttl', 86400))) return $c;
        $url = str_replace('https://www.niftyindices.com', cfg('upstream')['niftyindices'] ?? 'https://www.niftyindices.com', $def['csv']);
        [$status, $body] = http_get($url, ['accept' => 'text/csv,*/*', 'headers' => ['Referer: https://www.niftyindices.com/']]);
        $rows = $status === 200 ? parse_constituent_csv($body) : [];
        if (count($rows) >= 5) {
            $out = ['rows' => $rows, 'source' => 'NSE Indices (official)', 'at' => time()];
            cache_set($ck, $out);
            return $out;
        }
        if ($old = cache_stale($ck)) return $old;
    }
    return ['rows' => $def['fallback'] ?? [], 'source' => empty($def['csv']) ? 'MarketLens list' : 'Bundled fallback list'];
}

/** Yahoo's v7 quote API needs a session cookie + crumb. Cached for a few hours. */
function yahoo_crumb(bool $refresh = false): ?string
{
    $jar = data_path('cache/yahoo-cookies.txt');
    $ck = 'yahoo-crumb';
    if (!$refresh && ($c = cache_get($ck, 6 * 3600))) return $c['crumb'];
    @unlink($jar);
    http_get(cfg('upstream')['yahoo_cookie'] . '/', ['cookie_jar' => $jar, 'accept' => 'text/html']);
    foreach (cfg('upstream')['yahoo'] as $host) {
        [$status, $body] = http_get($host . '/v1/test/getcrumb', ['cookie_jar' => $jar, 'accept' => 'text/plain']);
        $crumb = trim($body);
        if ($status === 200 && $crumb !== '' && strlen($crumb) < 64 && !str_contains($crumb, '<')) {
            cache_set($ck, ['crumb' => $crumb]);
            return $crumb;
        }
    }
    return null;
}

/** Batch fundamentals + price via Yahoo v7. @return array<string,array> keyed by Yahoo symbol */
function yahoo_v7_quotes(array $ysyms): array
{
    $crumb = yahoo_crumb();
    if (!$crumb) return [];
    $jar = data_path('cache/yahoo-cookies.txt');
    $out = [];
    foreach (array_chunk($ysyms, 50) as $i => $chunk) {
        $q = http_build_query(['symbols' => implode(',', $chunk), 'crumb' => $crumb]);
        $host = cfg('upstream')['yahoo'][0];
        [$status, $body] = http_get("$host/v7/finance/quote?$q", ['cookie_jar' => $jar]);
        if ($status === 401 && $i === 0) {
            // Crumb expired: refresh once.
            $crumb = yahoo_crumb(true);
            if (!$crumb) return $out;
            $q = http_build_query(['symbols' => implode(',', $chunk), 'crumb' => $crumb]);
            [$status, $body] = http_get("$host/v7/finance/quote?$q", ['cookie_jar' => $jar]);
        }
        if ($status !== 200) continue;
        foreach ((json_decode($body, true) ?: [])['quoteResponse']['result'] ?? [] as $r) {
            if (!isset($r['symbol'], $r['regularMarketPrice'])) continue;
            $dy = $r['dividendYield'] ?? (isset($r['trailingAnnualDividendYield']) ? $r['trailingAnnualDividendYield'] * 100 : null);
            $out[$r['symbol']] = [
                'price' => (float) $r['regularMarketPrice'],
                'changePct' => num($r['regularMarketChangePercent'] ?? null),
                'mcap' => num($r['marketCap'] ?? null),
                'pe' => num($r['trailingPE'] ?? null),
                'fpe' => num($r['forwardPE'] ?? null),
                'pb' => num($r['priceToBook'] ?? null),
                'divYield' => num($dy),
                'high52' => num($r['fiftyTwoWeekHigh'] ?? null),
                'low52' => num($r['fiftyTwoWeekLow'] ?? null),
                'volume' => num($r['regularMarketVolume'] ?? null),
                'marketOpen' => isset($r['marketState']) ? $r['marketState'] === 'REGULAR' : null,
            ];
        }
    }
    return $out;
}

function screener(string $id): array
{
    $defs = index_defs();
    if (!isset($defs[$id])) throw new InvalidArgumentException('Unknown index');
    $def = $defs[$id];
    $ck = "scr:$id";
    if ($c = cache_get($ck, (int) cfg('screener_ttl', 120))) return $c;

    $cons = index_constituents($def);
    $mkt = $def['market'];
    $ids = [];
    foreach ($cons['rows'] as [$sym]) $ids[] = "$mkt:$sym";
    $ids = array_values(array_filter($ids, fn($x) => yahoo_symbol($x) !== null));

    $ymap = [];
    foreach ($ids as $x) $ymap[$x] = yahoo_symbol($x);
    $v7 = yahoo_v7_quotes(array_values($ymap));
    $source = $v7 ? 'Yahoo Finance (quote)' : null;

    // Fill anything v7 missed from the chart endpoint (price + 52W only).
    $missing = array_values(array_filter($ids, fn($x) => !isset($v7[$ymap[$x]])));
    $chart = $missing ? get_quotes($missing)['quotes'] : [];
    if (!$source && $chart) $source = 'Yahoo Finance (chart)';

    $rows = [];
    foreach ($cons['rows'] as [$sym, $name, $industry]) {
        $x = "$mkt:$sym";
        $q = isset($ymap[$x]) ? ($v7[$ymap[$x]] ?? null) : null;
        if (!$q && isset($chart[$x])) {
            $c = $chart[$x];
            $q = ['price' => $c['price'], 'changePct' => $c['changePct'], 'mcap' => null, 'pe' => null, 'fpe' => null, 'pb' => null, 'divYield' => null, 'high52' => $c['high52'], 'low52' => $c['low52'], 'volume' => $c['volume'], 'marketOpen' => $c['marketOpen']];
        }
        $rows[] = ['symbol' => $sym, 'name' => $name, 'industry' => $industry ?: null] + ($q ?? ['price' => null]);
    }
    $out = [
        'id' => $id,
        'asOf' => time(),
        'constituentsSource' => $cons['source'],
        'quoteSource' => $source,
        'rows' => $rows,
    ];
    if ($source) cache_set($ck, $out);
    return $out;
}
