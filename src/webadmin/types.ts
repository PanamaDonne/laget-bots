/**
 * Chat providers still open in PAN-306. Berget pay-as-you-go is a candidate
 * again, together with Scaleway and OVH. This list is not a final choice.
 */
export const CHAT_PROVIDER_CANDIDATES = ["berget", "scaleway", "ovh"] as const;

export type ProviderId = (typeof CHAT_PROVIDER_CANDIDATES)[number];

export type EmailConnectionStatus = "disconnected" | "pending" | "connected";

export type PairingStatus = "pending" | "paired" | "expired";

export interface Session {
  token: string;
  userId: string;
  email: string;
  expiresAt: string;
}

export interface KeyEnvelope {
  alg: "RSA-OAEP-256";
  /** Base64url ciphertext. The cloud stores this only when it is opaque RSA output. */
  ciphertext: string;
  /** Fingerprint of the Pi public key the browser encrypted to. */
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

/** Test view of cloud state. No session tokens, device secrets, or sign-in codes. */
export interface CloudSnapshot {
  users: Array<{ userId: string; email: string }>;
  sessionCount: number;
  devices: Array<{
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
    };
  }>;
}

export interface SignInMailbox {
  deliver(message: { email: string; code: string }): void;
}
