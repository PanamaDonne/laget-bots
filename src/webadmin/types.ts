export type ProviderId = "scaleway" | "ovh";

export const ALLOWED_PROVIDERS: readonly ProviderId[] = ["scaleway", "ovh"];

export type EmailConnectionStatus = "disconnected" | "pending" | "connected";

export type PairingStatus = "pending" | "paired" | "expired";

export interface Session {
  token: string;
  userId: string;
  email: string;
}

export interface KeyEnvelope {
  alg: "RSA-OAEP-256";
  /** Base64url ciphertext produced in the browser with the Pi public key. */
  ciphertext: string;
  /** Short fingerprint of the Pi public key used to encrypt. */
  keyFingerprint: string;
}

export interface ConnectionStatus {
  signedIn: true;
  device: {
    paired: boolean;
    deviceId: string | null;
  };
  provider: {
    configured: boolean;
    id: ProviderId | null;
  };
  email: {
    status: EmailConnectionStatus;
  };
}

export interface CloudDeviceRecord {
  deviceId: string;
  userId: string | null;
  piPublicKeyPem: string;
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

export interface CloudSnapshot {
  users: Array<{ userId: string; email: string }>;
  sessions: Array<{ token: string; userId: string }>;
  pairings: Array<{
    userCode: string;
    deviceCode: string;
    deviceId: string;
    status: PairingStatus;
  }>;
  devices: CloudDeviceRecord[];
}
