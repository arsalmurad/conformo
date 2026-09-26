/**
 * Local persistence is encrypted with AES-256-GCM; the key is derived from a
 * user passphrase via PBKDF2 and never stored. Only the salt, the PBKDF2
 * iteration count and the
 * ciphertext are ever written to disk — see storage.ts. Losing the
 * passphrase means losing the data: there is no recovery path, by design,
 * since a recoverable key is a stored key.
 */
const PBKDF2_ITERATIONS = 600_000; // OWASP's 2023 minimum for PBKDF2-HMAC-SHA256
const SALT_BYTES = 16;
const IV_BYTES = 12; // the size AES-GCM is defined for; do not change

export interface EncryptedBlob {
  saltB64: string;
  ivB64: string;
  iterations: number;
  ciphertextB64: string;
}

export async function deriveKey(passphrase: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJSON(passphrase: string, data: unknown): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, plaintext);
  return {
    saltB64: toB64(salt),
    ivB64: toB64(iv),
    iterations: PBKDF2_ITERATIONS,
    ciphertextB64: toB64(new Uint8Array(ciphertext)),
  };
}

/** Throws on a wrong passphrase: AES-GCM's authentication tag fails to
 * verify rather than silently returning garbage plaintext. */
export async function decryptJSON<T>(passphrase: string, blob: EncryptedBlob): Promise<T> {
  const salt = fromB64(blob.saltB64);
  const iv = fromB64(blob.ivB64);
  const key = await deriveKey(passphrase, salt, blob.iterations);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, fromB64(blob.ciphertextB64) as BufferSource);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

function toB64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromB64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
