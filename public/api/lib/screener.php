<?php
declare(strict_types=1);

require_once __DIR__ . '/quotes.php';
require_once __DIR__ . '/nse_list.php';

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

/**
 * Rows are [symbol, name, industry, exchange?]; exchange defaults to NSE.
 * @return array{rows:array,source:string}
 */
function index_constituents(array $def): array
{
    $src = $def['source'] ?? '';
    if ($src === 'nse' || $src === 'bse' || $src === 'all') {
        // The complete exchange lists, refreshed daily; falls back to the index lists if NSE is unreachable.
        $l = nse_listed();
        $rows = [];
        $boards = $src === 'all' ? ['main', 'sme'] : ($src === 'nse' ? [$def['board'] ?? 'main'] : []);
        foreach ($l['rows'] ?? [] as $r) if (in_array($r['board'], $boards, true)) $rows[] = [$r['symbol'], $r['name'], null, 'NSE'];
        $parts = $rows ? [$l['source']] : [];
        if ($src !== 'nse') {
            $bse = bse_only();
            foreach ($bse as $r) $rows[] = [$r['symbol'], $r['name'], null, 'BSE'];
            if ($bse) $parts[] = 'BSE end-of-day list (stocks not on NSE)';
        }
        if ($rows) return ['rows' => $rows, 'source' => implode(' + ', $parts)];
        if ($src !== 'nse' || ($def['board'] ?? 'main') === 'sme') return ['rows' => [], 'source' => 'Exchange lists unavailable'];
    }
    if (!empty($def['union'])) return union_constituents($def);
    return single_constituents($def);
}

/**
 * "All" universe: the broad official list (Nifty 500) when reachable, otherwise
 * every other index of the same market combined (deduplicated).
 */
function union_constituents(array $def): array
{
    if (!empty($def['csv'])) {
        $broad = single_constituents($def + ['fallback' => []]);
        if (count($broad['rows']) >= 50) return $broad;
    }
    $seen = [];
    $official = false;
    foreach (index_defs() as $other) {
        if ($other['market'] !== $def['market'] || !empty($other['union'])) continue;
        $c = single_constituents($other);
        $official = $official || str_contains($c['source'], 'official');
        foreach ($c['rows'] as $row) {
            $sym = $row[0];
            if (!isset($seen[$sym]) || (empty($seen[$sym][2]) && !empty($row[2]))) $seen[$sym] = $row;
        }
    }
    return ['rows' => array_values($seen), 'source' => $official ? 'Combined index lists (NSE Indices)' : 'Combined bundled lists'];
}

function single_constituents(array $def): array
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
    $host = cfg('upstream')['yahoo'][0];
    $url = fn(array $chunk) => "$host/v7/finance/quote?" . http_build_query(['symbols' => implode(',', $chunk), 'crumb' => $crumb]);
    $chunks = array_chunk($ysyms, 50);
    if (!$chunks) return $out;
    // First batch on its own, to refresh an expired crumb once; the rest in parallel.
    [$status, $body] = http_get($url($chunks[0]), ['cookie_jar' => $jar]);
    if ($status === 401) {
        $crumb = yahoo_crumb(true);
        if (!$crumb) return $out;
        [$status, $body] = http_get($url($chunks[0]), ['cookie_jar' => $jar]);
    }
    $bodies = [$status === 200 ? $body : ''];
    $rest = array_map($url, array_slice($chunks, 1));
    foreach (http_multi($rest, ['cookie_jar' => $jar], 6) as [$st, $b]) $bodies[] = $st === 200 ? $b : '';
    foreach ($bodies as $body) {
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

function screener(string $id, bool $fresh = false): array
{
    $defs = index_defs();
    if (!isset($defs[$id])) throw new InvalidArgumentException('Unknown index');
    $def = $defs[$id];
    $ck = "scr:$id";
    $big = in_array($def['source'] ?? '', ['nse', 'bse', 'all'], true);
    if (!$fresh && ($c = cache_get($ck, $big ? (int) cfg('screener_full_ttl', 600) : (int) cfg('screener_ttl', 120)))) return $c;

    $cons = index_constituents($def);
    $mkt = $def['market'];
    // Yahoo symbol per row: SYM.NS for NSE, SYM.BO for BSE-only stocks, the plain ticker in the US.
    $ysym = function (string $sym, string $ex) use ($mkt): ?string {
        if ($mkt === 'IN' && $ex === 'BSE') return preg_match('/^[A-Z0-9&.\-]{1,20}$/', $sym) ? "$sym.BO" : null;
        return yahoo_symbol("$mkt:$sym");
    };
    $ymap = [];
    foreach ($cons['rows'] as $r) {
        $y = $ysym($r[0], $r[3] ?? 'NSE');
        if ($y !== null) $ymap[($r[3] ?? 'NSE') . ':' . $r[0]] = $y;
    }
    $v7 = yahoo_v7_quotes(array_values(array_unique($ymap)));
    $source = $v7 ? 'Yahoo Finance (quote)' : null;

    // Anything v7 missed: the exchange's end-of-day price first (it covers brand-new, SME and
    // thinly traded stocks), then the chart endpoint for the few still missing.
    $listed = $mkt === 'IN' ? nse_listed() : null;
    $surv = $mkt === 'IN' ? nse_surveillance() : [];
    $bhav = $mkt === 'IN' ? nse_bhavcopy() : null;
    $bse = $mkt === 'IN' && in_array($def['source'] ?? '', ['bse', 'all'], true) ? bse_only() : [];
    $missing = [];
    foreach ($cons['rows'] as $r) {
        $ex = $r[3] ?? 'NSE';
        $k = "$ex:{$r[0]}";
        if (!isset($ymap[$k]) || isset($v7[$ymap[$k]])) continue;
        if ($ex === 'NSE' && !isset($bhav['rows'][$r[0]])) $missing[] = "$mkt:{$r[0]}";
    }
    $chart = $missing && count($missing) <= 80 ? get_quotes($missing)['quotes'] : [];
    if (!$source && $chart) $source = 'Yahoo Finance (chart)';

    $eod = fn(array $b, string $date) => ['price' => $b['close'], 'changePct' => $b['prevClose'] ? round(($b['close'] / $b['prevClose'] - 1) * 100, 2) : null, 'mcap' => null, 'pe' => null, 'fpe' => null, 'pb' => null, 'divYield' => null, 'high52' => null, 'low52' => null, 'volume' => $b['volume'], 'marketOpen' => false, 'priceDate' => $date];
    $rows = [];
    foreach ($cons['rows'] as $r) {
        [$sym, $name, $industry] = $r;
        $ex = $r[3] ?? 'NSE';
        $k = "$ex:$sym";
        $q = isset($ymap[$k]) ? ($v7[$ymap[$k]] ?? null) : null;
        if (!$q && $ex === 'BSE' && isset($bse[$sym])) {
            $q = $eod($bse[$sym], $bse[$sym]['date']);
        } elseif (!$q && $ex === 'NSE' && isset($bhav['rows'][$sym])) {
            $q = $eod($bhav['rows'][$sym], $bhav['date']);
        } elseif (!$q && isset($chart["$mkt:$sym"])) {
            $c = $chart["$mkt:$sym"];
            $q = ['price' => $c['price'], 'changePct' => $c['changePct'], 'mcap' => null, 'pe' => null, 'fpe' => null, 'pb' => null, 'divYield' => null, 'high52' => $c['high52'], 'low52' => $c['low52'], 'volume' => $c['volume'], 'marketOpen' => $c['marketOpen']];
        }
        $row = ['symbol' => $sym, 'name' => $name, 'industry' => $industry ?: null] + ($q ?? ['price' => null]);
        if ($mkt === 'IN' && $ex === 'BSE') {
            $b = $bse[$sym] ?? null;
            $row += ['exchange' => 'BSE', 'bseCode' => $b['code'] ?? null, 'series' => $b['group'] ?? null, 'listedOn' => null, 'flags' => bse_flags($b['group'] ?? '')];
        } elseif ($mkt === 'IN') {
            $li = $listed['rows'][$sym] ?? null;
            $row['series'] = $li['series'] ?? null;
            $row['listedOn'] = $li['listedOn'] ?? null;
            $row['flags'] = nse_flags($sym, $li, $surv, (bool) $listed);
        }
        $rows[] = $row;
    }
    if (!$source && ($bhav || $bse)) $source = 'Exchange end-of-day prices';
    $out = [
        'id' => $id,
        'asOf' => time(),
        'constituentsSource' => $cons['source'],
        'quoteSource' => $source,
        'eodDate' => $bhav['date'] ?? null,
        'rows' => $rows,
    ];
    if ($source) cache_set($ck, $out);
    return $out;
}
