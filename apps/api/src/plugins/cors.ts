import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import fastifyCors from "@fastify/cors";
import { config } from "../config.js";

const corsPlugin: FastifyPluginAsync = async (fastify) => {
  // In production the SPA is served from this same origin (see openspec
  // deployment/railway), so CORS is inert - but keep the allowed origin
  // pinned to the public base URL so it stays correct if a second origin
  // is ever introduced.
  await fastify.register(fastifyCors, {
    origin: config.publicBaseUrl,
    credentials: true,
  });
};

export default fp(corsPlugin, { name: "cors" });
