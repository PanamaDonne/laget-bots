/**
 * Browser-side web admin.
 * The API key is encrypted with the Pi public key held in this page.
 * The session token stays in a page-memory variable. A reload signs the user out.
 */
/* global atob, btoa, crypto, document, fetch, TextEncoder */

function pemToDer(pem) {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function toBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function toPem(label, bytes) {
  const body = bytesToBase64(bytes).match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

export async function fingerprintPublicKey(pem) {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", pemToDer(pem)));
  return [...hash]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

export async function encryptApiKeyInBrowser(apiKey, piPublicKeyPem) {
  const key = await crypto.subtle.importKey(
    "spki",
    pemToDer(piPublicKeyPem),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, new TextEncoder().encode(apiKey)),
  );
  return {
    alg: "RSA-OAEP-256",
    ciphertext: toBase64Url(ciphertext),
    keyFingerprint: await fingerprintPublicKey(piPublicKeyPem),
  };
}

export async function generatePiKeyPairInBrowser() {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const privateKey = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  return {
    publicKeyPem: toPem("PUBLIC KEY", publicKey),
    privateKeyPem: toPem("PRIVATE KEY", privateKey),
  };
}

function text(node) {
  return node ? String(node.value ?? "") : "";
}

/**
 * The provider-key submit path. Posts only providerId and the envelope.
 * Callers must pass the Pi public key they verified, never one read from the cloud.
 */
export async function submitProviderKeyFromPage({ apiKey, providerId, publicKeyPem, post }) {
  const envelope = await encryptApiKeyInBrowser(apiKey, publicKeyPem);
  const body = { providerId, envelope };
  await post("/api/provider/key", body);
  return body;
}

export function attachAdminPage(doc, env = {}) {
  const fetchImpl = env.fetchImpl ?? fetch;
  const memory = { token: null };
  let pi = null;

  const signInForm = doc.querySelector("#sign-in");
  const codeForm = doc.querySelector("#sign-in-code");
  const pairForm = doc.querySelector("#pair");
  const keyForm = doc.querySelector("#provider-key");
  const emailButton = doc.querySelector("#email-connect");
  const signOutButton = doc.querySelector("#sign-out");
  const piStart = doc.querySelector("#pi-start");
  const piEmail = doc.querySelector("#pi-email");
  const statusOut = doc.querySelector("#status");
  const messageOut = doc.querySelector("#message");
  const userCodeOut = doc.querySelector("#pi-user-code");
  const fingerprintOut = doc.querySelector("#pi-fingerprint");

  function say(message) {
    if (messageOut) messageOut.textContent = message;
  }

  function authHeaders() {
    return memory.token ? { authorization: `Bearer ${memory.token}` } : {};
  }

  async function api(method, path, body, extraHeaders) {
    const response = await fetchImpl(path, {
      method,
      headers: {
        ...authHeaders(),
        ...(extraHeaders ?? {}),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json();
    if (response.status === 401) memory.token = null;
    if (!response.ok) {
      throw new Error(typeof payload.error === "string" ? payload.error : "Request failed.");
    }
    return payload;
  }

  async function refreshStatus() {
    if (!memory.token || !statusOut) return;
    const status = await api("GET", "/api/status");
    statusOut.textContent = [
      "Inloggad: ja",
      `Pi parad: ${status.device.paired ? status.device.deviceId : "nej"}`,
      `Leverantör: ${status.provider.configured ? status.provider.id : "saknas"}`,
      `E-post: ${status.email.status}`,
    ].join("\n");
  }

  function guard(action) {
    return async (event) => {
      try {
        if (event?.preventDefault) event.preventDefault();
        await action();
      } catch (error) {
        say(error instanceof Error ? error.message : "Något gick fel.");
      }
    };
  }

  signInForm?.addEventListener(
    "submit",
    guard(async () => {
      const email = text(doc.querySelector("#email"));
      await api("POST", "/api/auth/sign-in", { email });
      say("Koden skickades. Skriv in den för att visa att adressen är din.");
    }),
  );

  codeForm?.addEventListener(
    "submit",
    guard(async () => {
      const email = text(doc.querySelector("#email"));
      const code = text(doc.querySelector("#email-code"));
      const session = await api("POST", "/api/auth/confirm", { email, code });
      memory.token = session.token;
      const codeField = doc.querySelector("#email-code");
      if (codeField) codeField.value = "";
      say(`Inloggad som ${session.email}`);
      await refreshStatus();
    }),
  );

  signOutButton?.addEventListener(
    "click",
    guard(async () => {
      await api("POST", "/api/auth/sign-out");
      memory.token = null;
      if (statusOut) statusOut.textContent = "Inte inloggad.";
      say("Utloggad.");
    }),
  );

  pairForm?.addEventListener(
    "submit",
    guard(async () => {
      const userCode = text(doc.querySelector("#user-code"));
      const keyFingerprint = text(doc.querySelector("#key-fingerprint"));
      const paired = await api("POST", "/api/pairing/confirm", { userCode, keyFingerprint });
      say(`Parad med ${paired.deviceId}`);
      await refreshStatus();
    }),
  );

  keyForm?.addEventListener(
    "submit",
    guard(async () => {
      const apiKey = text(doc.querySelector("#api-key"));
      const providerId = text(doc.querySelector("#provider"));
      if (!pi?.publicKeyPem) {
        say("Starta Pi:n här så nyckeln finns lokalt. Molnet lämnar inte ut den.");
        return;
      }
      await submitProviderKeyFromPage({
        apiKey,
        providerId,
        publicKeyPem: pi.publicKeyPem,
        post: (path, body) => api("POST", path, body),
      });
      const field = doc.querySelector("#api-key");
      if (field) field.value = "";
      say("Nyckeln krypterades med Pi:ns egen nyckel. Molnet har bara chiffertext.");
      await refreshStatus();
    }),
  );

  emailButton?.addEventListener(
    "click",
    guard(async () => {
      await api("POST", "/api/email/start");
      say("E-post väntar. Token stannar på Pi:n.");
      await refreshStatus();
    }),
  );

  piStart?.addEventListener(
    "click",
    guard(async () => {
      const generated = await generatePiKeyPairInBrowser();
      const deviceId = `pi-${crypto.randomUUID().slice(0, 8)}`;
      const pending = await api("POST", "/api/pairing/begin", {
        deviceId,
        piPublicKeyPem: generated.publicKeyPem,
      });
      pi = {
        deviceId,
        publicKeyPem: generated.publicKeyPem,
        deviceSecret: pending.deviceSecret,
      };
      if (userCodeOut) userCodeOut.textContent = pending.userCode;
      if (fingerprintOut) fingerprintOut.textContent = await fingerprintPublicKey(generated.publicKeyPem);
      const deviceOut = doc.querySelector("#pi-device-id");
      if (deviceOut) deviceOut.textContent = deviceId;
      say("Jämför fingeravtrycket med radion innan du bekräftar. Hemligheten lämnar inte Pi-panelen.");
    }),
  );

  piEmail?.addEventListener(
    "click",
    guard(async () => {
      if (!pi?.deviceSecret) {
        say("Starta ihopparning på Pi:n först.");
        return;
      }
      await api("POST", "/api/email/status", {
        deviceId: pi.deviceId,
        status: "connected",
        deviceSecret: pi.deviceSecret,
      });
      say("Pi rapporterade e-poststatus. Ingen mejltoken skickades.");
      await refreshStatus();
    }),
  );

  refreshStatus().catch(() => {
    if (statusOut) statusOut.textContent = "Inte inloggad.";
  });

  return memory;
}

if (typeof document !== "undefined") {
  attachAdminPage(document);
}
