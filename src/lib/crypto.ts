// Browser-side crypto helpers using Web Crypto API.
// SHA-256 hashing for patient identifiers and AES-GCM encryption for sensitive fields.
// Note: in a production system the AES key would live server-side; for this prototype
// we derive a deterministic demo key from a fixed app pepper to keep encrypted values
// stable across sessions. Sensitive values are never shown to non-authenticated users
// (RLS enforces that).

const APP_PEPPER = "lovable-healthcare-monitor-v1";

export async function sha256(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getKey(): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(APP_PEPPER));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function b64encode(bytes: Uint8Array): string {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64decode(str: string): Uint8Array {
  const s = atob(str); const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export async function aesEncrypt(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data));
  const combined = new Uint8Array(iv.length + ct.length);
  combined.set(iv); combined.set(ct, iv.length);
  return b64encode(combined);
}

export async function aesDecrypt(payload: string): Promise<string> {
  try {
    const key = await getKey();
    const combined = b64decode(payload);
    const iv = combined.slice(0, 12);
    const ct = combined.slice(12);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(pt);
  } catch {
    return "[encrypted]";
  }
}
