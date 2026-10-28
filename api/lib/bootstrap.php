<?php
declare(strict_types=1);

$GLOBALS['ML_CONFIG'] = require __DIR__ . '/../config.php';
require_once __DIR__ . '/http.php';
require_once __DIR__ . '/store.php';

function cfg(string $key, $default = null)
{
    return $GLOBALS['ML_CONFIG'][$key] ?? $default;
}

function data_path(string $rel): string
{
    $dir = cfg('data_dir');
    $path = $dir . '/' . $rel;
    $parent = dirname($path);
    if (!is_dir($parent)) {
        @mkdir($parent, 0755, true);
    }
    return $path;
}

function json_out($data, int $status = 200, int $maxAge = 0): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header($maxAge > 0 ? "Cache-Control: public, max-age=$maxAge" : 'Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function num($v): ?float
{
    if ($v === null || $v === '' || $v === '-') return null;
    if (is_int($v) || is_float($v)) return (float) $v;
    $t = trim((string) $v);
    if (is_numeric($t)) return (float) $t; // includes scientific notation such as "1.19E7"
    $clean = preg_replace('/[^0-9.\-]/', '', (string) $v);
    return is_numeric($clean) ? (float) $clean : null;
}
