import type { FastifyPluginAsync } from "fastify";
import { PrismaClient } from "@prisma/client";
import { updateTurnstileSettingsSchema, type TurnstileConfig, type TurnstileSettingsDto } from "@planetos/shared";
import { makeRequireAdmin } from "../plugins/requireAdmin.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { isSecretKeyRecognized } from "../lib/turnstile.js";

const TURNSTILE_SETTINGS_ID = "singleton";

function toConfigDto(settings: { enabled: boolean; siteKey: string | null } | null): TurnstileConfig {
  if (!settings || !settings.enabled) {
    return { enabled: false, siteKey: null };
  }
  return { enabled: true, siteKey: settings.siteKey };
}

function toSettingsDto(settings: {
  enabled: boolean;
  siteKey: string | null;
  secretKeyEncrypted: string | null;
  updatedAt: Date;
} | null): TurnstileSettingsDto {
  if (!settings) {
    return { enabled: false, siteKey: null, secretConfigured: false, updatedAt: null };
  }
  return {
    enabled: settings.enabled,
    siteKey: settings.siteKey,
    secretConfigured: Boolean(settings.secretKeyEncrypted),
    updatedAt: settings.updatedAt.toISOString(),
  };
}

const turnstileRoutes: FastifyPluginAsync<{ prisma: PrismaClient }> = async (fastify, opts) => {
  const { prisma } = opts;
  const requireAdmin = makeRequireAdmin(prisma);

  fastify.get("/api/turnstile/config", async (_request, reply) => {
    const settings = await prisma.turnstileSettings.findUnique({
      where: { id: TURNSTILE_SETTINGS_ID },
      select: { enabled: true, siteKey: true },
    });
    return reply.status(200).send(toConfigDto(settings));
  });

  fastify.get(
    "/api/admin/turnstile",
    { preHandler: requireAdmin },
    async (_request, reply) => {
      const settings = await prisma.turnstileSettings.findUnique({
        where: { id: TURNSTILE_SETTINGS_ID },
        select: { enabled: true, siteKey: true, secretKeyEncrypted: true, updatedAt: true },
      });
      return reply.status(200).send(toSettingsDto(settings));
    }
  );

  fastify.patch(
    "/api/admin/turnstile",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const body = updateTurnstileSettingsSchema.parse(request.body);
      const adminId = request.adminUser!.id;

      const data: {
        enabled: boolean;
        siteKey: string | null;
        updatedById: string;
        secretKeyEncrypted?: string;
      } = {
        enabled: body.enabled,
        siteKey: body.siteKey,
        updatedById: adminId,
      };
      if (body.secretKey) {
        data.secretKeyEncrypted = encrypt(body.secretKey);
      }

      const updated = await prisma.turnstileSettings.upsert({
        where: { id: TURNSTILE_SETTINGS_ID },
        create: { id: TURNSTILE_SETTINGS_ID, ...data },
        update: data,
        select: { enabled: true, siteKey: true, secretKeyEncrypted: true, updatedAt: true },
      });

      return reply.status(200).send(toSettingsDto(updated));
    }
  );

  fastify.post(
    "/api/admin/turnstile/test",
    { preHandler: requireAdmin },
    async (_request, reply) => {
      const settings = await prisma.turnstileSettings.findUnique({
        where: { id: TURNSTILE_SETTINGS_ID },
        select: { secretKeyEncrypted: true },
      });

      if (!settings?.secretKeyEncrypted) {
        return reply.status(200).send({ success: false });
      }

      const secretKey = decrypt(settings.secretKeyEncrypted);
      const success = await isSecretKeyRecognized(secretKey);
      return reply.status(200).send({ success });
    }
  );
};

export default turnstileRoutes;
