import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import fastifyHelmet from "@fastify/helmet";

const securityPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyHelmet, {
    // This API only ever returns JSON, never HTML - the web app (a
    // separately-deployed SPA) owns its own CSP via a <meta> tag. A CSP
    // header here would have no document to protect and risks being
    // reintroduced by accident, so it stays explicitly off.
    contentSecurityPolicy: false,
  });
};

export default fp(securityPlugin, { name: "security" });
