<?php
declare(strict_types=1);

require_once __DIR__ . '/nse.php';
require_once __DIR__ . '/gmp.php';

function store_path(): string
{
    return data_path('ipo-store.json');
}

function load_store(): array
{
    return read_json(store_path(), ['version' => 1, 'lastRun' => 0, 'lastSuccess' => 0, 'sources' => [], 'ipos' => []]);
}

/** Add N exchange working days (skips weekends and configured holidays). */
function add_workdays(string $date, int $n): string
{
    $holidays = array_flip(cfg('market_holidays', []));
    $d = new DateTime($date);
    while ($n > 0) {
        $d->modify('+1 day');
        if ((int) $d->format('N') >= 6 || isset($holidays[$d->format('Y-m-d')])) continue;
        $n--;
    }
    return $d->format('Y-m-d');
}

/** SEBI T+3 listing timetable, computed from the close date when not published. */
function build_timeline(array $r): ?array
{
    if (empty($r['closeDate'])) return null;
    $t = $r['closeDate'];
    $est = empty($r['listingDate']);
    return [
        'open' => $r['openDate'] ?? null,
        'close' => $t,
        'allotment' => $r['allotmentDate'] ?? add_workdays($t, 1),
        'refund' => add_workdays($t, 2),
        'demat' => add_workdays($t, 2),
        'listing' => $r['listingDate'] ?? add_workdays($t, 3),
        'estimated' => $est,
    ];
}

/**
 * NSE sometimes omits "times" and "offered" for the retail row (only bids are
 * given). Derive the retail portion as the net issue minus the other
 * categories' portions, and times = bids / portion.
 */
function fill_missing_times(array $cats, ?float $issueShares): array
{
    foreach ($cats as $k => $c) {
        if ($c['times'] === null && $c['offered'] && $c['bid'] !== null) $cats[$k]['times'] = round($c['bid'] / $c['offered'], 2);
    }
    $r = $cats['retail'] ?? null;
    if ($r && $r['times'] === null && $r['bid'] !== null && $issueShares) {
        $others = 0.0;
        foreach (['qib', 'nii', 'employee', 'shareholder', 'policyholder'] as $k) $others += (float) ($cats[$k]['offered'] ?? 0);
        $portion = $issueShares - $others;
        // Only trust the result when the portion is a sensible share of the issue (retail is 10–35%).
        if ($portion > 0.05 * $issueShares && $portion < 0.6 * $issueShares) {
            $cats['retail']['offered'] = $portion;
            $cats['retail']['times'] = round($r['bid'] / $portion, 2);
            $cats['retail']['derived'] = true;
        }
    }
    return $cats;
}

/** Parse loose date ranges like "27-29 Oct", "27 Oct - 2 Nov", "Oct 27-29". */
function parse_range(?string $s): ?array
{
    if (!$s) return null;
    $s = trim(preg_replace('/\s+/', ' ', str_replace(['–', '—', ' to '], '-', $s)));
    $y = (int) date('Y');
    $mk = function ($d, $m) use ($y) {
        $t = strtotime("$d $m $y");
        return $t ? date('Y-m-d', $t) : null;
    };
    if (preg_match('/(\d{1,2})\s*([A-Za-z]{3,})?\s*-\s*(\d{1,2})\s*([A-Za-z]{3,})/', $s, $m)) {
        $open = $mk($m[1], $m[2] ?: $m[4]);
        $close = $mk($m[3], $m[4]);
    } elseif (preg_match('/([A-Za-z]{3,})\s*(\d{1,2})\s*-\s*(\d{1,2})/', $s, $m)) {
        $open = $mk($m[2], $m[1]);
        $close = $mk($m[3], $m[1]);
    } else {
        return null;
    }
    if (!$open || !$close) return null;
    if ($close < $open) $close = date('Y-m-d', strtotime($close . ' +1 year'));
    return [$open, $close];
}

/**
 * Refresh the IPO store from all sources. Safe to call concurrently: a
 * non-blocking lock ensures only one refresh runs.
 */
function refresh_ipos(bool $force = false): array
{
    $lock = fopen(data_path('ipo.lock'), 'c');
    if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
        return ['skipped' => 'refresh already running'];
    }
    @set_time_limit(90);
    $store = load_store();
    $today = date('Y-m-d');
    $now = time();
    $log = [];

    // 1. Discover issues from NSE.
    try {
        $issues = nse_issues();
        foreach ($issues as $sym => $i) {
            $rec = $store['ipos'][$sym] ?? ['firstSeen' => $today, 'subscription' => [], 'gmp' => [], 'sources' => []];
            foreach ($i as $k => $v) {
                if ($v !== null && $k !== 'nseTimes') $rec[$k] = $v;
            }
            $rec['sources'] = array_values(array_unique(array_merge($rec['sources'], ['NSE'])));
            $rec['updatedAt'] = $now;
            $store['ipos'][$sym] = $rec;
        }
        // Merge any GMP-only placeholder that NSE now covers.
        foreach ($store['ipos'] as $k => $r) {
            if (!str_starts_with($k, 'gmp-')) continue;
            foreach ($issues as $sym => $i) {
                if (names_match($r['name'], $i['name'])) {
                    $store['ipos'][$sym]['gmp'] = ($r['gmp'] ?? []) + ($store['ipos'][$sym]['gmp'] ?? []);
                    unset($store['ipos'][$k]);
                    break;
                }
            }
        }
        $store['sources']['NSE issues'] = ['ok' => true, 'msg' => count($issues) . ' current/upcoming issues', 'at' => $now];
    } catch (Throwable $e) {
        $store['sources']['NSE issues'] = ['ok' => false, 'msg' => $e->getMessage(), 'at' => $now];
    }

    // 2. Subscription snapshots while bidding is open (and the morning after close, for final numbers).
    $subOk = 0;
    $subErr = [];
    foreach ($store['ipos'] as $sym => &$r) {
        if (str_starts_with($sym, 'gmp-') || empty($r['openDate']) || empty($r['closeDate'])) continue;
        $dayAfter = add_workdays($r['closeDate'], 1);
        if ($today < $r['openDate'] || $today > $dayAfter) continue;
        try {
            $cats = nse_subscription($sym);
            $cats = fill_missing_times($cats, $r['issueShares'] ?? null);
            if ($cats) {
                $key = min($today, $r['closeDate']);
                $r['subscription'][$key] = ['time' => $now, 'cats' => $cats];
                ksort($r['subscription']);
                $subOk++;
            }
        } catch (Throwable $e) {
            $subErr[] = "$sym: " . $e->getMessage();
        }
    }
    unset($r);
    $store['sources']['NSE subscription'] = ['ok' => !$subErr, 'msg' => $subErr ? implode('; ', array_slice($subErr, 0, 3)) : "$subOk issues updated", 'at' => $now];

    // 3. Grey-market premium.
    $gmp = fetch_gmp();
    $matched = 0;
    foreach ($gmp['rows'] as $row) {
        if ($row['gmp'] === null) continue;
        $hit = null;
        foreach ($store['ipos'] as $k => $r) {
            if (names_match($r['name'], $row['name'])) { $hit = $k; break; }
        }
        if ($hit === null) {
            // Not on NSE (yet) — e.g. BSE-only or just announced. Track only if it is current.
            $range = parse_range($row['dates']);
            if (!$range || $range[1] < date('Y-m-d', strtotime('-3 days'))) continue;
            // Reject garbled dates: a bidding window is at most ~10 days.
            if ((strtotime($range[1]) - strtotime($range[0])) > 10 * 86400) continue;
            $hit = 'gmp-' . norm_name($row['name']);
            // NSE lists mainboard issues itself, so tracker-only issues are almost always SME (NSE Emerge / BSE SME).
            $store['ipos'][$hit] = ($store['ipos'][$hit] ?? ['firstSeen' => $today, 'subscription' => [], 'gmp' => [], 'sources' => []]) + [
                'symbol' => null, 'name' => $row['name'], 'type' => 'SME',
            ];
            $store['ipos'][$hit]['openDate'] = $range[0];
            $store['ipos'][$hit]['closeDate'] = $range[1];
            if ($row['price']) $store['ipos'][$hit]['priceBand'] = $row['price'];
        }
        $rec = &$store['ipos'][$hit];
        $tl = build_timeline($rec);
        if ($tl && $today > $tl['listing']) { unset($rec); continue; } // GMP is meaningless after listing
        // First source wins for the day so values stay comparable.
        if (!isset($rec['gmp'][$today]) || $rec['gmp'][$today]['source'] === $row['source']) {
            $rec['gmp'][$today] = ['value' => $row['gmp'], 'source' => $row['source'], 'time' => $now];
            ksort($rec['gmp']);
        }
        $rec['sources'] = array_values(array_unique(array_merge($rec['sources'] ?? [], ['GMP: ' . $row['source']])));
        unset($rec);
        $matched++;
    }
    foreach ($gmp['status'] as $name => $msg) {
        $store['sources']["GMP · $name"] = ['ok' => !str_starts_with($msg, 'HTTP'), 'msg' => $msg, 'at' => $now];
    }

    // Drop tracker-only placeholders created by older versions (status words in names, garbled dates).
    foreach ($store['ipos'] as $k => $r) {
        if (!str_starts_with($k, 'gmp-')) continue;
        $bad = preg_match('/\b(upcoming|open|closed|listed)$/i', $r['name'] ?? '')
            || (!empty($r['openDate']) && !empty($r['closeDate']) && strtotime($r['closeDate']) - strtotime($r['openDate']) > 10 * 86400);
        if ($bad) unset($store['ipos'][$k]);
    }

    // 4. Prune issues that listed long ago.
    $cut = date('Y-m-d', strtotime('-' . (int) cfg('ipo_keep_days', 120) . ' days'));
    foreach ($store['ipos'] as $k => $r) {
        $tl = build_timeline($r);
        if ($tl && $tl['listing'] < $cut) unset($store['ipos'][$k]);
    }

    $store['lastRun'] = $now;
    $anyOk = array_filter($store['sources'], fn($s) => $s['at'] === $now && $s['ok']);
    if ($anyOk) $store['lastSuccess'] = $now;
    write_json(store_path(), $store);
    flock($lock, LOCK_UN);
    fclose($lock);
    return ['ok' => (bool) $anyOk, 'ipos' => count($store['ipos']), 'gmpMatched' => $matched, 'sources' => $store['sources']];
}

/** Public, frontend-friendly representation. */
function ipo_payload(array $store): array
{
    $out = [];
    foreach ($store['ipos'] as $key => $r) {
        $subs = [];
        foreach ($r['subscription'] ?? [] as $date => $snap) {
            $row = ['date' => $date, 'time' => $snap['time']];
            foreach ($snap['cats'] as $cat => $v) $row[$cat] = $v['times'];
            $subs[] = $row;
        }
        $gmp = [];
        foreach ($r['gmp'] ?? [] as $date => $g) $gmp[] = ['date' => $date] + $g;
        $out[] = [
            'id' => str_starts_with($key, 'gmp-') ? $key : 'nse-' . strtolower($key),
            'symbol' => $r['symbol'] ?? null,
            'name' => $r['name'],
            'type' => $r['type'] ?? 'Mainboard',
            'openDate' => $r['openDate'] ?? null,
            'closeDate' => $r['closeDate'] ?? null,
            'priceBand' => $r['priceBand'] ?? null,
            'lotSize' => $r['lotSize'] ?? null,
            'issueShares' => $r['issueShares'] ?? null,
            'firstSeen' => $r['firstSeen'] ?? null,
            'sources' => $r['sources'] ?? [],
            'timeline' => build_timeline($r),
            'subscription' => $subs,
            'gmp' => $gmp,
        ];
    }
    usort($out, fn($a, $b) => strcmp((string) $b['openDate'], (string) $a['openDate']));
    return $out;
}
