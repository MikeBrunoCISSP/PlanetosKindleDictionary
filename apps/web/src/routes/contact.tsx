import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { contactMessageSchema } from "@planetos/shared";
import { useQuery } from "@tanstack/react-query";
import { Turnstile } from "@marsidev/react-turnstile";
import { apiGetTurnstileConfig, apiSubmitContactMessage } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

type ContactFormValues = z.infer<typeof contactMessageSchema>;

export const Route = createFileRoute("/contact")({
  component: ContactPage,
});

function ContactPage() {
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>(undefined);
  const [submitted, setSubmitted] = useState(false);

  const { data: turnstileConfig } = useQuery({
    queryKey: ["turnstile-config"],
    queryFn: apiGetTurnstileConfig,
  });

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactMessageSchema),
    defaultValues: { name: "", email: "", subject: "", message: "" },
  });

  const message = form.watch("message");
  const turnstileRequired = turnstileConfig?.enabled === true;

  const onSubmit = async (values: ContactFormValues) => {
    if (turnstileRequired && !turnstileToken) {
      form.setError("root", { message: "Please complete the verification challenge." });
      return;
    }

    try {
      await apiSubmitContactMessage({ ...values, turnstileToken });
      setSubmitted(true);
    } catch {
      form.setError("root", { message: "Something went wrong. Please try again." });
    }
  };

  if (submitted) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Card>
            <CardHeader>
              <CardTitle>Message Sent</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-sm">Thanks for reaching out — we'll get back to you as soon as we can.</p>
              <Link to="/" className="text-sm underline underline-offset-2 hover:no-underline">
                Back to Home
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Contact Us</CardTitle>
            <CardDescription>Have a question or feedback? Send us a message.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="grid gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input autoComplete="name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subject</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Message</FormLabel>
                      <FormControl>
                        <Textarea maxLength={3000} rows={6} {...field} />
                      </FormControl>
                      <div className="text-muted-foreground text-right text-xs">
                        {message.length}/3000
                      </div>
                      <FormMessage />
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
                  {form.formState.isSubmitting ? "Sending…" : "Send Message"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
