import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { connectWallet, currentAddress } from "./wallet";

interface WalletCtx { address: string | null; connect: () => Promise<void>; error: string | null }
const Ctx = createContext<WalletCtx>({ address: null, connect: async () => {}, error: null });

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // Read-only "view as" for demos: ?viewAs=G... shows that wallet's data (can't sign).
    const viewAs = new URLSearchParams(window.location.search).get("viewAs");
    if (viewAs && /^G[A-Z2-7]{55}$/.test(viewAs)) { setAddress(viewAs); return; }
    currentAddress().then(setAddress);
  }, []);
  const connect = useCallback(async () => {
    setError(null);
    try { setAddress(await connectWallet()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  return <Ctx.Provider value={{ address, connect, error }}>{children}</Ctx.Provider>;
}
export const useWallet = () => useContext(Ctx);
export const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
