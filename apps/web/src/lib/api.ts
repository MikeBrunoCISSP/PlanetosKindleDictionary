import type {
  AdminUserDto,
  CreateSeriesDto,
  LoginDto,
  RegisterDto,
  SeriesDto,
  SeriesListItemDto,
  UpdateSeriesDto,
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

export async function apiGetSeriesList(page = 1): Promise<SeriesListItemDto[]> {
  const res = await fetch(`/api/series?page=${page}`, { credentials: "include" });
  return handleResponse<SeriesListItemDto[]>(res);
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
