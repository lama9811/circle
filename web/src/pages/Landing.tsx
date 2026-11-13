import { Link, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { DemoRing } from "../components/Ring3D";
import { useWallet } from "../lib/useWallet";
import { AgentChat } from "../components/AgentChat";

const ease = [0.2, 0.8, 0.2, 1] as const;
const LINES = ["Save together.", "Nobody holds", "the cash."];

export function Landing() {
  const { address, connect } = useWallet();
  const nav = useNavigate();

  return (
    <>
      <section className="hero">
        <div>
          <h1 aria-label={LINES.join(" ")}>
            {LINES.map((l, i) => (
              <span className="line" key={l} aria-hidden>
                <motion.span initial={{ y: "110%" }} animate={{ y: 0 }} transition={{ duration: 0.9, delay: 0.1 + i * 0.12, ease }}>{l}</motion.span>
              </span>
            ))}
          </h1>
          <motion.p className="lede" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.6, ease }}>
            Your chama, susu or tanda, run by a smart contract. Everyone pays in, the pot goes to whoever's turn it is, and every on-time payment builds a record a lender can trust.
          </motion.p>
          <motion.div className="cta" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.6, ease }}>
            {address ? (
              <Link className="btn big" to="/circles">Open my circles</Link>
            ) : (
              <button className="btn big" onClick={async () => { await connect(); nav("/circles"); }}>Connect wallet to start</button>
            )}
            <Link className="btn big ghost" to="/create">Start a circle</Link>
          </motion.div>
          <motion.div className="facts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9, duration: 0.8 }}>
            <div className="fact"><b>&lt; $0.01</b><span>network fee per payment</span></div>
            <div className="fact"><b>0</b><span>treasurers holding money</span></div>
            <div className="fact"><b>1 deposit</b><span>covers a missed payment</span></div>
          </motion.div>
        </div>
        <motion.div className="hero-stage" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1.2, ease }}>
          <DemoRing />
        </motion.div>
      </section>

      <section className="how" aria-label="How a circle works">
        {[
          ["Set the circle", "Pick the amount, how long each round lasts, and who gets the pot in which order."],
          ["Lock a deposit", "Everyone puts in one round's worth up front. If someone stops paying, it covers them."],
          ["Pay each round", "One tap in your wallet. Everyone can see who has paid, with no notebook arguments."],
          ["Get the pot", "When the last payment lands, the whole pot goes to that round's member automatically."],
        ].map(([t, d], i) => (
          <motion.div key={t} className="panel" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-60px" }} transition={{ delay: i * 0.08, duration: 0.6, ease }}>
            <div className="step">Step {i + 1}</div>
            <h3>{t}</h3>
            <p>{d}</p>
          </motion.div>
        ))}
      </section>

      <section className="ask" aria-label="Ask the CircleSave assistant">
        <div>
          <h2>Ask anything about how it works</h2>
          <p className="muted">The assistant is Claude. It reads the circle straight from the contract to answer, and it can't move anyone's money. Try it on a sample circle where two members still owe this round.</p>
        </div>
        <AgentChat
          title="CircleSave assistant"
          demo
          suggestions={[
            "How does a savings circle work here?",
            "Who still needs to pay this round?",
            "What happens if someone stops paying after they got the pot?",
            "Write a friendly reminder in Swahili for anyone who hasn't paid",
          ]}
        />
      </section>
    </>
  );
}
