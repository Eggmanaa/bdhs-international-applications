// Shared admin auth utilities — HMAC-signed tokens using ADMIN_SECRET_SALT.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function importKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function b64url(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function issueToken(secret, ttlSeconds = 60 * 60 * 8) {
  const payload = { exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = b64url(encoder.encode(payloadStr));
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  return payloadB64 + '.' + b64url(sig);
}

export async function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  try {
    const key = await importKey(secret);
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlDecode(sigB64),
      encoder.encode(payloadB64)
    );
    if (!ok) return false;
    const payload = JSON.parse(decoder.decode(b64urlDecode(payloadB64)));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return false;
    return true;
  } catch {
    return false;
  }
}

// Timing-safe string comparison
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Helper: extract + verify bearer token from request; works with either
// Authorization header OR ?token= query param (used for file downloads).
export async function requireAuth(request, env) {
  let token = null;
  const header = request.headers.get('Authorization') || '';
  if (header.startsWith('Bearer ')) token = header.slice(7).trim();
  if (!token) {
    const url = new URL(request.url);
    token = url.searchParams.get('token');
  }
  if (!token) return false;
  return verifyToken(token, env.ADMIN_SECRET_SALT);
}

export function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

export function text(msg, status = 200) {
  return new Response(msg, { status, headers: { 'Content-Type': 'text/plain' } });
}
