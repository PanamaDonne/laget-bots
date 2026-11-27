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

export function webAdminError(
  fixedMessage: string,
  secrets: Iterable<string> = [],
): Error {
  const scrubbed = scrubSecrets(fixedMessage, secrets);
  const error = new Error(scrubbed);
  error.name = "WebAdminError";
  return error;
}

export function assertNoSecretFields(
  payload: Record<string, unknown>,
  forbiddenKeys: readonly string[],
): void {
  const found: string[] = [];
  for (const key of forbiddenKeys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      found.push(key);
    }
  }
  if (found.length > 0) {
    const leaked: string[] = [];
    collectStrings(payload, leaked);
    throw webAdminError("Secret fields are not accepted by the cloud admin.", leaked);
  }
}
