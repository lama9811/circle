// Node HTTP handler for POST /api/agent, shared by the Vercel function and the
// Vite dev-server middleware. The Anthropic API key stays on the server.
import type { IncomingMessage, ServerResponse } from "node:http";
import Anthropic from "@anthropic-ai/sdk";
import { makeConfig } from "../src/shared/config";
import { AgentRequestSchema, runAgent } from "./agent";

const MAX_BODY = 64 * 1024;

async function readBody(req: IncomingMessage & { body?: unknown }): Promise<unknown> {
  if (req.body !== undefined) {
    return typeof req.body === "string" ? JSON.parse(req.body) : req.body; // Vercel pre-parses
  }
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error("Request too large");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export async function handleAgent(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") return send(res, 405, { error: "Use POST" });

  let parsed;
  try {
    parsed = AgentRequestSchema.safeParse(await readBody(req));
  } catch {
    return send(res, 400, { error: "Invalid JSON body" });
  }
  if (!parsed.success) return send(res, 400, { error: parsed.error.issues[0]?.message ?? "Invalid request" });

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return send(res, 503, { error: "The assistant isn't set up yet: add ANTHROPIC_API_KEY to web/.env and restart the app." });
  }

  try {
    const out = await runAgent(parsed.data, makeConfig(process.env));
    return send(res, 200, out);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return send(res, 500, { error: "The AI service is not configured (check ANTHROPIC_API_KEY on the server)." });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return send(res, 429, { error: "The assistant is busy. Please try again in a moment." });
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error", err.status, err.message);
      return send(res, 502, { error: "The AI service returned an error. Please try again." });
    }
    console.error("agent error", err);
    return send(res, 500, { error: err instanceof Error ? err.message : "Agent failed" });
  }
}
