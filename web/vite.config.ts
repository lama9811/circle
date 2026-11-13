import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

// In `npm run dev`, serve /api/agent from the same handler Vercel uses in production.
function agentApi(): Plugin {
  return {
    name: "circlesave-agent-api",
    configureServer(server) {
      server.middlewares.use("/api/agent", async (req, res) => {
        const mod = await server.ssrLoadModule("/server/handler.ts");
        await mod.handleAgent(req, res);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Expose .env values (including non-VITE_ ones like ANTHROPIC_API_KEY) to the
  // dev server process only. Only VITE_* vars ever reach the browser bundle.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return { plugins: [react(), agentApi()] };
});
