<?php
declare(strict_types=1);

/**
 * NSE's own lists, refreshed daily so new listings appear on their own:
 * every security listed for trading (main board and SME), the surveillance
 * lists SEBI and the exchanges run jointly (ASM, GSM, ESM), and the latest
 * end-of-day prices (bhavcopy), which also cover stocks too new for Yahoo.
 */

function nse_archive_get(string $path): array
{
    $base = cfg('upstream')['nse_archives'] ?? 'https://nsearchives.nseindia.com';
    return http_get($base . $path, ['accept' => 'text/csv,application/zip,*/*', 'timeout' => 30, 'headers' => ['Referer: https://www.nseindia.com/']]);
}

/** "06-OCT-2008" or "09-Nov-26" -> "2008-10-06" */
function nse_date(string $s): ?string
{
    if (!preg_match('/^(\d{1,2})-([a-z]{3})-(\d{2}|\d{4})$/i', trim($s), $m)) return null;
    $d = DateTime::createFromFormat('!d-M-' . (strlen($m[3]) === 2 ? 'y' : 'Y'), $m[1] . '-' . ucfirst(strtolower($m[2])) . '-' . $m[3]);
    return $d ? $d->format('Y-m-d') : null;
}

/** Parse EQUITY_L.csv / SME_EQUITY_L.csv: SYMBOL, NAME OF COMPANY, SERIES, DATE OF LISTING, ..., ISIN */
function nse_parse_listing_csv(string $csv, string $board): array
{
    $lines = preg_split('/\r\n|\n|\r/', trim($csv));
    if (count($lines) < 2) return [];
    $head = array_map(fn($h) => strtolower(preg_replace('/[^a-z]/i', '', $h)), str_getcsv(array_shift($lines)));
    $col = fn(string $k) => array_search($k, $head, true);
    [$iSym, $iName, $iSer, $iDate, $iIsin] = [$col('symbol'), $col('nameofcompany'), $col('series'), $col('dateoflisting'), $col('isinnumber')];
    if ($iSym === false || $iSer === false) return [];
    $out = [];
    foreach ($lines as $l) {
        $c = str_getcsv($l);
        $sym = strtoupper(trim($c[$iSym] ?? ''));
        if ($sym === '') continue;
        $out[$sym] = [
            'symbol' => $sym,
            'name' => trim($c[$iName] ?? $sym),
            'series' => strtoupper(trim($c[$iSer] ?? '')),
            'listedOn' => $iDate !== false ? nse_date($c[$iDate] ?? '') : null,
            'isin' => $iIsin !== false ? trim($c[$iIsin] ?? '') : null,
            'board' => $board,
        ];
    }
    return $out;
}

/**
 * Every security NSE lists for trading, keyed by symbol.
 * @return array{rows:array<string,array>,source:string,at:int}|null
 */
function nse_listed(): ?array
{
    $ck = 'nse:listed';
    if ($c = cache_get($ck, (int) cfg('nse_list_ttl', 6 * 3600))) return $c;
    $rows = [];
    $ok = 0;
    foreach (['main' => '/content/equities/EQUITY_L.csv', 'sme' => '/emerge/corporates/content/SME_EQUITY_L.csv'] as $board => $path) {
        [$status, $body] = nse_archive_get($path);
        $part = $status === 200 ? nse_parse_listing_csv($body, $board) : [];
        if (count($part) >= ($board === 'main' ? 500 : 20)) {
            $rows += $part;
            $ok++;
        }
    }
    if ($ok === 2) {
        $out = ['rows' => $rows, 'source' => 'NSE listed securities (official, daily)', 'at' => time()];
        cache_set($ck, $out);
        return $out;
    }
    return cache_stale($ck) ?: null;
}

/**
 * Surveillance flags by symbol from NSE's ASM, GSM and ESM reports.
 * @return array<string,list<array{code:string,label:string,detail:string,level:string}>>
 */
function nse_surveillance(): array
{
    $ck = 'nse:surveillance';
    if ($c = cache_get($ck, (int) cfg('nse_surveillance_ttl', 3 * 3600))) return $c['flags'];
    $base = cfg('upstream')['nse'];
    $opt = ['timeout' => 20, 'headers' => ['Referer: ' . $base . '/reports/asm']];
    $res = http_multi(['asm' => "$base/api/reportASM", 'gsm' => "$base/api/reportGSM", 'esm' => "$base/api/reportESM"], $opt, 3);
    $flags = [];
    $ok = 0;
    $add = function (?string $sym, array $f) use (&$flags) {
        $sym = strtoupper(trim((string) $sym));
        if ($sym !== '') $flags[$sym][] = $f;
    };
    foreach ($res as $kind => [$status, $body]) {
        $d = $status === 200 ? json_decode($body, true) : null;
        if (!is_array($d)) continue;
        $ok++;
        if ($kind === 'asm') {
            foreach (['longterm' => 'Long-term ASM', 'shortterm' => 'Short-term ASM'] as $k => $name) {
                foreach ($d[$k]['data'] ?? [] as $r) {
                    $stage = trim((string) ($r['asmSurvIndicator'] ?? ''));
                    $add($r['symbol'] ?? null, ['code' => 'ASM', 'label' => trim("$name $stage"), 'detail' => (string) ($r['survDesc'] ?? $name), 'level' => 'warn']);
                }
            }
        } else {
            foreach (array_is_list($d) ? $d : [] as $r) {
                if ($kind === 'gsm') {
                    $stage = trim((string) ($r['gsmStage'] ?? ''));
                    $add($r['symbol'] ?? null, ['code' => 'GSM', 'label' => 'GSM' . ($stage !== '' ? " stage $stage" : ''), 'detail' => (string) ($r['survDesc'] ?? 'Graded Surveillance Measure'), 'level' => 'high']);
                } else {
                    $stage = trim((string) ($r['esmSurvIndicator'] ?? ''));
                    $add($r['symbol'] ?? null, ['code' => 'ESM', 'label' => trim("ESM $stage"), 'detail' => (string) ($r['survDesc'] ?? 'Enhanced Surveillance Measure'), 'level' => 'high']);
                }
            }
        }
    }
    if ($ok === 3) {
        cache_set($ck, ['flags' => $flags, 'at' => time()]);
        return $flags;
    }
    $old = cache_stale($ck);
    return $old['flags'] ?? $flags;
}

/** Read the single CSV inside a bhavcopy zip. */
function nse_unzip_first(string $zip): ?string
{
    if (class_exists('ZipArchive')) {
        $tmp = tempnam(sys_get_temp_dir(), 'bhav');
        file_put_contents($tmp, $zip);
        $z = new ZipArchive();
        $csv = null;
        if ($z->open($tmp) === true) {
            $csv = $z->numFiles ? $z->getFromIndex(0) : null;
            $z->close();
        }
        @unlink($tmp);
        return $csv === false ? null : $csv;
    }
    // No zip extension: read the first entry from the central directory and inflate it.
    $eocd = strrpos($zip, "PK\x05\x06");
    if ($eocd === false) return null;
    $cd = unpack('Voffset', substr($zip, $eocd + 16, 4))['offset'];
    $e = unpack('vmethod/x8/Vcsize/x4/vnlen/vxlen/vclen/x8/Vlocal', substr($zip, $cd + 10, 36));
    $lh = unpack('vnlen/vxlen', substr($zip, $e['local'] + 26, 4));
    $data = substr($zip, $e['local'] + 30 + $lh['nlen'] + $lh['xlen'], $e['csize']);
    $out = $e['method'] === 8 ? @gzinflate($data) : ($e['method'] === 0 ? $data : false);
    return $out === false ? null : $out;
}

/**
 * Latest end-of-day prices for every NSE equity, keyed by symbol.
 * @return array{date:string,rows:array<string,array{close:float,prevClose:?float,volume:?float,series:string}>}|null
 */
function nse_bhavcopy(): ?array
{
    $ck = 'nse:bhav';
    if ($c = cache_get($ck, (int) cfg('nse_bhav_ttl', 3 * 3600))) return $c;
    $tz = new DateTimeZone('Asia/Kolkata');
    $day = new DateTime('now', $tz);
    for ($i = 0; $i < 8; $i++, $day->modify('-1 day')) {
        if ((int) $day->format('N') >= 6) continue;
        $f = 'BhavCopy_NSE_CM_0_0_0_' . $day->format('Ymd') . '_F_0000.csv.zip';
        [$status, $body] = nse_archive_get('/content/cm/' . $f);
        if ($status !== 200 || !str_starts_with($body, 'PK')) continue;
        $csv = nse_unzip_first($body);
        if (!$csv) continue;
        $lines = preg_split('/\r\n|\n|\r/', trim($csv));
        $head = str_getcsv(array_shift($lines));
        $ix = array_flip($head);
        if (!isset($ix['TckrSymb'], $ix['SctySrs'], $ix['ClsPric'])) continue;
        $rows = [];
        foreach ($lines as $l) {
            $c = str_getcsv($l);
            $ser = $c[$ix['SctySrs']] ?? '';
            if (!in_array($ser, ['EQ', 'BE', 'BZ', 'SM', 'ST', 'SZ'], true)) continue;
            $rows[strtoupper($c[$ix['TckrSymb']])] = [
                'close' => (float) $c[$ix['ClsPric']],
                'prevClose' => isset($ix['PrvsClsgPric']) ? num($c[$ix['PrvsClsgPric']] ?? null) : null,
                'volume' => isset($ix['TtlTradgVol']) ? num($c[$ix['TtlTradgVol']] ?? null) : null,
                'series' => $ser,
            ];
        }
        if (count($rows) < 500) continue;
        $out = ['date' => $day->format('Y-m-d'), 'rows' => $rows, 'at' => time()];
        cache_set($ck, $out);
        return $out;
    }
    return cache_stale($ck) ?: null;
}

/**
 * Trading restrictions for one symbol: its series (trade-for-trade, non-compliant),
 * the surveillance lists, and whether NSE lists it for trading at all.
 * @return list<array{code:string,label:string,detail:string,level:string}>
 */
function nse_flags(string $sym, ?array $listing, array $surv, bool $haveList): array
{
    $flags = [];
    if ($haveList && !$listing) {
        $flags[] = ['code' => 'SUSP', 'label' => 'Not trading', 'detail' => 'Not on NSE\'s list of securities available for trading: suspended, delisted or moved.', 'level' => 'high'];
    }
    $series = $listing['series'] ?? null;
    if ($series === 'BZ' || $series === 'SZ') {
        $flags[] = ['code' => $series, 'label' => "Non-compliant ($series)", 'detail' => 'Moved to the ' . $series . ' series for not complying with listing regulations (SEBI SOP): trade-for-trade only, with stricter price bands.', 'level' => 'high'];
    } elseif ($series === 'BE' || $series === 'ST') {
        $new = !empty($listing['listedOn']) && $listing['listedOn'] >= date('Y-m-d', strtotime('-30 days'));
        $flags[] = ['code' => $series, 'label' => "Trade-for-trade ($series)", 'detail' => 'Every trade must be settled by delivery: no intraday buying and selling. ' . ($new ? 'New listings often start in this segment.' : 'Often a surveillance action.'), 'level' => 'warn'];
    }
    foreach ($surv[$sym] ?? [] as $f) $flags[] = $f;
    return $flags;
}

/**
 * BSE's end-of-day file: every equity that traded on BSE in the latest session, keyed by ISIN.
 * The group code doubles as a restriction signal (T/XT/MT trade-to-trade, Z non-compliant).
 * @return array{date:string,rows:array<string,array>}|null
 */
function bse_bhavcopy(): ?array
{
    $ck = 'bse:bhav';
    if ($c = cache_get($ck, (int) cfg('nse_bhav_ttl', 3 * 3600))) return $c;
    $base = cfg('upstream')['bse'] ?? 'https://www.bseindia.com';
    $groups = array_flip(['A', 'B', 'T', 'X', 'XT', 'M', 'MT', 'MS', 'Z']); // equity groups; F, IF, P, R are debt and other instruments
    $day = new DateTime('now', new DateTimeZone('Asia/Kolkata'));
    for ($i = 0; $i < 8; $i++, $day->modify('-1 day')) {
        if ((int) $day->format('N') >= 6) continue;
        [$status, $csv] = http_get($base . '/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_' . $day->format('Ymd') . '_F_0000.CSV', ['accept' => 'text/csv,*/*', 'timeout' => 30, 'headers' => ['Referer: https://www.bseindia.com/']]);
        if ($status !== 200 || !str_starts_with($csv, 'TradDt')) continue;
        $lines = preg_split('/\r\n|\n|\r/', trim($csv));
        $ix = array_flip(str_getcsv(array_shift($lines)));
        if (!isset($ix['ISIN'], $ix['TckrSymb'], $ix['SctySrs'], $ix['ClsPric'])) continue;
        $rows = [];
        foreach ($lines as $l) {
            $c = str_getcsv($l);
            $isin = $c[$ix['ISIN']] ?? '';
            $grp = $c[$ix['SctySrs']] ?? '';
            if (($c[$ix['FinInstrmTp']] ?? '') !== 'STK' || !str_starts_with($isin, 'INE') || !isset($groups[$grp])) continue;
            $rows[$isin] = [
                'symbol' => strtoupper($c[$ix['TckrSymb']]),
                'code' => $c[$ix['FinInstrmId']] ?? null,
                'name' => ucwords(strtolower(trim($c[$ix['FinInstrmNm']] ?? ''))),
                'group' => $grp,
                'close' => (float) $c[$ix['ClsPric']],
                'prevClose' => num($c[$ix['PrvsClsgPric']] ?? null),
                'volume' => num($c[$ix['TtlTradgVol']] ?? null),
            ];
        }
        if (count($rows) < 1000) continue;
        $out = ['date' => $day->format('Y-m-d'), 'rows' => $rows, 'at' => time()];
        cache_set($ck, $out);
        return $out;
    }
    return cache_stale($ck) ?: null;
}

/** BSE stocks that are not listed on NSE (matched by ISIN), keyed by BSE symbol. */
function bse_only(): array
{
    $bse = bse_bhavcopy();
    $nse = nse_listed();
    if (!$bse || !$nse) return [];
    $onNse = [];
    foreach ($nse['rows'] as $r) if (!empty($r['isin'])) $onNse[$r['isin']] = true;
    $out = [];
    foreach ($bse['rows'] as $isin => $r) {
        if (isset($onNse[$isin]) || isset($out[$r['symbol']])) continue;
        $out[$r['symbol']] = $r + ['isin' => $isin, 'date' => $bse['date']];
    }
    return $out;
}

/** Restrictions BSE signals through a stock's group. */
function bse_flags(string $group): array
{
    if ($group === 'Z') return [['code' => 'Z', 'label' => 'Non-compliant (Z)', 'detail' => 'BSE group Z: the company has not complied with listing requirements or investor-grievance rules. Trade-to-trade, with stricter price bands.', 'level' => 'high']];
    if (in_array($group, ['T', 'XT', 'MT'], true)) return [['code' => $group, 'label' => "Trade-to-trade ($group)", 'detail' => 'BSE trade-to-trade group: every trade must be settled by delivery, no intraday. Usually a surveillance action.', 'level' => 'warn']];
    return [];
}
