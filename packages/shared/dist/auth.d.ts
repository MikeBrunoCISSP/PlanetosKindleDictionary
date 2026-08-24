import { z } from "zod";
export declare const passwordSchema: z.ZodEffects<z.ZodString, string, string>;
export declare const registerSchema: z.ZodObject<{
    email: z.ZodString;
    displayName: z.ZodString;
    password: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    email: string;
    displayName: string;
    password: string;
}, {
    email: string;
    displayName: string;
    password: string;
}>;
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export declare const userDtoSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    displayName: z.ZodString;
    role: z.ZodEnum<["MEMBER", "ADMIN"]>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    displayName: string;
    id: string;
    role: "MEMBER" | "ADMIN";
    createdAt: string;
}, {
    email: string;
    displayName: string;
    id: string;
    role: "MEMBER" | "ADMIN";
    createdAt: string;
}>;
export declare const adminUserSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    displayName: z.ZodString;
    role: z.ZodEnum<["MEMBER", "ADMIN"]>;
    isActive: z.ZodBoolean;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    displayName: string;
    id: string;
    role: "MEMBER" | "ADMIN";
    createdAt: string;
    isActive: boolean;
}, {
    email: string;
    displayName: string;
    id: string;
    role: "MEMBER" | "ADMIN";
    createdAt: string;
    isActive: boolean;
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
export type UserDto = z.infer<typeof userDtoSchema>;
export type AdminUserDto = z.infer<typeof adminUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
//# sourceMappingURL=auth.d.ts.map