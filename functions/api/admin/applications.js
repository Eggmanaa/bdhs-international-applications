// GET /api/admin/applications — list all applications (summary).

import { requireAuth, json, text } from '../../_shared/auth.js';

const SUMMARY_COLS = [
  'id', 'submitted_at', 'status',
  'contact_email', 'student_email',
  'student_first_name', 'student_last_name', 'student_preferred_name',
  'place_of_birth', 'applying_for_grade', 'intended_start_term',
  'intends_to_graduate', 'father_email', 'mother_email',
].join(', ');

export async function onRequestGet({ request, env }) {
  if (!(await requireAuth(request, env))) return text('Unauthorized', 401);

  const rs = await env.DB.prepare(
    `SELECT ${SUMMARY_COLS} FROM applications ORDER BY submitted_at DESC LIMIT 500`
  ).all();

  return json({ applications: rs.results || [] });
}

export async function onRequest(context) {
  if (context.request.method !== 'GET') return text('Method Not Allowed', 405);
  return onRequestGet(context);
}
