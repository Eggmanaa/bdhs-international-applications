# BDHS International Applications

Marketing site, application portal, and admin console for the Bishop García Diego High School International Student Program.

Live: https://BDHSInternationalApplications.pages.dev

## Stack

- **Cloudflare Pages** — static site (HTML + inline CSS/JS) hosted from `public/`
- **Cloudflare Pages Functions** — API handlers in `functions/api/`
- **Cloudflare D1** — application database
- **Cloudflare R2** — uploaded document storage

## Project structure

```
/
├── public/
│   ├── index.html           Public marketing site + application form
│   └── admin.html           Password-gated admin console
├── functions/
│   ├── _shared/
│   │   ├── auth.js          HMAC token utilities + request helpers
│   │   └── email.js         Optional Resend email notification
│   └── api/
│       ├── apply.js         POST /api/apply — submit application
│       └── admin/
│           ├── login.js                          POST /api/admin/login
│           ├── applications.js                   GET  /api/admin/applications
│           ├── application/[id].js               GET  /api/admin/application/:id
│           ├── application/[id]/status.js        PATCH .../status
│           └── file/[[key]].js                   GET  /api/admin/file/*
├── schema.sql               D1 schema
├── wrangler.toml            Cloudflare Pages config
└── package.json
```

## One-time setup

```bash
# 1. Install dependencies
npm install

# 2. Authenticate with Cloudflare (opens a browser)
npx wrangler login

# 3. Create D1 database — copy the returned database_id into wrangler.toml
npx wrangler d1 create bdhs-intl-applications

# 4. Apply schema to remote D1
npx wrangler d1 execute bdhs-intl-applications --remote --file=./schema.sql

# 5. Create R2 bucket
npx wrangler r2 bucket create bdhs-intl-docs

# 6. Create the Pages project
npx wrangler pages project create bdhs-international-applications --production-branch main

# 7. Set secrets (run each and paste the value when prompted)
npx wrangler pages secret put ADMIN_PASSWORD --project-name bdhs-international-applications
npx wrangler pages secret put ADMIN_SECRET_SALT --project-name bdhs-international-applications
npx wrangler pages secret put RESEND_API_KEY --project-name bdhs-international-applications   # optional

# 8. Deploy
npm run deploy
```

After the first deploy, attach the D1 and R2 bindings to the Pages project from the Cloudflare dashboard:
- **Settings → Functions → D1 database bindings** → `DB` → `bdhs-intl-applications`
- **Settings → Functions → R2 bucket bindings** → `DOCS` → `bdhs-intl-docs`

Re-deploy any time with `npm run deploy`.

## Environment variables / secrets

| Name                 | Kind    | Purpose                                                               |
|----------------------|---------|-----------------------------------------------------------------------|
| `ADMIN_PASSWORD`     | secret  | Password for the admin console.                                       |
| `ADMIN_SECRET_SALT`  | secret  | Random string used to sign admin session tokens.                      |
| `RESEND_API_KEY`     | secret  | *(optional)* Enables email notifications via Resend when submissions land. |
| `NOTIFY_EMAIL_TO`    | var     | Comma-separated recipients for new-application emails. Defaults to Mr. Eggman and Ms. Diaz. |
| `NOTIFY_EMAIL_FROM`  | var     | From address for notifications. Defaults to Resend's test domain.     |

`NOTIFY_EMAIL_TO` and `NOTIFY_EMAIL_FROM` can be changed in `wrangler.toml` under `[vars]`.

## Local development

```bash
# Apply schema to local D1 once
npm run db:init:local

# Run locally with live reload
npm run dev
```

The app will be available at `http://localhost:8788`.

## Admin console

Open `/admin.html`. Sign in with the password set via `ADMIN_PASSWORD`. You can:

- View all applications with search + filter (status, intended term)
- Drill into any application to see every field and download documents
- Update application status: New → In Review → Interview Scheduled → Accepted / Declined / Withdrawn



## Post-deploy TODO: enable R2 (one-time)

Document uploads require Cloudflare R2 to be enabled on the account. R2 was not yet
enabled when the initial deploy happened. To turn it on:

1. Go to https://dash.cloudflare.com → R2 → accept the terms. (Free tier covers
   10 GB of storage and 1 million reads/month — this project will not exceed it.)
2. Create a bucket named `bdhs-intl-docs`.
3. In the Pages project `bdhsinternationalapplications` → Settings → Functions →
   **R2 bucket bindings**, add: `DOCS` → `bdhs-intl-docs`.
4. Uncomment the `[[r2_buckets]]` block in `wrangler.toml`.
5. Redeploy: `npm run deploy`.

Until R2 is enabled, the application form still works and writes to D1, but any
uploaded files will be silently dropped. The form response reports
`documentsReceived: 0` until R2 is wired in.

## Forward-proofing

- The application form's "intended start semester" dropdown is generated in JavaScript and rolls forward automatically each calendar year. No annual maintenance is required.
- The "I intend to graduate from Bishop Diego" checkbox distinguishes full graduation-track students from shorter-term exchange applicants.
- Document uploads are stored per-application in R2 under `applications/{id}/{field}_{filename}`.

## Contact

Aaron Eggman, International Program Coordinator
aeggman@bishopdiego.org

Erika Diaz, International Program
ediaz@bishopdiego.org

Bishop García Diego High School · 4000 La Colina Rd · Santa Barbara, CA 93110
