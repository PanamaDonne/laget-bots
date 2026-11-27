import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";
import {
  CHAT_PROVIDER_CANDIDATES,
  createWebAdmin,
  decryptApiKeyOnPi,
  encryptApiKeyForPi,
  fingerprintPublicKey,
  handleAdminRequest,
  startWebAdminServer,
  type KeyEnvelope,
  type SignInMailbox,
  type WebAdmin,
  type WebAdminApp,
} from "../src/webadmin/index.ts";
import {
  attachAdminPage,
  encryptApiKeyInBrowser,
  submitProviderKeyFromPage,
} from "../src/webadmin/client.js";

function generatePiKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

class Inbox implements SignInMailbox {
  readonly codes = new Map<string, string>();

  deliver(message: { email: string; code: string }): void {
    this.codes.set(message.email, message.code);
  }
}

function setup(now: () => number = () => 1_700_000_000_000): WebAdminApp & { mailbox: Inbox } {
  const mailbox = new Inbox();
  return { ...createWebAdmin({ mailbox, now }), mailbox };
}

function signIn(app: WebAdminApp & { mailbox: Inbox }, email = "daniel@example.com") {
  app.admin.requestSignIn({ email });
  const code = app.mailbox.codes.get(email);
  assert.ok(code);
  return app.admin.confirmSignIn({ email, code });
}

function pairPi(
  app: WebAdminApp & { mailbox: Inbox },
  sessionToken: string,
  keys = generatePiKeyPair(),
  deviceId = "pi-living-room",
) {
  const pending = app.admin.beginDevicePairing({
    deviceId,
    piPublicKeyPem: keys.publicKeyPem,
  });
  assert.ok(pending.deviceSecret);
  const fingerprint = fingerprintPublicKey(keys.publicKeyPem);
  app.admin.confirmPairing({
    sessionToken,
    userCode: pending.userCode,
    keyFingerprint: fingerprint,
  });
  return { ...pending, deviceSecret: pending.deviceSecret, fingerprint, keys, deviceId };
}

test("sign-in without email proof is refused", () => {
  const app = setup();
  assert.throws(() => app.admin.signIn({ email: "daniel@example.com" }), /email proof/i);
  const pending = app.admin.requestSignIn({ email: "daniel@example.com" });
  assert.deepEqual(pending, { pending: true });
  assert.equal("token" in pending, false);
  assert.throws(
    () => app.admin.confirmSignIn({ email: "daniel@example.com", code: "WRONGCODE" }),
    /email proof/i,
  );
  assert.equal(app.inspect().users.length, 0);
});

test("a proved sign-in can sign out and the session expires", () => {
  let clock = 1_700_000_000_000;
  const app = setup(() => clock);
  const session = signIn(app);
  assert.equal(session.email, "daniel@example.com");
  const again = signIn(app);
  assert.equal(again.userId, session.userId);

  app.admin.signOut({ sessionToken: session.token });
  assert.throws(() => app.admin.getConnectionStatus({ sessionToken: session.token }), /not signed in/i);

  clock += 12 * 60 * 60 * 1000 + 1;
  assert.throws(() => app.admin.getConnectionStatus({ sessionToken: again.token }), /not signed in/i);
});

test("pairing does not overwrite a paired Pi and email status needs the device secret", async () => {
  const app = setup();
  const session = signIn(app);
  const keys = generatePiKeyPair();
  const paired = pairPi(app, session.token, keys);
  const envelope = await encryptApiKeyForPi("sk-owner-key", keys.publicKeyPem);
  app.admin.submitProviderKey({
    sessionToken: session.token,
    providerId: "scaleway",
    envelope,
  });

  const attacker = generatePiKeyPair();
  assert.throws(
    () =>
      app.admin.beginDevicePairing({
        deviceId: paired.deviceId,
        piPublicKeyPem: attacker.publicKeyPem,
      }),
    /already paired/i,
  );
  const after = app.inspect().devices.find((device) => device.deviceId === paired.deviceId);
  assert.equal(after?.userId, session.userId);
  assert.equal(after?.piPublicKeyPem, keys.publicKeyPem);
  assert.equal(after?.provider?.id, "scaleway");

  assert.throws(
    () =>
      app.admin.reportEmailStatusFromPi({
        deviceId: paired.deviceId,
        status: "connected",
        deviceSecret: "guessed-secret",
      }),
    /device proof/i,
  );
  assert.equal(after?.email.status, "disconnected");

  app.admin.reportEmailStatusFromPi({
    deviceId: paired.deviceId,
    status: "connected",
    deviceSecret: paired.deviceSecret,
  });
  assert.equal(
    app.inspect().devices.find((device) => device.deviceId === paired.deviceId)?.email.status,
    "connected",
  );
});

test("confirmPairing refuses a fingerprint that was not shown on the Pi", () => {
  const app = setup();
  const session = signIn(app);
  const keys = generatePiKeyPair();
  const other = generatePiKeyPair();
  const pending = app.admin.beginDevicePairing({
    deviceId: "pi-1",
    piPublicKeyPem: keys.publicKeyPem,
  });
  assert.throws(
    () =>
      app.admin.beginDevicePairing({
        deviceId: "pi-1",
        piPublicKeyPem: other.publicKeyPem,
      }),
    /device proof/i,
  );
  assert.equal(
    app.inspect().devices.find((device) => device.deviceId === "pi-1")?.piPublicKeyPem,
    keys.publicKeyPem,
  );
  assert.throws(
    () =>
      app.admin.confirmPairing({
        sessionToken: session.token,
        userCode: pending.userCode,
        keyFingerprint: fingerprintPublicKey(other.publicKeyPem),
      }),
    /fingerprint/i,
  );
  assert.equal(app.admin.getConnectionStatus({ sessionToken: session.token }).device.paired, false);
  app.admin.confirmPairing({
    sessionToken: session.token,
    userCode: pending.userCode,
    keyFingerprint: fingerprintPublicKey(keys.publicKeyPem),
  });
  assert.equal(app.admin.getConnectionStatus({ sessionToken: session.token }).device.paired, true);
});

test("ciphertext of any other length is rejected and never stored", async () => {
  const app = setup();
  const session = signIn(app);
  const keys = generatePiKeyPair();
  pairPi(app, session.token, keys, "pi-cipher");

  const samples = [
    "sk-short-plain-key",
    `sk-real-plain-key-${"B".repeat(420)}`,
    `sk-real-plain-key-${"A".repeat(342)}`.slice(0, 342),
  ];
  for (const ciphertext of samples) {
    assert.throws(
      () =>
        app.admin.submitProviderKey({
          sessionToken: session.token,
          providerId: "berget",
          envelope: {
            alg: "RSA-OAEP-256",
            ciphertext,
            keyFingerprint: fingerprintPublicKey(keys.publicKeyPem),
          },
        }),
      /REDACTED/,
    );
    const stored = JSON.stringify(app.inspect());
    assert.equal(stored.includes(ciphertext), false, ciphertext.slice(0, 24));
    assert.equal(stored.includes("sk-real-plain-key"), false);
    assert.equal(stored.includes("sk-short-plain-key"), false);
  }

  const apiKey = "sk-real-owner-key";
  const envelope = await encryptApiKeyForPi(apiKey, keys.publicKeyPem);
  app.admin.submitProviderKey({
    sessionToken: session.token,
    providerId: "berget",
    envelope,
  });
  const snapshot = JSON.stringify(app.inspect());
  assert.equal(snapshot.includes(apiKey), false);
  assert.match(snapshot, /"id":"berget"/);
  assert.equal(await decryptApiKeyOnPi(envelope, keys.privateKeyPem), apiKey);
});

test("errors include the rejected secret only after it has been scrubbed", () => {
  const app = setup();
  const session = signIn(app);
  const keys = generatePiKeyPair();
  const pending = app.admin.beginDevicePairing({
    deviceId: "pi-scrub",
    piPublicKeyPem: keys.publicKeyPem,
  });
  app.admin.confirmPairing({
    sessionToken: session.token,
    userCode: pending.userCode,
    keyFingerprint: fingerprintPublicKey(keys.publicKeyPem),
  });
  const secret = "sk-super-secret-value";
  try {
    app.admin.submitProviderKey({
      sessionToken: session.token,
      providerId: "ovh",
      envelope: {
        alg: "RSA-OAEP-256",
        ciphertext: secret,
        keyFingerprint: fingerprintPublicKey(keys.publicKeyPem),
      },
    });
    assert.fail("expected throw");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.equal(message.includes(secret), false);
    assert.match(message, /\[REDACTED\]/);
  }
});

test("unknown provider ids are refused and PAN-306 candidates are accepted", async () => {
  const app = setup();
  const session = signIn(app);
  const keys = generatePiKeyPair();
  pairPi(app, session.token, keys, "pi-providers");
  const envelope = await encryptApiKeyForPi("sk-candidate", keys.publicKeyPem);
  assert.throws(
    () =>
      app.admin.submitProviderKey({
        sessionToken: session.token,
        providerId: "not-a-provider",
        envelope,
      }),
    /provider/i,
  );
  for (const providerId of CHAT_PROVIDER_CANDIDATES) {
    app.admin.submitProviderKey({ sessionToken: session.token, providerId, envelope });
    assert.equal(
      app.admin.getConnectionStatus({ sessionToken: session.token }).provider.id,
      providerId,
    );
  }
  assert.equal(CHAT_PROVIDER_CANDIDATES.includes("berget"), true);
});

test("browser webcrypto envelope decrypts with the Pi private key", async () => {
  const { publicKeyPem, privateKeyPem } = generatePiKeyPair();
  const apiKey = "sk-browser-only";
  const envelope = await encryptApiKeyInBrowser(apiKey, publicKeyPem);
  assert.equal(envelope.ciphertext.includes(apiKey), false);
  assert.equal(await decryptApiKeyOnPi(envelope, privateKeyPem), apiKey);
});

test("HTTP routes require email proof, device proof, and reject secret fields", async () => {
  const app = setup();
  const keys = generatePiKeyPair();
  const signInResponse = handleAdminRequest(app.admin, {
    method: "POST",
    path: "/api/auth/sign-in",
    headers: {},
    body: { email: "daniel@example.com" },
  });
  assert.equal(signInResponse.status, 200);
  assert.equal(JSON.stringify(signInResponse.body).includes("token"), false);
  const code = app.mailbox.codes.get("daniel@example.com");
  assert.ok(code);
  const confirmed = handleAdminRequest(app.admin, {
    method: "POST",
    path: "/api/auth/confirm",
    headers: {},
    body: { email: "daniel@example.com", code },
  });
  assert.equal(confirmed.status, 200);
  const token =
    confirmed.body && typeof confirmed.body === "object" && !Array.isArray(confirmed.body)
      ? String(confirmed.body.token)
      : "";
  const pending = app.admin.beginDevicePairing({
    deviceId: "pi-http",
    piPublicKeyPem: keys.publicKeyPem,
  });
  const fingerprint = fingerprintPublicKey(keys.publicKeyPem);
  assert.equal(
    handleAdminRequest(app.admin, {
      method: "POST",
      path: "/api/pairing/confirm",
      headers: { authorization: `Bearer ${token}` },
      body: { userCode: pending.userCode, keyFingerprint: "deadbeefdeadbeef" },
    }).status,
    400,
  );
  assert.equal(
    handleAdminRequest(app.admin, {
      method: "POST",
      path: "/api/pairing/confirm",
      headers: { authorization: `Bearer ${token}` },
      body: { userCode: pending.userCode, keyFingerprint: fingerprint },
    }).status,
    200,
  );

  const overwrite = handleAdminRequest(app.admin, {
    method: "POST",
    path: "/api/pairing/begin",
    headers: {},
    body: { deviceId: "pi-http", piPublicKeyPem: generatePiKeyPair().publicKeyPem },
  });
  assert.equal(overwrite.status, 400);
  const status = handleAdminRequest(app.admin, {
    method: "GET",
    path: "/api/status",
    headers: { authorization: `Bearer ${token}` },
  });
  const statusText = JSON.stringify(status.body);
  assert.match(statusText, /"paired":true/);
  assert.equal(statusText.includes("BEGIN PUBLIC KEY"), false);
  assert.equal(statusText.includes("piPublicKeyPem"), false);

  assert.ok(pending.deviceSecret);
  const mailed = handleAdminRequest(app.admin, {
    method: "POST",
    path: "/api/email/status",
    headers: {},
    body: {
      deviceId: "pi-http",
      status: "connected",
      deviceSecret: pending.deviceSecret,
      mailToken: "ya29.should-never-arrive",
    },
  });
  assert.equal(mailed.status, 400);
  assert.equal(JSON.stringify(app.inspect()).includes("ya29.should-never-arrive"), false);
  assert.equal(
    app.inspect().devices.find((device) => device.deviceId === "pi-http")?.email.status,
    "disconnected",
  );

  assert.equal(
    handleAdminRequest(app.admin, {
      method: "POST",
      path: "/api/auth/sign-out",
      headers: { authorization: `Bearer ${token}` },
    }).status,
    200,
  );
  assert.equal(
    handleAdminRequest(app.admin, {
      method: "GET",
      path: "/api/status",
      headers: { authorization: `Bearer ${token}` },
    }).status,
    401,
  );
});

test("unexpected errors do not echo internal details", () => {
  const admin = {
    requestSignIn() {
      throw new Error("postgres://user:secret@internal-host/db");
    },
  } as unknown as WebAdmin;
  const response = handleAdminRequest(admin, {
    method: "POST",
    path: "/api/auth/sign-in",
    headers: {},
    body: { email: "daniel@example.com" },
  });
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { error: "Request failed." });
});

test("the page form encrypts with the local Pi key and does not persist the session token", async () => {
  const attacker = generatePiKeyPair();
  const calls: Array<{ path: string; body?: string; headers: Record<string, string> }> = [];
  const fetchImpl: Parameters<typeof attachAdminPage>[1] extends infer Env
    ? Env extends { fetchImpl?: infer Fetch }
      ? Fetch
      : never
    : never = async (path, init) => {
    calls.push({ path, body: init.body, headers: init.headers });
    const payload: Record<string, unknown> =
      path === "/api/auth/sign-in"
        ? { pending: true }
        : path === "/api/auth/confirm"
          ? { token: "sess_page", email: "daniel@example.com", expiresAt: "2099-01-01T00:00:00.000Z" }
          : path === "/api/pairing/begin"
            ? { userCode: "ABCD-EFGH", deviceCode: "device_x", deviceSecret: "device-secret-not-on-screen" }
            : path === "/api/pairing/confirm"
              ? { deviceId: "pi-local" }
              : path === "/api/status"
                ? {
                    signedIn: true,
                    device: {
                      paired: true,
                      deviceId: "pi-local",
                      piPublicKeyPem: attacker.publicKeyPem,
                    },
                    provider: { configured: false, id: null },
                    email: { status: "disconnected" },
                  }
                : { ok: true };
    return { ok: true, status: 200, json: async () => payload };
  };

  const nodes = new Map<string, FakeNode>();
  const doc = {
    querySelector(selector: string) {
      return nodes.get(selector) ?? null;
    },
  };
  for (const id of [
    "#sign-in",
    "#sign-in-code",
    "#pair",
    "#provider-key",
    "#email",
    "#email-code",
    "#user-code",
    "#key-fingerprint",
    "#provider",
    "#api-key",
    "#email-connect",
    "#sign-out",
    "#pi-start",
    "#pi-email",
    "#status",
    "#message",
    "#pi-user-code",
    "#pi-fingerprint",
    "#pi-device-id",
  ]) {
    nodes.set(id, new FakeNode());
  }
  const memory = attachAdminPage(doc, { fetchImpl });
  assert.equal(memory.token, null);

  nodes.get("#email")!.value = "daniel@example.com";
  await nodes.get("#sign-in")!.emit("submit");
  assert.equal(memory.token, null);

  nodes.get("#email-code")!.value = "PROVED";
  await nodes.get("#sign-in-code")!.emit("submit");
  assert.equal(memory.token, "sess_page");

  await nodes.get("#pi-start")!.emit("click");
  const screen = [
    nodes.get("#message")!.textContent,
    nodes.get("#pi-user-code")!.textContent,
    nodes.get("#pi-fingerprint")!.textContent,
    nodes.get("#pi-device-id")!.textContent,
    nodes.get("#status")!.textContent,
  ].join("\n");
  assert.equal(screen.includes("device-secret-not-on-screen"), false);
  assert.ok(nodes.get("#pi-fingerprint")!.textContent.length > 8);

  nodes.get("#user-code")!.value = nodes.get("#pi-user-code")!.textContent;
  nodes.get("#key-fingerprint")!.value = nodes.get("#pi-fingerprint")!.textContent;
  await nodes.get("#pair")!.emit("submit");

  const apiKey = "sk-form-secret";
  nodes.get("#provider")!.value = "berget";
  nodes.get("#api-key")!.value = apiKey;
  await nodes.get("#provider-key")!.emit("submit");
  const posted = calls.find((call) => call.path === "/api/provider/key");
  assert.ok(posted?.body);
  assert.equal(posted.body.includes(apiKey), false);
  assert.equal(posted.body.includes("apiKey"), false);
  const parsed = JSON.parse(posted.body) as { providerId: string; envelope: KeyEnvelope };
  assert.equal(parsed.providerId, "berget");
  await assert.rejects(() => decryptApiKeyOnPi(parsed.envelope, attacker.privateKeyPem));
  assert.equal(nodes.get("#api-key")!.value, "");

  await nodes.get("#sign-out")!.emit("click");
  assert.equal(memory.token, null);
  assert.equal(nodes.get("#status")!.textContent, "Inte inloggad.");
});

test("submitProviderKeyFromPage posts an envelope and not the plaintext key", async () => {
  const keys = generatePiKeyPair();
  const apiKey = "sk-direct-form-secret";
  let posted = "";
  await submitProviderKeyFromPage({
    apiKey,
    providerId: "berget",
    publicKeyPem: keys.publicKeyPem,
    post: async (_path, body) => {
      posted = JSON.stringify(body);
    },
  });
  assert.equal(posted.includes(apiKey), false);
  const envelope = JSON.parse(posted).envelope as KeyEnvelope;
  assert.equal(await decryptApiKeyOnPi(envelope, keys.privateKeyPem), apiKey);
});

test("hosted page does not serve the sign-in code or the Pi public key", async () => {
  const server = await startWebAdminServer(0);
  const base = `http://127.0.0.1:${server.port}`;
  try {
    const html = await (await fetch(`${base}/`)).text();
    const client = await (await fetch(`${base}/client.js`)).text();
    assert.match(html, /id="sign-in-code"/);
    assert.match(html, /id="key-fingerprint"/);
    assert.match(html, /value="berget"/);
    assert.equal(client.includes("sessionStorage"), false);
    assert.equal(client.includes("localStorage"), false);
    assert.equal(client.includes("piPublicKeyPem"), true);
    assert.equal(client.includes("status.device.piPublicKeyPem"), false);

    const inbox = await fetch(`${base}/api/auth/inbox`);
    assert.equal(inbox.status, 404);
    const requested = await fetch(`${base}/api/auth/sign-in`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "daniel@example.com" }),
    });
    const requestBody = await requested.text();
    const code = server.takeSignInCode("daniel@example.com");
    assert.ok(code);
    assert.equal(requestBody.includes(code), false);
  } finally {
    await server.close();
  }
});

class FakeNode {
  value = "";
  textContent = "";
  private readonly listeners = new Map<string, () => Promise<void> | void>();

  addEventListener(type: string, listener: () => Promise<void> | void): void {
    this.listeners.set(type, listener);
  }

  async emit(type: string): Promise<void> {
    await this.listeners.get(type)?.();
  }
}
