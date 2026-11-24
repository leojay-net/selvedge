#!/usr/bin/env bash
set -uo pipefail
proofs_directory="$(cd "$(dirname "$0")/../programs/mandate/proofs" && pwd)"
log_directory="$(cd "$(dirname "$0")/.." && pwd)/docs/logs"
mkdir -p "$log_directory"
cd "$proofs_directory"
harness_names=$(grep -A2 "kani::proof" src/harnesses.rs | grep -o "fn [a-z_]*" | sed 's/fn //')
failed=0
for harness_name in $harness_names; do
  started=$(date +%s)
  output=$(cargo kani --harness "$harness_name" 2>&1)
  elapsed=$(( $(date +%s) - started ))
  verdict=$(echo "$output" | grep -E "^VERIFICATION" | tail -1)
  printf '%s | %s | %ss\n' "$harness_name" "${verdict:-NO VERDICT}" "$elapsed"
  echo "$verdict" | grep -q SUCCESSFUL || failed=1
done
exit $failed
