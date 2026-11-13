import { useEffect, useState } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { type ContractCall, type Reputation } from "../shared/chain";
import { cfg, reader } from "../lib/wallet";
import { useWallet } from "../lib/useWallet";
import { askAgent } from "../lib/agentClient";
import { Markdown } from "../components/Markdown";
import { useNames } from "../lib/names";

const FN_LABEL: Record<string, string> = { create_circle: "Started circle", join: "Joined", contribute: "Paid", payout: "Sent pot", mark_default: "Covered miss", close: "Closed" };

function Gauge({ pct }: { pct: number | null }) {
  const v = useMotionValue(0);
  const dash = useTransform(v, (x) => `${(x / 100) * 471} 471`);
  const label = useTransform(v, (x) => `${Math.round(x)}%`);
  useEffect(() => { const c = animate(v, pct ?? 0, { duration: 1.6, ease: [0.2, 0.8, 0.2, 1] }); return c.stop; }, [pct, v]);
  return (
    <svg viewBox="0 0 180 180" role="img" aria-label={pct === null ? "No payments yet" : `${pct}% on time`}>
      <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stopColor="#3CC6A4" /><stop offset="1" stopColor="#E8B04A" /></linearGradient></defs>
      <circle cx="90" cy="90" r="75" fill="none" stroke="#2c346a" strokeWidth="14" />
      <motion.circle cx="90" cy="90" r="75" fill="none" stroke="url(#g)" strokeWidth="14" strokeLinecap="round" transform="rotate(-90 90 90)" style={{ strokeDasharray: dash }} />
      <motion.text x="90" y="100" textAnchor="middle" fill="#ECEFFB" style={{ font: "800 34px Unbounded, sans-serif" }}>{pct === null ? "–" : label}</motion.text>
    </svg>
  );
}

export function MyScore() {
  const { address, connect } = useWallet();
  const [rep, setRep] = useState<Reputation | null>(null);
  const [hist, setHist] = useState<ContractCall[]>([]);
  const [report, setReport] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const names = useNames();

  useEffect(() => {
    if (!address || !cfg.contractId) return;
    reader.getReputation(address).then(setRep).catch((e) => setErr(e.message));
    reader.getHistory(address).then(setHist).catch(() => {});
  }, [address]);

  async function makeReport() {
    setBusy(true); setErr(null);
    try {
      const r = await askAgent({ mode: "lender", address: address!, names: names[address!] ? { [address!]: names[address!] } : undefined, messages: [{ role: "user", content: "Write my good-saver report for a lender." }] });
      setReport(r.reply);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  if (!address) return (
    <div className="panel empty"><h3>Connect your wallet to see your saver score</h3><p>Your score follows your wallet across every circle.</p><button className="btn" onClick={connect}>Connect wallet</button></div>
  );
  const pct = rep && rep.total ? Math.round((rep.onTime / rep.total) * 100) : null;

  return (
    <div className="score-wrap">
      <div className="panel">
        <h2>{names[address] ? `${names[address]}'s saver score` : "My saver score"}</h2>
        <div className="gauge">
          <Gauge pct={pct} />
          <div>
            <div className="num">{rep?.onTime ?? 0}<span className="muted" style={{ fontSize: 20 }}> / {rep?.total ?? 0}</span></div>
            <p>payments made on time. It's stored on-chain, so any lender you choose can check it.</p>
          </div>
        </div>
        <h3 style={{ marginTop: 24 }}>History</h3>
        {hist.length === 0 && <p className="muted" style={{ marginTop: 8 }}>Your payments will show up here, each one linked to its transaction.</p>}
        <ul className="history">
          {hist.map((h, i) => (
            <motion.li key={h.hash} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
              <span className="fn">{FN_LABEL[h.fn] ?? h.fn}</span>
              <time dateTime={h.createdAt}>{new Date(h.createdAt).toLocaleString()}{!h.successful && " (failed)"}</time>
              <a href={reader.txUrl(h.hash)} target="_blank" rel="noreferrer">Transaction</a>
            </motion.li>
          ))}
        </ul>
      </div>
      <div className="panel agent">
        <div className="agent-head">
          <div className={`orb ${busy ? "thinking" : ""}`} aria-hidden />
          <div><b>Report for a lender</b><small>Claude turns your on-chain record into a short report you can share.</small></div>
        </div>
        <button className="btn" style={{ alignSelf: "start" }} onClick={makeReport} disabled={busy}>
          {busy ? <><span className="spinner" />Reading your record</> : report ? "Write it again" : "Write my report"}
        </button>
        {err && <div className="error">{err}</div>}
        {report && (
          <motion.div className="report" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <Markdown text={report} />
            <button className="btn ghost small" style={{ marginTop: 12 }} onClick={() => { navigator.clipboard.writeText(report); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy report"}</button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
