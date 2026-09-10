import { z } from "zod";
import { plainText } from "./validation.js";

export const blockedEmailDtoSchema = z.object({
  id: z.string(),
  email: z.string(),
  reason: z.string().nullable(),
  blockedAt: z.string().datetime(),
  blockedById: z.string().nullable(),
});

export const createBlockedEmailSchema = z.object({
  email: z.string().email("Must be a valid email address"),
  reason: plainText({ max: 500, minMessage: "Reason is required" }).optional(),
});

export const denyRegistrationSchema = z.object({
  block: z.boolean().default(false),
});

export type BlockedEmailDto = z.infer<typeof blockedEmailDtoSchema>;
export type CreateBlockedEmailDto = z.infer<typeof createBlockedEmailSchema>;
export type DenyRegistrationDto = z.infer<typeof denyRegistrationSchema>;
