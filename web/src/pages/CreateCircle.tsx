import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { StrKey, scValToNative } from "@stellar/stellar-sdk";
import { parseAmount } from "../shared/chain";
import { cfg, invoke, sc } from "../lib/wallet";
import { short, useWallet } from "../lib/useWallet";
import { setNames } from "../lib/names";
import { Ring3D, type Seat } from "../components/Ring3D";

const ROUNDS = [
  { label: "5 minutes (demo)", secs: 300 },
  { label: "1 day", secs: 86400 },
  { label: "1 week", secs: 604800 },
  { label: "1 month", secs: 2592000 },
];

export function CreateCircle() {
  const { address, connect } = useWallet();
  const nav = useNavigate();
  const [amount, setAmount] = useState("10");
  const [secs, setSecs] = useState(604800);
  const [members, setMembers] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Each line: optional name, then the address. e.g. "Amina GABC…"
  const rows = members.split("\n").map((line) => {
    const m = /(G[A-Z2-7]{55})/.exec(line);
    const addr = m ? m[1] : line.trim();
    const name = m ? line.replace(m[1], "").replace(/[,:\-–]/g, " ").trim() : "";
    return { addr, name };
  }).filter((r) => r.addr);
  const list = rows.map((r) => r.addr);
  const valid = list.filter((a) => StrKey.isValidEd25519PublicKey(a));
  const amt = Number(amount) || 0;
  const seats: Seat[] = (valid.length ? rows.filter((r) => valid.includes(r.addr)) : [{ addr: "", name: "" }, { addr: "", name: "" }, { addr: "", name: "" }])
    .map((r) => ({ label: r.name || (r.addr ? short(r.addr) : "Member"), state: "waiting", isMe: r.addr === address }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    try {
      if (!address) return connect();
      const bad = list.find((a) => !StrKey.isValidEd25519PublicKey(a));
      if (bad) throw new Error(`${short(bad)} isn't a Stellar address. Addresses start with G and are 56 characters.`);
      if (list.length < 2) throw new Error("Add at least 2 members. Include yourself if you're saving too.");
      if (new Set(list).size !== list.length) throw new Error("The same address is listed twice.");
      setNames(Object.fromEntries(rows.filter((r) => r.name).map((r) => [r.addr, r.name])));
      setBusy(true);
      const tx = await invoke(address, "create_circle", [sc.addr(address), sc.addr(cfg.tokenId), sc.i128(parseAmount(amount, cfg.tokenDecimals)), sc.addrs(list), sc.u64(secs)]);
      nav(`/circle/${Number(scValToNative(tx.returnValue!))}`);
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  return (
    <div className="create">
      <form className="panel form" onSubmit={submit}>
        <div><h2>Start a circle</h2><p className="muted" style={{ marginTop: 8 }}>The rules are fixed once the circle is created. Nobody can change them later, including you.</p></div>
        <label className="field"><span>Each member pays per round</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-describedby="amt-hint" />
          <small id="amt-hint">In {cfg.tokenSymbol}. Everyone also locks this amount once as a deposit.</small>
        </label>
        <div className="field"><span>Each round lasts</span>
          <div className="seg" role="group">
            {ROUNDS.map((r) => <button type="button" key={r.secs} aria-pressed={secs === r.secs} onClick={() => setSecs(r.secs)}>{r.label}</button>)}
          </div>
        </div>
        <label className="field"><span>Members, in the order they get the pot</span>
          <textarea rows={6} value={members} onChange={(e) => setMembers(e.target.value)} placeholder={"One member per line: name, then wallet address.\nAmina GABC…  (gets the pot in round 1)\nKofi GDEF…  (round 2)"} spellCheck={false} />
        </label>
        {address && !list.includes(address) && (
          <button type="button" className="btn ghost small" style={{ alignSelf: "start" }} onClick={() => setMembers([address, ...list].join("\n"))}>Add my wallet first in line</button>
        )}
        {err && <div className="error">{err}</div>}
        <button className="btn big" disabled={busy}>{busy ? <><span className="spinner" />Confirm in your wallet</> : address ? "Create circle" : "Connect wallet to create"}</button>
      </form>
      <div className="panel preview">
        <h3>Your circle</h3>
        <Ring3D seats={seats} recipient={null} round={0} height={300} />
        <div className="sum">
          <div className="kv"><small>Pot each round</small><b>{valid.length ? amt * valid.length : "–"} {cfg.tokenSymbol}</b></div>
          <div className="kv"><small>Rounds</small><b>{valid.length || "–"}</b></div>
          <div className="kv"><small>Deposit each</small><b>{amt} {cfg.tokenSymbol}</b></div>
          <div className="kv"><small>Round length</small><b>{ROUNDS.find((r) => r.secs === secs)?.label.replace(" (demo)", "")}</b></div>
        </div>
      </div>
    </div>
  );
}
