import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifySession from "@fastify/session";
import { RedisStore } from "connect-redis";
import { Redis } from "ioredis";
import { config } from "../config.js";

declare module "@fastify/session" {
  interface FastifySessionObject {
    userId?: string;
  }
}

const sessionPlugin: FastifyPluginAsync = async (fastify) => {
  const redis = new Redis(config.redisUrl);
  const store = new RedisStore({ client: redis as never });

  await fastify.register(fastifyCookie);
  await fastify.register(fastifySession, {
    secret: config.sessionSecret,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.isProduction,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
    store: store as never,
    saveUninitialized: false,
  });
};

export default fp(sessionPlugin, { name: "session" });
