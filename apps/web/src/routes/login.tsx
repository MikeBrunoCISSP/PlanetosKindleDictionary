import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { loginSchema, registerSchema, forgotPasswordSchema, passwordRequirements } from "@planetos/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckIcon, CircleIcon } from "lucide-react";
import { Turnstile } from "@marsidev/react-turnstile";
import { cn } from "@/lib/utils";
import { apiGetTurnstileConfig, apiLogin, apiRegister, apiForgotPassword, ApiError } from "@/lib/api";
import { useMe, ME_QUERY_KEY } from "@/lib/useMe";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const registerFormSchema = registerSchema
  .extend({ confirmPassword: z.string() })
  .superRefine(({ password, confirmPassword }, ctx) => {
    if (confirmPassword !== password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords do not match",
        path: ["confirmPassword"],
      });
    }
  });

type RegisterFormValues = z.infer<typeof registerFormSchema>;
type LoginFormValues = z.infer<typeof loginSchema>;
type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

type Mode = "login" | "register" | "forgot-password";

const loginSearchSchema = z.object({
  mode: z.enum(["login", "register", "forgot-password"]).optional().default("login"),
});

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { mode } = Route.useSearch();
  const me = useMe();

  useEffect(() => {
    if (me) void navigate({ to: "/" });
  }, [me, navigate]);

  if (me) return null;

  const handleTabChange = (value: string) => {
    void navigate({ to: "/login", search: { mode: value as Mode }, replace: true });
  };

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">eReader Dictionaries</h1>
        </div>
        {mode === "forgot-password" ? (
          <ForgotPasswordForm />
        ) : (
          <Tabs value={mode} onValueChange={handleTabChange}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Sign In</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <SignInForm />
            </TabsContent>
            <TabsContent value="register">
              <RegisterForm />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

function SignInForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  });

  const onSubmit = async (values: LoginFormValues) => {
    try {
      const user = await apiLogin(values);
      queryClient.setQueryData(ME_QUERY_KEY, user);
      void navigate({ to: "/" });
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 401
          ? "Invalid username/email or password"
          : "Something went wrong. Please try again.";
      form.setError("root", { message });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign In</CardTitle>
        <CardDescription>Enter your username or email and password to sign in.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="identifier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username or Email</FormLabel>
                  <FormControl>
                    <Input autoComplete="username" placeholder="you@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Link
              to="/login"
              search={{ mode: "forgot-password" }}
              className="text-muted-foreground -mt-2 text-sm underline underline-offset-2 hover:no-underline"
            >
              Forgot Password?
            </Link>
            {form.formState.errors.root && (
              <p className="text-destructive text-sm">{form.formState.errors.root.message}</p>
            )}
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Signing in…" : "Sign In"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function ForgotPasswordForm() {
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { identifier: "" },
  });

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    try {
      await apiForgotPassword(values);
    } catch {
      // Deliberately ignored: the confirmation message must appear
      // identically regardless of whether the request succeeded, matching
      // the backend's own no-enumeration contract.
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm">
            If an account registered with that username or email address was found, an email with
            instructions to reset your password has been sent.
          </p>
          <Link to="/login" search={{ mode: "login" }} className="text-sm underline underline-offset-2 hover:no-underline">
            Back to Sign In
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Forgot Password</CardTitle>
        <CardDescription>Enter your username or email and we'll send you a reset link.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="identifier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username or Email</FormLabel>
                  <FormControl>
                    <Input autoComplete="username" placeholder="you@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Sending…" : "Send Reset Link"}
            </Button>
            <Link to="/login" search={{ mode: "login" }} className="text-center text-sm underline underline-offset-2 hover:no-underline">
              Back to Sign In
            </Link>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function RegisterForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>(undefined);

  const { data: turnstileConfig } = useQuery({
    queryKey: ["turnstile-config"],
    queryFn: apiGetTurnstileConfig,
  });

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { email: "", username: "", reasonForJoining: "", password: "", confirmPassword: "" },
  });

  const password = useWatch({ control: form.control, name: "password" });
  const confirmPassword = useWatch({ control: form.control, name: "confirmPassword" });
  const passwordMismatch = confirmPassword.length > 0 && confirmPassword !== password;

  const turnstileRequired = turnstileConfig?.enabled === true;

  const onSubmit = async (values: RegisterFormValues) => {
    if (turnstileRequired && !turnstileToken) {
      form.setError("root", { message: "Please complete the verification challenge." });
      return;
    }

    try {
      const { confirmPassword: _, ...registerData } = values;
      const user = await apiRegister({ ...registerData, turnstileToken });
      queryClient.setQueryData(ME_QUERY_KEY, user);
      toast.success("Your registration request has been submitted and is awaiting administrator approval.");
      void navigate({ to: "/" });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const detail = err.detail ?? err.message;
        if (/email/i.test(detail)) {
          form.setError("email", { message: "This email address is already registered." });
        } else if (/username/i.test(detail)) {
          form.setError("username", { message: "This username is already taken." });
        } else {
          form.setError("root", { message: detail });
        }
      } else if (err instanceof ApiError && err.status === 400 && /verif/i.test(err.detail ?? err.message)) {
        form.setError("root", { message: "Verification failed. Please try again." });
      } else {
        form.setError("root", { message: "Something went wrong. Please try again." });
      }
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Account</CardTitle>
        <CardDescription>Fill in your details to register.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" autoComplete="email" placeholder="you@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input autoComplete="username" placeholder="Make it unique & creative!" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="reasonForJoining"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Why are you requesting to join?</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Tell us a bit about why you'd like to join…"
                      maxLength={2000}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <ul className="grid gap-1">
                    {passwordRequirements.map((requirement) => {
                      const satisfied = requirement.test(password);
                      return (
                        <li
                          key={requirement.id}
                          className={cn(
                            "flex items-center gap-1.5 text-sm",
                            satisfied ? "text-green-600" : "text-muted-foreground"
                          )}
                        >
                          {satisfied ? (
                            <CheckIcon className="size-3.5 shrink-0" />
                          ) : (
                            <CircleIcon className="size-3.5 shrink-0" />
                          )}
                          {requirement.label}
                        </li>
                      );
                    })}
                  </ul>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  {passwordMismatch && <p className="text-destructive text-sm">Passwords do not match</p>}
                </FormItem>
              )}
            />
            {turnstileRequired && turnstileConfig?.siteKey && (
              <Turnstile
                siteKey={turnstileConfig.siteKey}
                onSuccess={setTurnstileToken}
                onExpire={() => setTurnstileToken(undefined)}
                onError={() => setTurnstileToken(undefined)}
              />
            )}
            {form.formState.errors.root && (
              <p className="text-destructive text-sm">{form.formState.errors.root.message}</p>
            )}
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Creating account…" : "Create Account"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
