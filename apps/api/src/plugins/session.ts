import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifySession from "@fastify/session";
import { RedisStore } from "connect-redis";
import { Redis } from "ioredis";

declare module "@fastify/session" {
  interface FastifySessionObject {
    userId?: string;
  }
}

const sessionPlugin: FastifyPluginAsync = async (fastify) => {
  const redis = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379");
  const store = new RedisStore({ client: redis as never });

  await fastify.register(fastifyCookie);
  await fastify.register(fastifySession, {
    secret: process.env["SESSION_SECRET"] ?? "fallback-dev-secret-change-in-production-32c",
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env["NODE_ENV"] === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
    store: store as never,
    saveUninitialized: false,
  });
};

export default fp(sessionPlugin, { name: "session" });
