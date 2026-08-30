import type {
  AdminUserDto,
  CreateEntryDto,
  CreateSeriesDto,
  EntryDto,
  EntryEditProposalDto,
  EntrySummaryDto,
  ForgotPasswordDto,
  LoginDto,
  PendingQueueItemDto,
  PendingUserDto,
  PublicEntryDto,
  RegisterDto,
  RejectEntryDto,
  ResendVerificationDto,
  ResetPasswordDto,
  SearchResultsDto,
  SeriesDto,
  SeriesListItemDto,
  SubmitEntryEditProposalDto,
  TurnstileConfig,
  TurnstileSettingsDto,
  UpdateSeriesDto,
  UpdateTurnstileSettingsDto,
  UpdateUserDto,
  UserDto,
} from "@planetos/shared";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly type: string,
    message: string,
    public readonly detail?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("problem+json") || contentType.includes("application/json")) {
    const problem = (await res.json()) as {
      type?: string;
      title?: string;
      detail?: string;
    };
    throw new ApiError(
      res.status,
      problem.type ?? "about:blank",
      problem.title ?? res.statusText,
      problem.detail
    );
  }

  throw new ApiError(res.status, "about:blank", res.statusText);
}

export async function apiRegister(data: RegisterDto): Promise<UserDto> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  });
  return handleResponse<UserDto>(res);
}

export async function apiLogin(data: LoginDto): Promise<UserDto> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  });
  return handleResponse<UserDto>(res);
}

export async function apiLogout(): Promise<void> {
  const res = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  return handleResponse<void>(res);
}

export async function apiForgotPassword(data: ForgotPasswordDto): Promise<void> {
  const res = await fetch("/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  });
  return handleResponse<void>(res);
}

export async function apiResetPassword(data: ResetPasswordDto): Promise<void> {
  const res = await fetch("/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  });
  return handleResponse<void>(res);
}

export async function apiVerifyEmail(data: { token: string }): Promise<void> {
  const res = await fetch("/api/auth/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  });
  return handleResponse<void>(res);
}

export async function apiResendVerification(data: ResendVerificationDto): Promise<void> {
  const res = await fetch("/api/auth/resend-verification", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  });
  return handleResponse<void>(res);
}

export async function apiMe(): Promise<UserDto | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401) return null;
  return handleResponse<UserDto>(res);
}

export async function apiAdminGetUsers(page = 1): Promise<AdminUserDto[]> {
  const res = await fetch(`/api/admin/users?page=${page}`, { credentials: "include" });
  return handleResponse<AdminUserDto[]>(res);
}

export async function apiAdminUpdateUser(id: string, patch: UpdateUserDto): Promise<AdminUserDto> {
  const res = await fetch(`/api/admin/users/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
    credentials: "include",
  });
  return handleResponse<AdminUserDto>(res);
}

export async function apiGetPendingUsers(): Promise<PendingUserDto[]> {
  const res = await fetch("/api/admin/users/pending", { credentials: "include" });
  return handleResponse<PendingUserDto[]>(res);
}

export async function apiApproveRegistration(id: string): Promise<AdminUserDto> {
  const res = await fetch(`/api/admin/users/${id}/approve`, {
    method: "POST",
    credentials: "include",
  });
  return handleResponse<AdminUserDto>(res);
}

export async function apiDenyRegistration(id: string): Promise<void> {
  const res = await fetch(`/api/admin/users/${id}/deny`, {
    method: "POST",
    credentials: "include",
  });
  return handleResponse<void>(res);
}

export async function apiGetTurnstileConfig(): Promise<TurnstileConfig> {
  const res = await fetch("/api/turnstile/config", { credentials: "include" });
  return handleResponse<TurnstileConfig>(res);
}

export async function apiGetTurnstileSettings(): Promise<TurnstileSettingsDto> {
  const res = await fetch("/api/admin/turnstile", { credentials: "include" });
  return handleResponse<TurnstileSettingsDto>(res);
}

export async function apiUpdateTurnstileSettings(
  data: UpdateTurnstileSettingsDto
): Promise<TurnstileSettingsDto> {
  const res = await fetch("/api/admin/turnstile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  });
  return handleResponse<TurnstileSettingsDto>(res);
}

export async function apiTestTurnstileConfig(): Promise<{ success: boolean }> {
  const res = await fetch("/api/admin/turnstile/test", {
    method: "POST",
    credentials: "include",
  });
  return handleResponse<{ success: boolean }>(res);
}

export async function apiSearchEntries(q: string, page = 1): Promise<SearchResultsDto> {
  const params = new URLSearchParams({ q, page: String(page) });
  const res = await fetch(`/api/search?${params.toString()}`, { credentials: "include" });
  return handleResponse<SearchResultsDto>(res);
}

export async function apiGetSeriesList(page = 1): Promise<SeriesListItemDto[]> {
  const res = await fetch(`/api/series?page=${page}`, { credentials: "include" });
  return handleResponse<SeriesListItemDto[]>(res);
}

export async function apiGetDownloads(): Promise<{ slug: string; title: string }[]> {
  const res = await fetch("/api/downloads", { credentials: "include" });
  return handleResponse<{ slug: string; title: string }[]>(res);
}

export async function apiGetSeries(slug: string): Promise<SeriesDto> {
  const res = await fetch(`/api/series/${slug}`, { credentials: "include" });
  return handleResponse<SeriesDto>(res);
}

export async function apiCreateSeries(data: CreateSeriesDto): Promise<SeriesDto> {
  const res = await fetch("/api/series", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  });
  return handleResponse<SeriesDto>(res);
}

export async function apiUpdateSeries(slug: string, patch: UpdateSeriesDto): Promise<SeriesDto> {
  const res = await fetch(`/api/series/${slug}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
    credentials: "include",
  });
  return handleResponse<SeriesDto>(res);
}

export async function apiDeleteSeries(slug: string): Promise<void> {
  const res = await fetch(`/api/series/${slug}`, {
    method: "DELETE",
    credentials: "include",
  });
  return handleResponse<void>(res);
}

export async function apiGetSeriesWords(seriesSlug: string): Promise<string[]> {
  const res = await fetch(`/api/series/${seriesSlug}/entries/words`, { credentials: "include" });
  return handleResponse<string[]>(res);
}

export async function apiCreateEntry(seriesSlug: string, data: CreateEntryDto): Promise<EntryDto> {
  const res = await fetch(`/api/series/${seriesSlug}/entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  });
  return handleResponse<EntryDto>(res);
}

export async function apiGetPendingEntries(): Promise<EntrySummaryDto[]> {
  const res = await fetch("/api/admin/entries/pending", { credentials: "include" });
  return handleResponse<EntrySummaryDto[]>(res);
}

export async function apiGetEntry(id: string): Promise<EntryDto> {
  const res = await fetch(`/api/admin/entries/${id}`, { credentials: "include" });
  return handleResponse<EntryDto>(res);
}

export async function apiApproveEntry(id: string): Promise<EntryDto> {
  const res = await fetch(`/api/admin/entries/${id}/approve`, {
    method: "POST",
    credentials: "include",
  });
  return handleResponse<EntryDto>(res);
}

export async function apiRejectEntry(id: string, data: RejectEntryDto): Promise<EntryDto> {
  const res = await fetch(`/api/admin/entries/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  });
  return handleResponse<EntryDto>(res);
}

export async function apiGetEntryPublic(id: string): Promise<PublicEntryDto> {
  const res = await fetch(`/api/entries/${id}`, { credentials: "include" });
  return handleResponse<PublicEntryDto>(res);
}

export async function apiSubmitEntryEditProposal(
  id: string,
  data: SubmitEntryEditProposalDto
): Promise<{ id: string; status: "PENDING" | "APPROVED" }> {
  const res = await fetch(`/api/entries/${id}/edit-proposals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  });
  return handleResponse<{ id: string; status: "PENDING" | "APPROVED" }>(res);
}

export async function apiGetReviewQueue(): Promise<PendingQueueItemDto[]> {
  const res = await fetch("/api/admin/review-queue", { credentials: "include" });
  return handleResponse<PendingQueueItemDto[]>(res);
}

export async function apiGetEntryEditProposal(id: string): Promise<EntryEditProposalDto> {
  const res = await fetch(`/api/admin/entry-edit-proposals/${id}`, { credentials: "include" });
  return handleResponse<EntryEditProposalDto>(res);
}

export async function apiApproveEntryEditProposal(id: string): Promise<EntryDto> {
  const res = await fetch(`/api/admin/entry-edit-proposals/${id}/approve`, {
    method: "POST",
    credentials: "include",
  });
  return handleResponse<EntryDto>(res);
}

export async function apiRejectEntryEditProposal(
  id: string,
  data: RejectEntryDto
): Promise<{ id: string; status: string; rejectionNote: string | null }> {
  const res = await fetch(`/api/admin/entry-edit-proposals/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    credentials: "include",
  });
  return handleResponse<{ id: string; status: string; rejectionNote: string | null }>(res);
}
