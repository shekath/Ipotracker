#!/usr/bin/env bash
# Offline end-to-end test of the PHP backend against the mock upstream.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
cat > "$TMP/config.local.php" <<PHP
<?php return [
  'data_dir' => '$TMP/data',
  'cron_token' => 'secret',
  'upstream' => ['yahoo' => ['http://127.0.0.1:8099'], 'nse' => 'http://127.0.0.1:8099', 'twelvedata' => 'http://127.0.0.1:8099'],
  'gmp_sources' => [['name' => 'Mock GMP', 'url' => 'http://127.0.0.1:8099/gmp.html']],
];
PHP
export ML_CONFIG_LOCAL="$TMP/config.local.php"
php -S 127.0.0.1:8099 tests/mock/router.php >/dev/null 2>&1 & M=$!
ML_CONFIG_LOCAL="$TMP/config.local.php" php -S 127.0.0.1:8098 -t public >/dev/null 2>&1 & A=$!
trap 'kill $M $A 2>/dev/null; rm -rf "$TMP"' EXIT
sleep 1
fail() { echo "FAIL: $1"; exit 1; }
j() { php -r '$d=json_decode(file_get_contents("php://stdin"),true); echo json_encode(eval("return $argv[1];"));' "$1"; }

Q=$(curl -s "http://127.0.0.1:8098/api/quotes.php?ids=IN:RELIANCE,US:AAPL,IN:M%26M,IN:FAIL,bad")
[ "$(echo "$Q" | j 'count($d["quotes"])')" = "3" ] || fail "quotes count: $Q"
[ "$(echo "$Q" | j '$d["errors"]')" = '["IN:FAIL"]' ] || fail "quote errors: $Q"
[ "$(echo "$Q" | j '$d["quotes"]["IN:RELIANCE"]["changePct"]>0')" = "true" ] || fail "changePct"
echo "ok quotes"

H=$(curl -s "http://127.0.0.1:8098/api/history.php?id=US:AAPL&range=1y")
[ "$(echo "$H" | j 'count($d["points"])')" = "250" ] || fail "history: $H"
[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:8098/api/history.php?id=US:AAPL&range=9y")" = "400" ] || fail "history validation"
echo "ok history"

[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:8098/api/cron/update-ipos.php")" = "403" ] || fail "cron needs token"
R=$(curl -s "http://127.0.0.1:8098/api/cron/update-ipos.php?token=secret")
[ "$(echo "$R" | j '$d["ok"]')" = "true" ] || fail "cron run: $R"
echo "ok cron"

I=$(curl -s "http://127.0.0.1:8098/api/ipos.php")
echo "$I" | j 'array_map(fn($i)=>$i["id"]." ".$i["type"]." subs=".count($i["subscription"])." gmp=".json_encode(array_column($i["gmp"],"value")), $d["ipos"])'; echo
[ "$(echo "$I" | j 'count($d["ipos"])')" = "4" ] || fail "expected 4 ipos (3 NSE + 1 BSE-only from GMP)"
BLS=$(echo "$I" | j 'array_values(array_filter($d["ipos"], fn($i)=>$i["symbol"]==="BLSPOLY"))[0]')
[ "$(echo "$BLS" | j '$d["subscription"][0]["qib"]')" = "1.5" ] || fail "qib: $BLS"
[ "$(echo "$BLS" | j '$d["subscription"][0]["snii"]')" = "8.4" ] || fail "snii"
[ "$(echo "$BLS" | j '$d["subscription"][0]["bnii"]')" = "5.1" ] || fail "bnii"
[ "$(echo "$BLS" | j '$d["subscription"][0]["retail"]')" = "4.4" ] || fail "retail"
[ "$(echo "$BLS" | j '$d["gmp"][0]["value"]')" = "25" ] || fail "gmp: $BLS"
[ "$(echo "$BLS" | j '$d["priceBand"]')" = "[142,150]" ] || fail "band"
[ "$(echo "$BLS" | j '$d["timeline"]["estimated"]')" = "true" ] || fail "timeline"
echo "$I" | j 'in_array("Tiny Widgets Limited", array_column($d["ipos"],"name")) && array_values(array_filter($d["ipos"], fn($i)=>$i["name"]==="Tiny Widgets Limited"))[0]["type"]==="SME"' | grep -q true || fail "SME detection"
echo "$I" | j 'in_array("Old Listed Co", array_column($d["ipos"],"name"))' | grep -q false || fail "old GMP rows must be ignored"
echo "ok ipos"

curl -s "http://127.0.0.1:8098/api/health.php" | j '$d["dataDirWritable"]' | grep -q true || fail "health"
[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:8098/api/lib/http.php")" != "500" ] || true
echo "ALL BACKEND TESTS PASSED"
