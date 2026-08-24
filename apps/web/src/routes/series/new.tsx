import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSeriesSchema, type CreateSeriesDto } from "@planetos/shared";
import { apiMe, apiCreateSeries, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useState } from "react";

export const Route = createFileRoute("/series/new")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.fetchQuery({
      queryKey: ["auth", "me"],
      queryFn: apiMe,
      staleTime: 30 * 1000,
    });
    if (!user) throw redirect({ to: "/login" });
    if (user.role !== "ADMIN") return { forbidden: true as const };
    return { forbidden: false as const };
  },
  component: SeriesNewPage,
});

function SeriesNewPage() {
  const { forbidden } = Route.useRouteContext();
  if (forbidden) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">403 Forbidden</h1>
          <p className="text-muted-foreground">You do not have permission to access this page.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="p-8 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Create Dictionary</h1>
      <CreateSeriesForm />
    </div>
  );
}

function CreateSeriesForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateSeriesDto>({
    resolver: zodResolver(createSeriesSchema),
  });

  const mutation = useMutation({
    mutationFn: apiCreateSeries,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["series", "list"] });
      await navigate({ to: "/" });
    },
    onError: (err) => {
      setApiError(err instanceof ApiError ? err.message : "An error occurred");
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => {
        setApiError(null);
        mutation.mutate(data);
      })}
      className="space-y-4"
    >
      <div className="space-y-1">
        <Label htmlFor="title">Name</Label>
        <Input id="title" {...register("title")} placeholder="Dictionary name" />
        {errors.title && (
          <p className="text-sm text-destructive">{errors.title.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" {...register("description")} placeholder="Describe this dictionary" rows={4} />
        {errors.description && (
          <p className="text-sm text-destructive">{errors.description.message}</p>
        )}
      </div>

      {apiError && <p className="text-sm text-destructive">{apiError}</p>}

      <Button type="submit" disabled={isSubmitting || mutation.isPending}>
        {mutation.isPending ? "Creating..." : "Create Dictionary"}
      </Button>
    </form>
  );
}
