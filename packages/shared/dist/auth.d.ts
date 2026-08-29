import { z } from "zod";
export interface PasswordRequirement {
    id: "minLength" | "uppercase" | "lowercase" | "digit";
    label: string;
    test: (value: string) => boolean;
}
export declare const passwordRequirements: PasswordRequirement[];
export declare const passwordSchema: z.ZodEffects<z.ZodString, string, string>;
export declare const usernameSchema: z.ZodEffects<z.ZodString, string, string>;
export declare const reasonForJoiningSchema: z.ZodEffects<z.ZodString, string, string>;
export declare const registerSchema: z.ZodObject<{
    email: z.ZodString;
    username: z.ZodEffects<z.ZodString, string, string>;
    reasonForJoining: z.ZodEffects<z.ZodString, string, string>;
    password: z.ZodEffects<z.ZodString, string, string>;
    turnstileToken: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    email: string;
    username: string;
    reasonForJoining: string;
    password: string;
    turnstileToken?: string | undefined;
}, {
    email: string;
    username: string;
    reasonForJoining: string;
    password: string;
    turnstileToken?: string | undefined;
}>;
export declare const loginSchema: z.ZodObject<{
    identifier: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    password: string;
    identifier: string;
}, {
    password: string;
    identifier: string;
}>;
export declare const forgotPasswordSchema: z.ZodObject<{
    identifier: z.ZodString;
}, "strip", z.ZodTypeAny, {
    identifier: string;
}, {
    identifier: string;
}>;
export declare const resetPasswordSchema: z.ZodObject<{
    token: z.ZodString;
    password: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    password: string;
    token: string;
}, {
    password: string;
    token: string;
}>;
export declare const userDtoSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    username: z.ZodString;
    role: z.ZodEnum<["MEMBER", "ADMIN"]>;
    approvalStatus: z.ZodEnum<["PENDING", "APPROVED"]>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    username: string;
    id: string;
    role: "MEMBER" | "ADMIN";
    approvalStatus: "PENDING" | "APPROVED";
    createdAt: string;
}, {
    email: string;
    username: string;
    id: string;
    role: "MEMBER" | "ADMIN";
    approvalStatus: "PENDING" | "APPROVED";
    createdAt: string;
}>;
export declare const adminUserSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    username: z.ZodString;
    role: z.ZodEnum<["MEMBER", "ADMIN"]>;
    isActive: z.ZodBoolean;
    approvalStatus: z.ZodEnum<["PENDING", "APPROVED"]>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    username: string;
    id: string;
    role: "MEMBER" | "ADMIN";
    approvalStatus: "PENDING" | "APPROVED";
    createdAt: string;
    isActive: boolean;
}, {
    email: string;
    username: string;
    id: string;
    role: "MEMBER" | "ADMIN";
    approvalStatus: "PENDING" | "APPROVED";
    createdAt: string;
    isActive: boolean;
}>;
export declare const pendingUserDtoSchema: z.ZodObject<{
    id: z.ZodString;
    username: z.ZodString;
    email: z.ZodString;
    reasonForJoining: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    username: string;
    reasonForJoining: string | null;
    id: string;
    createdAt: string;
}, {
    email: string;
    username: string;
    reasonForJoining: string | null;
    id: string;
    createdAt: string;
}>;
export declare const updateUserSchema: z.ZodEffects<z.ZodObject<{
    isActive: z.ZodOptional<z.ZodBoolean>;
    role: z.ZodOptional<z.ZodEnum<["MEMBER", "ADMIN"]>>;
}, "strip", z.ZodTypeAny, {
    role?: "MEMBER" | "ADMIN" | undefined;
    isActive?: boolean | undefined;
}, {
    role?: "MEMBER" | "ADMIN" | undefined;
    isActive?: boolean | undefined;
}>, {
    role?: "MEMBER" | "ADMIN" | undefined;
    isActive?: boolean | undefined;
}, {
    role?: "MEMBER" | "ADMIN" | undefined;
    isActive?: boolean | undefined;
}>;
export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
export type UserDto = z.infer<typeof userDtoSchema>;
export type AdminUserDto = z.infer<typeof adminUserSchema>;
export type PendingUserDto = z.infer<typeof pendingUserDtoSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
//# sourceMappingURL=auth.d.ts.map