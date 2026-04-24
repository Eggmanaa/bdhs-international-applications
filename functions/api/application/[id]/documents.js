// GET  /api/application/:id/documents?token=...  — list already-uploaded docs (for upload.html)
// POST /api/application/:id/documents?token=...  — upload more docs to an existing application

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const FILE_FIELDS = [
  'doc_transcript_current',
  'doc_transcript_prior1',
  'doc_transcript_prior2',
  'doc_passport',
  'doc_birth_certificate',
  'doc_financial',
  'doc_recommendation_1',
  'doc_recommendation_2',
  'doc_recommendation_3',
  'doc_other',
];

function sanitizeFilename(name) {
  if (!name) return 'file';
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

// Check id + token against DB; returns the application row on success, null on failure.
async function verifyAccess(env, id, token) {
  if (!id || !token) return null;
  const row = await env.DB.prepare(
    `SELECT id, submitted_at, status, contact_email, student_first_name, student_last_name,
            student_preferred_name, upload_token
     FROM applications WHERE id = ?`
  ).bind(id).first();
  if (!row) return null;
  if (!row.upload_token) return null;
  // Constant-time-ish compare
  const a = String(row.upload_token), b = String(token);
  if (a.length !== b.length) return null;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  if (diff !== 0) return null;
  return row;
}

function text(msg, status = 200) {
  return new Response(msg, { status, headers: { 'Content-Type': 'text/plain' } });
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

export async function onRequestGet({ request, env, params }) {
  const id = params.id;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const app = await verifyAccess(env, id, token);
  if (!app) return text('Invalid id or token', 401);

  const docs = await env.DB.prepare(
    `SELECT id, field_name, original_name, content_type, size, uploaded_at
     FROM documents WHERE application_id = ? ORDER BY id`
  ).bind(id).all();

  // Strip upload_token from response
  const { upload_token, ...safeApp } = app;
  return json({ application: safeApp, documents: docs.results || [] });
}

export async function onRequestPost({ request, env, params }) {
  const id = params.id;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const app = await verifyAccess(env, id, token);
  if (!app) return text('Invalid id or token', 401);

  if (!env.DOCS) {
    return text('Document storage is not yet configured on the server. Please email your documents to aeggman@bishopdiego.org and ediaz@bishopdiego.org.', 503);
  }

  let form;
  try { form = await request.formData(); }
  catch { return text('Invalid multipart form data', 400); }

  const uploadedAt = new Date().toISOString();
  const stored = [];

  for (const field of FILE_FIELDS) {
    const file = form.get(field);
    if (!file || typeof file === 'string') continue;
    if (!file.size) continue;
    if (file.size > MAX_FILE_BYTES) {
      console.warn(`[documents] Skipping ${field}: file too large (${file.size} bytes)`);
      continue;
    }

    const safeName = sanitizeFilename(file.name || field);
    const key = `applications/${id}/${field}_${safeName}`;

    try {
      await env.DOCS.put(key, file.stream(), {
        httpMetadata: { contentType: file.type || 'application/octet-stream' },
        customMetadata: { applicationId: id, fieldName: field, originalName: String(file.name || '') },
      });
    } catch (err) {
      console.error(`[documents] R2 put failed for ${field}:`, err);
      continue;
    }

    // Remove any previous document row for the same field, then insert fresh
    try {
      await env.DB.prepare(
        `DELETE FROM documents WHERE application_id = ? AND field_name = ?`
      ).bind(id, field).run();

      await env.DB.prepare(
        `INSERT INTO documents (application_id, field_name, original_name, content_type, size, key, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, field, String(file.name || field), file.type || 'application/octet-stream', file.size, key, uploadedAt
      ).run();

      stored.push(field);
    } catch (err) {
      console.error('[documents] D1 upsert failed:', err);
    }
  }

  return json({ ok: true, documentsReceived: stored.length, fields: stored });
}

export async function onRequest(context) {
  const m = context.request.method;
  if (m === 'GET') return onRequestGet(context);
  if (m === 'POST') return onRequestPost(context);
  return text('Method Not Allowed', 405);
}
