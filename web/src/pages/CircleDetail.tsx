import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { formatAmount, type Circle } from "../shared/chain";
import { cfg, invoke, reader, sc, type TxResult } from "../lib/wallet";
import { short, useWallet } from "../lib/useWallet";
import { AgentChat } from "../components/AgentChat";
import { TxNote } from "../components/Tx";
import { Ring3D, type Seat } from "../components/Ring3D";
import { nameOf, setNames, useNames } from "../lib/names";

function countdown(s: number) {
  if (s <= 0) return "Deadline passed";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d ? `${d}d ${h}h left` : h ? `${h}h ${m}m left` : `${m}m ${s % 60}s left`;
}

export function CircleDetail() {
  const id = Number(useParams().id);
  const { address, connect } = useWallet();
  const [c, setC] = useState<Circle | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tx, setTx] = useState<TxResult | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const names = useNames();

  const load = useCallback(() => reader.getCircle(id).then((v) => { setC(v); setErr(null); }).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); const p = setInterval(load, 6000); const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000); return () => { clearInterval(p); clearInterval(t); }; }, [load]);

  async function act(label: string, method: string, args = [sc.u32(id)]) {
    if (!address) return connect();
    setBusy(label); setErr(null); setTx(null);
    try { setTx(await invoke(address, method, args)); await load(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  }

  const seats: Seat[] = useMemo(() => !c ? [] : c.members.map((m, i) => ({
    label: m === address ? `You (${nameOf(names, m)})` : nameOf(names, m),
    isMe: m === address,
    state: c.status === "Forming" ? (c.joined[i] ? "joined" : "waiting") : c.status === "Active" ? (c.paid[i] ? "paid" : "unpaid") : "paid",
  })), [c, address, names]);

  if (!c) return err ? <div className="error">{err}</div> : <p className="muted">Reading circle {id} from Testnet…</p>;

  const fmt = (v: bigint) => `${formatAmount(v, cfg.tokenDecimals)} ${cfg.tokenSymbol}`;
  const me = address ? c.members.indexOf(address) : -1;
  const allPaid = c.paid.every(Boolean);
  const late = c.status === "Active" && now > c.deadline;
  const paidN = c.paid.filter(Boolean).length;
  const joinedN = c.joined.filter(Boolean).length;

  const subtitle =
    c.status === "Forming" ? `${joinedN} of ${c.members.length} deposits in. The first round starts when everyone has joined.`
    : c.status === "Active" ? `Round ${c.round + 1} of ${c.members.length}. ${paidN} of ${c.members.length} paid. ${countdown(c.deadline - now)}.`
    : c.status === "Completed" ? "Every member has received the pot. Close the circle to return deposits."
    : "This circle is finished and all deposits have been returned.";

  const primary =
    c.status === "Forming" && me >= 0 && !c.joined[me] ? { k: "join", label: `Join and lock ${fmt(c.amount)}`, m: "join", args: [sc.u32(id), sc.addr(address!)] }
    : c.status === "Active" && me >= 0 && !c.paid[me] ? { k: "pay", label: `Pay ${fmt(c.amount)}`, m: "contribute", args: [sc.u32(id), sc.addr(address!)] }
    : c.status === "Active" && allPaid ? { k: "payout", label: `Send pot to ${me === c.round ? "me" : nameOf(names, c.members[c.round])}`, m: "payout", args: [sc.u32(id)] }
    : c.status === "Completed" ? { k: "close", label: "Close and return deposits", m: "close", args: [sc.u32(id)] }
    : null;

  return (
    <div className="detail">
      <div className="detail-main">
        <div className="panel stage">
          <div className="stage-head">
            <div><h2>Circle {c.id}</h2><p>{subtitle}</p></div>
            <span className={`status ${c.status}`}>{c.status === "Forming" ? "Gathering" : c.status}</span>
          </div>
          <Ring3D seats={seats} recipient={c.status === "Active" ? c.round : null} round={c.round} height={520} />
          <div className="stage-foot">
            <AnimatePresence mode="popLayout">
              {primary && (
                <motion.button key={primary.k} className={`btn big ${primary.k === "payout" ? "jade" : ""}`} disabled={!!busy}
                  initial={{ opacity: 0, y: 14, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }}
                  whileHover={{ y: -2 }} whileTap={{ scale: 0.96 }} onClick={() => act(primary.k, primary.m, primary.args)}>
                  {busy === primary.k ? <><span className="spinner" />Confirm in your wallet</> : primary.label}
                </motion.button>
              )}
            </AnimatePresence>
            {!address && <button className="btn big ghost" onClick={connect}>Connect wallet</button>}
          </div>
        </div>

        {err && <div className="error">{err}</div>}
        <TxNote tx={tx} />

        <div className="stats">
          <div className="kv"><small>Each round</small><b>{fmt(c.amount)}</b></div>
          <div className="kv"><small>In the pot</small><b>{fmt(c.pot)}</b></div>
          <div className="kv"><small>Full pot</small><b>{fmt(c.amount * BigInt(c.members.length))}</b></div>
          <div className="kv"><small>Gets the pot</small><b>{c.status === "Active" ? (me === c.round ? "You" : nameOf(names, c.members[c.round])) : "–"}</b></div>
        </div>

        <div className="panel tight">
          <h3>Members</h3>
          <table className="members">
            <thead><tr><th>Turn</th><th>Member</th><th>Deposit held</th><th>{c.status === "Forming" ? "Joined" : "This round"}</th></tr></thead>
            <tbody>
              {c.members.map((m, i) => {
                const done = c.status !== "Forming" && (c.status !== "Active" || i < c.round);
                const turn = c.status === "Active" && i === c.round;
                return (
                  <tr key={m} className={i === me ? "me" : ""}>
                    <td><span className={`pos ${turn ? "turn" : done ? "done" : ""}`} title={done ? "Already received the pot" : turn ? "Receives this round's pot" : undefined}>{i + 1}</span></td>
                    <td>
                      <button className="name-btn" title="Rename this member (saved in this browser)" onClick={() => { const n = window.prompt(`Name for ${short(m)}`, names[m] ?? ""); if (n !== null) setNames({ [m]: n }); }}>{nameOf(names, m)}{i === me && " (you)"}</button>
                      <a className="addr-sm" href={reader.accountUrl(m)} target="_blank" rel="noreferrer">{short(m)}</a>{c.defaults[i] > 0 && <span className="tag default">missed {c.defaults[i]}</span>}</td>
                    <td>{fmt(c.deposits[i])}</td>
                    <td>
                      {c.status === "Forming" ? <span className={`tag ${c.joined[i] ? "paid" : "unpaid"}`}>{c.joined[i] ? "Joined" : "Not yet"}</span>
                        : c.status === "Active" ? (
                          c.paid[i] ? <span className="tag paid">Paid</span>
                          : late && c.deposits[i] >= c.amount ? <button className="btn small ghost" disabled={!!busy} onClick={() => act(`def${i}`, "mark_default", [sc.u32(id), sc.addr(m)])}>{busy === `def${i}` ? "Confirm in wallet" : "Cover from deposit"}</button>
                          : <span className="tag unpaid">Not paid</span>
                        ) : "–"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="links"><a href={reader.contractUrl()} target="_blank" rel="noreferrer">See every transaction on Stellar Expert</a></div>
        </div>
      </div>
      <AgentChat circleId={id} address={address} names={Object.fromEntries(c.members.filter((m) => names[m]).map((m) => [m, names[m]]))} />
    </div>
  );
}
