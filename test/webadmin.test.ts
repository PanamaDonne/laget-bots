import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  createWebAdmin,
  decryptApiKeyOnPi,
  encryptApiKeyForPi,
  handleAdminRequest,
  type CloudSnapshot,
} from "../src/webadmin/index.ts";
import { encryptApiKeyInBrowser } from "../src/webadmin/client.js";
import { startWebAdminServer } from "../src/webadmin/serve.ts";

function generatePiKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

function assertNoPlaintextSecrets(snapshot: CloudSnapshot, forbidden: string[]): void {
  const serialized = JSON.stringify(snapshot);
  for (const secret of forbidden) {
    assert.equal(
      serialized.includes(secret),
      false,
      `cloud snapshot must not contain plaintext secret`,
    );
  }
}

test("user can sign in, pair the Pi, set an encrypted key, connect email, and see status", async () => {
  const admin = createWebAdmin();
  const { publicKeyPem, privateKeyPem } = generatePiKeyPair();
  const apiKey = "sk-test-plain-api-key-never-in-cloud";

  const session = admin.signIn({ email: "daniel@example.com" });
  assert.equal(session.email, "daniel@example.com");
  assert.ok(session.token.length > 10);

  const pending = admin.beginDevicePairing({
    deviceId: "pi-living-room",
    piPublicKeyPem: publicKeyPem,
  });
  assert.match(pending.userCode, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.ok(pending.deviceCode.length > 10);
  assert.equal(admin.pollPairing(pending.deviceCode).status, "pending");

  const paired = admin.confirmPairing({
    sessionToken: session.token,
    userCode: pending.userCode,
  });
  assert.equal(paired.deviceId, "pi-living-room");
  assert.equal(admin.pollPairing(pending.deviceCode).status, "paired");

  const envelope = await encryptApiKeyForPi(apiKey, publicKeyPem);
  assert.equal(envelope.ciphertext.includes(apiKey), false);
  assert.ok(envelope.ciphertext.length > 0);

  admin.submitProviderKey({
    sessionToken: session.token,
    providerId: "scaleway",
    envelope,
  });

  const emailStart = admin.startEmailConnection({ sessionToken: session.token });
  assert.equal(emailStart.status, "pending");

  admin.reportEmailStatusFromPi({
    deviceId: "pi-living-room",
    status: "connected",
  });

  const status = admin.getConnectionStatus({ sessionToken: session.token });
  assert.equal(status.signedIn, true);
  assert.equal(status.device.paired, true);
  assert.equal(status.device.deviceId, "pi-living-room");
  assert.equal(status.provider.configured, true);
  assert.equal(status.provider.id, "scaleway");
  assert.equal(status.email.status, "connected");
  assert.equal("apiKey" in status.provider, false);
  assert.equal("token" in status.email, false);
  assert.equal("mailToken" in status.email, false);

  const snapshot = admin.debugCloudSnapshot();
  assertNoPlaintextSecrets(snapshot, [apiKey, privateKeyPem.slice(0, 40)]);

  const device = snapshot.devices.find((entry) => entry.deviceId === "pi-living-room");
  assert.ok(device);
  assert.ok(device.provider?.keyCiphertext);
  assert.equal(device.provider?.keyCiphertext.includes(apiKey), false);
  assert.equal(device.email?.status, "connected");
  assert.equal("mailToken" in (device.email ?? {}), false);
  assert.equal("apiKey" in (device.provider ?? {}), false);
});

test("cloud store rejects plaintext API keys", () => {
  const admin = createWebAdmin();
  const { publicKeyPem } = generatePiKeyPair();
  const session = admin.signIn({ email: "daniel@example.com" });
  const pending = admin.beginDevicePairing({
    deviceId: "pi-1",
    piPublicKeyPem: publicKeyPem,
  });
  admin.confirmPairing({ sessionToken: session.token, userCode: pending.userCode });

  assert.throws(
    () =>
      admin.submitProviderKey({
        sessionToken: session.token,
        providerId: "scaleway",
        envelope: {
          alg: "RSA-OAEP-256",
          ciphertext: "sk-looks-like-plaintext",
          keyFingerprint: "deadbeef",
        },
      }),
    /ciphertext/i,
  );
});

test("unknown session cannot pair or read status", () => {
  const admin = createWebAdmin();
  assert.throws(
    () => admin.confirmPairing({ sessionToken: "missing", userCode: "AAAA-BBBB" }),
    /signed in|session/i,
  );
  assert.throws(() => admin.getConnectionStatus({ sessionToken: "missing" }), /signed in|session/i);
});

test("provider id must be an allowed EU pay-as-you-go option", async () => {
  const admin = createWebAdmin();
  const { publicKeyPem } = generatePiKeyPair();
  const session = admin.signIn({ email: "daniel@example.com" });
  const pending = admin.beginDevicePairing({
    deviceId: "pi-1",
    piPublicKeyPem: publicKeyPem,
  });
  admin.confirmPairing({ sessionToken: session.token, userCode: pending.userCode });
  const envelope = await encryptApiKeyForPi("sk-ok", publicKeyPem);

  assert.throws(
    () =>
      admin.submitProviderKey({
        sessionToken: session.token,
        providerId: "berget",
        envelope,
      }),
    /provider/i,
  );
});

test("errors never echo the raw API key", async () => {
  const admin = createWebAdmin();
  const { publicKeyPem } = generatePiKeyPair();
  const session = admin.signIn({ email: "daniel@example.com" });
  const pending = admin.beginDevicePairing({
    deviceId: "pi-1",
    piPublicKeyPem: publicKeyPem,
  });
  admin.confirmPairing({ sessionToken: session.token, userCode: pending.userCode });

  const secret = "sk-super-secret-value";
  try {
    admin.submitProviderKey({
      sessionToken: session.token,
      providerId: "scaleway",
      envelope: {
        alg: "RSA-OAEP-256",
        ciphertext: secret,
        keyFingerprint: "abcd",
      },
    });
    assert.fail("expected throw");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.equal(message.includes(secret), false);
    assert.match(message, /ciphertext/i);
  }
});

test("Pi can decrypt a key envelope that the cloud only stored as ciphertext", async () => {
  const { publicKeyPem, privateKeyPem } = generatePiKeyPair();
  const apiKey = "sk-roundtrip-key";
  const envelope = await encryptApiKeyForPi(apiKey, publicKeyPem);
  const plain = await decryptApiKeyOnPi(envelope, privateKeyPem);
  assert.equal(plain, apiKey);
});

test("browser webcrypto envelope decrypts with the Pi private key", async () => {
  const { publicKeyPem, privateKeyPem } = generatePiKeyPair();
  const apiKey = "sk-browser-only";
  const envelope = await encryptApiKeyInBrowser(apiKey, publicKeyPem);
  assert.equal(envelope.ciphertext.includes(apiKey), false);
  assert.equal(await decryptApiKeyOnPi(envelope, privateKeyPem), apiKey);
});

test("email connection keeps tokens off the cloud", () => {
  const admin = createWebAdmin();
  const { publicKeyPem } = generatePiKeyPair();
  const session = admin.signIn({ email: "daniel@example.com" });
  const pending = admin.beginDevicePairing({
    deviceId: "pi-1",
    piPublicKeyPem: publicKeyPem,
  });
  admin.confirmPairing({ sessionToken: session.token, userCode: pending.userCode });
  admin.startEmailConnection({ sessionToken: session.token });

  assert.throws(
    () =>
      admin.reportEmailStatusFromPi({
        deviceId: "pi-1",
        status: "connected",
        mailToken: "ya29.should-never-arrive",
      } as { deviceId: string; status: "connected" }),
    /mail token|secret|not accepted/i,
  );

  admin.reportEmailStatusFromPi({ deviceId: "pi-1", status: "connected" });
  const snapshot = admin.debugCloudSnapshot();
  assertNoPlaintextSecrets(snapshot, ["ya29.should-never-arrive"]);
});

test("HTTP adapter covers sign-in through status without leaking the key", async () => {
  const admin = createWebAdmin();
  const { publicKeyPem } = generatePiKeyPair();
  const apiKey = "sk-http-adapter-secret";

  const signIn = handleAdminRequest(admin, {
    method: "POST",
    path: "/api/auth/sign-in",
    headers: {},
    body: { email: "daniel@example.com" },
  });
  assert.equal(signIn.status, 200);
  const token =
    signIn.body && typeof signIn.body === "object" && !Array.isArray(signIn.body)
      ? String(signIn.body.token)
      : "";
  assert.ok(token);

  const begin = handleAdminRequest(admin, {
    method: "POST",
    path: "/api/pairing/begin",
    headers: {},
    body: { deviceId: "pi-http", piPublicKeyPem: publicKeyPem },
  });
  assert.equal(begin.status, 200);
  const beginBody =
    begin.body && typeof begin.body === "object" && !Array.isArray(begin.body) ? begin.body : {};
  const userCode = String(beginBody.userCode);
  const deviceCode = String(beginBody.deviceCode);

  const confirm = handleAdminRequest(admin, {
    method: "POST",
    path: "/api/pairing/confirm",
    headers: { authorization: `Bearer ${token}` },
    body: { userCode },
  });
  assert.equal(confirm.status, 200);

  const poll = handleAdminRequest(admin, {
    method: "GET",
    path: `/api/pairing/poll/${deviceCode}`,
    headers: {},
  });
  assert.equal(poll.status, 200);

  const envelope = await encryptApiKeyForPi(apiKey, publicKeyPem);
  const keyRes = handleAdminRequest(admin, {
    method: "POST",
    path: "/api/provider/key",
    headers: { authorization: `Bearer ${token}` },
    body: {
      providerId: "ovh",
      envelope: {
        alg: envelope.alg,
        ciphertext: envelope.ciphertext,
        keyFingerprint: envelope.keyFingerprint,
      },
    },
  });
  assert.equal(keyRes.status, 200);

  assert.equal(
    handleAdminRequest(admin, {
      method: "POST",
      path: "/api/email/start",
      headers: { authorization: `Bearer ${token}` },
    }).status,
    200,
  );
  assert.equal(
    handleAdminRequest(admin, {
      method: "POST",
      path: "/api/email/status",
      headers: {},
      body: { deviceId: "pi-http", status: "connected" },
    }).status,
    200,
  );

  const status = handleAdminRequest(admin, {
    method: "GET",
    path: "/api/status",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(status.status, 200);
  const serialized = JSON.stringify(status.body);
  assert.equal(serialized.includes(apiKey), false);
  assert.match(serialized, /"configured":true/);
  assert.match(serialized, /"email":\{"status":"connected"\}/);
});

test("hosted page encrypts the key in the client before the cloud stores status", async () => {
  const server = await startWebAdminServer(0);
  const base = `http://127.0.0.1:${server.port}`;
  const apiKey = "sk-hosted-page-secret";
  try {
    const page = await fetch(`${base}/`);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /id="sign-in"/);
    assert.match(html, /id="pair"/);
    assert.match(html, /id="provider-key"/);
    assert.match(html, /id="email-connect"/);
    assert.match(html, /src="\/client.js"/);
    assert.equal(html.includes(apiKey), false);

    const client = await (await fetch(`${base}/client.js`)).text();
    assert.match(client, /encryptApiKeyInBrowser/);
    assert.match(client, /\/api\/provider\/key/);
    assert.equal(client.includes("apiKey:"), false);

    const { publicKeyPem } = generatePiKeyPair();
    const signIn = await fetch(`${base}/api/auth/sign-in`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "daniel@example.com" }),
    });
    const session = (await signIn.json()) as { token: string };
    const pending = await fetch(`${base}/api/pairing/begin`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: "pi-hosted", piPublicKeyPem: publicKeyPem }),
    });
    const pairing = (await pending.json()) as { userCode: string };
    await fetch(`${base}/api/pairing/confirm`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ userCode: pairing.userCode }),
    });
    const envelope = await encryptApiKeyInBrowser(apiKey, publicKeyPem);
    const saved = await fetch(`${base}/api/provider/key`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({ providerId: "scaleway", envelope }),
    });
    assert.equal(saved.status, 200);
    const status = await fetch(`${base}/api/status`, {
      headers: { authorization: `Bearer ${session.token}` },
    });
    const body = await status.text();
    assert.equal(body.includes(apiKey), false);
    assert.match(body, /"configured":true/);
    assert.equal(body.includes(envelope.ciphertext), false);
  } finally {
    await server.close();
  }
});
