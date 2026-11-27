export interface BrowserKeyEnvelope {
  alg: "RSA-OAEP-256";
  ciphertext: string;
  keyFingerprint: string;
}

export function fingerprintPublicKey(pem: string): Promise<string>;

export function encryptApiKeyInBrowser(
  apiKey: string,
  piPublicKeyPem: string,
): Promise<BrowserKeyEnvelope>;

export function generatePiKeyPairInBrowser(): Promise<{
  publicKeyPem: string;
  privateKeyPem: string;
}>;

export function submitProviderKeyFromPage(input: {
  apiKey: string;
  providerId: string;
  publicKeyPem: string;
  post: (path: string, body: { providerId: string; envelope: BrowserKeyEnvelope }) => Promise<unknown>;
}): Promise<{ providerId: string; envelope: BrowserKeyEnvelope }>;

export function attachAdminPage(
  doc: {
    querySelector(selector: string): {
      value?: string;
      textContent?: string;
      addEventListener(type: string, listener: (event?: { preventDefault?: () => void }) => void): void;
    } | null;
  },
  env?: {
    fetchImpl?: (path: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
      ok: boolean;
      status: number;
      json: () => Promise<Record<string, unknown>>;
    }>;
  },
): { token: string | null };
