# CircleSave

A group savings pot (chama / susu / tanda) run by a **Stellar Soroban smart contract** instead of a treasurer. Nobody can run off with the money, and every on-time payment builds a portable on-chain "good saver" score. **Claude AI agents** help members understand their circle and turn their record into a lender-ready report.

Built for the Blockchain Innovation Challenge powered by Stellar. Runs on **Stellar Testnet**.

- **Contract ID:** `CDBCDLAJMN7C3LYEZ6VGYTK5MKOMSL5PI5FJ6FJDYJHNHAPYVTLUO4NJ` ([Stellar Expert](https://stellar.expert/explorer/testnet/contract/CDBCDLAJMN7C3LYEZ6VGYTK5MKOMSL5PI5FJ6FJDYJHNHAPYVTLUO4NJ))
- **Live app:** `<fill in after Vercel deploy>`

## The problem
8 people each put $10 a week into a pot, and each week one person takes $80 home. Today one treasurer holds the cash (it can be lost or stolen), records live in a notebook (disputes), a member who already got the pot can stop paying, and years of faithful saving leave no record a lender can see.

## How it works
1. The organizer creates a circle: amount, round length, members in payout order.
2. Each member joins and locks a **deposit equal to one contribution**. The circle starts only when every deposit is in.
3. Each round every member pays from their Freighter wallet.
4. Once everyone has paid, **anyone** can release the pot. The contract sends it to that round's recipient.
5. If someone misses the deadline, anyone can **cover them with their deposit**, so the recipient still gets the full pot. Their score drops.
6. After the last round, `close` returns the remaining deposits.

Reputation = on-time payments / total payments, stored on-chain per wallet.

## AI agents (Claude)
Both agents run server-side (`web/server/agent.ts`) with the Anthropic SDK tool runner on `claude-opus-5-5`. They get **read-only** tools over the contract (`get_circle`, `get_reputation`, `get_member_circles`, `get_payment_history`). They hold no keys and can't move funds; every payment is still signed in the member's own wallet.

| Agent | Where | What it does |
|---|---|---|
| **Circle Assistant** | Circle page | Answers "who hasn't paid?", "when is my turn?", explains defaults, and drafts friendly WhatsApp/SMS reminders in any language (Swahili, Twi, Spanish…) |
| **Credit Analyst** | My score page | Writes a factual "good-saver" report from the on-chain record that a microfinance lender can read, which is the path from unbanked to banked |

## Architecture
```
Freighter wallet ──signs──▶ Soroban contract (holds all funds, rules, reputation)
       ▲                           ▲ read (simulate)
React + Vite app ──/api/agent──▶ Claude agents (read-only tools)
```

| Path | What |
|---|---|
| `contracts/circle_save/` | Soroban contract (Rust) + unit tests |
| `web/src/` | React app (Connect, My circles, Create, Circle detail, My score) |
| `web/src/shared/chain.ts` | Read-only contract client shared by the app and the agents |
| `web/server/agent.ts` | Claude agents |
| `web/api/agent.ts` | Vercel serverless function (the dev server serves the same handler) |
| `scripts/` | Testnet deploy + a full CLI demo circle |

Contract functions: `create_circle`, `join`, `contribute`, `payout`, `mark_default`, `close`, `get_circle`, `get_reputation`, `get_member_circles`, `circle_count`.

## Setup
Prereqs: Rust, the Stellar CLI, Node 20+, the [Freighter](https://freighter.app) extension (set to Testnet).
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32v1-none
brew install stellar-cli        # or: cargo install --locked stellar-cli
```

### Contract
```bash
cargo test                      # runs the full 3-member / 3-round circle + default tests
./scripts/deploy.sh             # builds, deploys to Testnet, writes web/.env
./scripts/demo-cli.sh           # optional: runs a full circle from the CLI
```

### Web app
```bash
cd web
cp .env.example .env            # deploy.sh already filled VITE_CONTRACT_ID
# add ANTHROPIC_API_KEY=... to web/.env (server-only, never sent to the browser)
npm install
npm run dev
```
Open the app, connect Freighter, press **Get test funds** (Friendbot), create a circle with 3 wallets, and run it. Tip: use a round length of `0.003` days (about 5 minutes) for the live demo.

### Deploy (Vercel)
```bash
cd web && npx vercel --prod
```
Set `VITE_CONTRACT_ID` and `ANTHROPIC_API_KEY` in the Vercel project's environment variables.

## Token
The demo uses native test XLM through its Stellar Asset Contract, so Friendbot funds are enough. To use test USDC, set `VITE_TOKEN_ID` (the USDC SAC address) and `VITE_TOKEN_SYMBOL=USDC`.

## Economics
No treasurer cost. Fees are a fraction of a cent per contribution (shown on screen after every payment). Deposits self-insure against defaults. Groups onboard 5–10 people at once. **Revenue:** lenders pay a small fee for consented reputation checks (the Credit Analyst report), with an optional per-circle fee as a second lever.

## Next steps
Mainnet + fiat on/off-ramps via anchors, SMS/USSD access, a lender marketplace, KYC and licensing.
