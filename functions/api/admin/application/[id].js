// GET /api/admin/application/:id — full detail + document list

import { requireAuth, json, text } from '../../../_shared/auth.js';

export async function onRequestGet({ request, env, params }) {
  if (!(await requireAuth(request, env))) return text('Unauthorized', 401);

  const id = params.id;
  if (!id) return text('Missing id', 400);

  const app = await env.DB.prepare(
    `SELECT * FROM applications WHERE id = ?`
  ).bind(id).first();

  if (!app) return text('Not found', 404);

  const docs = await env.DB.prepare(
    `SELECT id, field_name, original_name, content_type, size, key, uploaded_at
     FROM documents WHERE application_id = ? ORDER BY id`
  ).bind(id).all();

  return json({
    application: app,
    documents: docs.results || [],
  });
}

export async function onRequest(context) {
  if (context.request.method !== 'GET') return text('Method Not Allowed', 405);
  return onRequestGet(context);
}
