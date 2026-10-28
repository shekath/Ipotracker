<?php
/**
 * Mock upstream for offline tests. Mimics the response shapes of Yahoo's v8
 * chart API, NSE's IPO endpoints (incl. the cookie handshake) and a GMP table page.
 * Run: php -S 127.0.0.1:8099 tests/mock/router.php
 */
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$q = $_GET;
header('Content-Type: application/json');

if (preg_match('#^/v8/finance/chart/(.+)$#', $path, $m)) {
    $sym = urldecode($m[1]);
    if ($sym === 'FAIL.NS') { http_response_code(404); echo '{"chart":{"error":"not found"}}'; exit; }
    $base = 100 + (crc32($sym) % 900);
    $now = time();
    $range = $q['range'] ?? '1d';
    $n = ['1d' => 1, '1mo' => 22, '6mo' => 126, '1y' => 250, '5y' => 260][$range] ?? 1;
    $ts = []; $close = [];
    for ($i = $n; $i > 0; $i--) { $ts[] = $now - $i * 86400; $close[] = round($base * (1 + sin($i / 9) * 0.08), 2); }
    echo json_encode(['chart' => ['result' => [[
        'meta' => [
            'currency' => str_ends_with($sym, '.NS') ? 'INR' : 'USD', 'symbol' => $sym,
            'regularMarketPrice' => $base * 1.01, 'chartPreviousClose' => $base, 'previousClose' => $base,
            'regularMarketDayHigh' => $base * 1.02, 'regularMarketDayLow' => $base * 0.99,
            'fiftyTwoWeekHigh' => $base * 1.3, 'fiftyTwoWeekLow' => $base * 0.7,
            'regularMarketVolume' => 123456, 'regularMarketTime' => $now,
            'currentTradingPeriod' => ['regular' => ['start' => $now - 3600, 'end' => $now + 3600]],
        ],
        'timestamp' => $ts,
        'indicators' => ['quote' => [['close' => $close]]],
    ]], 'error' => null]]);
    exit;
}

// Yahoo v7: cookie from fc.yahoo.com, then a crumb, then batch quotes.
if ($path === '/fc/') { setcookie('A3', 'yahoo', 0, '/'); http_response_code(404); echo 'fc'; exit; }
if ($path === '/v1/test/getcrumb') {
    header('Content-Type: text/plain');
    if (empty($_COOKIE['A3'])) { http_response_code(401); echo 'no cookie'; exit; }
    echo 'mockcrumb'; exit;
}
if ($path === '/v7/finance/quote') {
    if (($q['crumb'] ?? '') !== 'mockcrumb' || empty($_COOKIE['A3'])) { http_response_code(401); echo '{"finance":{"error":"Invalid Crumb"}}'; exit; }
    $res = [];
    foreach (explode(',', $q['symbols']) as $sym) {
        if ($sym === 'NOV7.NS') continue; // simulate a symbol v7 misses -> chart fallback
        $base = 100 + (crc32($sym) % 900);
        $res[] = ['symbol' => $sym, 'regularMarketPrice' => $base * 1.01, 'regularMarketChangePercent' => (crc32($sym) % 7) - 3.0,
            'marketCap' => $base * 1e10, 'trailingPE' => 10 + crc32($sym) % 40, 'forwardPE' => 9 + crc32($sym) % 30, 'priceToBook' => 1 + (crc32($sym) % 90) / 10,
            'trailingAnnualDividendYield' => 0.012, 'fiftyTwoWeekHigh' => $base * 1.3, 'fiftyTwoWeekLow' => $base * 0.7, 'regularMarketVolume' => 1000, 'marketState' => 'REGULAR'];
    }
    echo json_encode(['quoteResponse' => ['result' => $res, 'error' => null]]); exit;
}

// niftyindices.com constituent CSVs
if (preg_match('#^/IndexConstituent/(.+)\.csv$#', $path, $m)) {
    header('Content-Type: text/csv');
    if ($m[1] !== 'ind_nifty50list') { http_response_code(403); echo 'blocked'; exit; }
    echo "\xEF\xBB\xBFCompany Name,Industry,Symbol,Series,ISIN Code\r\n";
    foreach ([['Reliance Industries Ltd.', 'Oil Gas & Consumable Fuels', 'RELIANCE'], ['Mahindra & Mahindra Ltd.', 'Automobile and Auto Components', 'M&M'], ['Bajaj Auto Ltd.', 'Automobile and Auto Components', 'BAJAJ-AUTO'], ['HDFC Bank Ltd.', 'Financial Services', 'HDFCBANK'], ['Infosys Ltd.', 'Information Technology', 'INFY'], ['No V7 Ltd.', 'Services', 'NOV7']] as $r) {
        echo "\"{$r[0]}\",{$r[1]},{$r[2]},EQ,INE000000000\r\n";
    }
    exit;
}

// NSE: home sets the session cookie; APIs refuse requests without it.
if ($path === '/') { setcookie('nsit', 'abc', 0, '/'); header('Content-Type: text/html'); echo '<html>NSE</html>'; exit; }
if (str_starts_with($path, '/api/') && empty($_COOKIE['nsit'])) { http_response_code(401); echo '{}'; exit; }

$d = fn($off) => date('d-M-Y', strtotime("$off days"));
if ($path === '/api/ipo-current-issue') {
    echo json_encode([
        ['symbol' => 'BLSPOLY', 'companyName' => 'BLS Polymers Limited', 'series' => 'EQ', 'issueStartDate' => $d(-1), 'issueEndDate' => $d(1), 'status' => 'Active', 'issuePrice' => 'Rs.142 to Rs.150', 'issueSize' => '17000000', 'noOfTime' => '3.21'],
        ['symbol' => 'TINYSME', 'companyName' => 'Tiny Widgets Limited', 'series' => 'SME', 'issueStartDate' => $d(0), 'issueEndDate' => $d(2), 'status' => 'Active', 'issuePrice' => 'Rs.60 to Rs.64', 'issueSize' => '2000000'],
    ]);
    exit;
}
if ($path === '/api/all-upcoming-issues') {
    echo json_encode([['symbol' => 'NEWCO', 'companyName' => 'Brand New Tech Limited', 'series' => 'EQ', 'issueStartDate' => $d(4), 'issueEndDate' => $d(6), 'issuePrice' => 'Rs.400 to Rs.420', 'status' => 'Forthcoming']]);
    exit;
}
if ($path === '/api/ipo-active-category') {
    $mult = $q['symbol'] === 'BLSPOLY' ? 1 : 0.2;
    echo json_encode(['updateTime' => date('d-M-Y H:i:s'), 'dataList' => [
        ['srNo' => '1', 'category' => 'Qualified Institutional Buyers(QIBs)', 'noOfShareOffered' => '3400000', 'noOfSharesBid' => (string) (5100000 * $mult), 'noOfTotalMeant' => (string) round(1.5 * $mult, 2)],
        ['srNo' => '2', 'category' => 'Non Institutional Investors', 'noOfShareOffered' => '2550000', 'noOfSharesBid' => '0', 'noOfTotalMeant' => (string) round(6.2 * $mult, 2)],
        ['srNo' => '2.1', 'category' => 'Bid Amount of more than Ten Lakh Rupees', 'noOfShareOffered' => '1700000', 'noOfSharesBid' => '0', 'noOfTotalMeant' => (string) round(5.1 * $mult, 2)],
        ['srNo' => '2.2', 'category' => 'Bid Amount of more than two lakh rupees but upto Ten Lakh Rupees', 'noOfShareOffered' => '850000', 'noOfSharesBid' => '0', 'noOfTotalMeant' => (string) round(8.4 * $mult, 2)],
        ['srNo' => '3', 'category' => 'Retail Individual Investors(RIIs)', 'noOfShareOffered' => '5950000', 'noOfSharesBid' => '0', 'noOfTotalMeant' => (string) round(4.4 * $mult, 2)],
        ['srNo' => '4', 'category' => 'Total', 'noOfShareOffered' => '11900000', 'noOfSharesBid' => '0', 'noOfTotalMeant' => (string) round(3.9 * $mult, 2)],
    ]]);
    exit;
}

if ($path === '/gmp.html') {
    header('Content-Type: text/html');
    $open = date('j', strtotime('+1 day')); $close = date('j M', strtotime('+3 days'));
    echo "<html><body><table><thead><tr><th>IPO Name</th><th>IPO GMP</th><th>IPO Price</th><th>Date</th></tr></thead><tbody>
      <tr><td>BLS Polymers IPO</td><td>₹25 (16.67%)</td><td>₹142-150</td><td>27-29 Oct</td></tr>
      <tr><td>Brand New Tech</td><td>-</td><td>₹400-420</td><td>soon</td></tr>
      <tr><td>BSE Only Industries IPO</td><td>₹12</td><td>₹90-95</td><td>$open-$close</td></tr>
      <tr><td>Old Listed Co IPO</td><td>₹5</td><td>₹50</td><td>1-3 Jan</td></tr>
    </tbody></table></body></html>";
    exit;
}
http_response_code(404);
echo '{}';
