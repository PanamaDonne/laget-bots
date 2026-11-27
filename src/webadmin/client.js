/**
 * Browser-side web admin. Encrypts the API key with the Pi public key
 * before anything is sent. The plaintext key never leaves this page.
 */
/* global atob, btoa, crypto, document, fetch, FormData, sessionStorage, TextEncoder */

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
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function toBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function toPem(label, bytes) {
  const body = bytesToBase64(bytes).match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----`;
}

async function fingerprintPublicKey(pem) {
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

function wirePage() {
  const tokenKey = "radio-days-webadmin-token";
  let pi = null;

  const signInForm = document.querySelector("#sign-in");
  const pairForm = document.querySelector("#pair");
  const keyForm = document.querySelector("#provider-key");
  const emailButton = document.querySelector("#email-connect");
  const piStart = document.querySelector("#pi-start");
  const piEmail = document.querySelector("#pi-email");
  const statusOut = document.querySelector("#status");
  const messageOut = document.querySelector("#message");
  const userCodeOut = document.querySelector("#pi-user-code");

  function say(text) {
    if (messageOut) messageOut.textContent = text;
  }

  function guard(action) {
    return async (event) => {
      try {
        await action(event);
      } catch (error) {
        say(error instanceof Error ? error.message : "Något gick fel.");
      }
    };
  }

  function authHeaders() {
    const token = sessionStorage.getItem(tokenKey);
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  async function api(method, path, body) {
    const response = await fetch(path, {
      method,
      headers: {
        ...authHeaders(),
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(typeof payload.error === "string" ? payload.error : "Request failed.");
    }
    return payload;
  }

  async function refreshStatus() {
    if (!sessionStorage.getItem(tokenKey) || !statusOut) return;
    const status = await api("GET", "/api/status");
    statusOut.textContent = [
      `Inloggad: ja`,
      `Pi parad: ${status.device.paired ? status.device.deviceId : "nej"}`,
      `Leverantör: ${status.provider.configured ? status.provider.id : "saknas"}`,
      `E-post: ${status.email.status}`,
    ].join("\n");
  }

  signInForm?.addEventListener(
    "submit",
    guard(async (event) => {
      event.preventDefault();
      const email = new FormData(signInForm).get("email");
      const session = await api("POST", "/api/auth/sign-in", { email: String(email) });
      sessionStorage.setItem(tokenKey, session.token);
      say(`Inloggad som ${session.email}`);
      await refreshStatus();
    }),
  );

  pairForm?.addEventListener(
    "submit",
    guard(async (event) => {
      event.preventDefault();
      const userCode = new FormData(pairForm).get("userCode");
      const paired = await api("POST", "/api/pairing/confirm", { userCode: String(userCode) });
      say(`Parad med ${paired.deviceId}`);
      await refreshStatus();
    }),
  );

  keyForm?.addEventListener(
    "submit",
    guard(async (event) => {
      event.preventDefault();
      const form = new FormData(keyForm);
      const apiKey = String(form.get("apiKey") ?? "");
      const providerId = String(form.get("providerId") ?? "");
      const status = await api("GET", "/api/status");
      const pem = status.device.piPublicKeyPem;
      if (!pem) {
        say("Para ihop Pi:n först.");
        return;
      }
      const envelope = await encryptApiKeyInBrowser(apiKey, pem);
      await api("POST", "/api/provider/key", { providerId, envelope });
      const field = keyForm.querySelector("input[name=apiKey]");
      if (field) field.value = "";
      say("Nyckeln krypterades i webbläsaren. Molnet har bara chiffertext.");
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
      pi = await generatePiKeyPairInBrowser();
      const pending = await api("POST", "/api/pairing/begin", {
        deviceId: "pi-web",
        piPublicKeyPem: pi.publicKeyPem,
      });
      pi.deviceCode = pending.deviceCode;
      if (userCodeOut) userCodeOut.textContent = pending.userCode;
      say("Pi väntar på koden. Den privata nyckeln lämnar inte den här panelen.");
    }),
  );

  piEmail?.addEventListener(
    "click",
    guard(async () => {
      await api("POST", "/api/email/status", { deviceId: "pi-web", status: "connected" });
      say("Pi rapporterade e-poststatus. Ingen mejltoken skickades.");
      await refreshStatus();
    }),
  );

  refreshStatus().catch(() => {
    if (statusOut) statusOut.textContent = "Inte inloggad.";
  });
}

if (typeof document !== "undefined") {
  wirePage();
}
