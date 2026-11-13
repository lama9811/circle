#!/usr/bin/env bash
# Build, test and deploy CircleSave to Stellar Testnet, then write web/.env.
# Needs: rustup (+ wasm32v1-none target) and the Stellar CLI.
set -euo pipefail
cd "$(dirname "$0")/.."

cargo test -p circle-save
stellar contract build

# Demo identities funded by Friendbot (no-op if they already exist).
for who in organizer alice bob carol; do
  stellar keys generate "$who" --network testnet --fund 2>/dev/null || true
done

WASM=target/wasm32v1-none/release/circle_save.wasm
CONTRACT_ID=$(stellar contract deploy --wasm "$WASM" --source organizer --network testnet)
TOKEN_ID=$(stellar contract id asset --asset native --network testnet)
echo "Contract: $CONTRACT_ID"
echo "Token (native XLM SAC): $TOKEN_ID"

ENV=web/.env
touch "$ENV"
grep -v '^VITE_CONTRACT_ID=' "$ENV" > "$ENV.tmp" || true
echo "VITE_CONTRACT_ID=$CONTRACT_ID" >> "$ENV.tmp"
mv "$ENV.tmp" "$ENV"
echo "$CONTRACT_ID" > .contract-id
echo "Wrote VITE_CONTRACT_ID to $ENV"
echo "Explorer: https://stellar.expert/explorer/testnet/contract/$CONTRACT_ID"
