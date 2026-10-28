<?php
declare(strict_types=1);

const ML_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function curl_handle(string $url, array $opt = [])
{
    $ch = curl_init($url);
    $headers = array_merge([
        'Accept: ' . ($opt['accept'] ?? 'application/json, text/plain, */*'),
        'Accept-Language: en-US,en;q=0.9',
    ], $opt['headers'] ?? []);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_TIMEOUT => $opt['timeout'] ?? cfg('http_timeout', 12),
        CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_USERAGENT => ML_UA,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_ENCODING => '',
    ]);
    if (!empty($opt['cookie_jar'])) {
        curl_setopt($ch, CURLOPT_COOKIEJAR, $opt['cookie_jar']);
        curl_setopt($ch, CURLOPT_COOKIEFILE, $opt['cookie_jar']);
    }
    return $ch;
}

/** @return array{0:int,1:string,2:string} status, body, error */
function http_get(string $url, array $opt = []): array
{
    $ch = curl_handle($url, $opt);
    $body = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    return [$status, is_string($body) ? $body : '', $err];
}

function http_json(string $url, array $opt = [])
{
    [$status, $body, $err] = http_get($url, $opt);
    if ($status !== 200) {
        throw new RuntimeException("HTTP $status from " . parse_url($url, PHP_URL_HOST) . ($err ? " ($err)" : ''));
    }
    $data = json_decode($body, true);
    if ($data === null) {
        throw new RuntimeException('Invalid JSON from ' . parse_url($url, PHP_URL_HOST));
    }
    return $data;
}

/**
 * Fetch many URLs in parallel.
 * @param array<string,string> $urls key => url
 * @return array<string,array{0:int,1:string}>
 */
function http_multi(array $urls, array $opt = []): array
{
    $mh = curl_multi_init();
    $handles = [];
    foreach ($urls as $k => $u) {
        $handles[$k] = curl_handle($u, $opt);
        curl_multi_add_handle($mh, $handles[$k]);
    }
    do {
        $st = curl_multi_exec($mh, $running);
        if ($running) curl_multi_select($mh, 1.0);
    } while ($running && $st === CURLM_OK);
    $out = [];
    foreach ($handles as $k => $ch) {
        $out[$k] = [(int) curl_getinfo($ch, CURLINFO_HTTP_CODE), (string) curl_multi_getcontent($ch)];
        curl_multi_remove_handle($mh, $ch);
        curl_close($ch);
    }
    curl_multi_close($mh);
    return $out;
}
