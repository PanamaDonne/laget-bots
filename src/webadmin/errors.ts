const REDACTED = "[REDACTED]";

function collectStrings(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectStrings(entry, out);
    return;
  }
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) collectStrings(entry, out);
  }
}

/** Replace known secrets (and trimmed forms) in an error message. */
export function scrubSecrets(message: string, secrets: Iterable<string>): string {
  let result = message;
  for (const secret of secrets) {
    if (!secret) continue;
    const forms = new Set([secret, secret.trim()]);
    for (const form of forms) {
      if (!form) continue;
      if (result.includes(form)) {
        result = result.split(form).join(REDACTED);
      }
    }
  }
  return result;
}

export class WebAdminError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebAdminError";
  }
}

export function webAdminError(fixedMessage: string, secrets: Iterable<string> = []): WebAdminError {
  return new WebAdminError(scrubSecrets(fixedMessage, secrets));
}

export function assertOnlyFields(
  payload: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const extra = Object.keys(payload).filter((key) => !allowed.includes(key));
  if (extra.length === 0) return;
  const leaked: string[] = [];
  collectStrings(payload, leaked);
  throw webAdminError("Secret fields are not accepted by the cloud admin.", leaked);
}
