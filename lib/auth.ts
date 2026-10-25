/**
 * Session cookie: a signed, HttpOnly token proving the passcode was entered.
 *
 * Written against Web Crypto rather than node:crypto because middleware runs
 * on the Edge runtime, where node:crypto is unavailable. The same helpers are
 * therefore usable from middleware, route handlers and server components.
 *
 * The token carries only an expiry. There is one user, so there is nothing
 * else to say, and a token that carries no personal data is one less thing to
 * leak.
 */

export const SESSION_COOKIE = "fitness_session";

/** Long-lived on purpose: this is a phone in a gym, not a bank. */
export const SESSION_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

interface SessionPayload {
  /** Expiry, seconds since the epoch. */
  exp: number;
}

function encoder(): TextEncoder {
  return new TextEncoder();
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function sign(data: string, secret: string): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder().encode(data));
  return toBase64Url(new Uint8Array(signature));
}

/** Compares without leaking length or position through timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  const left = encoder().encode(a);
  const right = encoder().encode(b);
  // Compare a fixed number of bytes either way, then fold in the length.
  const length = Math.max(left.length, right.length);
  let diff = left.length ^ right.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

export async function createSessionToken(secret: string, now = Date.now()): Promise<string> {
  const payload: SessionPayload = {
    exp: Math.floor(now / 1000) + SESSION_MAX_AGE_SECONDS,
  };
  const body = toBase64Url(encoder().encode(JSON.stringify(payload)));
  return `${body}.${await sign(body, secret)}`;
}

export async function verifySessionToken(
  token: string | undefined,
  secret: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  if (!token || !secret) return false;
  const [body, signature] = token.split(".");
  if (!body || !signature) return false;

  const expected = await sign(body, secret);
  if (!timingSafeEqual(signature, expected)) return false;

  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload;
    return typeof payload.exp === "number" && payload.exp * 1000 > now;
  } catch {
    return false;
  }
}

/**
 * The server-side configuration the gate needs. Missing either value means the
 * app cannot authenticate anyone, and it must refuse rather than fall open.
 */
export function authConfig(): { secret?: string; passcode?: string; ready: boolean } {
  const secret = process.env.AUTH_SECRET;
  const passcode = process.env.FITNESS_WRITE_PASSCODE;
  return { secret, passcode, ready: Boolean(secret && passcode) };
}
