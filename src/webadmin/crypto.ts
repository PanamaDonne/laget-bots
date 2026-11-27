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
const PRINTABLE_RATIO_LIMIT = 0.8;
const MAX_REPEAT = 16;

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

function modulusBytes(publicKeyPem: string): number {
  const key = createPublicKey(publicKeyPem);
  const bits = key.asymmetricKeyDetails?.modulusLength;
  if (!bits) {
    throw webAdminError("Pi public key is not an RSA key.");
  }
  return bits / 8;
}

function longestRun(value: string): number {
  let best = 0;
  let run = 0;
  let previous = "";
  for (const char of value) {
    if (char === previous) {
      run += 1;
    } else {
      previous = char;
      run = 1;
    }
    if (run > best) best = run;
  }
  return best;
}

function printableRatio(bytes: Buffer): number {
  if (bytes.length === 0) return 1;
  let printable = 0;
  for (const byte of bytes) {
    if (byte >= 0x20 && byte <= 0x7e) printable += 1;
  }
  return printable / bytes.length;
}

/** Encrypt an API key with the Pi public key. The cloud never calls this. */
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

/**
 * Decrypt on the Pi only. The Pi drops any envelope it cannot decrypt.
 * The cloud never calls this.
 */
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
 * Accept only an opaque RSA ciphertext of exactly the key's modulus size.
 * A plaintext string of any length is rejected, including one padded out so
 * an older "at least 256 bytes" check would have stored it.
 * The cloud cannot prove the bytes are a real OAEP message. The Pi must
 * discard whatever it cannot decrypt, and that rule lives with the Pi.
 */
export function assertValidKeyEnvelope(envelope: KeyEnvelope, piPublicKeyPem: string): void {
  const secret = envelope.ciphertext;
  const secrets = [secret];
  const reject = (reason: string): never => {
    throw webAdminError(`${reason}: ${secret}`, secrets);
  };
  if (envelope.alg !== RSA_OAEP_SHA256) {
    reject("Unsupported key envelope algorithm");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(secret)) {
    reject("Key envelope ciphertext is not valid base64url");
  }
  let bytes = fromBase64Url("AA");
  try {
    bytes = fromBase64Url(secret);
  } catch {
    reject("Key envelope ciphertext is not valid base64url");
  }
  const expected = modulusBytes(piPublicKeyPem);
  if (bytes.length !== expected) {
    reject("Key envelope ciphertext is not RSA ciphertext");
  }
  if (longestRun(secret) >= MAX_REPEAT || printableRatio(bytes) > PRINTABLE_RATIO_LIMIT) {
    reject("Key envelope looks like plaintext");
  }
  if (envelope.keyFingerprint !== fingerprintPublicKey(piPublicKeyPem)) {
    reject("Key envelope fingerprint does not match the paired Pi");
  }
}
