import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import fastifyRateLimit from "@fastify/rate-limit";
import { Redis } from "ioredis";
import { config } from "../config.js";

const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  const redis = new Redis(config.redisUrl);

  fastify.addHook("onClose", async () => {
    await redis.quit();
  });

  await fastify.register(fastifyRateLimit, {
    global: false,
    redis: redis as never,
    keyGenerator: (request) => request.ip,
    addHeadersOnExceeding: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
    },
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
      "retry-after": true,
    },
  });
};

export const REGISTRATION_RATE_LIMIT = {
  rateLimit: { max: 5, timeWindow: "1 hour" },
} as const;

export const LOGIN_RATE_LIMIT = {
  rateLimit: { max: 10, timeWindow: "15 minutes" },
} as const;

export const FORGOT_PASSWORD_RATE_LIMIT = {
  rateLimit: { max: 5, timeWindow: "1 hour" },
} as const;

export const RESET_PASSWORD_RATE_LIMIT = {
  rateLimit: { max: 10, timeWindow: "15 minutes" },
} as const;

export const VERIFY_EMAIL_RATE_LIMIT = {
  rateLimit: { max: 10, timeWindow: "15 minutes" },
} as const;

export const RESEND_VERIFICATION_RATE_LIMIT = {
  rateLimit: { max: 5, timeWindow: "1 hour" },
} as const;

export const SEARCH_RATE_LIMIT = {
  rateLimit: { max: 60, timeWindow: "1 minute" },
} as const;

// SPEC.md's documented "60 writes/hour/user" tier (SEC-003) - keyed by the
// authenticated session's user id, not IP, so distinct users behind a
// shared IP (or one user across several IPs) are budgeted correctly. Falls
// back to IP only for the sliver of traffic where this hook runs before a
// route's own auth preHandler has had a chance to reject it.
export const WRITE_RATE_LIMIT = {
  rateLimit: {
    max: 60,
    timeWindow: "1 hour",
    keyGenerator: (request: FastifyRequest) => request.session.userId ?? request.ip,
  },
} as const;

export default fp(rateLimitPlugin, { name: "rateLimit" });
