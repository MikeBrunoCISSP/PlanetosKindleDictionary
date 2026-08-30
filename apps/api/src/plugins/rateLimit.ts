import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import fastifyRateLimit from "@fastify/rate-limit";
import { Redis } from "ioredis";

const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  const redis = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379");

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

export default fp(rateLimitPlugin, { name: "rateLimit" });
