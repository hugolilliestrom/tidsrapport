/** Client-side AES-GCM for sync payloads. Keys never leave the devices. */

const TE = new TextEncoder();
const TD = new TextDecoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

export function encodeKey(bytes: Uint8Array): string {
  return b64urlEncode(bytes);
}

export function decodeKey(s: string): Uint8Array {
  return b64urlDecode(s);
}

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", asBufferSource(raw), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptJson(
  value: unknown,
  encKeyRaw: Uint8Array
): Promise<{ ciphertext: string; iv: string }> {
  const key = await importAesKey(encKeyRaw);
  const iv = randomBytes(12);
  const plain = TE.encode(JSON.stringify(value));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asBufferSource(iv) },
    key,
    plain
  );
  return {
    ciphertext: b64urlEncode(new Uint8Array(cipher)),
    iv: b64urlEncode(iv),
  };
}

export async function decryptJson<T>(
  ciphertext: string,
  iv: string,
  encKeyRaw: Uint8Array
): Promise<T> {
  const key = await importAesKey(encKeyRaw);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asBufferSource(b64urlDecode(iv)) },
    key,
    asBufferSource(b64urlDecode(ciphertext))
  );
  return JSON.parse(TD.decode(plain)) as T;
}

export type SyncCreds = {
  id: string;
  writeKey: string;
  encKey: string;
};

/** Portable sync code: tr1.<base64url(json)> */
export function encodeSyncCode(creds: SyncCreds): string {
  const json = JSON.stringify({
    i: creds.id,
    w: creds.writeKey,
    k: creds.encKey,
  });
  return `tr1.${b64urlEncode(TE.encode(json))}`;
}

export function decodeSyncCode(code: string): SyncCreds | null {
  const trimmed = code.trim().replace(/\s+/g, "");
  if (!trimmed.startsWith("tr1.")) return null;
  try {
    const json = TD.decode(b64urlDecode(trimmed.slice(4)));
    const parsed = JSON.parse(json) as { i?: string; w?: string; k?: string };
    if (!parsed.i || !parsed.w || !parsed.k) return null;
    return { id: parsed.i, writeKey: parsed.w, encKey: parsed.k };
  } catch {
    return null;
  }
}
