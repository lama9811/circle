// Browser-only: Freighter wallet + signed contract calls.
import {
  getAddress,
  getNetwork,
  isConnected,
  requestAccess,
  signTransaction,
} from "@stellar/freighter-api";
import {
  Account,
  Address,
  scValToNative,
  BASE_FEE,
  Contract,
  nativeToScVal,
  rpc,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { CircleSaveReader, friendlyError } from "../shared/chain";
import { makeConfig } from "../shared/config";

export const cfg = makeConfig(import.meta.env as Record<string, string | undefined>);
export const reader = new CircleSaveReader(cfg);

export async function connectWallet(): Promise<string> {
  const conn = await isConnected();
  if (!conn.isConnected) {
    throw new Error("Freighter wallet not found. Install it from freighter.app and reload.");
  }
  const access = await requestAccess();
  if (access.error) throw new Error(access.error.message ?? "Wallet access was refused");
  const net = await getNetwork();
  if (!net.error && net.networkPassphrase !== cfg.networkPassphrase) {
    throw new Error("Switch Freighter to Testnet (Settings → Network) and try again.");
  }
  return access.address;
}

export async function currentAddress(): Promise<string | null> {
  try {
    const conn = await isConnected();
    if (!conn.isConnected) return null;
    const a = await getAddress();
    return a.address || null;
  } catch {
    return null;
  }
}

export async function fundWithFriendbot(address: string) {
  const r = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`);
  if (!r.ok && r.status !== 400) throw new Error("Friendbot failed");
}

export async function tokenBalance(address: string): Promise<bigint> {
  // SAC `balance` via simulation.
  const tx = new TransactionBuilder(new Account(address, "0"), {
    fee: BASE_FEE,
    networkPassphrase: cfg.networkPassphrase,
  })
    .addOperation(new Contract(cfg.tokenId).call("balance", new Address(address).toScVal()))
    .setTimeout(30)
    .build();
  const sim = await reader.server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim) || !sim.result) return 0n;
  return BigInt(scValToNative(sim.result.retval));
}

export interface TxResult {
  hash: string;
  fee: string; // stroops actually charged
  returnValue?: xdr.ScVal;
}

/** Build, simulate, sign with Freighter, submit and wait for a contract call. */
export async function invoke(source: string, method: string, args: xdr.ScVal[]): Promise<TxResult> {
  const server = reader.server;
  const account = await server.getAccount(source);
  const built = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: cfg.networkPassphrase,
  })
    .addOperation(new Contract(cfg.contractId).call(method, ...args))
    .setTimeout(120)
    .build();

  let prepared;
  try {
    prepared = await server.prepareTransaction(built);
  } catch (e) {
    throw new Error(friendlyError(e instanceof Error ? e.message : String(e)));
  }

  const signed = await signTransaction(prepared.toXDR(), {
    networkPassphrase: cfg.networkPassphrase,
    address: source,
  });
  if (signed.error) throw new Error(signed.error.message ?? "Signing was cancelled");

  const tx = TransactionBuilder.fromXDR(signed.signedTxXdr, cfg.networkPassphrase);
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") throw new Error("Network rejected the transaction");

  const res = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (res.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction failed (${res.status}). See ${reader.txUrl(sent.hash)}`);
  }
  const fee = String(res.resultXdr.feeCharged);
  return { hash: sent.hash, fee, returnValue: res.returnValue };
}

export const sc = {
  u32: (n: number) => nativeToScVal(n, { type: "u32" }),
  u64: (n: number | bigint) => nativeToScVal(BigInt(n), { type: "u64" }),
  i128: (n: bigint) => nativeToScVal(n, { type: "i128" }),
  addr: (a: string) => new Address(a).toScVal(),
  addrs: (as: string[]) => xdr.ScVal.scvVec(as.map((a) => new Address(a).toScVal())),
};

/** Stroops → USD-ish string at a rough XLM price, for the "cost per payment" badge. */
export function feeLabel(stroops: string, xlmUsd = 0.4) {
  const xlm = Number(stroops) / 1e7;
  return `${xlm.toFixed(5)} XLM (≈ $${(xlm * xlmUsd).toFixed(4)})`;
}
