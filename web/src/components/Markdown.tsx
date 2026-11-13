// Tiny, safe Markdown renderer (headings, bullets, bold, links) — no innerHTML.
import type { ReactNode } from "react";

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={k++}>{m[1]}</strong>);
    else out.push(<a key={k++} href={m[3]} target="_blank" rel="noreferrer">{m[2]}</a>);
    last = re.lastIndex;
  }
  out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => { if (list.length) { blocks.push(<ul key={blocks.length}>{list}</ul>); list = []; } };
  text.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (/^[-*] /.test(t)) { list.push(<li key={i}>{inline(t.slice(2))}</li>); return; }
    flush();
    if (!t) return;
    const h = /^(#{1,3}) (.*)$/.exec(t);
    if (h) blocks.push(<h4 key={i}>{inline(h[2])}</h4>);
    else blocks.push(<p key={i}>{inline(t)}</p>);
  });
  flush();
  return <div className="md">{blocks}</div>;
}
