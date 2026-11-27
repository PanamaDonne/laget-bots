import {
  constants,
  createHash,
  createPrivateKey,
  createPublicKey,
  privateDecrypt,
  publicEncrypt,
} from "node:crypto";
import type { KeyEnvelope } from "./types.ts";
import { webAdminError } from "./errors.ts";

const RSA_OAEP_SHA256 = "RSA-OAEP-256";
const MIN_CIPHERTEXT_BYTES = 256;

function pemToBuffer(pem: string): Buffer {
  return Buffer.from(
    pem
      .replace(/-----BEGIN [^-]+-----/g, "")
      .replace(/-----END [^-]+-----/g, "")
      .replace(/\s+/g, ""),
    "base64",
  );
}

export function fingerprintPublicKey(publicKeyPem: string): string {
  return createHash("sha256").update(pemToBuffer(publicKeyPem)).digest("hex").slice(0, 16);
}

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

/** Encrypt an API key in the browser (or test double) with the Pi public key. */
export async function encryptApiKeyForPi(
  apiKey: string,
  piPublicKeyPem: string,
): Promise<KeyEnvelope> {
  if (!apiKey.trim()) {
    throw webAdminError("API key is required.");
  }
  const key = createPublicKey(piPublicKeyPem);
  const ciphertext = publicEncrypt(
    {
      key,
      oaepHash: "sha256",
      padding: constants.RSA_PKCS1_OAEP_PADDING,
    },
    Buffer.from(apiKey, "utf8"),
  );
  return {
    alg: RSA_OAEP_SHA256,
    ciphertext: toBase64Url(ciphertext),
    keyFingerprint: fingerprintPublicKey(piPublicKeyPem),
  };
}

/** Decrypt on the Pi only. The cloud never calls this. */
export async function decryptApiKeyOnPi(
  envelope: KeyEnvelope,
  piPrivateKeyPem: string,
): Promise<string> {
  if (envelope.alg !== RSA_OAEP_SHA256) {
    throw webAdminError("Unsupported key envelope algorithm.");
  }
  const key = createPrivateKey(piPrivateKeyPem);
  const plain = privateDecrypt(
    {
      key,
      oaepHash: "sha256",
      padding: constants.RSA_PKCS1_OAEP_PADDING,
    },
    fromBase64Url(envelope.ciphertext),
  );
  return plain.toString("utf8");
}

/**
 * Cloud-side check: accept only envelopes that look like RSA-OAEP ciphertext.
 * Never store or log the raw value when rejecting.
 */
export function assertValidKeyEnvelope(envelope: KeyEnvelope, expectedFingerprint: string): void {
  const secrets = [envelope.ciphertext];
  if (envelope.alg !== RSA_OAEP_SHA256) {
    throw webAdminError("Unsupported key envelope algorithm.", secrets);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(envelope.ciphertext)) {
    throw webAdminError("Key envelope ciphertext is not valid base64url.", secrets);
  }
  let bytes: Buffer;
  try {
    bytes = fromBase64Url(envelope.ciphertext);
  } catch {
    throw webAdminError("Key envelope ciphertext is not valid base64url.", secrets);
  }
  if (bytes.length < MIN_CIPHERTEXT_BYTES) {
    throw webAdminError(
      "Key envelope ciphertext is too short; plaintext keys are not accepted.",
      secrets,
    );
  }
  if (envelope.keyFingerprint !== expectedFingerprint) {
    throw webAdminError("Key envelope fingerprint does not match the paired Pi.", secrets);
  }
}
