import { Asset, Networks } from "@stellar/stellar-sdk";
import type { ChainConfig } from "./chain";

/**
 * Build the chain config from env vars. The browser passes `import.meta.env`
 * (VITE_* vars); the server passes `process.env` (same names work there too).
 *
 * Token defaults to native test XLM wrapped as a Stellar Asset Contract, so
 * Friendbot-funded accounts can play immediately. Point VITE_TOKEN_ID at a test
 * USDC SAC (and set VITE_TOKEN_SYMBOL=USDC) to switch.
 */
export function makeConfig(env: Record<string, string | undefined>): ChainConfig {
  const passphrase = env.VITE_NETWORK_PASSPHRASE || Networks.TESTNET;
  return {
    contractId: env.VITE_CONTRACT_ID || "",
    tokenId: env.VITE_TOKEN_ID || Asset.native().contractId(passphrase),
    rpcUrl: env.VITE_RPC_URL || "https://soroban-testnet.stellar.org",
    horizonUrl: env.VITE_HORIZON_URL || "https://horizon-testnet.stellar.org",
    networkPassphrase: passphrase,
    explorerBase: env.VITE_EXPLORER_BASE || "https://stellar.expert/explorer/testnet",
    tokenSymbol: env.VITE_TOKEN_SYMBOL || "XLM",
    tokenDecimals: Number(env.VITE_TOKEN_DECIMALS || 7),
  };
}
