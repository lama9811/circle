import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { askAgent, type ChatMsg } from "../lib/agentClient";
import { Markdown } from "./Markdown";

const CIRCLE_SUGGESTIONS = [
  "Who still needs to pay this round?",
  "When is my turn to get the pot?",
  "Write a friendly reminder in Swahili for anyone who hasn't paid",
  "What happens if someone stops paying?",
];

export function AgentChat({ circleId, address, suggestions = CIRCLE_SUGGESTIONS, title = "Ask about this circle", demo, names }: { demo?: boolean; names?: Record<string, string>; circleId?: number; address?: string | null; suggestions?: string[]; title?: string }) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next = [...messages, { role: "user" as const, content: text.trim() }];
    setMessages(next); setInput(""); setBusy(true); setErr(null);
    try {
      const r = await askAgent({ mode: "assistant", messages: next, circleId, demo, names, address: address ?? undefined });
      setMessages([...next, { role: "assistant", content: r.reply }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setMessages(messages); setInput(text);
    } finally { setBusy(false); }
  }

  return (
    <aside className="panel agent" aria-label="Circle assistant">
      <div className="agent-head">
        <div className={`orb ${busy ? "thinking" : ""}`} aria-hidden />
        <div><b>{title}</b><small>Claude reads the contract to answer. It can't move money.</small></div>
      </div>
      <div className="chat" aria-live="polite">
        {messages.length === 0 && (
          <div className="suggest">
            {suggestions.map((s, i) => (
              <motion.button key={s} className="chip" onClick={() => send(s)} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.06 }}>{s}</motion.button>
            ))}
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div key={i} className={`bubble ${m.role}`} initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 400, damping: 30 }}>
              {m.role === "assistant" ? <Markdown text={m.content} /> : m.content}
            </motion.div>
          ))}
          {busy && (
            <motion.div key="typing" className="bubble assistant" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <span className="typing" aria-label="Reading the circle"><i /><i /><i /></span>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={end} />
      </div>
      {err && <div className="error">{err}</div>}
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question" aria-label="Ask a question" maxLength={2000} />
        <button className="btn small" disabled={busy || !input.trim()}>Ask</button>
      </form>
    </aside>
  );
}
