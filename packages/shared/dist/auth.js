import { z } from "zod";
import { plainText } from "./validation.js";
export const passwordRequirements = [
    { id: "minLength", label: "Password must be at least 8 characters", test: (v) => v.length >= 8 },
    {
        id: "uppercase",
        label: "Password must contain at least one uppercase letter (A–Z)",
        test: (v) => /[A-Z]/.test(v),
    },
    {
        id: "lowercase",
        label: "Password must contain at least one lowercase letter (a–z)",
        test: (v) => /[a-z]/.test(v),
    },
    { id: "digit", label: "Password must contain at least one digit (0–9)", test: (v) => /[0-9]/.test(v) },
];
export const passwordSchema = z.string().superRefine((val, ctx) => {
    for (const requirement of passwordRequirements) {
        if (!requirement.test(val)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: requirement.label });
        }
    }
});
export const usernameSchema = plainText({ max: 50, minMessage: "Username is required" });
export const reasonForJoiningSchema = plainText({
    max: 2000,
    minMessage: "Please tell us why you'd like to join",
});
export const registerSchema = z.object({
    email: z.string().email("Must be a valid email address"),
    username: usernameSchema,
    reasonForJoining: reasonForJoiningSchema,
    password: passwordSchema,
    turnstileToken: z.string().optional(),
});
export const loginSchema = z.object({
    identifier: z.string().min(1, "Username or email is required"),
    password: z.string().min(1, "Password is required"),
});
export const forgotPasswordSchema = z.object({
    identifier: z.string().min(1, "Username or email is required"),
});
export const resetPasswordSchema = z.object({
    token: z.string().min(1, "Reset token is required"),
    password: passwordSchema,
});
export const userDtoSchema = z.object({
    id: z.string(),
    email: z.string().email(),
    username: z.string(),
    role: z.enum(["MEMBER", "ADMIN"]),
    approvalStatus: z.enum(["PENDING", "APPROVED"]),
    createdAt: z.string().datetime(),
});
export const adminUserSchema = z.object({
    id: z.string(),
    email: z.string().email(),
    username: z.string(),
    role: z.enum(["MEMBER", "ADMIN"]),
    isActive: z.boolean(),
    approvalStatus: z.enum(["PENDING", "APPROVED"]),
    createdAt: z.string().datetime(),
});
export const pendingUserDtoSchema = z.object({
    id: z.string(),
    username: z.string(),
    email: z.string().email(),
    reasonForJoining: z.string().nullable(),
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