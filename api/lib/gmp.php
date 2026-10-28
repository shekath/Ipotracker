<?php
declare(strict_types=1);

/** Normalise company names for fuzzy matching across sources. */
function norm_name(string $s): string
{
    $s = strtolower(html_entity_decode($s));
    $s = preg_replace('/\b(limited|ltd|ipo|sme|nse|bse|the|private|pvt|company|co|inc|india|bse sme|nse sme)\b\.?/', ' ', $s);
    return preg_replace('/[^a-z0-9]/', '', $s);
}

function names_match(string $a, string $b): bool
{
    $a = norm_name($a);
    $b = norm_name($b);
    if ($a === '' || $b === '') return false;
    if ($a === $b) return true;
    $min = min(strlen($a), strlen($b));
    return $min >= 6 && (str_starts_with($a, $b) || str_starts_with($b, $a));
}

/** "Ajwa Projects IPO Open", "HGS (India) Upcoming" -> "Ajwa Projects", "HGS (India)" */
function clean_ipo_name(string $name): string
{
    $n = trim($name);
    do {
        $prev = $n;
        $n = trim(preg_replace('/\s*(\b(IPO|SME|BSE|NSE|Upcoming|Open|Opens? Today|Closed|Closes? Today|Listed|Allotted|Allotment)\b|\([^)]*\b(SME|BSE|NSE|Emerge|Upcoming|Open|Closed)\b[^)]*\))\s*$/i', '', $n));
    } while ($n !== $prev && $n !== '');
    return $n !== '' ? $n : trim($name);
}

/**
 * Parse every HTML table that has a GMP column.
 * @return list<array{name:string,gmp:?float,price:?array,dates:?string}>
 */
function parse_gmp_tables(string $html): array
{
    if (trim($html) === '') return [];
    $dom = new DOMDocument();
    libxml_use_internal_errors(true);
    $dom->loadHTML('<?xml encoding="utf-8"?>' . $html);
    libxml_clear_errors();
    $rows = [];
    foreach ($dom->getElementsByTagName('table') as $table) {
        $head = null;
        foreach ($table->getElementsByTagName('tr') as $tr) {
            $cells = [];
            foreach ($tr->childNodes as $td) {
                if ($td instanceof DOMElement && in_array($td->tagName, ['td', 'th'], true)) {
                    $cells[] = trim(preg_replace('/\s+/u', ' ', $td->textContent));
                }
            }
            if (!$cells) continue;
            $lower = array_map('strtolower', $cells);
            if ($head === null) {
                $gmpIdx = null;
                foreach ($lower as $i => $c) {
                    if (str_contains($c, 'gmp') || str_contains($c, 'premium')) { $gmpIdx = $i; break; }
                }
                if ($gmpIdx !== null) {
                    $find = function (array $needles) use ($lower) {
                        foreach ($lower as $i => $c) foreach ($needles as $n) if (str_contains($c, $n)) return $i;
                        return null;
                    };
                    $head = ['gmp' => $gmpIdx, 'name' => $find(['name', 'ipo', 'company']) ?? 0, 'price' => $find(['price', 'band']), 'date' => $find(['date', 'open', 'close'])];
                }
                continue;
            }
            $name = $cells[$head['name']] ?? '';
            $gmpCell = $cells[$head['gmp']] ?? '';
            if ($name === '' || norm_name($name) === '') continue;
            // "₹25 (16.67%)", "+25", "-", "25"
            $gmp = null;
            if (preg_match('/-?\s*\d+(?:\.\d+)?/', str_replace([',', '₹'], '', $gmpCell), $m)) {
                $gmp = (float) str_replace(' ', '', $m[0]);
            }
            $rows[] = [
                'name' => clean_ipo_name($name),
                'gmp' => $gmp,
                'price' => $head['price'] !== null ? parse_band($cells[$head['price']] ?? null) : null,
                'dates' => $head['date'] !== null ? ($cells[$head['date']] ?? null) : null,
            ];
        }
    }
    return $rows;
}

/** @return array{rows:list<array>,status:array<string,string>} */
function fetch_gmp(): array
{
    $all = [];
    $status = [];
    foreach (cfg('gmp_sources', []) as $src) {
        [$code, $body, $err] = http_get($src['url'], ['accept' => 'text/html']);
        if ($code !== 200) {
            $status[$src['name']] = "HTTP $code" . ($err ? " $err" : '');
            continue;
        }
        $rows = parse_gmp_tables($body);
        foreach ($rows as &$r) $r['source'] = $src['name'];
        $status[$src['name']] = count($rows) . ' rows';
        $all = array_merge($all, $rows);
    }
    return ['rows' => $all, 'status' => $status];
}
