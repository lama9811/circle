// Read-only access to the CircleSave contract. Used by both the browser app and
// the server-side AI agents, so it must not import anything browser-only.
import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Horizon,
  Keypair,
  nativeToScVal,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

export interface ChainConfig {
  contractId: string;
  tokenId: string;
  rpcUrl: string;
  horizonUrl: string;
  networkPassphrase: string;
  explorerBase: string; // e.g. https://stellar.expert/explorer/testnet
  tokenSymbol: string;
  tokenDecimals: number;
}

export type CircleStatus = "Forming" | "Active" | "Completed" | "Closed";

export interface Circle {
  id: number;
  organizer: string;
  token: string;
  amount: bigint;
  members: string[];
  roundSecs: number;
  round: number;
  deadline: number; // unix seconds, 0 when not running
  joined: boolean[];
  paid: boolean[];
  deposits: bigint[];
  defaults: number[];
  pot: bigint;
  status: CircleStatus;
}

export interface Reputation {
  onTime: number;
  total: number;
}

export interface ContractCall {
  hash: string;
  createdAt: string;
  fn: string;
  successful: boolean;
}

// Simulation needs a source account but never submits, so any well-formed key works.
const READ_SOURCE = Keypair.random().publicKey();

export class CircleSaveReader {
  readonly server: rpc.Server;
  readonly cfg: ChainConfig;
  constructor(cfg: ChainConfig) {
    this.cfg = cfg;
    this.server = new rpc.Server(cfg.rpcUrl);
  }

  private async read(method: string, ...args: xdr.ScVal[]): Promise<unknown> {
    const tx = new TransactionBuilder(new Account(READ_SOURCE, "0"), {
      fee: BASE_FEE,
      networkPassphrase: this.cfg.networkPassphrase,
    })
      .addOperation(new Contract(this.cfg.contractId).call(method, ...args))
      .setTimeout(30)
      .build();
    const sim = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) throw new Error(friendlyError(sim.error));
    if (!sim.result) throw new Error(`${method} returned no result`);
    return scValToNative(sim.result.retval);
  }

  async getCircle(id: number): Promise<Circle> {
    return parseCircle(await this.read("get_circle", nativeToScVal(id, { type: "u32" })));
  }

  async getReputation(member: string): Promise<Reputation> {
    const r = (await this.read("get_reputation", new Address(member).toScVal())) as {
      on_time: number;
      total: number;
    };
    return { onTime: Number(r.on_time), total: Number(r.total) };
  }

  async getMemberCircles(member: string): Promise<number[]> {
    const ids = (await this.read("get_member_circles", new Address(member).toScVal())) as number[];
    return ids.map(Number);
  }

  async circleCount(): Promise<number> {
    return Number(await this.read("circle_count"));
  }

  /** Recent CircleSave contract calls made by `account`, via Horizon. */
  async getHistory(account: string, limit = 50): Promise<ContractCall[]> {
    const horizon = new Horizon.Server(this.cfg.horizonUrl);
    const page = await horizon.operations().forAccount(account).order("desc").limit(limit).call();
    const out: ContractCall[] = [];
    for (const op of page.records) {
      if (op.type !== "invoke_host_function") continue;
      const params = (op as unknown as { parameters?: { value: string }[] }).parameters ?? [];
      if (params.length < 2) continue;
      try {
        const contract = scValToNative(xdr.ScVal.fromXDR(params[0].value, "base64"));
        if (contract !== this.cfg.contractId) continue;
        const fn = String(scValToNative(xdr.ScVal.fromXDR(params[1].value, "base64")));
        out.push({
          hash: op.transaction_hash,
          createdAt: op.created_at,
          fn,
          successful: op.transaction_successful,
        });
      } catch {
        // Not a contract invocation we can decode; skip it.
      }
    }
    return out;
  }

  txUrl(hash: string) {
    return `${this.cfg.explorerBase}/tx/${hash}`;
  }
  contractUrl() {
    return `${this.cfg.explorerBase}/contract/${this.cfg.contractId}`;
  }
  accountUrl(a: string) {
    return `${this.cfg.explorerBase}/account/${a}`;
  }
}

function parseCircle(raw: unknown): Circle {
  const c = raw as Record<string, unknown>;
  const status = c.status;
  return {
    id: Number(c.id),
    organizer: String(c.organizer),
    token: String(c.token),
    amount: BigInt(c.amount as bigint),
    members: (c.members as string[]).map(String),
    roundSecs: Number(c.round_secs),
    round: Number(c.round),
    deadline: Number(c.deadline),
    joined: (c.joined as boolean[]).map(Boolean),
    paid: (c.paid as boolean[]).map(Boolean),
    deposits: (c.deposits as bigint[]).map((d) => BigInt(d)),
    defaults: (c.defaults as number[]).map(Number),
    pot: BigInt(c.pot as bigint),
    // Unit enum variants decode as ["Active"].
    status: (Array.isArray(status) ? status[0] : status) as CircleStatus,
  };
}

const CONTRACT_ERRORS: Record<number, string> = {
  1: "Circle not found",
  2: "Amount must be greater than zero",
  3: "A circle needs at least 2 members",
  4: "The same member is listed twice",
  5: "That wallet is not a member of this circle",
  6: "Already joined",
  7: "This circle is no longer accepting members",
  8: "This circle is not active",
  9: "Already paid this round",
  10: "Not everyone has paid this round yet",
  11: "The round deadline has not passed yet",
  12: "This member's deposit has already been used",
  13: "The circle has not finished all rounds yet",
  14: "Round length must be greater than zero",
  15: "Too many members (max 20)",
};

export function friendlyError(msg: string): string {
  const m = /Error\(Contract, #(\d+)\)/.exec(msg);
  if (m && CONTRACT_ERRORS[Number(m[1])]) return CONTRACT_ERRORS[Number(m[1])];
  return msg.length > 300 ? msg.slice(0, 300) + "…" : msg;
}

export function formatAmount(v: bigint, decimals: number): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

export function parseAmount(s: string, decimals: number): bigint {
  const [w, f = ""] = s.trim().split(".");
  if (!/^\d+$/.test(w || "0") || !/^\d*$/.test(f) || f.length > decimals) {
    throw new Error("Invalid amount");
  }
  return BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt(f.padEnd(decimals, "0") || "0");
}

/** JSON-safe summary of a circle for display or for the AI agents. */
export function describeCircle(c: Circle, cfg: ChainConfig, nowSecs = Math.floor(Date.now() / 1000)) {
  const fmt = (v: bigint) => `${formatAmount(v, cfg.tokenDecimals)} ${cfg.tokenSymbol}`;
  return {
    id: c.id,
    status: c.status,
    contribution_per_round: fmt(c.amount),
    full_pot_size: fmt(c.amount * BigInt(c.members.length)),
    round_length_days: +(c.roundSecs / 86400).toFixed(2),
    current_round: c.status === "Active" ? c.round + 1 : null,
    total_rounds: c.members.length,
    this_round_recipient: c.status === "Active" ? c.members[c.round] : null,
    deadline_utc: c.deadline ? new Date(c.deadline * 1000).toISOString() : null,
    deadline_passed: c.deadline ? nowSecs > c.deadline : false,
    pot_collected: fmt(c.pot),
    organizer: c.organizer,
    members: c.members.map((m, i) => ({
      position: i + 1,
      address: m,
      receives_pot_in_round: i + 1,
      already_received_pot: c.status !== "Forming" && (c.round > i || c.status !== "Active"),
      joined: c.joined[i],
      paid_this_round: c.status === "Active" ? c.paid[i] : null,
      deposit_held: fmt(c.deposits[i]),
      defaults: c.defaults[i],
    })),
    explorer_contract_url: `${cfg.explorerBase}/contract/${cfg.contractId}`,
  };
}
