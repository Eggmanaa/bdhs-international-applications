// Email notification helper — uses Resend if RESEND_API_KEY is configured.
// If the key is missing, the function no-ops so submissions still succeed.
// To enable: wrangler pages secret put RESEND_API_KEY

export async function sendNotification(env, { subject, html, text, to }) {
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('[email] RESEND_API_KEY not set — skipping:', subject);
    return { skipped: true };
  }

  // If `to` was passed, use it. Otherwise send to admins.
  let toList;
  if (to) {
    toList = Array.isArray(to) ? to : [to];
  } else {
    toList = (env.NOTIFY_EMAIL_TO || 'aeggman@bishopdiego.org,ediaz@bishopdiego.org')
      .split(',').map(s => s.trim()).filter(Boolean);
  }
  const from = env.NOTIFY_EMAIL_FROM || 'BDHS International <onboarding@resend.dev>';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: toList, subject, html, text }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[email] Resend error:', res.status, err);
      return { ok: false, error: err };
    }
    return { ok: true };
  } catch (err) {
    console.error('[email] exception:', err);
    return { ok: false, error: String(err) };
  }
}
