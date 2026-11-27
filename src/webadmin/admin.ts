import { randomBytes, randomInt } from "node:crypto";
import { assertValidKeyEnvelope, fingerprintPublicKey } from "./crypto.ts";
import { assertNoSecretFields, webAdminError } from "./errors.ts";
import {
  ALLOWED_PROVIDERS,
  type CloudDeviceRecord,
  type CloudSnapshot,
  type ConnectionStatus,
  type EmailConnectionStatus,
  type KeyEnvelope,
  type PairingStatus,
  type ProviderId,
  type Session,
} from "./types.ts";

interface PairingRecord {
  userCode: string;
  deviceCode: string;
  deviceId: string;
  piPublicKeyPem: string;
  status: PairingStatus;
  userId: string | null;
  expiresAtMs: number;
}

interface UserRecord {
  userId: string;
  email: string;
}

interface SessionRecord {
  token: string;
  userId: string;
}

export interface WebAdmin {
  signIn(input: { email: string }): Session;
  beginDevicePairing(input: {
    deviceId: string;
    piPublicKeyPem: string;
  }): { userCode: string; deviceCode: string; expiresAt: string };
  confirmPairing(input: { sessionToken: string; userCode: string }): {
    deviceId: string;
  };
  pollPairing(deviceCode: string): { status: PairingStatus; deviceId: string };
  submitProviderKey(input: {
    sessionToken: string;
    providerId: string;
    envelope: KeyEnvelope;
  }): void;
  startEmailConnection(input: { sessionToken: string }): {
    status: EmailConnectionStatus;
  };
  reportEmailStatusFromPi(input: {
    deviceId: string;
    status: EmailConnectionStatus;
  }): void;
  getConnectionStatus(input: { sessionToken: string }): ConnectionStatus;
  debugCloudSnapshot(): CloudSnapshot;
}

function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function newUserCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = (n: number): string => {
    let out = "";
    for (let i = 0; i < n; i += 1) {
      out += alphabet[randomInt(alphabet.length)] ?? "A";
    }
    return out;
  };
  return `${part(4)}-${part(4)}`;
}

function isProviderId(value: string): value is ProviderId {
  return (ALLOWED_PROVIDERS as readonly string[]).includes(value);
}

export function createWebAdmin(now: () => number = Date.now): WebAdmin {
  const users = new Map<string, UserRecord>();
  const sessions = new Map<string, SessionRecord>();
  const pairingsByUserCode = new Map<string, PairingRecord>();
  const pairingsByDeviceCode = new Map<string, PairingRecord>();
  const devices = new Map<string, CloudDeviceRecord>();

  function requireSession(sessionToken: string): SessionRecord {
    const session = sessions.get(sessionToken);
    if (!session) {
      throw webAdminError("Not signed in.");
    }
    return session;
  }

  function requireUserDevice(userId: string): CloudDeviceRecord {
    for (const device of devices.values()) {
      if (device.userId === userId) return device;
    }
    throw webAdminError("No paired Pi for this account.");
  }

  return {
    signIn({ email }) {
      const normalized = email.trim().toLowerCase();
      if (!normalized || !normalized.includes("@")) {
        throw webAdminError("A valid email is required to sign in.");
      }
      let user = [...users.values()].find((entry) => entry.email === normalized);
      if (!user) {
        user = { userId: newId("user"), email: normalized };
        users.set(user.userId, user);
      }
      const token = newId("sess");
      sessions.set(token, { token, userId: user.userId });
      return { token, userId: user.userId, email: user.email };
    },

    beginDevicePairing({ deviceId, piPublicKeyPem }) {
      const trimmedDeviceId = deviceId.trim();
      if (!trimmedDeviceId) {
        throw webAdminError("Device id is required.");
      }
      if (!piPublicKeyPem.includes("BEGIN PUBLIC KEY")) {
        throw webAdminError("A Pi public key is required to begin pairing.");
      }
      const userCode = newUserCode();
      const deviceCode = newId("device");
      const record: PairingRecord = {
        userCode,
        deviceCode,
        deviceId: trimmedDeviceId,
        piPublicKeyPem,
        status: "pending",
        userId: null,
        expiresAtMs: now() + 15 * 60 * 1000,
      };
      pairingsByUserCode.set(userCode, record);
      pairingsByDeviceCode.set(deviceCode, record);
      devices.set(trimmedDeviceId, {
        deviceId: trimmedDeviceId,
        userId: null,
        piPublicKeyPem,
        provider: null,
        email: { status: "disconnected", connectedAt: null },
      });
      return {
        userCode,
        deviceCode,
        expiresAt: new Date(record.expiresAtMs).toISOString(),
      };
    },

    confirmPairing({ sessionToken, userCode }) {
      const session = requireSession(sessionToken);
      const pairing = pairingsByUserCode.get(userCode.trim().toUpperCase());
      if (!pairing || pairing.expiresAtMs < now()) {
        if (pairing) pairing.status = "expired";
        throw webAdminError("Pairing code is invalid or expired.");
      }
      if (pairing.status === "paired") {
        throw webAdminError("Pairing code was already used.");
      }
      pairing.status = "paired";
      pairing.userId = session.userId;
      const device = devices.get(pairing.deviceId);
      if (!device) {
        throw webAdminError("Paired device record is missing.");
      }
      device.userId = session.userId;
      return { deviceId: pairing.deviceId };
    },

    pollPairing(deviceCode) {
      const pairing = pairingsByDeviceCode.get(deviceCode);
      if (!pairing) {
        throw webAdminError("Unknown device pairing.");
      }
      if (pairing.status === "pending" && pairing.expiresAtMs < now()) {
        pairing.status = "expired";
      }
      return { status: pairing.status, deviceId: pairing.deviceId };
    },

    submitProviderKey({ sessionToken, providerId, envelope }) {
      const session = requireSession(sessionToken);
      const device = requireUserDevice(session.userId);
      const secrets = [envelope.ciphertext];
      if (!isProviderId(providerId)) {
        throw webAdminError("Provider is not allowed.", secrets);
      }
      assertValidKeyEnvelope(envelope, fingerprintPublicKey(device.piPublicKeyPem));
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
      return { status: "pending" as const };
    },

    reportEmailStatusFromPi(input) {
      assertNoSecretFields(input as unknown as Record<string, unknown>, [
        "mailToken",
        "accessToken",
        "refreshToken",
        "apiKey",
        "token",
      ]);
      const device = devices.get(input.deviceId);
      if (!device || !device.userId) {
        throw webAdminError("Device is not paired.");
      }
      switch (input.status) {
        case "connected":
          device.email = {
            status: "connected",
            connectedAt: new Date(now()).toISOString(),
          };
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
      let device: CloudDeviceRecord | undefined;
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

    debugCloudSnapshot(): CloudSnapshot {
      return {
        users: [...users.values()].map(({ userId, email }) => ({ userId, email })),
        sessions: [...sessions.values()].map(({ token, userId }) => ({ token, userId })),
        pairings: [...pairingsByUserCode.values()].map((pairing) => ({
          userCode: pairing.userCode,
          deviceCode: pairing.deviceCode,
          deviceId: pairing.deviceId,
          status: pairing.status,
        })),
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
          email: {
            status: device.email.status,
            connectedAt: device.email.connectedAt,
          },
        })),
      };
    },
  };
}
