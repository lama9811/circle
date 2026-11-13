// Friendly names for wallet addresses. Names are a per-browser address book
// (the contract only stores addresses), pre-filled with the demo wallets.
import { useSyncExternalStore } from "react";

const DEFAULTS: Record<string, string> = {
  GDDW4AL3YNQLHSL7PBBYGWQLTEKOWEJBP7DVT6B2BQQETAKZ7ZUSUR2A: "Organizer",
  GDQKFJMIGSDVEHGSOVZVUZ4E7PTYFWTDZW7HETOCLUWSFAB5EEFSX3C3: "Alice",
  GB4WCG4JVPVYPPIVGGDDILYNN5QE47G5M475TPD3CANVZWRINHNS7D5M: "Bob",
  GBCK73XWBBRM3AOHSB6YN7QE2Z73KT4SB3SLSJUC6CWSXT5LMSGQ7D6Q: "Carol",
};
const KEY = "circlesave.names";

function load(): Record<string, string> {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return { ...DEFAULTS }; }
}
let names = load();
const subs = new Set<() => void>();

export function setNames(update: Record<string, string>) {
  names = { ...names };
  for (const [a, n] of Object.entries(update)) {
    const v = n.trim().slice(0, 40);
    if (v) names[a] = v; else delete names[a];
  }
  try { localStorage.setItem(KEY, JSON.stringify(names)); } catch { /* storage unavailable */ }
  subs.forEach((f) => f());
}

export function useNames() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => names);
}

export const shortAddr = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
export const nameOf = (map: Record<string, string>, a: string) => map[a] || shortAddr(a);
