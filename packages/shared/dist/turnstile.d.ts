import { z } from "zod";
export declare const turnstileConfigSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    siteKey: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    siteKey: string | null;
}, {
    enabled: boolean;
    siteKey: string | null;
}>;
export declare const turnstileSettingsDtoSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    siteKey: z.ZodNullable<z.ZodString>;
    secretConfigured: z.ZodBoolean;
    updatedAt: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    siteKey: string | null;
    secretConfigured: boolean;
    updatedAt: string | null;
}, {
    enabled: boolean;
    siteKey: string | null;
    secretConfigured: boolean;
    updatedAt: string | null;
}>;
export declare const updateTurnstileSettingsSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    siteKey: z.ZodNullable<z.ZodString>;
    secretKey: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    siteKey: string | null;
    secretKey?: string | undefined;
}, {
    enabled: boolean;
    siteKey: string | null;
    secretKey?: string | undefined;
}>;
export type TurnstileConfig = z.infer<typeof turnstileConfigSchema>;
export type TurnstileSettingsDto = z.infer<typeof turnstileSettingsDtoSchema>;
export type UpdateTurnstileSettingsDto = z.infer<typeof updateTurnstileSettingsSchema>;
//# sourceMappingURL=turnstile.d.ts.map