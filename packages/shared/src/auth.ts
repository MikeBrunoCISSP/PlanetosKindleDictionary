import { z } from "zod";
import { plainText } from "./validation.js";

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

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type UserDto = z.infer<typeof userDtoSchema>;
export type AdminUserDto = z.infer<typeof adminUserSchema>;
export type PendingUserDto = z.infer<typeof pendingUserDtoSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
