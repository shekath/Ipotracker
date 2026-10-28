<?php
declare(strict_types=1);

/**
 * NSE public endpoints. NSE requires a browser-like session cookie, which we
 * obtain by loading the home page first and reusing the cookie jar.
 */
function nse_get(string $path)
{
    $base = cfg('upstream')['nse'];
    $jar = data_path('cache/nse-cookies.txt');
    $opt = ['cookie_jar' => $jar, 'headers' => ['Referer: ' . $base . '/market-data/all-upcoming-issues-ipo']];
    if (!is_file($jar) || filemtime($jar) < time() - 600) {
        http_get($base . '/', $opt + ['accept' => 'text/html']);
    }
    try {
        return http_json($base . $path, $opt);
    } catch (RuntimeException $e) {
        // Session may have expired: refresh cookies once and retry.
        http_get($base . '/', $opt + ['accept' => 'text/html']);
        return http_json($base . $path, $opt);
    }
}

/** Find the first list of associative rows anywhere in a decoded payload. */
function rows_of($data): array
{
    if (is_array($data) && array_is_list($data) && isset($data[0]) && is_array($data[0])) return $data;
    if (is_array($data)) {
        foreach (['data', 'dataList', 'result', 'records'] as $k) {
            if (isset($data[$k])) {
                $r = rows_of($data[$k]);
                if ($r) return $r;
            }
        }
        foreach ($data as $v) {
            if (is_array($v)) {
                $r = rows_of($v);
                if ($r) return $r;
            }
        }
    }
    return [];
}

/** Case/format-insensitive field lookup: pick($row, 'issueStartDate', 'startDate'). */
function pick(array $row, string ...$keys)
{
    $norm = [];
    foreach ($row as $k => $v) $norm[strtolower(preg_replace('/[^a-z0-9]/i', '', (string) $k))] = $v;
    foreach ($keys as $k) {
        $nk = strtolower(preg_replace('/[^a-z0-9]/i', '', $k));
        if (isset($norm[$nk]) && $norm[$nk] !== '') return $norm[$nk];
    }
    return null;
}

function parse_date($v): ?string
{
    if (!$v) return null;
    $v = trim((string) $v);
    foreach (['d-M-Y', 'd-m-Y', 'Y-m-d', 'd M Y', 'd-M-Y H:i:s', 'M d, Y', 'D, M d, Y'] as $f) {
        $d = DateTime::createFromFormat('!' . $f, $v);
        if ($d) return $d->format('Y-m-d');
    }
    $t = strtotime($v);
    return $t ? date('Y-m-d', $t) : null;
}

/** "Rs.142 to Rs.150" -> [142, 150] */
function parse_band($v): ?array
{
    if ($v === null) return null;
    preg_match_all('/\d+(?:\.\d+)?/', str_replace(',', '', (string) $v), $m);
    $n = array_map('floatval', $m[0]);
    $n = array_values(array_filter($n, fn($x) => $x > 0));
    if (!$n) return null;
    return [min($n), max($n)];
}

/** Map NSE category labels to stable keys. */
function category_key(string $label): ?string
{
    $l = strtolower(str_replace(['₹', ','], '', $label));
    $tenLakh = (bool) preg_match('/\b(10|ten)\s*lakh/', $l);
    $twoLakh = (bool) preg_match('/\b(2|two)\s*lakh/', $l);
    if (str_contains($l, 'anchor')) return 'anchor';
    if (str_contains($l, 'qualified') || preg_match('/\bqibs?\b/', $l)) return 'qib';
    // "more than 2 lakh but up to 10 lakh" (small NII) must be tested before "more than 10 lakh" (big NII).
    if (str_contains($l, 'snii') || ($twoLakh && $tenLakh) || ($tenLakh && preg_match('/up ?to|upto|below|less than/', $l))) return 'snii';
    if (str_contains($l, 'bnii') || ($tenLakh && preg_match('/more than|above|exceed/', $l))) return 'bnii';
    if (str_contains($l, 'non institutional') || str_contains($l, 'non-institutional') || preg_match('/\b(nii|hni)s?\b/', $l)) return 'nii';
    // "Individuals(Other than RIIs)" is an NII sub-row, not retail.
    if (!str_contains($l, 'other than') && (str_contains($l, 'retail') || preg_match('/\brii?s?\b/', $l))) return 'retail';
    if (str_contains($l, 'employee')) return 'employee';
    if (str_contains($l, 'shareholder')) return 'shareholder';
    if (str_contains($l, 'policy')) return 'policyholder';
    if (str_contains($l, 'total')) return 'total';
    return null;
}

/** @return array<string,array{times:?float,offered:?float,bid:?float}> */
function nse_subscription(string $symbol): array
{
    $data = nse_get('/api/ipo-active-category?symbol=' . rawurlencode($symbol));
    // Keep the latest raw reply for diagnosing NSE format changes (api/data is not web-accessible).
    write_json(data_path('cache/nse-sub-' . preg_replace('/[^A-Z0-9]/', '', $symbol) . '.json'), $data);
    $out = [];
    foreach (rows_of($data) as $row) {
        // Only main category rows: srNo "1", "2", "2.1", "3" (or none for Total).
        // Sub-rows like "1(a) Mutual funds" or "2.1(b) Individuals" are breakdowns, and
        // the first row is a header ("Sr.No.", "Category").
        $sr = trim((string) (pick($row, 'srNo', 'srno') ?? ''));
        if ($sr !== '' && !preg_match('/^\d+(\.\d+)?$/', $sr)) continue;
        $label = (string) (pick($row, 'category', 'categoryName', 'investorCategory') ?? '');
        if (strtolower(trim($label)) === 'category') continue;
        $key = category_key($label);
        if (!$key) continue;
        $times = num(pick($row, 'noOfTotalMeant', 'noOfTimes', 'noOfTime', 'subscription', 'times'));
        $offered = num(pick($row, 'noOfShareOffered', 'noOfSharesOffered', 'sharesOffered'));
        $bid = num(pick($row, 'noOfSharesBid', 'noOfsharesBid', 'sharesBid'));
        if ($times === null && $offered && $bid !== null) $times = round($bid / $offered, 2);
        // Keep the first row per key (sub-rows such as bNII/sNII have their own keys).
        if (!isset($out[$key])) $out[$key] = ['times' => $times, 'offered' => $offered, 'bid' => $bid];
    }
    return $out;
}

/** Current + forthcoming mainboard and SME issues. */
function nse_issues(): array
{
    $list = [];
    foreach (['/api/ipo-current-issue', '/api/all-upcoming-issues?category=ipo'] as $path) {
        foreach (rows_of(nse_get($path)) as $row) {
            $symbol = strtoupper(trim((string) pick($row, 'symbol')));
            $name = trim((string) pick($row, 'companyName', 'company', 'name'));
            if (!$symbol || !$name) continue;
            $series = strtoupper((string) (pick($row, 'series') ?? 'EQ'));
            $list[$symbol] = [
                'symbol' => $symbol,
                'name' => $name,
                'type' => in_array($series, ['SME', 'ST'], true) ? 'SME' : 'Mainboard',
                'openDate' => parse_date(pick($row, 'issueStartDate', 'startDate', 'openDate')),
                'closeDate' => parse_date(pick($row, 'issueEndDate', 'endDate', 'closeDate')),
                'priceBand' => parse_band(pick($row, 'issuePrice', 'priceBand', 'priceRange')),
                'issueShares' => num(pick($row, 'issueSize', 'noOfSharesOffered')),
                'lotSize' => num(pick($row, 'lotSize', 'marketLot', 'minBidQuantity')),
                'nseTimes' => num(pick($row, 'noOfTime', 'noOfTimes')),
            ];
        }
    }
    return $list;
}
