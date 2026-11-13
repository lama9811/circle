import { useEffect, useState } from "react";
import { HashRouter, Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { formatAmount } from "./shared/chain";
import { cfg, fundWithFriendbot, reader, tokenBalance } from "./lib/wallet";
import { short, useWallet, WalletProvider } from "./lib/useWallet";
import { MyCircles } from "./pages/MyCircles";
import { nameOf, useNames } from "./lib/names";
import { CreateCircle } from "./pages/CreateCircle";
import { CircleDetail } from "./pages/CircleDetail";
import { MyScore } from "./pages/MyScore";
import { Landing } from "./pages/Landing";

const LINKS = [
  { to: "/circles", label: "My circles" },
  { to: "/create", label: "Start a circle" },
  { to: "/score", label: "My score" },
];

function TopBar() {
  const { address, connect, error } = useWallet();
  const loc = useLocation();
  const [bal, setBal] = useState<bigint | null>(null);
  const [funding, setFunding] = useState(false);
  const names = useNames();
  useEffect(() => { if (address) tokenBalance(address).then(setBal); }, [address, loc.pathname]);

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand"><span className="brand-mark" aria-hidden />CircleSave</Link>
        <nav className="nav" aria-label="Main">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to}>
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="nav-pill" className="pill" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                  {l.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="wallet">
          {address ? (
            <>
              {bal !== null && <span className="balance">{formatAmount(bal, cfg.tokenDecimals)} {cfg.tokenSymbol}</span>}
              {bal === 0n && (
                <button className="btn small ghost" disabled={funding} onClick={async () => {
                  setFunding(true); await fundWithFriendbot(address).catch(() => {}); setBal(await tokenBalance(address)); setFunding(false);
                }}>{funding ? "Adding funds…" : "Add test funds"}</button>
              )}
              <a href={reader.accountUrl(address)} target="_blank" rel="noreferrer" className="addr" title={`${short(address)}: view this wallet on Stellar Expert`}>{nameOf(names, address)}</a>
            </>
          ) : (
            <button className="btn small" onClick={connect}>Connect wallet</button>
          )}
        </div>
      </header>
      <AnimatePresence>
        {error && (
          <motion.div className="error" style={{ margin: "12px auto", maxWidth: 1100 }} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
      transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

function AnimatedRoutes() {
  const loc = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={loc} key={loc.pathname}>
        <Route path="/" element={<Page><Landing /></Page>} />
        <Route path="/circles" element={<Page><MyCircles /></Page>} />
        <Route path="/create" element={<Page><CreateCircle /></Page>} />
        <Route path="/circle/:id" element={<Page><CircleDetail /></Page>} />
        <Route path="/score" element={<Page><MyScore /></Page>} />
      </Routes>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <WalletProvider>
        <HashRouter>
          <TopBar />
          <main>
            {!cfg.contractId && (
              <div className="error banner">The contract isn't connected yet. Run scripts/deploy.sh, then restart the app so it picks up VITE_CONTRACT_ID.</div>
            )}
            <AnimatedRoutes />
          </main>
          <footer>
            Every coin in a circle is held by a Soroban contract on Stellar Testnet, never by a person.{" "}
            {cfg.contractId && <a href={reader.contractUrl()} target="_blank" rel="noreferrer">See the contract</a>}
          </footer>
        </HashRouter>
      </WalletProvider>
    </MotionConfig>
  );
}
