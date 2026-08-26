import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { updateSeriesSchema, type UpdateSeriesDto } from "@planetos/shared";
import { apiMe, apiGetSeries, apiUpdateSeries, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/series/$slug/edit")({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.fetchQuery({
      queryKey: ["auth", "me"],
      queryFn: apiMe,
      staleTime: 30 * 1000,
    });
    if (!user) throw redirect({ to: "/login" });
    if (user.role !== "ADMIN") throw redirect({ to: "/" });
  },
  component: SeriesEditPage,
});

function SeriesEditPage() {
  const { slug } = Route.useParams();

  return (
    <div className="p-4 sm:p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Edit Dictionary</h1>
      <EditSeriesForm slug={slug} />
    </div>
  );
}

function EditSeriesForm({ slug }: { slug: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [apiError, setApiError] = useState<string | null>(null);

  const { data: series, isLoading, error } = useQuery({
    queryKey: ["series", slug],
    queryFn: () => apiGetSeries(slug),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdateSeriesDto>({
    resolver: zodResolver(updateSeriesSchema),
  });

  useEffect(() => {
    if (series) {
      reset({
        title: series.title,
        description: series.description ?? undefined,
      });
    }
  }, [series, reset]);

  const mutation = useMutation({
    mutationFn: (data: UpdateSeriesDto) => apiUpdateSeries(slug, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["series", "list"] });
      await queryClient.invalidateQueries({ queryKey: ["series", slug] });
      await navigate({ to: "/" });
    },
    onError: (err) => {
      setApiError(err instanceof ApiError ? err.message : "An error occurred");
    },
  });

  if (isLoading) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  if (error || !series) {
    return (
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">Dictionary not found</h2>
        <p className="text-muted-foreground">The dictionary "{slug}" does not exist.</p>
      </div>
    );
  }

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
        {mutation.isPending ? "Saving..." : "Save Changes"}
      </Button>
    </form>
  );
}
