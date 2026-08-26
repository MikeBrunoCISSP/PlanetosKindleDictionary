export function isPrismaError(err: unknown, code: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === code
  );
}

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const Errors = {
  DUPLICATE_EMAIL: () =>
    new DomainError("DUPLICATE_EMAIL", "This email address is already registered.", 409),
  DUPLICATE_USERNAME: () =>
    new DomainError("DUPLICATE_USERNAME", "This username is already taken.", 409),
  INVALID_CREDENTIALS: () =>
    new DomainError("INVALID_CREDENTIALS", "Invalid credentials.", 401),
  ACCOUNT_DISABLED: () =>
    new DomainError("ACCOUNT_DISABLED", "This account has been disabled.", 403),
  LAST_ADMIN: () =>
    new DomainError(
      "LAST_ADMIN",
      "This action would leave the system with no active administrators.",
      409
    ),
  NOT_FOUND: () => new DomainError("NOT_FOUND", "The requested resource was not found.", 404),
  FORBIDDEN: () => new DomainError("FORBIDDEN", "Access denied.", 403),
  DUPLICATE_WORD: () =>
    new DomainError("DUPLICATE_WORD", "The word already exists in the dictionary.", 409),
  ALREADY_REVIEWED: () =>
    new DomainError("ALREADY_REVIEWED", "This entry has already been reviewed.", 409),
  TURNSTILE_VERIFICATION_FAILED: () =>
    new DomainError(
      "TURNSTILE_VERIFICATION_FAILED",
      "We couldn't verify you're not a robot. Please try again.",
      400
    ),
  TURNSTILE_MISCONFIGURED: () =>
    new DomainError(
      "TURNSTILE_MISCONFIGURED",
      "Registration is temporarily unavailable. Please try again later.",
      503
    ),
} as const;
