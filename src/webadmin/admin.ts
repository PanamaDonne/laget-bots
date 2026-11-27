import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { assertValidKeyEnvelope, fingerprintPublicKey } from "./crypto.ts";
import { webAdminError } from "./errors.ts";
import {
  CHAT_PROVIDER_CANDIDATES,
  type CloudSnapshot,
  type ConnectionStatus,
  type EmailConnectionStatus,
  type KeyEnvelope,
  type PairingStatus,
  type ProviderId,
  type Session,
  type SignInMailbox,
} from "./types.ts";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SIGN_IN_CODE_TTL_MS = 10 * 60 * 1000;
const PAIRING_TTL_MS = 15 * 60 * 1000;

interface PairingRecord {
  userCode: string;
  deviceCode: string;
  deviceId: string;
  status: PairingStatus;
  expiresAtMs: number;
}

interface UserRecord {
  userId: string;
  email: string;
}

interface SessionRecord {
  token: string;
  userId: string;
  expiresAtMs: number;
}

interface ChallengeRecord {
  codeHash: string;
  expiresAtMs: number;
}

interface DeviceRecord {
  deviceId: string;
  userId: string | null;
  piPublicKeyPem: string;
  deviceSecretHash: string;
  reopen: boolean;
  provider: {
    id: ProviderId;
    keyCiphertext: string;
    keyFingerprint: string;
    alg: "RSA-OAEP-256";
  } | null;
  email: {
    status: EmailConnectionStatus;
    connectedAt: string | null;
  };
}

export interface WebAdmin {
  /** Always refuses. Sign-in needs requestSignIn plus confirmSignIn. */
  signIn(input: { email: string }): Session;
  requestSignIn(input: { email: string }): { pending: true };
  confirmSignIn(input: { email: string; code: string }): Session;
  signOut(input: { sessionToken: string }): void;
  beginDevicePairing(input: {
    deviceId: string;
    piPublicKeyPem: string;
    deviceSecret?: string;
  }): {
    userCode: string;
    deviceCode: string;
    expiresAt: string;
    deviceSecret?: string;
  };
  confirmPairing(input: {
    sessionToken: string;
    userCode: string;
    keyFingerprint: string;
  }): { deviceId: string };
  reopenPairing(input: { sessionToken: string }): { deviceId: string };
  pollPairing(input: { deviceCode: string; deviceSecret: string }): {
    status: PairingStatus;
    deviceId: string;
  };
  submitProviderKey(input: {
    sessionToken: string;
    providerId: string;
    envelope: KeyEnvelope;
  }): void;
  startEmailConnection(input: { sessionToken: string }): { status: EmailConnectionStatus };
  reportEmailStatusFromPi(input: {
    deviceId: string;
    status: EmailConnectionStatus;
    deviceSecret: string;
  }): void;
  getConnectionStatus(input: { sessionToken: string }): ConnectionStatus;
}

export interface WebAdminApp {
  admin: WebAdmin;
  /** Cloud fields a test may read. Omits tokens, device secrets, and sign-in codes. */
  inspect(): CloudSnapshot;
}

export interface WebAdminOptions {
  now?: () => number;
  mailbox: SignInMailbox;
  sessionTtlMs?: number;
  signInCodeTtlMs?: number;
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function newCode(groups: number, size: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = (): string => {
    let out = "";
    for (let i = 0; i < size; i += 1) {
      out += alphabet[randomInt(alphabet.length)] ?? "A";
    }
    return out;
  };
  return Array.from({ length: groups }, part).join("-");
}

function hashSecret(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isProviderId(value: string): value is ProviderId {
  return (CHAT_PROVIDER_CANDIDATES as readonly string[]).includes(value);
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) {
    throw webAdminError("A valid email is required to sign in.");
  }
  return normalized;
}

export function createWebAdmin(options: WebAdminOptions): WebAdminApp {
  const now = options.now ?? Date.now;
  const sessionTtlMs = options.sessionTtlMs ?? SESSION_TTL_MS;
  const signInCodeTtlMs = options.signInCodeTtlMs ?? SIGN_IN_CODE_TTL_MS;
  const users = new Map<string, UserRecord>();
  const sessions = new Map<string, SessionRecord>();
  const challenges = new Map<string, ChallengeRecord>();
  const pairingsByUserCode = new Map<string, PairingRecord>();
  const pairingsByDeviceCode = new Map<string, PairingRecord>();
  const devices = new Map<string, DeviceRecord>();

  function dropExpiredSessions(): void {
    for (const [token, session] of sessions) {
      if (session.expiresAtMs <= now()) sessions.delete(token);
    }
  }

  function requireSession(sessionToken: string): SessionRecord {
    dropExpiredSessions();
    const session = sessions.get(sessionToken);
    if (!session) throw webAdminError("Not signed in.");
    return session;
  }

  function requireUserDevice(userId: string): DeviceRecord {
    for (const device of devices.values()) {
      if (device.userId === userId) return device;
    }
    throw webAdminError("No paired Pi for this account.");
  }

  function deviceBySecret(deviceId: string, deviceSecret: string): DeviceRecord {
    const device = devices.get(deviceId);
    if (!device || !deviceSecret || !sameHash(device.deviceSecretHash, hashSecret(deviceSecret))) {
      throw webAdminError("Device proof is required.");
    }
    return device;
  }

  function issuePairing(device: DeviceRecord): PairingRecord {
    for (const [code, pairing] of pairingsByUserCode) {
      if (pairing.deviceId === device.deviceId) {
        pairingsByUserCode.delete(code);
        pairingsByDeviceCode.delete(pairing.deviceCode);
      }
    }
    const record: PairingRecord = {
      userCode: newCode(2, 4),
      deviceCode: newId("device"),
      deviceId: device.deviceId,
      status: "pending",
      expiresAtMs: now() + PAIRING_TTL_MS,
    };
    pairingsByUserCode.set(record.userCode, record);
    pairingsByDeviceCode.set(record.deviceCode, record);
    return record;
  }

  const admin: WebAdmin = {
    signIn() {
      throw webAdminError("Email proof is required.");
    },

    requestSignIn({ email }) {
      const normalized = normalizeEmail(email);
      const code = newCode(1, 8);
      challenges.set(normalized, {
        codeHash: hashSecret(code),
        expiresAtMs: now() + signInCodeTtlMs,
      });
      options.mailbox.deliver({ email: normalized, code });
      return { pending: true };
    },

    confirmSignIn({ email, code }) {
      const normalized = normalizeEmail(email);
      const challenge = challenges.get(normalized);
      if (!challenge || challenge.expiresAtMs <= now() || !sameHash(challenge.codeHash, hashSecret(code))) {
        throw webAdminError("Email proof is invalid or expired.");
      }
      challenges.delete(normalized);
      let user = [...users.values()].find((entry) => entry.email === normalized);
      if (!user) {
        user = { userId: newId("user"), email: normalized };
        users.set(user.userId, user);
      }
      const token = newId("sess");
      const expiresAtMs = now() + sessionTtlMs;
      sessions.set(token, { token, userId: user.userId, expiresAtMs });
      return {
        token,
        userId: user.userId,
        email: user.email,
        expiresAt: new Date(expiresAtMs).toISOString(),
      };
    },

    signOut({ sessionToken }) {
      dropExpiredSessions();
      if (!sessions.delete(sessionToken)) {
        throw webAdminError("Not signed in.");
      }
    },

    beginDevicePairing({ deviceId, piPublicKeyPem, deviceSecret }) {
      const trimmedDeviceId = deviceId.trim();
      if (!trimmedDeviceId) throw webAdminError("Device id is required.");
      if (!piPublicKeyPem.includes("BEGIN PUBLIC KEY")) {
        throw webAdminError("A Pi public key is required to begin pairing.");
      }
      const existing = devices.get(trimmedDeviceId);
      if (existing?.userId && !existing.reopen) {
        throw webAdminError("Device is already paired.");
      }
      if (existing) {
        deviceBySecret(trimmedDeviceId, deviceSecret ?? "");
        existing.piPublicKeyPem = piPublicKeyPem;
        if (existing.reopen) {
          existing.userId = null;
          existing.reopen = false;
          existing.provider = null;
          existing.email = { status: "disconnected", connectedAt: null };
        }
        const pairing = issuePairing(existing);
        return {
          userCode: pairing.userCode,
          deviceCode: pairing.deviceCode,
          expiresAt: new Date(pairing.expiresAtMs).toISOString(),
        };
      }
      const secret = randomBytes(32).toString("hex");
      const device: DeviceRecord = {
        deviceId: trimmedDeviceId,
        userId: null,
        piPublicKeyPem,
        deviceSecretHash: hashSecret(secret),
        reopen: false,
        provider: null,
        email: { status: "disconnected", connectedAt: null },
      };
      devices.set(trimmedDeviceId, device);
      const pairing = issuePairing(device);
      return {
        userCode: pairing.userCode,
        deviceCode: pairing.deviceCode,
        expiresAt: new Date(pairing.expiresAtMs).toISOString(),
        deviceSecret: secret,
      };
    },

    confirmPairing({ sessionToken, userCode, keyFingerprint }) {
      const session = requireSession(sessionToken);
      const pairing = pairingsByUserCode.get(userCode.trim().toUpperCase());
      if (!pairing || pairing.expiresAtMs <= now()) {
        if (pairing) pairing.status = "expired";
        throw webAdminError("Pairing code is invalid or expired.");
      }
      if (pairing.status === "paired") {
        throw webAdminError("Pairing code was already used.");
      }
      const device = devices.get(pairing.deviceId);
      if (!device) throw webAdminError("Paired device record is missing.");
      if (fingerprintPublicKey(device.piPublicKeyPem) !== keyFingerprint.trim().toLowerCase()) {
        throw webAdminError("Key fingerprint does not match the Pi.");
      }
      pairing.status = "paired";
      device.userId = session.userId;
      device.reopen = false;
      return { deviceId: pairing.deviceId };
    },

    reopenPairing({ sessionToken }) {
      const session = requireSession(sessionToken);
      const device = requireUserDevice(session.userId);
      device.reopen = true;
      return { deviceId: device.deviceId };
    },

    pollPairing({ deviceCode, deviceSecret }) {
      const pairing = pairingsByDeviceCode.get(deviceCode);
      if (!pairing) throw webAdminError("Unknown device pairing.");
      deviceBySecret(pairing.deviceId, deviceSecret);
      if (pairing.status === "pending" && pairing.expiresAtMs <= now()) {
        pairing.status = "expired";
      }
      return { status: pairing.status, deviceId: pairing.deviceId };
    },

    submitProviderKey({ sessionToken, providerId, envelope }) {
      const session = requireSession(sessionToken);
      const device = requireUserDevice(session.userId);
      if (!isProviderId(providerId)) {
        throw webAdminError("Provider is not allowed.", [envelope.ciphertext]);
      }
      assertValidKeyEnvelope(envelope, device.piPublicKeyPem);
      device.provider = {
        id: providerId,
        keyCiphertext: envelope.ciphertext,
        keyFingerprint: envelope.keyFingerprint,
        alg: envelope.alg,
      };
    },

    startEmailConnection({ sessionToken }) {
      const session = requireSession(sessionToken);
      const device = requireUserDevice(session.userId);
      device.email = { status: "pending", connectedAt: null };
      return { status: "pending" };
    },

    reportEmailStatusFromPi(input) {
      const device = deviceBySecret(input.deviceId, input.deviceSecret);
      if (!device.userId) throw webAdminError("Device is not paired.");
      switch (input.status) {
        case "connected":
          device.email = { status: "connected", connectedAt: new Date(now()).toISOString() };
          break;
        case "disconnected":
          device.email = { status: "disconnected", connectedAt: null };
          break;
        case "pending":
          device.email = { status: "pending", connectedAt: null };
          break;
        default: {
          const _exhaustive: never = input.status;
          throw webAdminError(`Unknown email status: ${String(_exhaustive)}`);
        }
      }
    },

    getConnectionStatus({ sessionToken }) {
      const session = requireSession(sessionToken);
      let device: DeviceRecord | undefined;
      for (const entry of devices.values()) {
        if (entry.userId === session.userId) {
          device = entry;
          break;
        }
      }
      const status: ConnectionStatus = {
        signedIn: true,
        device: {
          paired: Boolean(device?.userId),
          deviceId: device?.userId ? device.deviceId : null,
        },
        provider: {
          configured: Boolean(device?.provider),
          id: device?.provider?.id ?? null,
        },
        email: {
          status: device?.email.status ?? "disconnected",
        },
      };
      return status;
    },
  };

  return {
    admin,
    inspect(): CloudSnapshot {
      dropExpiredSessions();
      return {
        users: [...users.values()].map(({ userId, email }) => ({ userId, email })),
        sessionCount: sessions.size,
        devices: [...devices.values()].map((device) => ({
          deviceId: device.deviceId,
          userId: device.userId,
          piPublicKeyPem: device.piPublicKeyPem,
          provider: device.provider
            ? {
                id: device.provider.id,
                keyCiphertext: device.provider.keyCiphertext,
                keyFingerprint: device.provider.keyFingerprint,
                alg: device.provider.alg,
              }
            : null,
          email: { status: device.email.status },
        })),
      };
    },
  };
}
