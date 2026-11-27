import { createWebAdmin, type WebAdmin, type WebAdminOptions } from "./admin.ts";
import { WebAdminError, assertOnlyFields, webAdminError } from "./errors.ts";
import type { EmailConnectionStatus, KeyEnvelope } from "./types.ts";

export type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

export interface AdminRequest {
  method: "GET" | "POST";
  path: string;
  headers: Record<string, string | undefined>;
  body?: Json;
}

export interface AdminResponse {
  status: number;
  body: Json;
}

const EMAIL_STATUS_FIELDS = ["deviceId", "status", "deviceSecret"] as const;
const BEGIN_FIELDS = ["deviceId", "piPublicKeyPem", "deviceSecret"] as const;

function sessionToken(headers: Record<string, string | undefined>): string {
  const raw = headers.authorization ?? headers.Authorization;
  if (!raw || !raw.startsWith("Bearer ")) {
    throw webAdminError("Not signed in.");
  }
  return raw.slice("Bearer ".length).trim();
}

function deviceSecretHeader(headers: Record<string, string | undefined>): string {
  const value = headers["x-device-secret"] ?? headers["X-Device-Secret"];
  if (!value?.trim()) throw webAdminError("Device proof is required.");
  return value.trim();
}

function asObject(body: Json | undefined): Record<string, Json> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw webAdminError("JSON object body is required.");
  }
  return body;
}

function asString(value: Json | undefined, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw webAdminError(`Field ${field} is required.`);
  }
  return value;
}

function optionalString(value: Json | undefined): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value;
}

function statusFor(error: WebAdminError): number {
  if (/not signed in|device proof is required|email proof is required/i.test(error.message)) {
    return 401;
  }
  return 400;
}

/**
 * HTTP adapter for the cloud web admin skeleton.
 * Unexpected errors return a fixed message so internals are not echoed.
 */
export function handleAdminRequest(admin: WebAdmin, request: AdminRequest): AdminResponse {
  try {
    return dispatch(admin, request);
  } catch (error) {
    if (error instanceof WebAdminError) {
      return { status: statusFor(error), body: { error: error.message } };
    }
    return { status: 500, body: { error: "Request failed." } };
  }
}

function dispatch(admin: WebAdmin, request: AdminRequest): AdminResponse {
  const { method, path } = request;

  if (method === "POST" && path === "/api/auth/sign-in") {
    const body = asObject(request.body);
    assertOnlyFields(body, ["email"]);
    const pending = admin.requestSignIn({ email: asString(body.email, "email") });
    return { status: 200, body: pending };
  }

  if (method === "POST" && path === "/api/auth/confirm") {
    const body = asObject(request.body);
    assertOnlyFields(body, ["email", "code"]);
    const session = admin.confirmSignIn({
      email: asString(body.email, "email"),
      code: asString(body.code, "code"),
    });
    return {
      status: 200,
      body: { token: session.token, email: session.email, expiresAt: session.expiresAt },
    };
  }

  if (method === "POST" && path === "/api/auth/sign-out") {
    admin.signOut({ sessionToken: sessionToken(request.headers) });
    return { status: 200, body: { ok: true } };
  }

  if (method === "POST" && path === "/api/pairing/begin") {
    const body = asObject(request.body);
    assertOnlyFields(body, BEGIN_FIELDS);
    const pending = admin.beginDevicePairing({
      deviceId: asString(body.deviceId, "deviceId"),
      piPublicKeyPem: asString(body.piPublicKeyPem, "piPublicKeyPem"),
      deviceSecret: optionalString(body.deviceSecret),
    });
    return { status: 200, body: pending };
  }

  if (method === "POST" && path === "/api/pairing/confirm") {
    const body = asObject(request.body);
    assertOnlyFields(body, ["userCode", "keyFingerprint"]);
    const paired = admin.confirmPairing({
      sessionToken: sessionToken(request.headers),
      userCode: asString(body.userCode, "userCode"),
      keyFingerprint: asString(body.keyFingerprint, "keyFingerprint"),
    });
    return { status: 200, body: paired };
  }

  if (method === "POST" && path === "/api/pairing/reopen") {
    const reopened = admin.reopenPairing({ sessionToken: sessionToken(request.headers) });
    return { status: 200, body: reopened };
  }

  if (method === "GET" && path.startsWith("/api/pairing/poll/")) {
    const deviceCode = path.slice("/api/pairing/poll/".length);
    return {
      status: 200,
      body: admin.pollPairing({
        deviceCode,
        deviceSecret: deviceSecretHeader(request.headers),
      }),
    };
  }

  if (method === "POST" && path === "/api/provider/key") {
    const body = asObject(request.body);
    assertOnlyFields(body, ["providerId", "envelope"]);
    admin.submitProviderKey({
      sessionToken: sessionToken(request.headers),
      providerId: asString(body.providerId, "providerId"),
      envelope: readEnvelope(body.envelope),
    });
    return { status: 200, body: { ok: true } };
  }

  if (method === "POST" && path === "/api/email/start") {
    const result = admin.startEmailConnection({
      sessionToken: sessionToken(request.headers),
    });
    return { status: 200, body: result };
  }

  if (method === "POST" && path === "/api/email/status") {
    const body = asObject(request.body);
    assertOnlyFields(body, EMAIL_STATUS_FIELDS);
    admin.reportEmailStatusFromPi({
      deviceId: asString(body.deviceId, "deviceId"),
      status: readEmailStatus(body.status),
      deviceSecret: asString(body.deviceSecret, "deviceSecret"),
    });
    return { status: 200, body: { ok: true } };
  }

  if (method === "GET" && path === "/api/status") {
    const status = admin.getConnectionStatus({
      sessionToken: sessionToken(request.headers),
    });
    return {
      status: 200,
      body: {
        signedIn: status.signedIn,
        device: {
          paired: status.device.paired,
          deviceId: status.device.deviceId,
        },
        provider: {
          configured: status.provider.configured,
          id: status.provider.id,
        },
        email: {
          status: status.email.status,
        },
      },
    };
  }

  return { status: 404, body: { error: "Not found." } };
}

export function createDefaultAdminHandler(
  options: WebAdminOptions,
): (request: AdminRequest) => AdminResponse {
  const { admin } = createWebAdmin(options);
  return (request) => handleAdminRequest(admin, request);
}

function readEnvelope(value: Json | undefined): KeyEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw webAdminError("Key envelope is required.");
  }
  assertOnlyFields(value, ["alg", "ciphertext", "keyFingerprint"]);
  const alg = value.alg;
  if (alg !== "RSA-OAEP-256") {
    throw webAdminError("Unsupported key envelope algorithm.");
  }
  return {
    alg,
    ciphertext: asString(value.ciphertext, "ciphertext"),
    keyFingerprint: asString(value.keyFingerprint, "keyFingerprint"),
  };
}

function readEmailStatus(value: Json | undefined): EmailConnectionStatus {
  const status = asString(value, "status");
  switch (status) {
    case "connected":
    case "disconnected":
    case "pending":
      return status;
    default: {
      const _exhaustive: never = status as never;
      throw webAdminError(`Unknown email status: ${String(_exhaustive)}`);
    }
  }
}
