// Vercel serverless function: POST /api/agent
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleAgent } from "../server/handler";

export const config = { maxDuration: 60 };

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleAgent(req, res);
}
