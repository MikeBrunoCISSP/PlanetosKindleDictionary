import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import fastifyCors from "@fastify/cors";

const corsPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyCors, {
    origin: process.env["PUBLIC_BASE_URL"] ?? "http://localhost:5173",
    credentials: true,
  });
};

export default fp(corsPlugin, { name: "cors" });
