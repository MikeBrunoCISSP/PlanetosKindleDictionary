import fp from "fastify-plugin";
import type { FastifyPluginAsync, FastifyError } from "fastify";
import { ZodError } from "zod";
import { DomainError } from "../lib/errors.js";

function isFastifyError(e: unknown): e is FastifyError {
  return typeof e === "object" && e !== null && "statusCode" in e;
}

const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error, _request, reply) => {
    fastify.log.error(error);

    if (error instanceof ZodError) {
      return reply.status(400).header("content-type", "application/problem+json").send({
        type: "about:blank",
        title: "Validation Error",
        status: 400,
        detail: "One or more fields failed validation.",
        errors: error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      });
    }

    if (error instanceof DomainError) {
      return reply
        .status(error.statusCode)
        .header("content-type", "application/problem+json")
        .send({
          type: `urn:planetos:error:${error.code.toLowerCase().replace(/_/g, "-")}`,
          title: error.message,
          status: error.statusCode,
          detail: error.message,
        });
    }

    if (isFastifyError(error) && error.statusCode === 429) {
      return reply.status(429).header("content-type", "application/problem+json").send({
        type: "about:blank",
        title: "Too Many Requests",
        status: 429,
        detail: "Rate limit exceeded. Please try again later.",
      });
    }

    const status = isFastifyError(error) ? (error.statusCode ?? 500) : 500;
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return reply.status(status).header("content-type", "application/problem+json").send({
      type: "about:blank",
      title: status === 500 ? "Internal Server Error" : message,
      status,
    });
  });
};

export default fp(errorHandlerPlugin, { name: "errorHandler" });
