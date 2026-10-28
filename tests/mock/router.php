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
    $n = ['1d' => 1, '1mo' => 22, '3mo' => 63, '6mo' => 126, '1y' => 250, '5y' => 260][$range] ?? 1;
    $daySec = 86400;
    if (($q['interval'] ?? '') === '1wk') { $n = (int) ceil($n / 5); $daySec = 7 * 86400; } // weekly candles, last one = this week
    $ts = []; $close = []; $open = []; $high = []; $low = [];
    for ($i = $n; $i > 0; $i--) {
        $ts[] = $now - ($i - 1) * $daySec - 3600;
        $c = round($base * (1 + sin($i / 9) * 0.08), 2);
        $close[] = $c; $open[] = round($c * 0.995, 2); $high[] = round($c * 1.02, 2); $low[] = round($c * 0.98, 2);
    }
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
        'indicators' => ['quote' => [['close' => $close, 'open' => $open, 'high' => $high, 'low' => $low]]],
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
    if ($m[1] === 'ind_nifty500list') {
        echo "Company Name,Industry,Symbol,Series,ISIN Code\r\n";
        for ($i = 1; $i <= 60; $i++) echo "Broad Co $i Ltd.,Services,BROAD$i,EQ,INE000000000\r\n";
        exit;
    }
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
        ['symbol' => 'BLSPOLY', 'companyName' => 'BLS Polymers Limited', 'series' => 'EQ', 'issueStartDate' => $d(-1), 'issueEndDate' => $d(1), 'status' => 'Active', 'issuePrice' => 'Rs.142 to Rs.150', 'issueSize' => '11900000', 'noOfTime' => '3.21'],
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
    // Shape copied from a live NSE reply: header row, numbered main rows, lettered sub-rows
    // (incl. "Individuals(Other than RIIs)" under NII) and a Total row in scientific notation.
    $r = fn($v) => (string) round($v * $mult, 2);
    $retailRow = $q['symbol'] === 'TINYSME'
        ? ['srNo' => '3', 'category' => 'Retail Individual Investors(RIIs)', 'noOfShareOffered' => '-', 'noOfSharesBid' => '50000', 'noOfTotalMeant' => '-']
        : ['srNo' => '3', 'category' => 'Retail Individual Investors(RIIs)', 'noOfShareOffered' => '5950000', 'noOfSharesBid' => '26180000', 'noOfTotalMeant' => $r(4.4)];
    echo json_encode(['updateTime' => 'Updated as on ' . date('d-M-Y H:i:s'), 'symbol' => null, 'dataList' => [
        ['srNo' => 'Sr.No.', 'category' => 'Category', 'noOfShareOffered' => 'No.of shares offered/reserved', 'noOfSharesBid' => 'No. of shares bid for', 'noOfTotalMeant' => 'No. of times of total meant for the category'],
        ['srNo' => '1', 'category' => 'Qualified Institutional Buyers(QIBs)', 'noOfShareOffered' => '3400000', 'noOfSharesBid' => (string) (5100000 * $mult), 'noOfTotalMeant' => $r(1.5)],
        ['srNo' => '1(c)', 'category' => 'Mutual funds', 'noOfShareOffered' => '', 'noOfSharesBid' => '0', 'noOfTotalMeant' => ''],
        ['srNo' => '2', 'category' => 'Non Institutional Investors', 'noOfShareOffered' => '2550000', 'noOfSharesBid' => '0', 'noOfTotalMeant' => $r(6.2)],
        ['srNo' => '2.1', 'category' => 'Non Institutional Investors(Bid amount of more than Ten Lakh Rupees)', 'noOfShareOffered' => '1700000', 'noOfSharesBid' => '0', 'noOfTotalMeant' => $r(5.1)],
        ['srNo' => '2.1(b)', 'category' => 'Individuals(Other than RIIs)', 'noOfShareOffered' => '', 'noOfSharesBid' => '57711300', 'noOfTotalMeant' => ''],
        ['srNo' => '2.2', 'category' => 'Non Institutional Investors(Bid amount of more than Two Lakh Rupees upto Ten Lakh Rupees)', 'noOfShareOffered' => '850000', 'noOfSharesBid' => '0', 'noOfTotalMeant' => $r(8.4)],
        ['srNo' => '2.2(b)', 'category' => 'Individuals(Other than RIIs)', 'noOfShareOffered' => '', 'noOfSharesBid' => '45410200', 'noOfTotalMeant' => ''],
        $retailRow,
        ['srNo' => '3(a)', 'category' => 'Cut Off', 'noOfShareOffered' => '', 'noOfSharesBid' => '100370500', 'noOfTotalMeant' => ''],
        ['srNo' => null, 'category' => 'Total', 'noOfShareOffered' => '1.19E7', 'noOfSharesBid' => '2.585774E8', 'noOfTotalMeant' => $r(3.9)],
    ]]);
    exit;
}

if ($path === '/gmp.html') {
    header('Content-Type: text/html');
    $open = date('j', strtotime('+1 day')); $close = date('j M', strtotime('+3 days'));
    echo "<html><body><table><thead><tr><th>IPO Name</th><th>IPO GMP</th><th>IPO Price</th><th>Date</th></tr></thead><tbody>
      <tr><td>BLS Polymers IPO Open</td><td>₹25 (16.67%)</td><td>₹142-150</td><td>27-29 Oct</td></tr>
      <tr><td>Garbled Dates Upcoming</td><td>₹7</td><td>₹99</td><td>30 Nov-3 Nov</td></tr>
      <tr><td>Brand New Tech</td><td>-</td><td>₹400-420</td><td>soon</td></tr>
      <tr><td>BSE Only Industries IPO (BSE SME) Upcoming</td><td>₹12</td><td>₹90-95</td><td>$open-$close</td></tr>
      <tr><td>Old Listed Co IPO</td><td>₹5</td><td>₹50</td><td>1-3 Jan</td></tr>
    </tbody></table></body></html>";
    exit;
}
http_response_code(404);
echo '{}';
