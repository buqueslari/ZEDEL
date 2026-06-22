import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleFormConfigRequest, handleSubmitRequest } from "./lib/api-handlers";

function apiDevPlugin(env: Record<string, string>): Plugin {
  return {
    name: "central-de-dados-api-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || "";
        if (!url.startsWith("/api/")) return next();

        try {
          if (url.startsWith("/api/submit") && req.method === "POST") {
            await handleSubmitRequest(req as IncomingMessage, res as ServerResponse, env);
            return;
          }
          if (url.startsWith("/api/form-config") && req.method === "GET") {
            await handleFormConfigRequest(res as ServerResponse, env);
            return;
          }
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "Rota nao encontrada." }));
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno." }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), apiDevPlugin(env)],
    server: {
      port: 5173,
    },
  };
});
