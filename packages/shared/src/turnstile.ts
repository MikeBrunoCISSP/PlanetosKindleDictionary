import { z } from "zod";

export const turnstileConfigSchema = z.object({
  enabled: z.boolean(),
  siteKey: z.string().nullable(),
});

export const turnstileSettingsDtoSchema = z.object({
  enabled: z.boolean(),
  siteKey: z.string().nullable(),
  secretConfigured: z.boolean(),
  updatedAt: z.string().datetime().nullable(),
});

export const updateTurnstileSettingsSchema = z.object({
  enabled: z.boolean(),
  siteKey: z.string().nullable(),
  secretKey: z.string().optional(),
});

export type TurnstileConfig = z.infer<typeof turnstileConfigSchema>;
export type TurnstileSettingsDto = z.infer<typeof turnstileSettingsDtoSchema>;
export type UpdateTurnstileSettingsDto = z.infer<typeof updateTurnstileSettingsSchema>;
