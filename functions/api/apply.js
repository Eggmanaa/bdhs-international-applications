// POST /api/apply — public application submission endpoint.
// Expects multipart/form-data. Stores files in R2, row in D1, sends email notification.

import { sendNotification } from '../_shared/email.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per file
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

const APP_FIELDS = [
  'contact_email', 'student_last_name', 'student_first_name', 'student_middle_name',
  'student_preferred_name', 'date_of_birth', 'place_of_birth', 'student_email', 'gender',
  'applying_for_grade', 'intended_start_term', 'planned_duration',
  'primary_language', 'religion', 'interests_other', 'sports_other',
  'current_grade', 'current_school_name', 'current_school_address', 'current_school_grades',
  'prior_school_name', 'prior_school_address', 'prior_school_grades',
  'disciplinary_action', 'disciplinary_explanation',
  'home_address', 'parents_are',
  'father_last_name', 'father_first_name', 'father_preferred_name', 'father_phone',
  'father_email', 'father_company', 'father_title',
  'mother_last_name', 'mother_first_name', 'mother_preferred_name', 'mother_phone',
  'mother_email', 'mother_company', 'mother_title',
  'family_language',
  'q_interesting', 'q_reading', 'q_contribution', 'q_influence',
  'q_difficult_decisions', 'q_generational_challenge',
  'financial_responsibility', 'i20_email',
  'parent_signature', 'student_signature',
];

function newId() {
  // Short URL-safe ID: timestamp + random
  const ts = Date.now().toString(36);
  const rand = crypto.getRandomValues(new Uint8Array(6));
  let tail = '';
  for (const b of rand) tail += b.toString(36).padStart(2, '0');
  return (ts + tail).toUpperCase().slice(0, 14);
}

function sanitizeFilename(name) {
  if (!name) return 'file';
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let form;
  try {
    form = await request.formData();
  } catch (err) {
    return new Response('Invalid multipart form data', { status: 400 });
  }

  const get = (name) => {
    const v = form.get(name);
    return typeof v === 'string' ? v.trim() : null;
  };

  // Collect scalar fields
  const data = {};
  for (const f of APP_FIELDS) data[f] = get(f);

  if (!data.contact_email || !data.student_first_name || !data.student_last_name) {
    return new Response('Missing required fields', { status: 400 });
  }

  // Multi-select fields (interests[], sports[])
  const interests = form.getAll('interests[]').filter(v => typeof v === 'string');
  const sports = form.getAll('sports[]').filter(v => typeof v === 'string');

  // Siblings — form has siblings[0][name], siblings[0][age], ...
  const siblings = [];
  for (let i = 0; i < 20; i++) {
    const name = get(`siblings[${i}][name]`);
    const age = get(`siblings[${i}][age]`);
    if (name || age) siblings.push({ name, age });
  }

  // Graduation intent checkbox
  const intendsToGraduate = form.get('intends_to_graduate') ? 1 : 0;

  const applicationId = newId();
  const submittedAt = new Date().toISOString();

  // Insert D1 row
  try {
    const stmt = env.DB.prepare(`
      INSERT INTO applications (
        id, submitted_at, status,
        contact_email, student_last_name, student_first_name, student_middle_name,
        student_preferred_name, date_of_birth, place_of_birth, student_email, gender,
        applying_for_grade, intended_start_term, intends_to_graduate, planned_duration,
        primary_language, religion, interests, interests_other, sports, sports_other,
        current_grade, current_school_name, current_school_address, current_school_grades,
        prior_school_name, prior_school_address, prior_school_grades,
        disciplinary_action, disciplinary_explanation,
        home_address, parents_are,
        father_last_name, father_first_name, father_preferred_name, father_phone,
        father_email, father_company, father_title,
        mother_last_name, mother_first_name, mother_preferred_name, mother_phone,
        mother_email, mother_company, mother_title, siblings, family_language,
        q_interesting, q_reading, q_contribution, q_influence,
        q_difficult_decisions, q_generational_challenge,
        financial_responsibility, i20_email,
        parent_signature, student_signature
      ) VALUES (?, ?, 'New',
        ?,?,?,?,?,?,?,?,?,
        ?,?,?,?,
        ?,?,?,?,?,?,
        ?,?,?,?,
        ?,?,?,
        ?,?,
        ?,?,
        ?,?,?,?,?,?,?,
        ?,?,?,?,?,?,?,?,?,
        ?,?,?,?,?,?,
        ?,?,?,?
      )
    `);

    await stmt.bind(
      applicationId, submittedAt,
      data.contact_email, data.student_last_name, data.student_first_name, data.student_middle_name,
      data.student_preferred_name, data.date_of_birth, data.place_of_birth, data.student_email, data.gender,
      data.applying_for_grade, data.intended_start_term, intendsToGraduate, data.planned_duration,
      data.primary_language, data.religion, JSON.stringify(interests), data.interests_other, JSON.stringify(sports), data.sports_other,
      data.current_grade, data.current_school_name, data.current_school_address, data.current_school_grades,
      data.prior_school_name, data.prior_school_address, data.prior_school_grades,
      data.disciplinary_action, data.disciplinary_explanation,
      data.home_address, data.parents_are,
      data.father_last_name, data.father_first_name, data.father_preferred_name, data.father_phone,
      data.father_email, data.father_company, data.father_title,
      data.mother_last_name, data.mother_first_name, data.mother_preferred_name, data.mother_phone,
      data.mother_email, data.mother_company, data.mother_title, JSON.stringify(siblings), data.family_language,
      data.q_interesting, data.q_reading, data.q_contribution, data.q_influence,
      data.q_difficult_decisions, data.q_generational_challenge,
      data.financial_responsibility, data.i20_email,
      data.parent_signature, data.student_signature
    ).run();
  } catch (err) {
    console.error('[apply] D1 insert failed:', err);
    return new Response('Database error: ' + err.message, { status: 500 });
  }

  // Store files in R2
  const docInserts = [];
  for (const field of FILE_FIELDS) {
    const file = form.get(field);
    if (!file || typeof file === 'string') continue;
    if (!file.size) continue;
    if (file.size > MAX_FILE_BYTES) {
      console.warn(`[apply] Skipping ${field}: file too large (${file.size} bytes)`);
      continue;
    }
    const safeName = sanitizeFilename(file.name || field);
    const key = `applications/${applicationId}/${field}_${safeName}`;
    try {
      await env.DOCS.put(key, file.stream(), {
        httpMetadata: { contentType: file.type || 'application/octet-stream' },
        customMetadata: { applicationId, fieldName: field, originalName: String(file.name || '') },
      });
      docInserts.push({
        field,
        original_name: String(file.name || field),
        content_type: file.type || 'application/octet-stream',
        size: file.size,
        key,
      });
    } catch (err) {
      console.error(`[apply] R2 put failed for ${field}:`, err);
    }
  }

  // Insert document rows (best-effort)
  if (docInserts.length) {
    try {
      const insertDoc = env.DB.prepare(
        `INSERT INTO documents (application_id, field_name, original_name, content_type, size, key, uploaded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      for (const d of docInserts) {
        await insertDoc.bind(
          applicationId, d.field, d.original_name, d.content_type, d.size, d.key, submittedAt
        ).run();
      }
    } catch (err) {
      console.error('[apply] document insert failed:', err);
    }
  }

  // Fire-and-forget email notification
  context.waitUntil(
    sendNotification(env, {
      subject: `New International Application: ${data.student_first_name || ''} ${data.student_last_name || ''} (#${applicationId})`,
      text:
`A new international student application has been submitted.

Name: ${data.student_first_name || ''} ${data.student_last_name || ''}${data.student_preferred_name ? ' (' + data.student_preferred_name + ')' : ''}
Contact Email: ${data.contact_email || ''}
Place of Birth: ${data.place_of_birth || ''}
Applying for Grade: ${data.applying_for_grade || ''}
Intended Start: ${data.intended_start_term || ''}
Intends to Graduate: ${intendsToGraduate ? 'Yes' : 'No'}
Documents Uploaded: ${docInserts.length}

View in admin console:
https://BDHSInternationalApplications.pages.dev/admin.html

Application ID: ${applicationId}
Submitted at: ${submittedAt}
`,
      html: `
<div style="font-family: Arial, sans-serif; max-width: 560px;">
  <h2 style="color:#A20927; font-family: Georgia, serif;">New International Application</h2>
  <p><strong>Name:</strong> ${escapeHtml((data.student_first_name || '') + ' ' + (data.student_last_name || ''))}${data.student_preferred_name ? ' (' + escapeHtml(data.student_preferred_name) + ')' : ''}</p>
  <p><strong>Contact Email:</strong> ${escapeHtml(data.contact_email || '')}</p>
  <p><strong>Place of Birth:</strong> ${escapeHtml(data.place_of_birth || '')}</p>
  <p><strong>Applying for Grade:</strong> ${escapeHtml(data.applying_for_grade || '')}</p>
  <p><strong>Intended Start Term:</strong> ${escapeHtml(data.intended_start_term || '')}</p>
  <p><strong>Intends to Graduate:</strong> ${intendsToGraduate ? 'Yes' : 'No'}</p>
  <p><strong>Documents Uploaded:</strong> ${docInserts.length}</p>
  <p style="margin-top:24px;">
    <a href="https://BDHSInternationalApplications.pages.dev/admin.html"
       style="display:inline-block; background:#A20927; color:#fff; padding:12px 24px; text-decoration:none; font-weight:700;">
      View in Admin Console
    </a>
  </p>
  <p style="color:#777; font-size:12px; margin-top:24px;">Application ID: ${applicationId}<br>Submitted ${submittedAt}</p>
</div>
      `,
    })
  );

  return new Response(JSON.stringify({
    ok: true,
    applicationId,
    documentsReceived: docInserts.length,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Reject non-POST
export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
  }
  return onRequestPost(context);
}
