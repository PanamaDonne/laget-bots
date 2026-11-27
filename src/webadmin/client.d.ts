export interface BrowserKeyEnvelope {
  alg: "RSA-OAEP-256";
  ciphertext: string;
  keyFingerprint: string;
}

export function encryptApiKeyInBrowser(
  apiKey: string,
  piPublicKeyPem: string,
): Promise<BrowserKeyEnvelope>;

export function generatePiKeyPairInBrowser(): Promise<{
  publicKeyPem: string;
  privateKeyPem: string;
}>;
