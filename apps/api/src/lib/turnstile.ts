const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface SiteverifyResponse {
  success: boolean;
  "error-codes"?: string[];
}

export interface VerifyResult {
  success: boolean;
  errorCodes: string[];
}

async function siteverify(secretKey: string, token: string, remoteIp?: string): Promise<VerifyResult> {
  const body = new URLSearchParams({ secret: secretKey, response: token });
  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  try {
    const response = await fetch(SITEVERIFY_URL, { method: "POST", body });
    const data = (await response.json()) as SiteverifyResponse;
    return { success: data.success === true, errorCodes: data["error-codes"] ?? [] };
  } catch {
    return { success: false, errorCodes: ["network-error"] };
  }
}

/** Verifies a registration Turnstile token against Cloudflare's siteverify endpoint. */
export function verify(secretKey: string, token: string, remoteIp?: string): Promise<VerifyResult> {
  return siteverify(secretKey, token, remoteIp);
}

/**
 * Checks whether `secretKey` is at least well-formed and recognized by Cloudflare, without
 * fabricating a full successful verification. Sends a deliberately-invalid dummy token: a
 * malformed/wrong secret is reported as `invalid-input-secret`, while a well-formed secret
 * rejects only the fake token itself (`invalid-input-response` or similar).
 */
export async function isSecretKeyRecognized(secretKey: string): Promise<boolean> {
  const { errorCodes } = await siteverify(secretKey, "dummy-configuration-test-token");
  if (errorCodes.includes("network-error")) {
    return false;
  }
  return !errorCodes.includes("invalid-input-secret") && !errorCodes.includes("missing-input-secret");
}
