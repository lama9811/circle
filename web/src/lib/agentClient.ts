export interface ChatMsg { role: "user" | "assistant"; content: string }

export async function askAgent(body: {
  mode: "assistant" | "lender";
  messages: ChatMsg[];
  circleId?: number;
  demo?: boolean;
  names?: Record<string, string>;
  address?: string;
}): Promise<{ reply: string; toolsUsed: string[] }> {
  const r = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Agent error ${r.status}`);
  return data;
}
