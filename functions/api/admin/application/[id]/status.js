// PATCH /api/admin/application/:id/status — update status

import { requireAuth, json, text } from '../../../../_shared/auth.js';

const ALLOWED = new Set([
  'New', 'In Review', 'Interview Scheduled', 'Accepted', 'Declined', 'Withdrawn',
]);

export async function onRequestPatch({ request, env, params }) {
  if (!(await requireAuth(request, env))) return text('Unauthorized', 401);

  const id = params.id;
  if (!id) return text('Missing id', 400);

  let body;
  try { body = await request.json(); } catch { return text('Invalid JSON', 400); }
  const status = body && body.status;
  if (!status || !ALLOWED.has(status)) return text('Invalid status', 400);

  const res = await env.DB.prepare(
    `UPDATE applications SET status = ? WHERE id = ?`
  ).bind(status, id).run();

  if (!res.meta || res.meta.changes === 0) return text('Not found', 404);

  return json({ ok: true, id, status });
}

export async function onRequest(context) {
  const method = context.request.method;
  if (method === 'PATCH' || method === 'POST') return onRequestPatch(context);
  return text('Method Not Allowed', 405);
}
