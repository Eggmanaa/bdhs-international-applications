// GET /api/admin/application/:id — full detail + document list
// DELETE /api/admin/application/:id — permanently remove the application,
//   its document rows in D1, and any uploaded files in R2.

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

export async function onRequestDelete({ request, env, params }) {
  if (!(await requireAuth(request, env))) return text('Unauthorized', 401);

  const id = params.id;
  if (!id) return text('Missing id', 400);

  // Verify the application exists first
  const app = await env.DB.prepare(
    `SELECT id FROM applications WHERE id = ?`
  ).bind(id).first();
  if (!app) return text('Not found', 404);

  // Get all document keys before we drop the rows so we can clean up R2 too.
  const docs = await env.DB.prepare(
    `SELECT key FROM documents WHERE application_id = ?`
  ).bind(id).all();
  const keys = (docs.results || []).map(r => r.key).filter(Boolean);

  // Delete from R2 if the binding is configured.
  let r2Deleted = 0;
  if (env.DOCS && keys.length) {
    for (const key of keys) {
      try {
        await env.DOCS.delete(key);
        r2Deleted++;
      } catch (err) {
        console.error('[admin delete] R2 delete failed for', key, err);
      }
    }
  }

  // Delete D1 rows (documents first, then application).
  await env.DB.prepare(`DELETE FROM documents WHERE application_id = ?`).bind(id).run();
  const res = await env.DB.prepare(`DELETE FROM applications WHERE id = ?`).bind(id).run();

  return json({
    ok: true,
    id,
    documentsDeletedR2: r2Deleted,
    documentsExpected: keys.length,
    applicationDeleted: !!res.meta?.changes,
  });
}

export async function onRequest(context) {
  const m = context.request.method;
  if (m === 'GET') return onRequestGet(context);
  if (m === 'DELETE') return onRequestDelete(context);
  return text('Method Not Allowed', 405);
}
