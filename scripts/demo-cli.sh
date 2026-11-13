#!/usr/bin/env bash
# Run one full 3-member, 3-round circle from the CLI (PRD build step 3).
set -euo pipefail
cd "$(dirname "$0")/.."
C=$(cat .contract-id)
T=$(stellar contract id asset --asset native --network testnet)
A=$(stellar keys address alice); B=$(stellar keys address bob); K=$(stellar keys address carol)
inv() { stellar contract invoke --id "$C" --network testnet --source "$1" -- "${@:2}"; }

ID=$(inv organizer create_circle --organizer "$(stellar keys address organizer)" --token "$T" \
  --amount 100000000 --members "[\"$A\",\"$B\",\"$K\"]" --round_secs 600)
echo "circle id: $ID"
for w in alice bob carol; do inv $w join --circle_id "$ID" --member "$(stellar keys address $w)"; done
for round in 1 2 3; do
  for w in alice bob carol; do inv $w contribute --circle_id "$ID" --member "$(stellar keys address $w)"; done
  echo "round $round payout -> $(inv organizer payout --circle_id "$ID")"
done
inv organizer close --circle_id "$ID"
for w in alice bob carol; do echo "$w: $(inv organizer get_reputation --member "$(stellar keys address $w)")"; done
