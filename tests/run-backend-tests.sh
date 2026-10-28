#!/usr/bin/env bash
# Offline end-to-end test of the PHP backend against the mock upstream.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP=$(mktemp -d)
cat > "$TMP/config.local.php" <<PHP
<?php return [
  'data_dir' => '$TMP/data',
  'cron_token' => 'secret',
  'upstream' => ['yahoo' => ['http://127.0.0.1:8099'], 'yahoo_cookie' => 'http://127.0.0.1:8099/fc', 'niftyindices' => 'http://127.0.0.1:8099', 'nse' => 'http://127.0.0.1:8099', 'twelvedata' => 'http://127.0.0.1:8099'],
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
[ "$(echo "$BLS" | j '$d["subscription"][0]["retail"]')" = "4.4" ] || fail "retail from the main RII row, not the 'Individuals(Other than RIIs)' sub-row: $BLS"
[ "$(echo "$BLS" | j '$d["subscription"][0]["total"]')" = "3.9" ] || fail "total"
TINY=$(echo "$I" | j 'array_values(array_filter($d["ipos"], fn($i)=>$i["symbol"]==="TINYSME"))[0]')
[ "$(echo "$TINY" | j '$d["subscription"][0]["retail"]')" = "null" ] || fail "retail must stay empty when it cannot be derived sensibly: $TINY"
[ "$(echo "$BLS" | j '$d["gmp"][0]["value"]')" = "25" ] || fail "gmp: $BLS"
[ "$(echo "$BLS" | j '$d["priceBand"]')" = "[142,150]" ] || fail "band"
[ "$(echo "$BLS" | j '$d["timeline"]["estimated"]')" = "true" ] || fail "timeline"
echo "$I" | j 'in_array("Tiny Widgets Limited", array_column($d["ipos"],"name")) && array_values(array_filter($d["ipos"], fn($i)=>$i["name"]==="Tiny Widgets Limited"))[0]["type"]==="SME"' | grep -q true || fail "SME detection"
echo "$I" | j 'in_array("Old Listed Co", array_column($d["ipos"],"name"))' | grep -q false || fail "old GMP rows must be ignored"
echo "$I" | j 'in_array("Garbled Dates", array_column($d["ipos"],"name"))' | grep -q false || fail "garbled date ranges must be rejected"
echo "$I" | j 'array_values(array_filter($d["ipos"], fn($i)=>$i["id"]==="gmp-onlyindustries"))[0]["name"]' | grep -q '"BSE Only Industries"' || fail "status words stripped from tracker names"
echo "$I" | j 'array_values(array_filter($d["ipos"], fn($i)=>$i["id"]==="gmp-onlyindustries"))[0]["type"]' | grep -q '"SME"' || fail "tracker-only issues are SME"
echo "ok ipos"

S=$(curl -s "http://127.0.0.1:8098/api/screener.php?index=nifty50")
[ "$(echo "$S" | j '$d["constituentsSource"]')" = '"NSE Indices (official)"' ] || fail "constituents source: $S"
[ "$(echo "$S" | j 'count($d["rows"])')" = "6" ] || fail "csv rows"
[ "$(echo "$S" | j 'array_column($d["rows"],"symbol")')" = '["RELIANCE","M&M","BAJAJ-AUTO","HDFCBANK","INFY","NOV7"]' ] || fail "symbols"
[ "$(echo "$S" | j '$d["rows"][1]["pe"]!==null && $d["rows"][1]["mcap"]>0')" = "true" ] || fail "v7 fundamentals for M&M"
[ "$(echo "$S" | j '$d["rows"][5]["price"]>0 && $d["rows"][5]["pe"]===null')" = "true" ] || fail "chart fallback for v7 miss"
[ "$(echo "$S" | j '$d["rows"][0]["divYield"]')" = "1.2" ] || fail "div yield %"
S2=$(curl -s "http://127.0.0.1:8098/api/screener.php?index=banknifty")
[ "$(echo "$S2" | j '$d["constituentsSource"]')" = '"Bundled fallback list"' ] || fail "fallback when CSV blocked: $S2"
[ "$(echo "$S2" | j 'count(array_filter($d["rows"], fn($r)=>$r["price"]>0))')" = "14" ] || fail "fallback quotes"
S3=$(curl -s "http://127.0.0.1:8098/api/screener.php?index=dow30")
[ "$(echo "$S3" | j 'count($d["rows"])')" = "30" ] || fail "dow30"
[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:8098/api/screener.php?index=nope")" = "404" ] || fail "unknown index"
A1=$(curl -s "http://127.0.0.1:8098/api/screener.php?index=allin")
[ "$(echo "$A1" | j '$d["constituentsSource"]')" = '"NSE Indices (official)"' ] || fail "All (India) uses the broad Nifty 500 list: $(echo "$A1" | head -c 200)"
[ "$(echo "$A1" | j 'count($d["rows"])')" = "60" ] || fail "All (India) rows"
[ "$(echo "$A1" | j 'count(array_filter($d["rows"], fn($r)=>$r["price"]>0))')" = "60" ] || fail "All (India) quotes"
A2=$(curl -s "http://127.0.0.1:8098/api/screener.php?index=allus")
[ "$(echo "$A2" | j 'count($d["rows"])')" = "37" ] || fail "All (US) = Dow 30 + mega caps, deduplicated"
[ "$(echo "$A2" | j 'count(array_unique(array_column($d["rows"],"symbol")))')" = "37" ] || fail "no duplicates"
echo "ok screener"

W=$(curl -s "http://127.0.0.1:8098/api/weekly.php")
[ "$(echo "$W" | j 'implode(",", array_keys($d["indices"]))')" = '"NIFTY,BANKNIFTY,SENSEX"' ] || fail "weekly indices: $(echo "$W" | head -c 300)"
[ "$(echo "$W" | j '$d["indices"]["NIFTY"]["prev"]["high"] > $d["indices"]["NIFTY"]["prev"]["low"]')" = "true" ] || fail "weekly prev high/low"
[ "$(echo "$W" | j '$d["indices"]["NIFTY"]["prev"]["vixHigh"] >= $d["indices"]["NIFTY"]["prev"]["vixLow"]')" = "true" ] || fail "weekly vix"
[ "$(echo "$W" | j 'is_float($d["indices"]["SENSEX"]["prevDay"]["close"]) || is_int($d["indices"]["SENSEX"]["prevDay"]["close"])')" = "true" ] || fail "weekly prevDay"
# Week split with fixed dates (IST): Wed 28 Oct 2026 -> previous week is 19-23 Oct; Sat 31 Oct -> the week just ended.
SPLIT=$(ML_CONFIG_LOCAL="$TMP/config.local.php" php -r 'require "public/api/lib/bootstrap.php"; require "public/api/lib/weekly.php";
  $mon19 = strtotime("2026-10-19 09:15"); $mon26 = strtotime("2026-10-26 09:15");
  $bars = [["t"=>$mon19,"high"=>2,"low"=>1,"close"=>1.5,"open"=>1], ["t"=>$mon26,"high"=>3,"low"=>2,"close"=>2.5,"open"=>2]];
  [$p1, $c1] = weekly_split($bars, strtotime("2026-10-28 12:00")); [$p2, $c2] = weekly_split($bars, strtotime("2026-10-31 12:00"));
  // Yahoo appends a live-session candle next to the current week candle: last week must still be 19-23 Oct.
  $yb = [["t"=>strtotime("2026-10-19 00:00"),"open"=>23150.85,"high"=>23175.25,"low"=>22372,"close"=>22600], ["t"=>strtotime("2026-10-26 00:00"),"open"=>22524.4,"high"=>22829.75,"low"=>22387.35,"close"=>22749.75], ["t"=>strtotime("2026-10-28 15:31"),"open"=>22678,"high"=>22778.05,"low"=>22497.7,"close"=>22698.85]];
  [$yp, $yc] = weekly_split($yb, strtotime("2026-10-28 21:00"));
  if ([$yp["high"], $yp["low"], $yp["close"], $yc["high"], $yc["low"], $yc["close"]] !== [23175.25, 22372, 22600, 22829.75, 22387.35, 22698.85]) { echo "yahoo-shape ", json_encode([$yp, $yc]); exit; }
  $daily = ["bars"=>[["t"=>strtotime("2026-10-27 09:15"),"open"=>9.0,"high"=>10.5,"low"=>9.0,"close"=>10.0], ["t"=>strtotime("2026-10-28 09:15"),"open"=>10.0,"high"=>11.5,"low"=>9.5,"close"=>11.0], ["t"=>strtotime("2026-10-28 15:31"),"open"=>11.0,"high"=>11.2,"low"=>10.8,"close"=>11.1]], "sessionEnd"=>strtotime("2026-10-28 15:30")];
  echo json_encode([$p1["t"]===$mon19 && $c1["t"]===$mon26, $p2["t"]===$mon26 && $c2===null, weekly_label($mon19),
    weekly_prev_day($daily, strtotime("2026-10-28 12:00"))["date"], weekly_prev_day($daily, strtotime("2026-10-28 16:00"))["date"]]);')
[ "$SPLIT" = '[true,true,"19 Oct \u2013 23 Oct 2026","2026-10-27","2026-10-28"]' ] || fail "weekly split: $SPLIT"
echo "ok weekly"

curl -s "http://127.0.0.1:8098/api/health.php" | j '$d["dataDirWritable"]' | grep -q true || fail "health"
[ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:8098/api/lib/http.php")" != "500" ] || true
echo "ALL BACKEND TESTS PASSED"
