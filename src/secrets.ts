export function scrubSecrets(text: string, secrets: readonly string[]): string {
  const needles = new Set<string>();
  for (const secret of secrets) {
    if (secret.length === 0) continue;
    needles.add(secret);
    const trimmed = secret.trim();
    if (trimmed.length > 0) needles.add(trimmed);
  }

  let out = text;
  for (const needle of [...needles].sort((left, right) => right.length - left.length)) {
    out = out.split(needle).join("[REDACTED]");
  }
  return out;
}

export function scrubError(error: unknown, secrets: readonly string[], publicMessage: string): Error {
  const message = scrubSecrets(publicMessage, secrets);
  const out = new Error(message);
  out.stack = scrubSecrets(out.stack ?? "", secrets);
  if (error instanceof Error && error.cause !== undefined) {
    out.cause = scrubCause(error.cause, secrets, message);
  }
  return out;
}

function scrubCause(cause: unknown, secrets: readonly string[], publicMessage: string): unknown {
  if (!(cause instanceof Error)) {
    return scrubSecrets(publicMessage, secrets);
  }
  const nested = new Error(publicMessage);
  nested.stack = scrubSecrets(nested.stack ?? "", secrets);
  if (cause.cause !== undefined) {
    nested.cause = scrubCause(cause.cause, secrets, publicMessage);
  }
  return nested;
}
