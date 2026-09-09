import type { FastifyPluginAsync } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { contactMessageSchema } from "@planetos/shared";
import { CONTACT_RATE_LIMIT } from "../plugins/rateLimit.js";
import { requireTurnstileIfEnabled } from "../lib/turnstile.js";
import { createContactMessage } from "../lib/contactMessages.js";
import { getEmailQueue } from "../lib/queues.js";
import { EMAIL_JOB_RETRY_OPTIONS } from "../lib/outbox.js";

const contactRoutes: FastifyPluginAsync<{ prisma: PrismaClient }> = async (fastify, opts) => {
  const { prisma } = opts;

  fastify.post("/api/contact", { config: CONTACT_RATE_LIMIT }, async (request, reply) => {
    const body = contactMessageSchema.parse(request.body);

    await requireTurnstileIfEnabled(prisma, body.turnstileToken, request.ip);

    const { id } = await createContactMessage(prisma, {
      name: body.name,
      email: body.email,
      subject: body.subject,
      message: body.message,
    });

    // Best-effort: a stray enqueue failure isn't fatal - the hourly
    // reconciliation sweep (worker.ts's reconcilePendingEmails) picks up any
    // ContactMessage row still PENDING after 5 minutes.
    try {
      await getEmailQueue().add(
        "send-contact-message",
        { contactMessageId: id },
        { ...EMAIL_JOB_RETRY_OPTIONS, deduplication: { id, keepLastIfActive: true } }
      );
    } catch (err) {
      request.log.error(err, "Failed to enqueue contact-message email job");
    }

    return reply.status(201).send({ id });
  });
};

export default contactRoutes;
