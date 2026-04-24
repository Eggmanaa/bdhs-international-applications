// GET /api/admin/file/* — stream a file from R2 (admin only).
// Uses catch-all [[key]] because keys contain slashes (applications/{id}/{field}_{name}).

import { requireAuth, text } from '../../../_shared/auth.js';

export async function onRequestGet({ request, env, params }) {
  if (!(await requireAuth(request, env))) return text('Unauthorized', 401);

  // params.key is an array of path segments for catch-all routes
  let key;
  if (Array.isArray(params.key)) key = params.key.join('/');
  else key = params.key || '';

  // Disallow traversal
  if (!key || key.includes('..')) return text('Bad key', 400);

  const obj = await env.DOCS.get(key);
  if (!obj) return text('File not found', 404);

  // Also verify this key belongs to an actual application row to prevent enumeration attacks
  const m = key.match(/^applications\/([^/]+)\//);
  if (!m) return text('Invalid key', 400);
  const appId = m[1];
  const row = await env.DB.prepare(`SELECT id FROM applications WHERE id = ?`).bind(appId).first();
  if (!row) return text('Not found', 404);

  const headers = new Headers();
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream');
  if (obj.size) headers.set('Content-Length', String(obj.size));
  const fileName = (obj.customMetadata?.originalName || key.split('/').pop()).replace(/[^\w.\- ()]/g, '_');
  headers.set('Content-Disposition', `attachment; filename="${fileName}"`);
  headers.set('Cache-Control', 'private, no-store');

  return new Response(obj.body, { status: 200, headers });
}

export async function onRequest(context) {
  if (context.request.method !== 'GET') return text('Method Not Allowed', 405);
  return onRequestGet(context);
}
