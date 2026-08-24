import { z } from "zod";
export const passwordSchema = z
    .string()
    .min(8, "Password must be at least 8 characters")
    .superRefine((val, ctx) => {
    if (!/[A-Z]/.test(val)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Password must contain at least one uppercase letter (A–Z)",
        });
    }
    if (!/[a-z]/.test(val)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Password must contain at least one lowercase letter (a–z)",
        });
    }
    if (!/[0-9]/.test(val)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Password must contain at least one digit (0–9)",
        });
    }
});
export const registerSchema = z.object({
    email: z.string().email("Must be a valid email address"),
    displayName: z
        .string()
        .min(1, "Display name is required")
        .max(50, "Display name must be 50 characters or fewer"),
    password: passwordSchema,
});
export const loginSchema = z.object({
    email: z.string().email("Must be a valid email address"),
    password: z.string().min(1, "Password is required"),
});
export const userDtoSchema = z.object({
    id: z.string(),
    email: z.string().email(),
    displayName: z.string(),
    role: z.enum(["MEMBER", "ADMIN"]),
    createdAt: z.string().datetime(),
});
export const adminUserSchema = z.object({
    id: z.string(),
    email: z.string().email(),
    displayName: z.string(),
    role: z.enum(["MEMBER", "ADMIN"]),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
});
export const updateUserSchema = z
    .object({
    isActive: z.boolean(),
    role: z.enum(["MEMBER", "ADMIN"]),
})
    .partial()
    .refine((v) => v.isActive !== undefined || v.role !== undefined, {
    message: "At least one of isActive or role must be provided",
});
//# sourceMappingURL=auth.js.map