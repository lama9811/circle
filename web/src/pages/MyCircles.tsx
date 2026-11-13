import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { formatAmount, type Circle } from "../shared/chain";
import { cfg, reader } from "../lib/wallet";
import { useWallet } from "../lib/useWallet";
import { TiltCard } from "../components/TiltCard";
import { nameOf, useNames } from "../lib/names";

function todo(c: Circle, me: number) {
  if (c.status === "Forming") return c.joined[me] ? `Waiting for ${c.joined.filter((j) => !j).length} more to join` : "Join and lock your deposit";
  if (c.status === "Active") return c.paid[me] ? (c.paid.every(Boolean) ? "Everyone paid. Release the pot" : "You've paid this round") : "Your payment is due";
  if (c.status === "Completed") return "All rounds done. Close to get deposits back";
  return "Finished";
}

export function MyCircles() {
  const { address, connect } = useWallet();
  const [circles, setCircles] = useState<Circle[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lookup, setLookup] = useState("");
  const nav = useNavigate();
  const names = useNames();

  useEffect(() => {
    if (!address || !cfg.contractId) return;
    setErr(null);
    reader.getMemberCircles(address)
      .then((ids) => Promise.all(ids.map((id) => reader.getCircle(id))))
      .then((cs) => setCircles(cs.reverse()))
      .catch((e) => setErr(e.message));
  }, [address]);

  if (!address) return (
    <div className="panel empty">
      <h3>Connect your wallet to see your circles</h3>
      <p>CircleSave uses Freighter on Stellar Testnet. Nothing here is real money.</p>
      <button className="btn" onClick={connect}>Connect wallet</button>
    </div>
  );

  return (
    <div>
      <div className="page-head">
        <div><h2>My circles</h2><p>Every circle your wallet belongs to, straight from the contract.</p></div>
        <Link className="btn" to="/create">Start a circle</Link>
      </div>
      {err && <div className="error">{err}</div>}
      {!circles && !err && cfg.contractId && <p className="muted">Reading your circles from Testnet…</p>}
      {circles?.length === 0 && (
        <div className="panel empty">
          <h3>No circles yet</h3>
          <p>Start one for your group, or ask your organizer for the circle number and open it below.</p>
          <Link className="btn" to="/create">Start a circle</Link>
        </div>
      )}
      <div className="grid">
        {circles?.map((c, k) => {
          const me = c.members.indexOf(address);
          const due = (c.status === "Active" && !c.paid[me]) || (c.status === "Forming" && !c.joined[me]);
          return (
            <motion.div key={c.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: k * 0.05 }}>
              <TiltCard to={`/circle/${c.id}`}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <b>Circle {c.id}</b><span className={`status ${c.status}`}>{c.status === "Forming" ? "Gathering" : c.status}</span>
                </div>
                <div className="amt">{formatAmount(c.amount, cfg.tokenDecimals)}<small className="muted">{cfg.tokenSymbol} a round</small></div>
                <div className="dots" aria-label="Members">
                  {c.members.map((m, i) => (
                    <i key={m} className={[(c.status === "Active" ? c.paid[i] : c.joined[i]) && "paid", c.status === "Active" && i === c.round && "turn", i === me && "me"].filter(Boolean).join(" ")} />
                  ))}
                </div>
                <div className={due ? "todo" : "muted"}>{todo(c, me)}</div>
                <small>{c.members.map((m) => nameOf(names, m)).join(", ")}</small>
                <small>You get the pot in round {me + 1} of {c.members.length}</small>
              </TiltCard>
            </motion.div>
          );
        })}
      </div>
      <form className="lookup" onSubmit={(e) => { e.preventDefault(); if (lookup) nav(`/circle/${lookup}`); }}>
        <input placeholder="Circle number" aria-label="Circle number" value={lookup} inputMode="numeric" onChange={(e) => setLookup(e.target.value.replace(/\D/g, ""))} />
        <button className="btn ghost" disabled={!lookup}>Open circle</button>
      </form>
    </div>
  );
}
