<?php
declare(strict_types=1);

/** Small file cache + JSON store with atomic writes. */
function cache_get(string $key, int $ttl)
{
    $f = data_path('cache/' . md5($key) . '.json');
    if (!is_file($f)) return null;
    if ($ttl > 0 && filemtime($f) < time() - $ttl) return null;
    $d = json_decode((string) file_get_contents($f), true);
    return $d;
}

/** Cached value regardless of age, or null. */
function cache_stale(string $key)
{
    return cache_get($key, 0);
}

function cache_set(string $key, $data): void
{
    write_json(data_path('cache/' . md5($key) . '.json'), $data);
}

function write_json(string $path, $data): void
{
    $tmp = $path . '.' . bin2hex(random_bytes(4)) . '.tmp';
    file_put_contents($tmp, json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    rename($tmp, $path);
}

function read_json(string $path, $default = [])
{
    if (!is_file($path)) return $default;
    $d = json_decode((string) file_get_contents($path), true);
    return is_array($d) ? $d : $default;
}
