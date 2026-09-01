import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import fastifyCors from "@fastify/cors";

const corsPlugin: FastifyPluginAsync = async (fastify) => {
  // In production the SPA is served from this same origin (see openspec
  // deployment/railway), so CORS is inert - but keep the allowed origin
  // pinned to PUBLIC_BASE_URL so it stays correct if a second origin is
  // ever introduced. Falls back to the Vite dev server for local `pnpm dev`.
  await fastify.register(fastifyCors, {
    origin: process.env["PUBLIC_BASE_URL"] ?? "http://localhost:5173",
    credentials: true,
  });
};

export default fp(corsPlugin, { name: "cors" });
