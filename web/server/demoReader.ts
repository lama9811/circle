// Sample data the agents read when no contract is deployed yet, so the AI can be
// tried immediately. Mirrors the CircleSaveReader read API.
import type { ChainConfig, Circle, ContractCall, Reputation } from "../src/shared/chain";

export type Reader = {
  cfg: ChainConfig;
  getCircle(id: number): Promise<Circle>;
  getReputation(a: string): Promise<Reputation>;
  getMemberCircles(a: string): Promise<number[]>;
  getHistory(a: string, limit?: number): Promise<ContractCall[]>;
  txUrl(hash: string): string;
};

// Addresses are labelled placeholders, not real accounts.
export const DEMO_MEMBERS = {
  Amina: "GAMINA" + "A".repeat(50),
  Kofi: "GKOFI" + "B".repeat(51),
  Lucia: "GLUCIA" + "C".repeat(50),
  Wanjiru: "GWANJIRU" + "D".repeat(48),
};
const M = Object.values(DEMO_MEMBERS);
const U = 10_0000000n; // 10 XLM

export function demoReader(cfg: ChainConfig): Reader {
  const now = Math.floor(Date.now() / 1000);
  const circle: Circle = {
    id: 0,
    organizer: M[0],
    token: cfg.tokenId,
    amount: U,
    members: M,
    roundSecs: 7 * 86400,
    round: 1, // Amina already got the pot; this round pays Kofi
    deadline: now + 2 * 86400,
    joined: [true, true, true, true],
    paid: [false, true, true, false], // Amina and Wanjiru haven't paid
    deposits: [U, U, U, U],
    defaults: [0, 0, 0, 0],
    pot: 2n * U,
    status: "Active",
  };
  const reps: Record<string, Reputation> = {
    [M[0]]: { onTime: 5, total: 6 },
    [M[1]]: { onTime: 8, total: 8 },
    [M[2]]: { onTime: 6, total: 6 },
    [M[3]]: { onTime: 3, total: 5 },
  };
  return {
    cfg: { ...cfg, contractId: "DEMO (no contract deployed yet)" },
    async getCircle(id) {
      if (id !== 0) throw new Error(`Circle ${id} not found (demo mode only has circle 0)`);
      return circle;
    },
    async getReputation(a) { return reps[a] ?? { onTime: 0, total: 0 }; },
    async getMemberCircles(a) { return M.includes(a) ? [0] : []; },
    async getHistory() { return []; },
    txUrl: (h) => `${cfg.explorerBase}/tx/${h}`,
  };
}
