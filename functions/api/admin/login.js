// POST /api/admin/login — exchange password for signed token.

import { issueToken, safeEqual, json, text } from '../../_shared/auth.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return text('Invalid JSON', 400);
  }
  const pw = (body && body.password) || '';
  const expected = env.ADMIN_PASSWORD || '';
  if (!expected) return text('Admin password not configured', 500);

  if (!safeEqual(pw, expected)) {
    // Small delay to discourage brute-force
    await new Promise(r => setTimeout(r, 400));
    return text('Invalid credentials', 401);
  }

  const token = await issueToken(env.ADMIN_SECRET_SALT || expected, 60 * 60 * 8);
  return json({ ok: true, token, expiresIn: 60 * 60 * 8 });
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') return text('Method Not Allowed', 405);
  return onRequestPost(context);
}
