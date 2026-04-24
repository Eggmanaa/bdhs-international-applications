// POST /api/apply — public application submission endpoint.
// Expects multipart/form-data. Stores files in R2, row in D1, sends email notification.
// Returns an applicationId + uploadToken so families can return later to upload missing docs.

import { sendNotification } from '../_shared/email.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
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
  const ts = Date.now().toString(36);
  const rand = crypto.getRandomValues(new Uint8Array(6));
  let tail = '';
  for (const b of rand) tail += b.toString(36).padStart(2, '0');
  return (ts + tail).toUpperCase().slice(0, 14);
}

function newUploadToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

function sanitizeFilename(name) {
  if (!name) return 'file';
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

async function storeFiles(env, form, applicationId) {
  const docInserts = [];
  if (!env.DOCS) {
    console.warn('[apply] R2 DOCS binding not configured — skipping file storage');
    return docInserts;
  }
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
  return docInserts;
}

async function recordDocuments(env, applicationId, docs, submittedAt) {
  if (!docs.length) return;
  try {
    const insertDoc = env.DB.prepare(
      `INSERT INTO documents (application_id, field_name, original_name, content_type, size, key, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const d of docs) {
      await insertDoc.bind(
        applicationId, d.field, d.original_name, d.content_type, d.size, d.key, submittedAt
      ).run();
    }
  } catch (err) {
    console.error('[apply] document insert failed:', err);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let form;
  try { form = await request.formData(); }
  catch { return new Response('Invalid multipart form data', { status: 400 }); }

  const get = (name) => {
    const v = form.get(name);
    return typeof v === 'string' ? v.trim() : null;
  };

  const data = {};
  for (const f of APP_FIELDS) data[f] = get(f);

  if (!data.contact_email || !data.student_first_name || !data.student_last_name) {
    return new Response('Missing required fields', { status: 400 });
  }

  const interests = form.getAll('interests[]').filter(v => typeof v === 'string');
  const sports = form.getAll('sports[]').filter(v => typeof v === 'string');

  const siblings = [];
  for (let i = 0; i < 20; i++) {
    const name = get(`siblings[${i}][name]`);
    const age = get(`siblings[${i}][age]`);
    if (name || age) siblings.push({ name, age });
  }

  const intendsToGraduate = form.get('intends_to_graduate') ? 1 : 0;

  const applicationId = newId();
  const uploadToken = newUploadToken();
  const submittedAt = new Date().toISOString();

  try {
    const stmt = env.DB.prepare(`
      INSERT INTO applications (
        id, submitted_at, status, upload_token,
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
      ) VALUES (?, ?, 'New', ?,
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
      applicationId, submittedAt, uploadToken,
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

  // Store files
  const docInserts = await storeFiles(env, form, applicationId);
  await recordDocuments(env, applicationId, docInserts, submittedAt);

  // Build the upload URL (for email)
  const origin = new URL(request.url).origin;
  const uploadUrl = `${origin}/upload.html?id=${encodeURIComponent(applicationId)}&token=${encodeURIComponent(uploadToken)}`;

  // Fire-and-forget email notifications
  // 1) To the family — confirmation + upload link
  // 2) To Mr. Eggman + Ms. Diaz — new application alert
  context.waitUntil((async () => {
    // Family confirmation
    await sendNotification(env, {
      to: data.contact_email,
      subject: `Bishop Diego International Application Received — ${data.student_first_name} ${data.student_last_name}`,
      text:
`Thank you for applying to Bishop García Diego High School's International Program.

Your application (ID ${applicationId}) has been received.

To add or replace supporting documents at any time, use your personal upload link:
${uploadUrl}

Save this link — it's the fastest way to submit transcripts, passport photos, bank letters, letters of recommendation, and other documents as you gather them.

Mr. Eggman (aeggman@bishopdiego.org) and Ms. Diaz (ediaz@bishopdiego.org) will reach out soon to schedule your personal interview.

Be the Difference,
The Bishop Diego International Program Team
`,
      html: `
<div style="font-family:Arial,sans-serif;max-width:600px;">
  <h2 style="color:#A20927;font-family:Georgia,serif;">Application Received</h2>
  <p>Thank you for applying to the <strong>Bishop García Diego High School International Program</strong>.</p>
  <p>Your application (ID <code>${escapeHtml(applicationId)}</code>) has been received. Documents uploaded with this submission: <strong>${docInserts.length}</strong>.</p>
  <p><strong>Save your personal upload link</strong> — you can return anytime to add missing documents:</p>
  <p><a href="${uploadUrl}" style="display:inline-block;background:#A20927;color:#fff;padding:12px 24px;text-decoration:none;font-weight:700;">Upload Documents</a></p>
  <p style="font-size:12px;color:#555;word-break:break-all;">${uploadUrl}</p>
  <p>Mr. Eggman and Ms. Diaz will reach out soon to schedule your personal interview.</p>
  <p style="margin-top:24px;color:#A20927;font-style:italic;">Be the Difference.</p>
</div>
      `,
    });

    // Admin notification
    await sendNotification(env, {
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
${origin}/admin.html

Application ID: ${applicationId}
Submitted at: ${submittedAt}
`,
      html: `
<div style="font-family:Arial,sans-serif;max-width:600px;">
  <h2 style="color:#A20927;font-family:Georgia,serif;">New International Application</h2>
  <p><strong>Name:</strong> ${escapeHtml((data.student_first_name || '') + ' ' + (data.student_last_name || ''))}${data.student_preferred_name ? ' (' + escapeHtml(data.student_preferred_name) + ')' : ''}</p>
  <p><strong>Contact Email:</strong> ${escapeHtml(data.contact_email || '')}</p>
  <p><strong>Place of Birth:</strong> ${escapeHtml(data.place_of_birth || '')}</p>
  <p><strong>Applying for Grade:</strong> ${escapeHtml(data.applying_for_grade || '')}</p>
  <p><strong>Intended Start Term:</strong> ${escapeHtml(data.intended_start_term || '')}</p>
  <p><strong>Intends to Graduate:</strong> ${intendsToGraduate ? 'Yes' : 'No'}</p>
  <p><strong>Documents Uploaded:</strong> ${docInserts.length}</p>
  <p style="margin-top:24px;"><a href="${origin}/admin.html" style="display:inline-block;background:#A20927;color:#fff;padding:12px 24px;text-decoration:none;font-weight:700;">View in Admin Console</a></p>
  <p style="color:#777;font-size:12px;margin-top:24px;">Application ID: ${applicationId}<br>Submitted ${submittedAt}</p>
</div>
      `,
    });
  })());

  return new Response(JSON.stringify({
    ok: true,
    applicationId,
    uploadToken,
    documentsReceived: docInserts.length,
    contactEmail: data.contact_email,
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

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
  }
  return onRequestPost(context);
}